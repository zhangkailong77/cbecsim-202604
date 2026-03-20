from __future__ import annotations

from datetime import datetime
import hashlib
from typing import Any

from sqlalchemy.orm import Session

from app.models import InventoryStockMovement, ShopeeListing, ShopeeListingVariant, ShopeeOrder, ShopeeOrderLogisticsEvent
from app.services.inventory_lot_sync import release_reserved_inventory_lots


CANCEL_THRESHOLD_HOURS = 48
CANCEL_BASE_PROB = 0.25
CANCEL_HOURLY_INCREMENT = 0.08
CANCEL_MAX_PROB = 0.90

_CANCEL_EVENT_CODE = "cancelled_by_buyer"
_CANCEL_EVENT_TITLE = "买家取消订单"
_CANCEL_EVENT_DESC = "卖家超时未发货，买家取消订单"


def _rollback_order_stock_and_sales(
    db: Session,
    *,
    run_id: int,
    user_id: int,
    order: ShopeeOrder,
) -> None:
    items = list(order.items or [])
    if not items:
        return

    for item in items:
        qty = max(0, int(item.quantity or 0))
        if qty <= 0:
            continue
        product_name = (item.product_name or "").strip()
        variant_name = (item.variant_name or "").strip()

        listing: ShopeeListing | None = None
        if int(order.listing_id or 0) > 0:
            listing = (
                db.query(ShopeeListing)
                .filter(
                    ShopeeListing.run_id == run_id,
                    ShopeeListing.user_id == user_id,
                    ShopeeListing.id == int(order.listing_id),
                )
                .first()
            )
        if not listing and product_name:
            listing = (
                db.query(ShopeeListing)
                .filter(
                    ShopeeListing.run_id == run_id,
                    ShopeeListing.user_id == user_id,
                    ShopeeListing.title == product_name,
                )
                .order_by(ShopeeListing.id.desc())
                .first()
            )
        if not listing:
            continue

        product_id = int(listing.product_id or 0) if listing.product_id is not None else 0
        listing.sales_count = max(0, int(listing.sales_count or 0) - qty)
        variants = list(listing.variants or [])
        if variants:
            matched_variant: ShopeeListingVariant | None = None
            if int(order.variant_id or 0) > 0:
                matched_variant = (
                    db.query(ShopeeListingVariant)
                    .filter(
                        ShopeeListingVariant.listing_id == listing.id,
                        ShopeeListingVariant.id == int(order.variant_id),
                    )
                    .first()
                )
            if not matched_variant and variant_name:
                matched_variant = (
                    db.query(ShopeeListingVariant)
                    .filter(
                        ShopeeListingVariant.listing_id == listing.id,
                        ShopeeListingVariant.option_value == variant_name,
                    )
                    .order_by(ShopeeListingVariant.sort_order.asc(), ShopeeListingVariant.id.asc())
                    .first()
                )
            if matched_variant:
                backorder_from_order = max(0, int(order.backorder_qty or 0))
                oversell_release = min(qty, backorder_from_order)
                stock_release = max(0, qty - oversell_release)
                released_reserved = 0
                if product_id > 0 and stock_release > 0:
                    released_reserved = release_reserved_inventory_lots(
                        db,
                        run_id=run_id,
                        product_id=product_id,
                        qty=stock_release,
                    )
                matched_variant.stock = max(0, int(matched_variant.stock or 0) + stock_release)
                matched_variant.sales_count = max(0, int(matched_variant.sales_count or 0) - qty)
                matched_variant.oversell_used = max(0, int(matched_variant.oversell_used or 0) - oversell_release)
                db.add(
                    InventoryStockMovement(
                        run_id=run_id,
                        user_id=user_id,
                        product_id=int(listing.product_id) if listing.product_id is not None else None,
                        listing_id=int(listing.id),
                        variant_id=int(matched_variant.id),
                        biz_order_id=int(order.id),
                        movement_type="cancel_release",
                        qty_delta_on_hand=int(stock_release),
                        qty_delta_reserved=-int(released_reserved),
                        qty_delta_backorder=-int(oversell_release),
                        biz_ref=order.order_no,
                        remark="订单取消释放库存/回退缺货占用",
                    )
                )
            listing.stock_available = int(sum(max(0, int(v.stock or 0)) for v in variants))
        else:
            backorder_from_order = max(0, int(order.backorder_qty or 0))
            stock_release = max(0, qty - min(qty, backorder_from_order))
            released_reserved = 0
            if product_id > 0 and stock_release > 0:
                released_reserved = release_reserved_inventory_lots(
                    db,
                    run_id=run_id,
                    product_id=product_id,
                    qty=stock_release,
                )
            listing.stock_available = max(0, int(listing.stock_available or 0) + stock_release)
            db.add(
                InventoryStockMovement(
                    run_id=run_id,
                    user_id=user_id,
                    product_id=int(listing.product_id) if listing.product_id is not None else None,
                    listing_id=int(listing.id),
                    variant_id=None,
                    biz_order_id=int(order.id),
                    movement_type="cancel_release",
                    qty_delta_on_hand=int(stock_release),
                    qty_delta_reserved=-int(released_reserved),
                    qty_delta_backorder=-int(min(qty, backorder_from_order)),
                    biz_ref=order.order_no,
                    remark="订单取消释放库存/回退缺货占用",
                )
            )


def calc_cancel_prob(overdue_hours: int) -> float:
    if overdue_hours < CANCEL_THRESHOLD_HOURS:
        return 0.0
    return min(
        CANCEL_MAX_PROB,
        CANCEL_BASE_PROB + (overdue_hours - CANCEL_THRESHOLD_HOURS) * CANCEL_HOURLY_INCREMENT,
    )


def should_cancel_for_tick(order_id: int, tick: datetime, prob: float) -> bool:
    if prob <= 0:
        return False
    if prob >= 1:
        return True
    seed = f"{order_id}-{tick.isoformat()}".encode("utf-8")
    digest = hashlib.sha256(seed).hexdigest()
    roll = int(digest[:8], 16) / 0xFFFFFFFF
    return roll < prob


def cancel_order(
    db: Session,
    *,
    run_id: int,
    user_id: int,
    order: ShopeeOrder,
    cancel_time: datetime,
    reason: str,
    source: str,
) -> None:
    _rollback_order_stock_and_sales(
        db,
        run_id=run_id,
        user_id=user_id,
        order=order,
    )
    order.type_bucket = "cancelled"
    order.process_status = "processed"
    order.cancelled_at = cancel_time
    order.cancel_reason = reason
    order.cancel_source = source
    order.countdown_text = "订单已取消"
    db.add(
        ShopeeOrderLogisticsEvent(
            run_id=run_id,
            user_id=user_id,
            order_id=order.id,
            event_code=_CANCEL_EVENT_CODE,
            event_title=_CANCEL_EVENT_TITLE,
            event_desc=_CANCEL_EVENT_DESC,
            event_time=cancel_time,
        )
    )


def auto_cancel_overdue_orders_by_tick(
    db: Session,
    *,
    run_id: int,
    user_id: int,
    current_tick: datetime,
    commit: bool = True,
) -> list[dict[str, Any]]:
    toship_orders = (
        db.query(ShopeeOrder)
        .filter(
            ShopeeOrder.run_id == run_id,
            ShopeeOrder.user_id == user_id,
            ShopeeOrder.type_bucket == "toship",
        )
        .all()
    )
    changed = False
    cancel_logs: list[dict[str, Any]] = []
    for order in toship_orders:
        if not order.ship_by_at:
            continue
        overdue_hours = int((current_tick - order.ship_by_at).total_seconds() // 3600)
        cancel_prob = calc_cancel_prob(overdue_hours)
        if not should_cancel_for_tick(order.id, current_tick, cancel_prob):
            continue
        cancel_order(
            db,
            run_id=run_id,
            user_id=user_id,
            order=order,
            cancel_time=current_tick,
            reason="seller_not_ship_in_time",
            source="buyer_auto",
        )
        cancel_logs.append(
            {
                "order_id": order.id,
                "order_no": order.order_no,
                "buyer_name": order.buyer_name,
                "cancelled_at": current_tick,
                "cancel_reason": "seller_not_ship_in_time",
                "cancel_source": "buyer_auto",
                "overdue_hours": overdue_hours,
                "cancel_prob": round(cancel_prob, 4),
            }
        )
        changed = True

    if changed and commit:
        db.commit()
    return cancel_logs
