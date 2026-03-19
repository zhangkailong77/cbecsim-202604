from datetime import date, datetime, timedelta
import json
import os
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import asc, desc, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.security import get_current_user
from app.db import get_db
from app.models import (
    GameRun,
    GameRunCashAdjustment,
    LogisticsShipment,
    OssStorageConfig,
    ShopeeCategoryNode,
    ShopeeListing,
    ShopeeListingDraft,
    ShopeeListingDraftImage,
    ShopeeListingDraftSpecValue,
    ShopeeListingImage,
    ShopeeListingVariant,
    ShopeeListingWholesaleTier,
    ShopeeListingSpecValue,
    ShopeeOrder,
    ShopeeOrderItem,
    ShopeeOrderLogisticsEvent,
    ShopeeOrderSettlement,
    ShopeeBankAccount,
    ShopeeFinanceLedgerEntry,
    ShopeeOrderGenerationLog,
    ShopeeSpecTemplate,
    ShopeeSpecTemplateOption,
    SimBuyerProfile,
    WarehouseLandmark,
    WarehouseStrategy,
)
from app.services.shopee_fulfillment import (
    calc_settlement,
    calc_shipping_cost,
    gen_tracking_no,
    gen_waybill_no,
    haversine_km,
)
from app.services.shopee_order_cancellation import (
    auto_cancel_overdue_orders_by_tick as service_auto_cancel_overdue_orders_by_tick,
    cancel_order as service_cancel_order,
)
from app.services.shopee_order_simulator import simulate_orders_for_run


router = APIRouter(prefix="/shopee", tags=["shopee"])
REAL_SECONDS_PER_GAME_DAY = 30 * 60
REAL_SECONDS_PER_GAME_HOUR = REAL_SECONDS_PER_GAME_DAY / 24
ORDER_SIM_TICK_GAME_HOURS = 8
ORDER_INCOME_RELEASE_DELAY_GAME_DAYS = 3
RM_TO_RMB_RATE = float(os.getenv("RM_TO_RMB_RATE", "1.74"))
LINE_TRANSIT_DAY_BOUNDS: dict[str, tuple[int, int]] = {
    "economy": (8, 18),
    "standard": (5, 12),
    "express": (3, 8),
}
CHANNEL_TO_FORWARDER_KEY: dict[str, str] = {
    "快捷快递": "express",
    "标准快递": "standard",
    "标准大件": "economy",
}
FORWARDER_KEY_TO_LABEL: dict[str, str] = {
    "economy": "经济线（马来）",
    "standard": "标准线（马来）",
    "express": "快速线（马来）",
}


class ShopeeOrderItemResponse(BaseModel):
    product_name: str
    variant_name: str
    quantity: int
    unit_price: int
    image_url: str | None


class ShopeeOrderResponse(BaseModel):
    id: int
    order_no: str
    buyer_name: str
    buyer_payment: int
    order_type: str
    type_bucket: str
    process_status: str
    shipping_priority: str
    shipping_channel: str
    destination: str
    countdown_text: str
    action_text: str
    ship_by_date: datetime | None
    tracking_no: str | None = None
    waybill_no: str | None = None
    ship_by_at: datetime | None = None
    shipped_at: datetime | None = None
    delivered_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None
    cancel_source: str | None = None
    eta_start_at: datetime | None = None
    eta_end_at: datetime | None = None
    distance_km: float | None = None
    delivery_line_label: str | None = None
    promised_transit_days_text: str | None = None
    transit_days_expected: int | None = None
    transit_days_elapsed: int | None = None
    transit_days_remaining: int | None = None
    created_at: datetime
    items: list[ShopeeOrderItemResponse]


class ShopeeOrderTabCounts(BaseModel):
    all: int
    unpaid: int
    toship: int
    shipping: int
    completed: int
    return_refund_cancel: int


class ShopeeOrdersListResponse(BaseModel):
    counts: ShopeeOrderTabCounts
    page: int
    page_size: int
    total: int
    simulated_recent_1h: int = 0
    last_simulated_at: datetime | None = None
    orders: list[ShopeeOrderResponse]


class ShopeeSimulateOrdersResponse(BaseModel):
    tick_time: datetime
    active_buyer_count: int
    candidate_product_count: int
    generated_order_count: int
    skip_reasons: dict[str, int] = Field(default_factory=dict)
    shop_context: dict[str, Any] = Field(default_factory=dict)
    buyer_journeys: list[dict[str, Any]] = Field(default_factory=list)


class ShopeeShipOrderRequest(BaseModel):
    shipping_channel: str | None = None


class ShopeeShipOrderResponse(BaseModel):
    order_id: int
    tracking_no: str
    waybill_no: str
    shipping_channel: str
    distance_km: float
    delivery_line_label: str | None = None
    promised_transit_days_text: str | None = None
    transit_days_expected: int | None = None
    eta_start_at: datetime
    eta_end_at: datetime
    process_status: str
    type_bucket: str


class ShopeeCancelOrderRequest(BaseModel):
    reason: str | None = None


class ShopeeCancelOrderResponse(BaseModel):
    order_id: int
    type_bucket: str
    process_status: str
    cancelled_at: datetime | None
    cancel_reason: str | None
    cancel_source: str | None


class ShopeeLogisticsEventResponse(BaseModel):
    event_code: str
    event_title: str
    event_desc: str | None
    event_time: datetime


class ShopeeOrderLogisticsResponse(BaseModel):
    order_id: int
    order_no: str
    tracking_no: str | None
    waybill_no: str | None
    shipping_channel: str
    destination: str
    eta_start_at: datetime | None
    eta_end_at: datetime | None
    delivery_line_label: str | None = None
    promised_transit_days_text: str | None = None
    transit_days_expected: int | None = None
    transit_days_elapsed: int | None = None
    transit_days_remaining: int | None = None
    events: list[ShopeeLogisticsEventResponse]


class ShopeeProgressLogisticsRequest(BaseModel):
    event_code: str | None = None


class ShopeeProgressLogisticsResponse(BaseModel):
    order_id: int
    order_no: str
    type_bucket: str
    process_status: str
    current_event_code: str
    delivered_at: datetime | None


class ShopeeOrderSettlementResponse(BaseModel):
    order_id: int
    settlement_status: str
    buyer_payment: float
    platform_commission_amount: float
    payment_fee_amount: float
    shipping_cost_amount: float
    shipping_subsidy_amount: float
    net_income_amount: float
    settled_at: datetime | None


class ShopeeFinanceOverviewResponse(BaseModel):
    wallet_balance: float
    total_income: float
    today_income: float
    week_income: float
    month_income: float
    transaction_count: int
    current_tick: datetime


class ShopeeFinanceTransactionRowResponse(BaseModel):
    id: int
    order_id: int | None
    order_no: str | None
    buyer_name: str | None
    entry_type: str
    direction: str
    amount: float
    balance_after: float
    status: str
    remark: str | None
    credited_at: datetime


class ShopeeFinanceTransactionsResponse(BaseModel):
    page: int
    page_size: int
    total: int
    rows: list[ShopeeFinanceTransactionRowResponse]


class ShopeeFinanceIncomeRowResponse(BaseModel):
    id: int
    order_id: int
    order_no: str
    buyer_name: str
    product_name: str | None
    variant_name: str | None
    image_url: str | None
    amount: float
    status: str
    credited_at: datetime


class ShopeeFinanceIncomeListResponse(BaseModel):
    page: int
    page_size: int
    total: int
    rows: list[ShopeeFinanceIncomeRowResponse]


class ShopeeBankAccountCreateRequest(BaseModel):
    bank_name: str
    account_holder: str
    account_no: str
    is_default: bool = False


class ShopeeBankAccountResponse(BaseModel):
    id: int
    bank_name: str
    account_holder: str
    account_no_masked: str
    currency: str
    is_default: bool
    verify_status: str
    created_at: datetime


class ShopeeBankAccountsListResponse(BaseModel):
    total: int
    rows: list[ShopeeBankAccountResponse]


class ShopeeFinanceWithdrawRequest(BaseModel):
    amount: float = Field(gt=0, le=100000000)


class ShopeeFinanceWithdrawResponse(BaseModel):
    wallet_balance: float
    withdraw_rm: float
    credited_rmb: float
    exchange_rate: float
    ledger_id: int
    cash_adjustment_id: int
    credited_at: datetime


class ShopeeListingRowResponse(BaseModel):
    id: int
    title: str
    category: str | None
    sku_code: str | None
    model_id: str | None
    cover_url: str | None
    sales_count: int
    price: int
    original_price: int
    stock_available: int
    quality_status: str
    status: str
    created_at: datetime
    variants: list["ShopeeListingVariantPreviewResponse"] = Field(default_factory=list)


class ShopeeListingVariantPreviewResponse(BaseModel):
    id: int
    option_value: str
    option_note: str | None
    price: int
    stock: int
    sales_count: int
    sku: str | None
    image_url: str | None


class ShopeeListingsCountsResponse(BaseModel):
    all: int
    live: int
    violation: int
    review: int
    unpublished: int


class ShopeeListingsListResponse(BaseModel):
    counts: ShopeeListingsCountsResponse
    page: int
    page_size: int
    total: int
    listings: list[ShopeeListingRowResponse]


ShopeeListingRowResponse.model_rebuild()


class ShopeeProductsBatchActionRequest(BaseModel):
    listing_ids: list[int]
    action: str


class ShopeeProductsBatchActionResponse(BaseModel):
    success: bool
    affected: int
    action: str


class ShopeeCreateListingResponse(BaseModel):
    id: int
    title: str
    cover_url: str | None


class ShopeeListingEditVariantResponse(BaseModel):
    id: int
    variant_name: str | None
    option_value: str
    option_note: str | None
    price: int
    stock: int
    sku: str | None
    gtin: str | None
    item_without_gtin: bool
    weight_kg: float | None
    parcel_length_cm: int | None
    parcel_width_cm: int | None
    parcel_height_cm: int | None
    image_url: str | None
    sort_order: int


class ShopeeListingEditWholesaleTierResponse(BaseModel):
    id: int
    tier_no: int
    min_qty: int | None
    max_qty: int | None
    unit_price: int | None


class ShopeeListingDetailResponse(BaseModel):
    id: int
    title: str
    category_id: int | None
    category: str | None
    gtin: str | None
    description: str | None
    video_url: str | None
    cover_url: str | None
    price: int
    stock_available: int
    min_purchase_qty: int
    max_purchase_qty: int | None
    max_purchase_mode: str
    max_purchase_period_start_date: date | None
    max_purchase_period_end_date: date | None
    max_purchase_period_qty: int | None
    max_purchase_period_days: int | None
    max_purchase_period_model: str | None
    weight_kg: float | None
    parcel_length_cm: int | None
    parcel_width_cm: int | None
    parcel_height_cm: int | None
    shipping_variation_dimension_enabled: bool
    shipping_standard_bulk: bool
    shipping_standard: bool
    shipping_express: bool
    preorder_enabled: bool
    insurance_enabled: bool
    condition_label: str | None
    schedule_publish_at: datetime | None
    parent_sku: str | None
    variants: list[ShopeeListingEditVariantResponse]
    wholesale_tiers: list[ShopeeListingEditWholesaleTierResponse]


class ShopeeEditBootstrapResponse(BaseModel):
    draft: "ShopeeDraftDetailResponse"
    listing: ShopeeListingDetailResponse


class ShopeeDraftImageResponse(BaseModel):
    id: int
    image_url: str
    sort_order: int
    is_cover: bool


class ShopeeDraftDetailResponse(BaseModel):
    id: int
    title: str
    category_id: int | None
    category: str | None
    gtin: str | None
    description: str | None
    video_url: str | None
    cover_url: str | None
    image_count_11: int
    image_count_34: int
    images_11: list[ShopeeDraftImageResponse]
    images_34: list[ShopeeDraftImageResponse]
    specs: list[dict[str, str | None]]
    created_at: datetime
    updated_at: datetime


class ShopeeDraftPublishResponse(BaseModel):
    draft_id: int
    listing_id: int
    status: str


class ShopeeDraftUpdatePayload(BaseModel):
    title: str
    category_id: int | None = None
    category: str | None = None
    gtin: str | None = None
    description: str | None = None
    spec_values: dict[str, str] | None = None


ShopeeEditBootstrapResponse.model_rebuild()


class ShopeeDraftSpecValueResponse(BaseModel):
    attr_key: str
    attr_label: str
    attr_value: str | None


class ShopeeSpecTemplateFieldResponse(BaseModel):
    attr_key: str
    attr_label: str
    input_type: str
    options: list[str]
    is_required: bool
    sort_order: int


class ShopeeSpecTemplateResponse(BaseModel):
    category_id: int
    category_path: str
    fields: list[ShopeeSpecTemplateFieldResponse]


class ShopeeCategoryNodeResponse(BaseModel):
    id: int
    name: str
    level: int
    path: str
    children: list[dict]


def _get_owned_running_run_or_404(db: Session, run_id: int, user_id: int) -> GameRun:
    run = (
        db.query(GameRun)
        .filter(
            GameRun.id == run_id,
            GameRun.user_id == user_id,
            GameRun.status == "running",
        )
        .first()
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Running game not found")
    return run


def _save_shopee_image(db: Session, image: UploadFile) -> str:
    try:
        import boto3
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="服务端缺少 boto3 依赖") from exc

    content_type = (image.content_type or "").lower()
    allow_map = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    suffix = allow_map.get(content_type)
    if not suffix:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持 JPG/PNG/WEBP 图片")

    data = image.file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="图片内容为空")
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="图片大小不能超过 5MB")

    oss_config = db.query(OssStorageConfig).filter(OssStorageConfig.is_active == True).order_by(OssStorageConfig.id.desc()).first()
    if not oss_config:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="未配置可用 OSS 存储")

    object_key = f"shopee/{datetime.utcnow().strftime('%Y%m%d')}/{uuid4().hex}{suffix}"
    client = boto3.client(
        "s3",
        endpoint_url=oss_config.endpoint,
        aws_access_key_id=oss_config.access_key,
        aws_secret_access_key=oss_config.access_secret,
    )
    try:
        client.put_object(
            Bucket=oss_config.bucket,
            Key=object_key,
            Body=data,
            ContentType=content_type,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"OSS 上传失败: {exc}") from exc

    return f"{oss_config.domain.rstrip('/')}/{object_key.lstrip('/')}"


def _save_shopee_video(db: Session, video: UploadFile) -> str:
    try:
        import boto3
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="服务端缺少 boto3 依赖") from exc

    content_type = (video.content_type or "").lower()
    allow_map = {
        "video/mp4": ".mp4",
    }
    suffix = allow_map.get(content_type)
    if not suffix:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持 MP4 视频")

    data = video.file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="视频内容为空")
    if len(data) > 30 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="视频大小不能超过 30MB")

    oss_config = db.query(OssStorageConfig).filter(OssStorageConfig.is_active == True).order_by(OssStorageConfig.id.desc()).first()
    if not oss_config:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="未配置可用 OSS 存储")

    object_key = f"shopee/{datetime.utcnow().strftime('%Y%m%d')}/{uuid4().hex}{suffix}"
    client = boto3.client(
        "s3",
        endpoint_url=oss_config.endpoint,
        aws_access_key_id=oss_config.access_key,
        aws_secret_access_key=oss_config.access_secret,
    )
    try:
        client.put_object(
            Bucket=oss_config.bucket,
            Key=object_key,
            Body=data,
            ContentType=content_type,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"OSS 上传失败: {exc}") from exc

    return f"{oss_config.domain.rstrip('/')}/{object_key.lstrip('/')}"


def _apply_filters(
    query,
    *,
    type_value: str,
    source: str | None,
    order_type: str,
    order_status: str,
    priority: str,
    keyword: str | None,
    channel: str | None,
):
    if type_value and type_value != "all":
        target_bucket = "cancelled" if type_value == "return_refund_cancel" else type_value
        query = query.filter(ShopeeOrder.type_bucket == target_bucket)

    if source == "to_process":
        query = query.filter(ShopeeOrder.process_status == "processing")

    if order_type != "all":
        query = query.filter(ShopeeOrder.order_type == order_type)

    if order_status != "all":
        query = query.filter(ShopeeOrder.process_status == order_status)

    if priority != "all":
        query = query.filter(ShopeeOrder.shipping_priority == priority)

    if keyword:
        kw = keyword.strip()
        if kw:
            query = query.filter(ShopeeOrder.order_no.ilike(f"%{kw}%"))

    if channel:
        ch = channel.strip()
        if ch:
            query = query.filter(ShopeeOrder.shipping_channel == ch)

    return query


LOGISTICS_FLOW = [
    "label_created",
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "delivered",
]

LOGISTICS_EVENT_META = {
    "label_created": ("已创建运单", "卖家已安排发货并生成面单"),
    "picked_up": ("已揽件", "包裹已由承运商揽收"),
    "in_transit": ("运输中", "包裹正在干线运输"),
    "out_for_delivery": ("派送中", "包裹正在末端派送"),
    "delivered": ("已签收", "包裹已完成签收"),
    "cancelled_by_buyer": ("买家取消订单", "卖家超时未发货，买家取消订单"),
}

BUYER_CITY_COORDS = {
    "MY-KUL": (3.1390, 101.6869),
    "MY-SGR": (3.0738, 101.5183),
    "MY-PNG": (5.4141, 100.3288),
    "MY-JHB": (1.4927, 103.7414),
    "MY-IPH": (4.5975, 101.0901),
    "MY-MLK": (2.1896, 102.2501),
    "MY-KDH": (6.1184, 100.3685),
    "MY-SBH": (5.9804, 116.0735),
    "MY-SWK": (1.5533, 110.3592),
    "MY-SAM": (3.0733, 101.5185),
}


def _get_owned_order_or_404(db: Session, run_id: int, user_id: int, order_id: int) -> ShopeeOrder:
    order = (
        db.query(ShopeeOrder)
        .filter(
            ShopeeOrder.id == order_id,
            ShopeeOrder.run_id == run_id,
            ShopeeOrder.user_id == user_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在")
    return order


def _resolve_buyer_latlng(db: Session, buyer_name: str, destination: str | None) -> tuple[float, float]:
    profile = db.query(SimBuyerProfile).filter(SimBuyerProfile.nickname == buyer_name).first()
    if profile and profile.lat is not None and profile.lng is not None:
        return float(profile.lat), float(profile.lng)
    if profile and profile.city_code and profile.city_code in BUYER_CITY_COORDS:
        return BUYER_CITY_COORDS[profile.city_code]
    for code, coords in BUYER_CITY_COORDS.items():
        if destination and code.endswith(destination[:3].upper()):
            return coords
    return BUYER_CITY_COORDS["MY-KUL"]


def _resolve_warehouse_latlng(db: Session, run: GameRun) -> tuple[float, float]:
    strategy = (
        db.query(WarehouseStrategy)
        .filter(WarehouseStrategy.run_id == run.id, WarehouseStrategy.user_id == run.user_id)
        .order_by(WarehouseStrategy.id.desc())
        .first()
    )
    if strategy:
        point = (
            db.query(WarehouseLandmark)
            .filter(
                WarehouseLandmark.market == run.market,
                WarehouseLandmark.warehouse_mode == strategy.warehouse_mode,
                WarehouseLandmark.warehouse_location == strategy.warehouse_location,
                WarehouseLandmark.is_active == True,
            )
            .first()
        )
        if point:
            return float(point.lat), float(point.lng)

    fallback = (
        db.query(WarehouseLandmark)
        .filter(WarehouseLandmark.market == run.market, WarehouseLandmark.is_active == True)
        .order_by(WarehouseLandmark.sort_order.asc(), WarehouseLandmark.id.asc())
        .first()
    )
    if fallback:
        return float(fallback.lat), float(fallback.lng)
    return BUYER_CITY_COORDS["MY-KUL"]


def _resolve_forwarder_for_order(
    db: Session,
    *,
    run_id: int,
    user_id: int,
    shipping_channel: str,
) -> tuple[str, str]:
    latest_shipment = (
        db.query(LogisticsShipment)
        .filter(
            LogisticsShipment.run_id == run_id,
            LogisticsShipment.user_id == user_id,
        )
        .order_by(LogisticsShipment.created_at.desc(), LogisticsShipment.id.desc())
        .first()
    )
    if latest_shipment and latest_shipment.forwarder_key in LINE_TRANSIT_DAY_BOUNDS:
        key = latest_shipment.forwarder_key
        return key, latest_shipment.forwarder_label or FORWARDER_KEY_TO_LABEL.get(key, "标准线（马来）")
    mapped_key = CHANNEL_TO_FORWARDER_KEY.get(shipping_channel, "standard")
    return mapped_key, FORWARDER_KEY_TO_LABEL.get(mapped_key, "标准线（马来）")


def _calc_transit_days_by_line_and_distance(
    *,
    forwarder_key: str,
    distance_km: float,
) -> tuple[int, int, int]:
    min_days, max_days = LINE_TRANSIT_DAY_BOUNDS.get(forwarder_key, LINE_TRANSIT_DAY_BOUNDS["standard"])
    if distance_km <= 80:
        ratio = 0.10
    elif distance_km <= 300:
        ratio = 0.35
    elif distance_km <= 800:
        ratio = 0.65
    else:
        ratio = 1.00
    raw_days = min_days + (max_days - min_days) * ratio
    transit_days = max(min_days, min(max_days, int(round(raw_days))))
    return transit_days, min_days, max_days


def _resolve_event_milestone_time(
    *,
    event_code: str,
    shipped_at: datetime,
    delivered_due_at: datetime,
) -> datetime:
    total_seconds = max(2 * 3600, int((delivered_due_at - shipped_at).total_seconds()))
    if event_code == "label_created":
        return shipped_at
    if event_code == "delivered":
        return delivered_due_at

    stage_ratio = {
        "picked_up": 0.08,
        "in_transit": 0.45,
        "out_for_delivery": 0.82,
    }.get(event_code, 0.45)
    return shipped_at + timedelta(seconds=int(total_seconds * stage_ratio))


def _resolve_line_meta_by_channel(shipping_channel: str) -> tuple[str, str]:
    forwarder_key = CHANNEL_TO_FORWARDER_KEY.get(shipping_channel, "standard")
    label = FORWARDER_KEY_TO_LABEL.get(forwarder_key, "标准线（马来）")
    return forwarder_key, label


def _infer_forwarder_key_by_eta(order: ShopeeOrder) -> str | None:
    if not order.shipped_at or not order.eta_start_at:
        return None
    expected_days = max(1, int(round((order.eta_start_at - order.shipped_at).total_seconds() / 86400)))

    matched_keys: list[str] = []
    for key, (min_days, max_days) in LINE_TRANSIT_DAY_BOUNDS.items():
        if min_days <= expected_days <= max_days:
            matched_keys.append(key)
    if len(matched_keys) == 1:
        return matched_keys[0]
    if len(matched_keys) > 1:
        return matched_keys[0]

    scored = sorted(
        LINE_TRANSIT_DAY_BOUNDS.items(),
        key=lambda kv: abs(((kv[1][0] + kv[1][1]) / 2) - expected_days),
    )
    return scored[0][0] if scored else None


def _calc_order_shipping_metrics(order: ShopeeOrder, current_tick: datetime) -> dict[str, int | str | None]:
    forwarder_key: str | None = None
    line_label: str | None = None

    if order.delivery_line_key and order.delivery_line_key in LINE_TRANSIT_DAY_BOUNDS:
        forwarder_key = order.delivery_line_key
        line_label = order.delivery_line_label or FORWARDER_KEY_TO_LABEL.get(forwarder_key, "标准线（马来）")
    else:
        inferred_key = _infer_forwarder_key_by_eta(order)
        if inferred_key and inferred_key in LINE_TRANSIT_DAY_BOUNDS:
            forwarder_key = inferred_key
            line_label = FORWARDER_KEY_TO_LABEL.get(forwarder_key, "标准线（马来）")
        else:
            forwarder_key, line_label = _resolve_line_meta_by_channel(order.shipping_channel or "")

    min_days, max_days = LINE_TRANSIT_DAY_BOUNDS.get(forwarder_key, LINE_TRANSIT_DAY_BOUNDS["standard"])
    promised_text = f"{min_days}~{max_days}天"

    expected_days: int | None = None
    elapsed_days: int | None = None
    remaining_days: int | None = None
    if order.shipped_at and order.eta_start_at:
        delta_sec = (order.eta_start_at - order.shipped_at).total_seconds()
        expected_days = max(1, int(round(delta_sec / 86400)))
        elapsed_days = max(0, int((current_tick - order.shipped_at).total_seconds() // 86400))
        if order.type_bucket == "completed":
            remaining_days = 0
        else:
            remaining_days = max(0, expected_days - elapsed_days)

    return {
        "delivery_line_label": line_label,
        "promised_transit_days_text": promised_text,
        "transit_days_expected": expected_days,
        "transit_days_elapsed": elapsed_days,
        "transit_days_remaining": remaining_days,
    }


def _next_event_code(current_event_code: str | None) -> str:
    if not current_event_code:
        return LOGISTICS_FLOW[0]
    if current_event_code not in LOGISTICS_FLOW:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前物流节点非法")
    idx = LOGISTICS_FLOW.index(current_event_code)
    if idx >= len(LOGISTICS_FLOW) - 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="物流已签收，无法继续推进")
    return LOGISTICS_FLOW[idx + 1]


def _resolve_game_tick(db: Session, run_id: int, user_id: int) -> datetime:
    last_log = (
        db.query(ShopeeOrderGenerationLog)
        .filter(
            ShopeeOrderGenerationLog.run_id == run_id,
            ShopeeOrderGenerationLog.user_id == user_id,
        )
        .order_by(ShopeeOrderGenerationLog.tick_time.desc(), ShopeeOrderGenerationLog.id.desc())
        .first()
    )
    if last_log and last_log.tick_time:
        return last_log.tick_time
    return datetime.utcnow()


def _resolve_game_hour_tick_by_run(run: GameRun) -> datetime:
    if not run.created_at:
        return datetime.utcnow()
    now = datetime.utcnow()
    elapsed_seconds = max(0, int((now - run.created_at).total_seconds()))
    elapsed_game_hours = int(elapsed_seconds // REAL_SECONDS_PER_GAME_HOUR)
    return run.created_at + timedelta(hours=elapsed_game_hours)


def _auto_simulate_orders_by_game_hour(
    db: Session,
    *,
    run: GameRun,
    user_id: int,
    max_ticks_per_request: int = 240,
) -> None:
    last_log = (
        db.query(ShopeeOrderGenerationLog)
        .filter(
            ShopeeOrderGenerationLog.run_id == run.id,
            ShopeeOrderGenerationLog.user_id == user_id,
        )
        .order_by(ShopeeOrderGenerationLog.tick_time.desc(), ShopeeOrderGenerationLog.id.desc())
        .first()
    )
    base_tick = last_log.tick_time if (last_log and last_log.tick_time) else run.created_at
    if not base_tick:
        return

    current_game_tick = _resolve_game_hour_tick_by_run(run)
    step_seconds = 3600 * ORDER_SIM_TICK_GAME_HOURS
    missing_steps = int((current_game_tick - base_tick).total_seconds() // step_seconds)
    if missing_steps <= 0:
        return

    ticks_to_run = min(missing_steps, max(1, int(max_ticks_per_request)))
    for offset in range(1, ticks_to_run + 1):
        simulate_orders_for_run(
            db,
            run_id=run.id,
            user_id=user_id,
            tick_time=base_tick + timedelta(hours=offset * ORDER_SIM_TICK_GAME_HOURS),
        )


def _upsert_order_settlement(
    db: Session,
    *,
    run_id: int,
    user_id: int,
    order: ShopeeOrder,
    settled_at: datetime,
) -> None:
    shipping_cost = calc_shipping_cost(float(order.distance_km or 0), order.shipping_channel)
    settlement_data = calc_settlement(
        buyer_payment=float(order.buyer_payment or 0),
        shipping_cost=shipping_cost,
        shipping_channel=order.shipping_channel,
    )
    settlement = (
        db.query(ShopeeOrderSettlement)
        .filter(
            ShopeeOrderSettlement.run_id == run_id,
            ShopeeOrderSettlement.user_id == user_id,
            ShopeeOrderSettlement.order_id == order.id,
        )
        .first()
    )
    if not settlement:
        # Concurrency-safe create: another request/worker may insert the same order_id
        # between "query none" and commit. Use savepoint + flush and fallback to update.
        try:
            with db.begin_nested():
                db.add(
                    ShopeeOrderSettlement(
                        run_id=run_id,
                        user_id=user_id,
                        order_id=order.id,
                        **settlement_data,
                        settlement_status="settled",
                        settled_at=settled_at,
                    )
                )
                db.flush()
            return
        except IntegrityError:
            settlement = (
                db.query(ShopeeOrderSettlement)
                .filter(
                    ShopeeOrderSettlement.run_id == run_id,
                    ShopeeOrderSettlement.user_id == user_id,
                    ShopeeOrderSettlement.order_id == order.id,
                )
                .first()
            )
            if not settlement:
                raise
    for key, value in settlement_data.items():
        setattr(settlement, key, value)
    settlement.settlement_status = "settled"
    settlement.settled_at = settled_at


def _calc_wallet_balance(db: Session, *, run_id: int, user_id: int) -> float:
    in_sum = (
        db.query(func.coalesce(func.sum(ShopeeFinanceLedgerEntry.amount), 0.0))
        .filter(
            ShopeeFinanceLedgerEntry.run_id == run_id,
            ShopeeFinanceLedgerEntry.user_id == user_id,
            ShopeeFinanceLedgerEntry.status == "completed",
            ShopeeFinanceLedgerEntry.direction == "in",
        )
        .scalar()
        or 0.0
    )
    out_sum = (
        db.query(func.coalesce(func.sum(ShopeeFinanceLedgerEntry.amount), 0.0))
        .filter(
            ShopeeFinanceLedgerEntry.run_id == run_id,
            ShopeeFinanceLedgerEntry.user_id == user_id,
            ShopeeFinanceLedgerEntry.status == "completed",
            ShopeeFinanceLedgerEntry.direction == "out",
        )
        .scalar()
        or 0.0
    )
    return round(float(in_sum) - float(out_sum), 2)


def _credit_order_income_if_needed(
    db: Session,
    *,
    run_id: int,
    user_id: int,
    order: ShopeeOrder,
    credited_at: datetime,
) -> bool:
    if order.type_bucket != "completed":
        return False
    if order.cancelled_at is not None or order.cancel_reason:
        return False
    if not order.delivered_at:
        return False

    release_at = order.delivered_at + timedelta(days=ORDER_INCOME_RELEASE_DELAY_GAME_DAYS)
    if credited_at < release_at:
        return False

    settlement = (
        db.query(ShopeeOrderSettlement)
        .filter(
            ShopeeOrderSettlement.run_id == run_id,
            ShopeeOrderSettlement.user_id == user_id,
            ShopeeOrderSettlement.order_id == order.id,
            ShopeeOrderSettlement.settlement_status == "settled",
        )
        .first()
    )
    if not settlement:
        return False

    existing = (
        db.query(ShopeeFinanceLedgerEntry)
        .filter(
            ShopeeFinanceLedgerEntry.run_id == run_id,
            ShopeeFinanceLedgerEntry.user_id == user_id,
            ShopeeFinanceLedgerEntry.order_id == order.id,
            ShopeeFinanceLedgerEntry.entry_type == "income_from_order",
        )
        .first()
    )
    if existing:
        return False

    net_income = float(settlement.net_income_amount or 0.0)
    direction = "in" if net_income >= 0 else "out"
    amount = abs(round(net_income, 2))
    if amount <= 0:
        return False

    current_balance = _calc_wallet_balance(db, run_id=run_id, user_id=user_id)
    signed_delta = amount if direction == "in" else -amount
    balance_after = round(current_balance + signed_delta, 2)
    remark = f"订单回款 {order.order_no}"

    try:
        with db.begin_nested():
            db.add(
                ShopeeFinanceLedgerEntry(
                    run_id=run_id,
                    user_id=user_id,
                    order_id=order.id,
                    entry_type="income_from_order",
                    direction=direction,
                    amount=amount,
                    balance_after=balance_after,
                    status="completed",
                    remark=remark,
                    credited_at=release_at,
                )
            )
            db.flush()
    except IntegrityError:
        # 并发情况下可能被其他请求先写入，同订单仅允许一条回款流水。
        return False
    return True


def _resolve_game_day_start(run: GameRun, current_tick: datetime) -> datetime:
    if not run.created_at:
        return current_tick
    elapsed_seconds = max(0, int((current_tick - run.created_at).total_seconds()))
    elapsed_hours = elapsed_seconds // 3600
    day_index = elapsed_hours // 24
    return run.created_at + timedelta(hours=day_index * 24)


def _resolve_game_week_start(current_tick: datetime) -> datetime:
    week_start = current_tick - timedelta(days=current_tick.weekday())
    return week_start.replace(hour=0, minute=0, second=0, microsecond=0)


def _resolve_game_month_start(current_tick: datetime) -> datetime:
    return current_tick.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _mask_bank_account_no(raw: str) -> str:
    text_no = (raw or "").strip().replace(" ", "")
    if not text_no:
        return "****"
    suffix = text_no[-4:] if len(text_no) >= 4 else text_no
    return f"**** {suffix}"


def _apply_logistics_transition(
    db: Session,
    *,
    run_id: int,
    user_id: int,
    order: ShopeeOrder,
    event_code: str,
    event_time: datetime,
) -> None:
    title, desc_text = LOGISTICS_EVENT_META[event_code]
    db.add(
        ShopeeOrderLogisticsEvent(
            run_id=run_id,
            user_id=user_id,
            order_id=order.id,
            event_code=event_code,
            event_title=title,
            event_desc=desc_text,
            event_time=event_time,
        )
    )
    if event_code != "delivered":
        order.type_bucket = "shipping"
        order.process_status = "processed"
        order.countdown_text = title
        return

    order.type_bucket = "completed"
    order.process_status = "processed"
    order.delivered_at = event_time
    order.countdown_text = "订单已签收"
    if not order.shipped_at:
        order.shipped_at = event_time
    _upsert_order_settlement(
        db,
        run_id=run_id,
        user_id=user_id,
        order=order,
        settled_at=event_time,
    )
    _credit_order_income_if_needed(
        db,
        run_id=run_id,
        user_id=user_id,
        order=order,
        credited_at=event_time,
    )


def _cancel_order(
    db: Session,
    *,
    run_id: int,
    user_id: int,
    order: ShopeeOrder,
    cancel_time: datetime,
    reason: str,
    source: str,
) -> None:
    service_cancel_order(
        db,
        run_id=run_id,
        user_id=user_id,
        order=order,
        cancel_time=cancel_time,
        reason=reason,
        source=source,
    )


def _auto_cancel_overdue_orders_by_tick(
    db: Session,
    *,
    run_id: int,
    user_id: int,
    current_tick: datetime,
) -> None:
    service_auto_cancel_overdue_orders_by_tick(
        db,
        run_id=run_id,
        user_id=user_id,
        current_tick=current_tick,
        commit=True,
    )


def _auto_progress_shipping_orders_by_tick(
    db: Session,
    *,
    run_id: int,
    user_id: int,
    current_tick: datetime,
) -> None:
    shipping_orders = (
        db.query(ShopeeOrder)
        .filter(
            ShopeeOrder.run_id == run_id,
            ShopeeOrder.user_id == user_id,
            ShopeeOrder.type_bucket == "shipping",
        )
        .all()
    )
    changed = False
    for order in shipping_orders:
        latest_event = (
            db.query(ShopeeOrderLogisticsEvent)
            .filter(
                ShopeeOrderLogisticsEvent.run_id == run_id,
                ShopeeOrderLogisticsEvent.user_id == user_id,
                ShopeeOrderLogisticsEvent.order_id == order.id,
            )
            .order_by(ShopeeOrderLogisticsEvent.event_time.desc(), ShopeeOrderLogisticsEvent.id.desc())
            .first()
        )
        if not latest_event or latest_event.event_code == "delivered":
            continue
        if not order.shipped_at:
            continue
        delivered_due_at = order.eta_start_at or (order.shipped_at + timedelta(days=3))
        if delivered_due_at <= order.shipped_at:
            delivered_due_at = order.shipped_at + timedelta(days=1)

        step_code = latest_event.event_code
        if step_code not in LOGISTICS_FLOW:
            continue
        step_index = LOGISTICS_FLOW.index(step_code)
        for idx in range(step_index + 1, len(LOGISTICS_FLOW)):
            next_code = LOGISTICS_FLOW[idx]
            next_event_time = _resolve_event_milestone_time(
                event_code=next_code,
                shipped_at=order.shipped_at,
                delivered_due_at=delivered_due_at,
            )
            if current_tick < next_event_time:
                break
            _apply_logistics_transition(
                db,
                run_id=run_id,
                user_id=user_id,
                order=order,
                event_code=next_code,
                event_time=next_event_time,
            )
            changed = True
            step_code = next_code

    if changed:
        db.commit()


def _backfill_income_for_completed_orders(
    db: Session,
    *,
    run_id: int,
    user_id: int,
    current_tick: datetime,
    max_rows: int = 200,
) -> None:
    completed_orders = (
        db.query(ShopeeOrder)
        .filter(
            ShopeeOrder.run_id == run_id,
            ShopeeOrder.user_id == user_id,
            ShopeeOrder.type_bucket == "completed",
            ShopeeOrder.cancelled_at.is_(None),
        )
        .order_by(ShopeeOrder.id.desc())
        .limit(max_rows)
        .all()
    )
    changed = False
    for order in completed_orders:
        created = _credit_order_income_if_needed(
            db,
            run_id=run_id,
            user_id=user_id,
            order=order,
            credited_at=order.delivered_at or current_tick,
        )
        if created:
            changed = True
    if changed:
        db.commit()


def _get_owned_draft_or_404(db: Session, draft_id: int, run_id: int, user_id: int) -> ShopeeListingDraft:
    draft = (
        db.query(ShopeeListingDraft)
        .options(selectinload(ShopeeListingDraft.images), selectinload(ShopeeListingDraft.specs))
        .filter(
            ShopeeListingDraft.id == draft_id,
            ShopeeListingDraft.run_id == run_id,
            ShopeeListingDraft.user_id == user_id,
        )
        .first()
    )
    if not draft:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品草稿不存在")
    return draft


def _get_owned_listing_or_404(db: Session, listing_id: int, run_id: int, user_id: int) -> ShopeeListing:
    listing = (
        db.query(ShopeeListing)
        .options(
            selectinload(ShopeeListing.images),
            selectinload(ShopeeListing.specs),
            selectinload(ShopeeListing.variants),
            selectinload(ShopeeListing.wholesale_tiers),
        )
        .filter(
            ShopeeListing.id == listing_id,
            ShopeeListing.run_id == run_id,
            ShopeeListing.user_id == user_id,
        )
        .first()
    )
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在")
    return listing


def _build_draft_response(draft: ShopeeListingDraft) -> ShopeeDraftDetailResponse:
    images_11 = [
        ShopeeDraftImageResponse(id=img.id, image_url=img.image_url, sort_order=img.sort_order, is_cover=img.is_cover)
        for img in sorted(
            [row for row in draft.images if row.image_ratio == "1:1"],
            key=lambda row: row.sort_order,
        )
    ]
    images_34 = [
        ShopeeDraftImageResponse(id=img.id, image_url=img.image_url, sort_order=img.sort_order, is_cover=img.is_cover)
        for img in sorted(
            [row for row in draft.images if row.image_ratio == "3:4"],
            key=lambda row: row.sort_order,
        )
    ]
    specs = [
        {"attr_key": row.attr_key, "attr_label": row.attr_label, "attr_value": row.attr_value}
        for row in sorted(draft.specs, key=lambda row: row.attr_key)
    ]
    return ShopeeDraftDetailResponse(
        id=draft.id,
        title=draft.title,
        category_id=draft.category_id,
        category=draft.category,
        gtin=draft.gtin,
        description=draft.description,
        video_url=draft.video_url,
        cover_url=draft.cover_url,
        image_count_11=len(images_11),
        image_count_34=len(images_34),
        images_11=images_11,
        images_34=images_34,
        specs=specs,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


def _build_listing_detail_response(listing: ShopeeListing) -> ShopeeListingDetailResponse:
    return ShopeeListingDetailResponse(
        id=listing.id,
        title=listing.title,
        category_id=listing.category_id,
        category=listing.category,
        gtin=listing.gtin,
        description=listing.description,
        video_url=listing.video_url,
        cover_url=listing.cover_url,
        price=listing.price,
        stock_available=listing.stock_available,
        min_purchase_qty=listing.min_purchase_qty,
        max_purchase_qty=listing.max_purchase_qty,
        max_purchase_mode=listing.max_purchase_mode,
        max_purchase_period_start_date=listing.max_purchase_period_start_date,
        max_purchase_period_end_date=listing.max_purchase_period_end_date,
        max_purchase_period_qty=listing.max_purchase_period_qty,
        max_purchase_period_days=listing.max_purchase_period_days,
        max_purchase_period_model=listing.max_purchase_period_model,
        weight_kg=listing.weight_kg,
        parcel_length_cm=listing.parcel_length_cm,
        parcel_width_cm=listing.parcel_width_cm,
        parcel_height_cm=listing.parcel_height_cm,
        shipping_variation_dimension_enabled=listing.shipping_variation_dimension_enabled,
        shipping_standard_bulk=listing.shipping_standard_bulk,
        shipping_standard=listing.shipping_standard,
        shipping_express=listing.shipping_express,
        preorder_enabled=listing.preorder_enabled,
        insurance_enabled=listing.insurance_enabled,
        condition_label=listing.condition_label,
        schedule_publish_at=listing.schedule_publish_at,
        parent_sku=listing.parent_sku,
        variants=[
            ShopeeListingEditVariantResponse(
                id=row.id,
                variant_name=row.variant_name,
                option_value=row.option_value,
                option_note=row.option_note,
                price=row.price,
                stock=row.stock,
                sku=row.sku,
                gtin=row.gtin,
                item_without_gtin=row.item_without_gtin,
                weight_kg=row.weight_kg,
                parcel_length_cm=row.parcel_length_cm,
                parcel_width_cm=row.parcel_width_cm,
                parcel_height_cm=row.parcel_height_cm,
                image_url=row.image_url,
                sort_order=row.sort_order,
            )
            for row in sorted(listing.variants or [], key=lambda x: (x.sort_order, x.id))
        ],
        wholesale_tiers=[
            ShopeeListingEditWholesaleTierResponse(
                id=row.id,
                tier_no=row.tier_no,
                min_qty=row.min_qty,
                max_qty=row.max_qty,
                unit_price=row.unit_price,
            )
            for row in sorted(listing.wholesale_tiers or [], key=lambda x: (x.tier_no, x.id))
        ],
    )


def _load_spec_templates(db: Session, category_id: int | None) -> list[ShopeeSpecTemplate]:
    if not category_id:
        return []
    return (
        db.query(ShopeeSpecTemplate)
        .options(selectinload(ShopeeSpecTemplate.options))
        .filter(
            ShopeeSpecTemplate.category_id == category_id,
            ShopeeSpecTemplate.is_active == True,
        )
        .order_by(ShopeeSpecTemplate.sort_order.asc(), ShopeeSpecTemplate.id.asc())
        .all()
    )


def _resolve_category_or_400(db: Session, category_id: int | None, category_path: str | None) -> tuple[int | None, str | None]:
    normalized_path = (category_path or "").strip() or None
    if category_id:
        row = (
            db.query(ShopeeCategoryNode)
            .filter(ShopeeCategoryNode.id == category_id, ShopeeCategoryNode.is_active == True)
            .first()
        )
        if not row:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="类目不存在或已下线")
        return row.id, row.path

    if normalized_path:
        row = (
            db.query(ShopeeCategoryNode)
            .filter(ShopeeCategoryNode.path == normalized_path, ShopeeCategoryNode.is_active == True)
            .first()
        )
        if not row:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="类目不存在或已下线")
        return row.id, row.path

    return None, None


def _parse_variants_payload(variations_payload: str | None) -> list[dict]:
    if not variations_payload or not variations_payload.strip():
        return []
    try:
        data = json.loads(variations_payload)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="变体数据格式错误") from exc
    if not isinstance(data, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="变体数据格式错误")
    rows: list[dict] = []

    def _to_positive_int(val):
        if val in (None, ""):
            return None
        try:
            num = int(float(val))
        except Exception:
            return None
        return num if num > 0 else None

    def _to_positive_float(val):
        if val in (None, ""):
            return None
        try:
            num = float(val)
        except Exception:
            return None
        return num if num > 0 else None

    def _to_positive_id(val):
        if val in (None, ""):
            return None
        try:
            num = int(val)
        except Exception:
            return None
        return num if num > 0 else None

    for idx, row in enumerate(data):
        if not isinstance(row, dict):
            continue
        option_value = str(row.get("option_value", "")).strip()
        if not option_value:
            continue
        rows.append(
            {
                "option_value": option_value,
                "option_note": str(row.get("option_note", "")).strip() or None,
                "source_variant_id": _to_positive_id(row.get("source_variant_id")),
                "price": max(int(row.get("price", 0) or 0), 0),
                "stock": max(int(row.get("stock", 0) or 0), 0),
                "sku": str(row.get("sku", "")).strip() or None,
                "gtin": str(row.get("gtin", "")).strip() or None,
                "image_url": str(row.get("image_url", "")).strip() or None,
                "item_without_gtin": bool(row.get("item_without_gtin", False)),
                "weight_kg": _to_positive_float(row.get("weight_kg")),
                "parcel_length_cm": _to_positive_int(row.get("parcel_length_cm")),
                "parcel_width_cm": _to_positive_int(row.get("parcel_width_cm")),
                "parcel_height_cm": _to_positive_int(row.get("parcel_height_cm")),
                "variant_name": str(row.get("variant_name", "")).strip() or None,
                "image_file_index": row.get("image_file_index", None),
                "sort_order": idx,
            }
        )
    return rows


def _parse_wholesale_tiers_payload(wholesale_tiers_payload: str | None) -> list[dict]:
    if not wholesale_tiers_payload or not wholesale_tiers_payload.strip():
        return []
    try:
        data = json.loads(wholesale_tiers_payload)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="批发价阶梯数据格式错误") from exc
    if not isinstance(data, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="批发价阶梯数据格式错误")
    rows: list[dict] = []
    for idx, row in enumerate(data):
        if not isinstance(row, dict):
            continue
        min_qty_raw = row.get("min_qty")
        max_qty_raw = row.get("max_qty")
        unit_price_raw = row.get("unit_price")

        def _to_positive_int(val):
            if val in (None, ""):
                return None
            try:
                num = int(val)
            except Exception:
                return None
            return num if num > 0 else None

        min_qty = _to_positive_int(min_qty_raw)
        max_qty = _to_positive_int(max_qty_raw)
        unit_price = _to_positive_int(unit_price_raw)
        if min_qty is None and max_qty is None and unit_price is None:
            continue
        rows.append(
            {
                "tier_no": idx + 1,
                "min_qty": min_qty,
                "max_qty": max_qty,
                "unit_price": unit_price,
            }
        )
    return rows


@router.get("/runs/{run_id}/orders", response_model=ShopeeOrdersListResponse)
def list_shopee_orders(
    run_id: int,
    type: str = Query(default="all"),
    source: str | None = Query(default=None),
    sort_by: str | None = Query(default=None),
    order: str = Query(default="asc"),
    order_type: str = Query(default="all"),
    order_status: str = Query(default="all"),
    priority: str = Query(default="all"),
    keyword: str | None = Query(default=None),
    channel: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeOrdersListResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    _auto_simulate_orders_by_game_hour(db, run=run, user_id=user_id, max_ticks_per_request=1)
    current_tick = _resolve_game_tick(db, run.id, user_id)
    _auto_cancel_overdue_orders_by_tick(db, run_id=run.id, user_id=user_id, current_tick=current_tick)
    _auto_progress_shipping_orders_by_tick(db, run_id=run.id, user_id=user_id, current_tick=current_tick)
    _backfill_income_for_completed_orders(db, run_id=run.id, user_id=user_id, current_tick=current_tick)

    base_query = db.query(ShopeeOrder).filter(ShopeeOrder.run_id == run.id, ShopeeOrder.user_id == user_id)
    counts = ShopeeOrderTabCounts(
        all=base_query.count(),
        unpaid=base_query.filter(ShopeeOrder.type_bucket == "unpaid").count(),
        toship=base_query.filter(ShopeeOrder.type_bucket == "toship").count(),
        shipping=base_query.filter(ShopeeOrder.type_bucket == "shipping").count(),
        completed=base_query.filter(ShopeeOrder.type_bucket == "completed").count(),
        return_refund_cancel=base_query.filter(ShopeeOrder.type_bucket == "cancelled").count(),
    )

    query = db.query(ShopeeOrder).options(selectinload(ShopeeOrder.items)).filter(
        ShopeeOrder.run_id == run.id, ShopeeOrder.user_id == user_id
    )
    query = _apply_filters(
        query,
        type_value=type,
        source=source,
        order_type=order_type,
        order_status=order_status,
        priority=priority,
        keyword=keyword,
        channel=channel,
    )

    sort_order = desc if order.strip().lower() == "desc" else asc
    if sort_by == "ship_by_date_asc":
        query = query.order_by(asc(ShopeeOrder.ship_by_date), ShopeeOrder.id.desc())
    elif sort_by == "ship_by_date_desc":
        query = query.order_by(desc(ShopeeOrder.ship_by_date), ShopeeOrder.id.desc())
    else:
        query = query.order_by(sort_order(ShopeeOrder.created_at), ShopeeOrder.id.desc())

    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    recent_window_start = datetime.utcnow() - timedelta(hours=1)
    simulated_recent_1h = (
        db.query(func.coalesce(func.sum(ShopeeOrderGenerationLog.generated_order_count), 0))
        .filter(
            ShopeeOrderGenerationLog.run_id == run.id,
            ShopeeOrderGenerationLog.user_id == user_id,
            ShopeeOrderGenerationLog.created_at >= recent_window_start,
        )
        .scalar()
        or 0
    )
    last_log = (
        db.query(ShopeeOrderGenerationLog)
        .filter(
            ShopeeOrderGenerationLog.run_id == run.id,
            ShopeeOrderGenerationLog.user_id == user_id,
        )
        .order_by(ShopeeOrderGenerationLog.created_at.desc())
        .first()
    )

    return ShopeeOrdersListResponse(
        counts=counts,
        page=page,
        page_size=page_size,
        total=total,
        simulated_recent_1h=int(simulated_recent_1h),
        last_simulated_at=last_log.created_at if last_log else None,
        orders=[
            ShopeeOrderResponse(
                **{
                    **{
                        "id": row.id,
                        "order_no": row.order_no,
                        "buyer_name": row.buyer_name,
                        "buyer_payment": row.buyer_payment,
                        "order_type": row.order_type,
                        "type_bucket": row.type_bucket,
                        "process_status": row.process_status,
                        "shipping_priority": row.shipping_priority,
                        "shipping_channel": row.shipping_channel,
                        "destination": row.destination,
                        "countdown_text": row.countdown_text,
                        "action_text": row.action_text,
                        "ship_by_date": row.ship_by_date,
                        "tracking_no": row.tracking_no,
                        "waybill_no": row.waybill_no,
                        "ship_by_at": row.ship_by_at,
                        "shipped_at": row.shipped_at,
                        "delivered_at": row.delivered_at,
                        "cancelled_at": row.cancelled_at,
                        "cancel_reason": row.cancel_reason,
                        "cancel_source": row.cancel_source,
                        "eta_start_at": row.eta_start_at,
                        "eta_end_at": row.eta_end_at,
                        "distance_km": row.distance_km,
                        "created_at": row.created_at,
                        "items": [
                            ShopeeOrderItemResponse(
                                product_name=item.product_name,
                                variant_name=item.variant_name,
                                quantity=item.quantity,
                                unit_price=item.unit_price,
                                image_url=item.image_url,
                            )
                            for item in row.items
                        ],
                    },
                    **_calc_order_shipping_metrics(row, current_tick),
                }
            )
            for row in rows
        ],
    )


@router.get("/runs/{run_id}/orders/{order_id}", response_model=ShopeeOrderResponse)
def get_shopee_order_detail(
    run_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeOrderResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    current_tick = _resolve_game_tick(db, run.id, user_id)
    _auto_cancel_overdue_orders_by_tick(db, run_id=run.id, user_id=user_id, current_tick=current_tick)
    _auto_progress_shipping_orders_by_tick(db, run_id=run.id, user_id=user_id, current_tick=current_tick)
    _backfill_income_for_completed_orders(db, run_id=run.id, user_id=user_id, current_tick=current_tick)
    row = (
        db.query(ShopeeOrder)
        .options(selectinload(ShopeeOrder.items))
        .filter(
            ShopeeOrder.id == order_id,
            ShopeeOrder.run_id == run.id,
            ShopeeOrder.user_id == user_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在")
    return ShopeeOrderResponse(
        **{
            **{
                "id": row.id,
                "order_no": row.order_no,
                "buyer_name": row.buyer_name,
                "buyer_payment": row.buyer_payment,
                "order_type": row.order_type,
                "type_bucket": row.type_bucket,
                "process_status": row.process_status,
                "shipping_priority": row.shipping_priority,
                "shipping_channel": row.shipping_channel,
                "destination": row.destination,
                "countdown_text": row.countdown_text,
                "action_text": row.action_text,
                "ship_by_date": row.ship_by_date,
                "tracking_no": row.tracking_no,
                "waybill_no": row.waybill_no,
                "ship_by_at": row.ship_by_at,
                "shipped_at": row.shipped_at,
                "delivered_at": row.delivered_at,
                "cancelled_at": row.cancelled_at,
                "cancel_reason": row.cancel_reason,
                "cancel_source": row.cancel_source,
                "eta_start_at": row.eta_start_at,
                "eta_end_at": row.eta_end_at,
                "distance_km": row.distance_km,
                "created_at": row.created_at,
                "items": [
                    ShopeeOrderItemResponse(
                        product_name=item.product_name,
                        variant_name=item.variant_name,
                        quantity=item.quantity,
                        unit_price=item.unit_price,
                        image_url=item.image_url,
                    )
                    for item in row.items
                ],
            },
            **_calc_order_shipping_metrics(row, current_tick),
        }
    )


@router.post("/runs/{run_id}/orders/{order_id}/ship", response_model=ShopeeShipOrderResponse)
def ship_order(
    run_id: int,
    order_id: int,
    payload: ShopeeShipOrderRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeShipOrderResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    current_tick = _resolve_game_tick(db, run.id, user_id)
    _auto_cancel_overdue_orders_by_tick(db, run_id=run.id, user_id=user_id, current_tick=current_tick)
    order = _get_owned_order_or_404(db, run.id, user_id, order_id)

    if order.type_bucket != "toship":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅待出货订单可安排发货")

    allowed_channels = {"标准快递", "标准大件", "快捷快递"}
    shipping_channel = (payload.shipping_channel or order.shipping_channel or "标准快递").strip()
    if shipping_channel not in allowed_channels:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="物流渠道不合法")

    now = current_tick
    warehouse_latlng = _resolve_warehouse_latlng(db, run)
    buyer_latlng = _resolve_buyer_latlng(db, order.buyer_name, order.destination)
    distance_km = haversine_km(warehouse_latlng, buyer_latlng)
    forwarder_key, _forwarder_label = _resolve_forwarder_for_order(
        db,
        run_id=run.id,
        user_id=user_id,
        shipping_channel=shipping_channel,
    )
    transit_days, _min_days, max_days = _calc_transit_days_by_line_and_distance(
        forwarder_key=forwarder_key,
        distance_km=distance_km,
    )
    eta_start_at = now + timedelta(days=transit_days)
    eta_end_at = now + timedelta(days=min(transit_days + 1, max_days))

    order.tracking_no = gen_tracking_no(now)
    order.waybill_no = gen_waybill_no(now)
    order.shipped_at = now
    order.ship_by_at = order.ship_by_at or order.ship_by_date or (now + timedelta(days=1))
    order.distance_km = distance_km
    order.eta_start_at = eta_start_at
    order.eta_end_at = eta_end_at
    order.shipping_channel = shipping_channel
    order.delivery_line_key = forwarder_key
    order.delivery_line_label = FORWARDER_KEY_TO_LABEL.get(forwarder_key, _forwarder_label or "标准线（马来）")
    order.type_bucket = "shipping"
    order.process_status = "processed"
    order.countdown_text = "物流运输中"

    _apply_logistics_transition(
        db,
        run_id=run.id,
        user_id=user_id,
        order=order,
        event_code="label_created",
        event_time=now,
    )
    db.commit()
    db.refresh(order)

    return ShopeeShipOrderResponse(
        order_id=order.id,
        tracking_no=order.tracking_no or "",
        waybill_no=order.waybill_no or "",
        shipping_channel=order.shipping_channel,
        distance_km=float(order.distance_km or 0),
        delivery_line_label=order.delivery_line_label or FORWARDER_KEY_TO_LABEL.get(forwarder_key, "标准线（马来）"),
        promised_transit_days_text=f"{_min_days}~{max_days}天",
        transit_days_expected=transit_days,
        eta_start_at=order.eta_start_at or now,
        eta_end_at=order.eta_end_at or now,
        process_status=order.process_status,
        type_bucket=order.type_bucket,
    )


@router.post("/runs/{run_id}/orders/{order_id}/cancel", response_model=ShopeeCancelOrderResponse)
def cancel_order(
    run_id: int,
    order_id: int,
    payload: ShopeeCancelOrderRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeCancelOrderResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    order = _get_owned_order_or_404(db, run.id, user_id, order_id)
    if order.type_bucket != "toship":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅待出货订单可取消")

    now = _resolve_game_tick(db, run.id, user_id)
    _cancel_order(
        db,
        run_id=run.id,
        user_id=user_id,
        order=order,
        cancel_time=now,
        reason=(payload.reason or "seller_not_ship_in_time").strip() or "seller_not_ship_in_time",
        source="manual_debug",
    )
    db.commit()
    db.refresh(order)
    return ShopeeCancelOrderResponse(
        order_id=order.id,
        type_bucket=order.type_bucket,
        process_status=order.process_status,
        cancelled_at=order.cancelled_at,
        cancel_reason=order.cancel_reason,
        cancel_source=order.cancel_source,
    )


@router.get("/runs/{run_id}/orders/{order_id}/logistics", response_model=ShopeeOrderLogisticsResponse)
def get_order_logistics(
    run_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeOrderLogisticsResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    current_tick = _resolve_game_tick(db, run.id, user_id)
    _auto_cancel_overdue_orders_by_tick(db, run_id=run.id, user_id=user_id, current_tick=current_tick)
    _auto_progress_shipping_orders_by_tick(db, run_id=run.id, user_id=user_id, current_tick=current_tick)
    order = _get_owned_order_or_404(db, run.id, user_id, order_id)
    events = (
        db.query(ShopeeOrderLogisticsEvent)
        .filter(
            ShopeeOrderLogisticsEvent.run_id == run.id,
            ShopeeOrderLogisticsEvent.user_id == user_id,
            ShopeeOrderLogisticsEvent.order_id == order.id,
        )
        .order_by(ShopeeOrderLogisticsEvent.event_time.desc(), ShopeeOrderLogisticsEvent.id.desc())
        .all()
    )
    return ShopeeOrderLogisticsResponse(
        order_id=order.id,
        order_no=order.order_no,
        tracking_no=order.tracking_no,
        waybill_no=order.waybill_no,
        shipping_channel=order.shipping_channel,
        destination=order.destination,
        eta_start_at=order.eta_start_at,
        eta_end_at=order.eta_end_at,
        **_calc_order_shipping_metrics(order, current_tick),
        events=[
            ShopeeLogisticsEventResponse(
                event_code=e.event_code,
                event_title=e.event_title,
                event_desc=e.event_desc,
                event_time=e.event_time,
            )
            for e in events
        ],
    )


@router.post("/runs/{run_id}/orders/{order_id}/logistics/progress", response_model=ShopeeProgressLogisticsResponse)
def progress_order_logistics(
    run_id: int,
    order_id: int,
    payload: ShopeeProgressLogisticsRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeProgressLogisticsResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    order = _get_owned_order_or_404(db, run.id, user_id, order_id)
    if order.type_bucket == "cancelled":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="订单已取消，无法推进物流")

    latest_event = (
        db.query(ShopeeOrderLogisticsEvent)
        .filter(
            ShopeeOrderLogisticsEvent.run_id == run.id,
            ShopeeOrderLogisticsEvent.user_id == user_id,
            ShopeeOrderLogisticsEvent.order_id == order.id,
        )
        .order_by(ShopeeOrderLogisticsEvent.event_time.desc(), ShopeeOrderLogisticsEvent.id.desc())
        .first()
    )

    expected_next = _next_event_code(latest_event.event_code if latest_event else None)
    target_code = payload.event_code or expected_next
    if target_code != expected_next:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"仅允许推进到下一节点: {expected_next}")

    now = _resolve_game_tick(db, run.id, user_id)
    _apply_logistics_transition(
        db,
        run_id=run.id,
        user_id=user_id,
        order=order,
        event_code=target_code,
        event_time=now,
    )

    db.commit()
    db.refresh(order)
    return ShopeeProgressLogisticsResponse(
        order_id=order.id,
        order_no=order.order_no,
        type_bucket=order.type_bucket,
        process_status=order.process_status,
        current_event_code=target_code,
        delivered_at=order.delivered_at,
    )


@router.get("/runs/{run_id}/orders/{order_id}/settlement", response_model=ShopeeOrderSettlementResponse)
def get_order_settlement(
    run_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeOrderSettlementResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    _ = _get_owned_order_or_404(db, run.id, user_id, order_id)
    settlement = (
        db.query(ShopeeOrderSettlement)
        .filter(
            ShopeeOrderSettlement.run_id == run.id,
            ShopeeOrderSettlement.user_id == user_id,
            ShopeeOrderSettlement.order_id == order_id,
        )
        .first()
    )
    if not settlement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单尚未生成结算")
    return ShopeeOrderSettlementResponse(
        order_id=order_id,
        settlement_status=settlement.settlement_status,
        buyer_payment=float(settlement.buyer_payment),
        platform_commission_amount=float(settlement.platform_commission_amount),
        payment_fee_amount=float(settlement.payment_fee_amount),
        shipping_cost_amount=float(settlement.shipping_cost_amount),
        shipping_subsidy_amount=float(settlement.shipping_subsidy_amount),
        net_income_amount=float(settlement.net_income_amount),
        settled_at=settlement.settled_at,
    )


@router.get("/runs/{run_id}/finance/overview", response_model=ShopeeFinanceOverviewResponse)
def get_shopee_finance_overview(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeFinanceOverviewResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    current_tick = _resolve_game_tick(db, run.id, user_id)
    _backfill_income_for_completed_orders(db, run_id=run.id, user_id=user_id, current_tick=current_tick)

    wallet_balance = _calc_wallet_balance(db, run_id=run.id, user_id=user_id)
    total_income = (
        db.query(func.coalesce(func.sum(ShopeeFinanceLedgerEntry.amount), 0.0))
        .filter(
            ShopeeFinanceLedgerEntry.run_id == run.id,
            ShopeeFinanceLedgerEntry.user_id == user_id,
            ShopeeFinanceLedgerEntry.status == "completed",
            ShopeeFinanceLedgerEntry.direction == "in",
            ShopeeFinanceLedgerEntry.entry_type == "income_from_order",
        )
        .scalar()
        or 0.0
    )
    day_start = _resolve_game_day_start(run, current_tick)
    today_income = (
        db.query(func.coalesce(func.sum(ShopeeFinanceLedgerEntry.amount), 0.0))
        .filter(
            ShopeeFinanceLedgerEntry.run_id == run.id,
            ShopeeFinanceLedgerEntry.user_id == user_id,
            ShopeeFinanceLedgerEntry.status == "completed",
            ShopeeFinanceLedgerEntry.direction == "in",
            ShopeeFinanceLedgerEntry.entry_type == "income_from_order",
            ShopeeFinanceLedgerEntry.credited_at >= day_start,
        )
        .scalar()
        or 0.0
    )
    week_start = _resolve_game_week_start(current_tick)
    week_income = (
        db.query(func.coalesce(func.sum(ShopeeFinanceLedgerEntry.amount), 0.0))
        .filter(
            ShopeeFinanceLedgerEntry.run_id == run.id,
            ShopeeFinanceLedgerEntry.user_id == user_id,
            ShopeeFinanceLedgerEntry.status == "completed",
            ShopeeFinanceLedgerEntry.direction == "in",
            ShopeeFinanceLedgerEntry.entry_type == "income_from_order",
            ShopeeFinanceLedgerEntry.credited_at >= week_start,
        )
        .scalar()
        or 0.0
    )
    month_start = _resolve_game_month_start(current_tick)
    month_income = (
        db.query(func.coalesce(func.sum(ShopeeFinanceLedgerEntry.amount), 0.0))
        .filter(
            ShopeeFinanceLedgerEntry.run_id == run.id,
            ShopeeFinanceLedgerEntry.user_id == user_id,
            ShopeeFinanceLedgerEntry.status == "completed",
            ShopeeFinanceLedgerEntry.direction == "in",
            ShopeeFinanceLedgerEntry.entry_type == "income_from_order",
            ShopeeFinanceLedgerEntry.credited_at >= month_start,
        )
        .scalar()
        or 0.0
    )
    transaction_count = (
        db.query(func.count(ShopeeFinanceLedgerEntry.id))
        .filter(
            ShopeeFinanceLedgerEntry.run_id == run.id,
            ShopeeFinanceLedgerEntry.user_id == user_id,
        )
        .scalar()
        or 0
    )
    return ShopeeFinanceOverviewResponse(
        wallet_balance=round(float(wallet_balance), 2),
        total_income=round(float(total_income), 2),
        today_income=round(float(today_income), 2),
        week_income=round(float(week_income), 2),
        month_income=round(float(month_income), 2),
        transaction_count=int(transaction_count),
        current_tick=current_tick,
    )


@router.get("/runs/{run_id}/finance/transactions", response_model=ShopeeFinanceTransactionsResponse)
def list_shopee_finance_transactions(
    run_id: int,
    direction: str = Query(default="all"),
    entry_type: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeFinanceTransactionsResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    current_tick = _resolve_game_tick(db, run.id, user_id)
    _backfill_income_for_completed_orders(db, run_id=run.id, user_id=user_id, current_tick=current_tick)

    query = (
        db.query(ShopeeFinanceLedgerEntry)
        .options(selectinload(ShopeeFinanceLedgerEntry.order))
        .filter(
            ShopeeFinanceLedgerEntry.run_id == run.id,
            ShopeeFinanceLedgerEntry.user_id == user_id,
        )
    )

    normalized_direction = (direction or "all").strip().lower()
    if normalized_direction in {"in", "out"}:
        query = query.filter(ShopeeFinanceLedgerEntry.direction == normalized_direction)
    if entry_type and entry_type.strip():
        query = query.filter(ShopeeFinanceLedgerEntry.entry_type == entry_type.strip())
    if keyword and keyword.strip():
        kw = keyword.strip()
        query = query.join(ShopeeOrder, ShopeeOrder.id == ShopeeFinanceLedgerEntry.order_id, isouter=True).filter(
            ShopeeOrder.order_no.ilike(f"%{kw}%")
        )

    query = query.order_by(ShopeeFinanceLedgerEntry.credited_at.desc(), ShopeeFinanceLedgerEntry.id.desc())
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    return ShopeeFinanceTransactionsResponse(
        page=page,
        page_size=page_size,
        total=total,
        rows=[
            ShopeeFinanceTransactionRowResponse(
                id=row.id,
                order_id=row.order_id,
                order_no=row.order.order_no if row.order else None,
                buyer_name=row.order.buyer_name if row.order else None,
                entry_type=row.entry_type,
                direction=row.direction,
                amount=float(row.amount or 0),
                balance_after=float(row.balance_after or 0),
                status=row.status,
                remark=row.remark,
                credited_at=row.credited_at,
            )
            for row in rows
        ],
    )


@router.get("/runs/{run_id}/finance/income", response_model=ShopeeFinanceIncomeListResponse)
def list_shopee_finance_income(
    run_id: int,
    keyword: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeFinanceIncomeListResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    current_tick = _resolve_game_tick(db, run.id, user_id)
    _backfill_income_for_completed_orders(db, run_id=run.id, user_id=user_id, current_tick=current_tick)

    query = (
        db.query(ShopeeFinanceLedgerEntry)
        .options(selectinload(ShopeeFinanceLedgerEntry.order).selectinload(ShopeeOrder.items))
        .filter(
            ShopeeFinanceLedgerEntry.run_id == run.id,
            ShopeeFinanceLedgerEntry.user_id == user_id,
            ShopeeFinanceLedgerEntry.entry_type == "income_from_order",
            ShopeeFinanceLedgerEntry.direction == "in",
        )
    )
    if keyword and keyword.strip():
        kw = keyword.strip()
        query = query.join(ShopeeOrder, ShopeeOrder.id == ShopeeFinanceLedgerEntry.order_id).filter(
            ShopeeOrder.order_no.ilike(f"%{kw}%")
        )

    query = query.order_by(ShopeeFinanceLedgerEntry.credited_at.desc(), ShopeeFinanceLedgerEntry.id.desc())
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    def _first_item(order: ShopeeOrder | None) -> ShopeeOrderItem | None:
        if not order or not order.items:
            return None
        return order.items[0]

    return ShopeeFinanceIncomeListResponse(
        page=page,
        page_size=page_size,
        total=total,
        rows=[
            ShopeeFinanceIncomeRowResponse(
                id=row.id,
                order_id=int(row.order_id or 0),
                order_no=row.order.order_no if row.order else "-",
                buyer_name=row.order.buyer_name if row.order else "-",
                product_name=(item.product_name if item else None),
                variant_name=(item.variant_name if item else None),
                image_url=(item.image_url if item else None),
                amount=float(row.amount or 0),
                status=row.status,
                credited_at=row.credited_at,
            )
            for row in rows
            for item in [_first_item(row.order)]
            if row.order_id
        ],
    )


@router.get("/runs/{run_id}/finance/bank-accounts", response_model=ShopeeBankAccountsListResponse)
def list_shopee_bank_accounts(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeBankAccountsListResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    rows = (
        db.query(ShopeeBankAccount)
        .filter(
            ShopeeBankAccount.run_id == run.id,
            ShopeeBankAccount.user_id == user_id,
        )
        .order_by(desc(ShopeeBankAccount.is_default), ShopeeBankAccount.id.desc())
        .all()
    )
    return ShopeeBankAccountsListResponse(
        total=len(rows),
        rows=[
            ShopeeBankAccountResponse(
                id=row.id,
                bank_name=row.bank_name,
                account_holder=row.account_holder,
                account_no_masked=row.account_no_masked,
                currency=row.currency,
                is_default=bool(row.is_default),
                verify_status=row.verify_status,
                created_at=row.created_at,
            )
            for row in rows
        ],
    )


@router.post("/runs/{run_id}/finance/bank-accounts", response_model=ShopeeBankAccountResponse)
def create_shopee_bank_account(
    run_id: int,
    payload: ShopeeBankAccountCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeBankAccountResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)

    bank_name = (payload.bank_name or "").strip()
    account_holder = (payload.account_holder or "").strip()
    account_no = (payload.account_no or "").strip().replace(" ", "")
    if len(account_holder) < 2 or len(account_holder) > 64:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="银行卡账户姓名需为2~64个字符")
    if not bank_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请选择银行名称")
    if len(account_no) < 4 or len(account_no) > 32:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="银行账号长度需为4~32位")

    exists = (
        db.query(ShopeeBankAccount)
        .filter(
            ShopeeBankAccount.run_id == run.id,
            ShopeeBankAccount.user_id == user_id,
            ShopeeBankAccount.account_no == account_no,
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该银行账号已存在")

    if payload.is_default:
        db.query(ShopeeBankAccount).filter(
            ShopeeBankAccount.run_id == run.id,
            ShopeeBankAccount.user_id == user_id,
            ShopeeBankAccount.is_default.is_(True),
        ).update({"is_default": False}, synchronize_session=False)

    new_row = ShopeeBankAccount(
        run_id=run.id,
        user_id=user_id,
        bank_name=bank_name,
        account_holder=account_holder,
        account_no=account_no,
        account_no_masked=_mask_bank_account_no(account_no),
        currency="RM",
        is_default=bool(payload.is_default),
        verify_status="verified",
    )
    db.add(new_row)
    db.commit()
    db.refresh(new_row)
    return ShopeeBankAccountResponse(
        id=new_row.id,
        bank_name=new_row.bank_name,
        account_holder=new_row.account_holder,
        account_no_masked=new_row.account_no_masked,
        currency=new_row.currency,
        is_default=bool(new_row.is_default),
        verify_status=new_row.verify_status,
        created_at=new_row.created_at,
    )


@router.post("/runs/{run_id}/finance/bank-accounts/{account_id}/set-default", response_model=ShopeeBankAccountResponse)
def set_default_shopee_bank_account(
    run_id: int,
    account_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeBankAccountResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    row = (
        db.query(ShopeeBankAccount)
        .filter(
            ShopeeBankAccount.id == account_id,
            ShopeeBankAccount.run_id == run.id,
            ShopeeBankAccount.user_id == user_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="银行账户不存在")

    db.query(ShopeeBankAccount).filter(
        ShopeeBankAccount.run_id == run.id,
        ShopeeBankAccount.user_id == user_id,
        ShopeeBankAccount.is_default.is_(True),
    ).update({"is_default": False}, synchronize_session=False)
    row.is_default = True
    db.commit()
    db.refresh(row)
    return ShopeeBankAccountResponse(
        id=row.id,
        bank_name=row.bank_name,
        account_holder=row.account_holder,
        account_no_masked=row.account_no_masked,
        currency=row.currency,
        is_default=bool(row.is_default),
        verify_status=row.verify_status,
        created_at=row.created_at,
    )


@router.post("/runs/{run_id}/finance/withdraw", response_model=ShopeeFinanceWithdrawResponse)
def withdraw_shopee_wallet_to_game_cash(
    run_id: int,
    payload: ShopeeFinanceWithdrawRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeFinanceWithdrawResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    current_tick = _resolve_game_tick(db, run.id, user_id)
    _backfill_income_for_completed_orders(db, run_id=run.id, user_id=user_id, current_tick=current_tick)

    default_bank = (
        db.query(ShopeeBankAccount)
        .filter(
            ShopeeBankAccount.run_id == run.id,
            ShopeeBankAccount.user_id == user_id,
            ShopeeBankAccount.is_default.is_(True),
        )
        .order_by(ShopeeBankAccount.id.desc())
        .first()
    )
    if not default_bank:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先设置默认银行卡后再提现")

    withdraw_rm = round(float(payload.amount or 0), 2)
    if withdraw_rm <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="提现金额必须大于 0")

    wallet_balance = _calc_wallet_balance(db, run_id=run.id, user_id=user_id)
    if withdraw_rm > wallet_balance:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"余额不足，当前可提现 {wallet_balance:.2f} RM")

    credited_rmb = round(withdraw_rm * RM_TO_RMB_RATE, 2)
    balance_after = round(wallet_balance - withdraw_rm, 2)

    ledger = ShopeeFinanceLedgerEntry(
        run_id=run.id,
        user_id=user_id,
        order_id=None,
        entry_type="withdrawal",
        direction="out",
        amount=withdraw_rm,
        balance_after=balance_after,
        status="completed",
        remark=f"提现至工作台（汇率 1:{RM_TO_RMB_RATE:.2f}）",
        credited_at=current_tick,
    )
    db.add(ledger)
    db.flush()

    adjustment = GameRunCashAdjustment(
        run_id=run.id,
        user_id=user_id,
        source="shopee_withdrawal",
        direction="in",
        amount=credited_rmb,
        remark=f"Shopee 提现转入，银行卡 {default_bank.bank_name}（{default_bank.account_no_masked}）",
        related_ledger_id=ledger.id,
    )
    db.add(adjustment)
    db.commit()
    db.refresh(ledger)
    db.refresh(adjustment)

    return ShopeeFinanceWithdrawResponse(
        wallet_balance=balance_after,
        withdraw_rm=withdraw_rm,
        credited_rmb=credited_rmb,
        exchange_rate=round(RM_TO_RMB_RATE, 4),
        ledger_id=ledger.id,
        cash_adjustment_id=adjustment.id,
        credited_at=current_tick,
    )


@router.post("/runs/{run_id}/orders/simulate", response_model=ShopeeSimulateOrdersResponse)
def simulate_shopee_orders(
    run_id: int,
    tick_time: datetime | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeSimulateOrdersResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    effective_tick_time = tick_time
    if effective_tick_time is None:
        last_log = (
            db.query(ShopeeOrderGenerationLog)
            .filter(
                ShopeeOrderGenerationLog.run_id == run.id,
                ShopeeOrderGenerationLog.user_id == user_id,
            )
            .order_by(ShopeeOrderGenerationLog.tick_time.desc(), ShopeeOrderGenerationLog.id.desc())
            .first()
        )
        if last_log and last_log.tick_time:
            effective_tick_time = last_log.tick_time + timedelta(hours=1)
        else:
            effective_tick_time = datetime.utcnow()

    result = simulate_orders_for_run(db, run_id=run.id, user_id=user_id, tick_time=effective_tick_time)
    return ShopeeSimulateOrdersResponse(
        tick_time=result["tick_time"],
        active_buyer_count=result["active_buyer_count"],
        candidate_product_count=result["candidate_product_count"],
        generated_order_count=result["generated_order_count"],
        skip_reasons=result["skip_reasons"],
        shop_context={
            "run_id": run.id,
            "user_id": user_id,
            "username": current_user.get("username"),
            "market": run.market,
            "status": run.status,
        },
        buyer_journeys=result.get("buyer_journeys") or [],
    )


@router.get("/runs/{run_id}/products", response_model=ShopeeListingsListResponse)
def list_shopee_products(
    run_id: int,
    type: str = Query(default="all"),
    keyword: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeListingsListResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)

    base_query = db.query(ShopeeListing).filter(ShopeeListing.run_id == run.id, ShopeeListing.user_id == user_id)
    counts = ShopeeListingsCountsResponse(
        all=base_query.count(),
        live=base_query.filter(ShopeeListing.status == "live").count(),
        violation=base_query.filter(ShopeeListing.status == "violation").count(),
        review=base_query.filter(ShopeeListing.status == "review").count(),
        unpublished=base_query.filter(ShopeeListing.status == "unpublished").count(),
    )

    query = base_query
    if type and type != "all":
        query = query.filter(ShopeeListing.status == type)

    if keyword:
        kw = keyword.strip()
        if kw:
            query = query.filter(ShopeeListing.title.ilike(f"%{kw}%"))

    query = query.options(selectinload(ShopeeListing.variants)).order_by(ShopeeListing.created_at.desc(), ShopeeListing.id.desc())
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    return ShopeeListingsListResponse(
        counts=counts,
        page=page,
        page_size=page_size,
        total=total,
        listings=[
            ShopeeListingRowResponse(
                id=row.id,
                title=row.title,
                category=row.category,
                sku_code=row.sku_code,
                model_id=row.model_id,
                cover_url=row.cover_url,
                sales_count=row.sales_count,
                price=row.price,
                original_price=row.original_price,
                stock_available=row.stock_available,
                quality_status=row.quality_status,
                status=row.status,
                created_at=row.created_at,
                variants=[
                    ShopeeListingVariantPreviewResponse(
                        id=variant.id,
                        option_value=variant.option_value,
                        option_note=variant.option_note,
                        price=variant.price,
                        stock=variant.stock,
                        sales_count=int(variant.sales_count or 0),
                        sku=variant.sku,
                        image_url=variant.image_url,
                    )
                    for variant in sorted(row.variants or [], key=lambda x: (x.sort_order, x.id))
                ],
            )
            for row in rows
        ],
    )


@router.post("/runs/{run_id}/products/batch-action", response_model=ShopeeProductsBatchActionResponse)
def batch_action_shopee_products(
    run_id: int,
    payload: ShopeeProductsBatchActionRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeProductsBatchActionResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)

    listing_ids = sorted({int(i) for i in payload.listing_ids if int(i) > 0})
    if not listing_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请选择至少一个商品")

    action = (payload.action or "").strip().lower()
    if action not in {"delete", "unpublish"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的批量操作")

    rows = db.query(ShopeeListing).filter(
        ShopeeListing.run_id == run.id,
        ShopeeListing.user_id == user_id,
        ShopeeListing.id.in_(listing_ids),
    ).all()
    if not rows:
        return ShopeeProductsBatchActionResponse(success=True, affected=0, action=action)

    affected = 0
    if action == "delete":
        for row in rows:
            db.delete(row)
            affected += 1
    else:
        for row in rows:
            if row.status != "unpublished":
                row.status = "unpublished"
                affected += 1
            elif row.status == "unpublished":
                affected += 1

    db.commit()
    return ShopeeProductsBatchActionResponse(success=True, affected=affected, action=action)


@router.post("/runs/{run_id}/products/{listing_id}/edit-draft", response_model=ShopeeEditBootstrapResponse)
def bootstrap_shopee_product_edit(
    run_id: int,
    listing_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeEditBootstrapResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    listing = _get_owned_listing_or_404(db, listing_id, run.id, user_id)

    draft = ShopeeListingDraft(
        run_id=run.id,
        user_id=user_id,
        category_id=listing.category_id,
        title=listing.title,
        category=listing.category,
        gtin=listing.gtin,
        description=listing.description,
        video_url=listing.video_url,
        cover_url=listing.cover_url,
        status="drafting",
    )
    db.add(draft)
    db.flush()

    for img in sorted(listing.images or [], key=lambda x: (x.sort_order, x.id)):
        db.add(
            ShopeeListingDraftImage(
                draft_id=draft.id,
                image_url=img.image_url,
                image_ratio=img.image_ratio,
                sort_order=img.sort_order,
                is_cover=img.is_cover,
            )
        )

    for spec in sorted(listing.specs or [], key=lambda x: (x.attr_key, x.id)):
        db.add(
            ShopeeListingDraftSpecValue(
                draft_id=draft.id,
                attr_key=spec.attr_key,
                attr_label=spec.attr_label,
                attr_value=spec.attr_value,
            )
        )

    db.commit()
    draft = _get_owned_draft_or_404(db, draft.id, run.id, user_id)
    listing = _get_owned_listing_or_404(db, listing_id, run.id, user_id)
    return ShopeeEditBootstrapResponse(
        draft=_build_draft_response(draft),
        listing=_build_listing_detail_response(listing),
    )


@router.get("/spec-templates", response_model=ShopeeSpecTemplateResponse)
def get_shopee_spec_template(
    category_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeSpecTemplateResponse:
    _ = current_user
    category_node = db.query(ShopeeCategoryNode).filter(
        ShopeeCategoryNode.id == category_id,
        ShopeeCategoryNode.is_active == True,
    ).first()
    if not category_node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="类目不存在")
    templates = _load_spec_templates(db, category_id)
    return ShopeeSpecTemplateResponse(
        category_id=category_node.id,
        category_path=category_node.path,
        fields=[
            ShopeeSpecTemplateFieldResponse(
                attr_key=row.field_key,
                attr_label=row.field_label,
                input_type=row.field_type,
                options=[opt.option_value for opt in sorted([o for o in row.options if o.is_active], key=lambda x: x.sort_order)],
                is_required=row.is_required,
                sort_order=row.sort_order,
            )
            for row in templates
        ],
    )


@router.get("/categories/tree", response_model=list[ShopeeCategoryNodeResponse])
def get_shopee_categories_tree(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[ShopeeCategoryNodeResponse]:
    _ = current_user
    rows = (
        db.query(ShopeeCategoryNode)
        .filter(ShopeeCategoryNode.is_active == True)
        .order_by(ShopeeCategoryNode.level.asc(), ShopeeCategoryNode.sort_order.asc(), ShopeeCategoryNode.id.asc())
        .all()
    )
    node_map: dict[int, dict] = {
        row.id: {"id": row.id, "name": row.name, "level": row.level, "path": row.path, "children": []}
        for row in rows
    }
    roots: list[dict] = []
    for row in rows:
        current = node_map[row.id]
        if row.parent_id and row.parent_id in node_map:
            node_map[row.parent_id]["children"].append(current)
        else:
            roots.append(current)
    return [ShopeeCategoryNodeResponse(**item) for item in roots]


@router.post("/runs/{run_id}/product-drafts", response_model=ShopeeDraftDetailResponse, status_code=status.HTTP_201_CREATED)
def create_shopee_product_draft(
    run_id: int,
    title: str = Form(..., min_length=2, max_length=120),
    category_id: int | None = Form(default=None),
    category: str | None = Form(default=None),
    gtin: str | None = Form(default=None),
    description: str | None = Form(default=None),
    video: UploadFile | None = File(default=None),
    cover_index: int = Form(default=0, ge=0),
    cover_index_34: int = Form(default=0, ge=0),
    images: list[UploadFile] = File(default=[]),
    images_34: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeDraftDetailResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)

    resolved_category_id, resolved_category_path = _resolve_category_or_400(db, category_id, category)

    valid_images_11 = [img for img in images if img and (img.filename or "").strip()]
    valid_images_34 = [img for img in images_34 if img and (img.filename or "").strip()]
    if not valid_images_11:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="至少上传 1 张 1:1 商品图")
    if len(valid_images_11) > 9 or len(valid_images_34) > 9:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="1:1 与 3:4 均最多上传 9 张图片")

    upload_urls_11 = [_save_shopee_image(db, img) for img in valid_images_11]
    upload_urls_34 = [_save_shopee_image(db, img) for img in valid_images_34]
    video_url = None
    if video and (video.filename or "").strip():
        video_url = _save_shopee_video(db, video)
    cover_idx_11 = min(max(cover_index, 0), max(len(upload_urls_11) - 1, 0))
    cover_idx_34 = min(max(cover_index_34, 0), max(len(upload_urls_34) - 1, 0))

    cover_url = upload_urls_11[cover_idx_11] if upload_urls_11 else None
    if not cover_url and upload_urls_34:
        cover_url = upload_urls_34[cover_idx_34]

    draft = ShopeeListingDraft(
        run_id=run.id,
        user_id=user_id,
        category_id=resolved_category_id,
        title=title.strip(),
        category=resolved_category_path,
        gtin=(gtin or "").strip() or None,
        description=(description or "").strip() or None,
        video_url=video_url,
        cover_url=cover_url,
        status="drafting",
    )
    db.add(draft)
    db.flush()

    for idx, image_url in enumerate(upload_urls_11):
        db.add(
            ShopeeListingDraftImage(
                draft_id=draft.id,
                image_url=image_url,
                image_ratio="1:1",
                sort_order=idx,
                is_cover=(idx == cover_idx_11),
            )
        )

    for idx, image_url in enumerate(upload_urls_34):
        db.add(
            ShopeeListingDraftImage(
                draft_id=draft.id,
                image_url=image_url,
                image_ratio="3:4",
                sort_order=idx,
                is_cover=(not upload_urls_11 and idx == cover_idx_34),
            )
        )

    db.commit()
    db.refresh(draft)
    draft = _get_owned_draft_or_404(db, draft.id, run.id, user_id)
    return _build_draft_response(draft)


@router.get("/runs/{run_id}/product-drafts/{draft_id}", response_model=ShopeeDraftDetailResponse)
def get_shopee_product_draft(
    run_id: int,
    draft_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeDraftDetailResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    draft = _get_owned_draft_or_404(db, draft_id, run.id, user_id)
    return _build_draft_response(draft)


@router.put("/runs/{run_id}/product-drafts/{draft_id}", response_model=ShopeeDraftDetailResponse)
def update_shopee_product_draft(
    run_id: int,
    draft_id: int,
    payload: ShopeeDraftUpdatePayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeDraftDetailResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    draft = _get_owned_draft_or_404(db, draft_id, run.id, user_id)

    resolved_category_id, resolved_category_path = _resolve_category_or_400(db, payload.category_id, payload.category)

    draft.title = payload.title.strip()
    if len(draft.title) < 2 or len(draft.title) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="商品名称长度需在 2~120 字符")
    draft.category_id = resolved_category_id
    draft.category = resolved_category_path
    draft.gtin = (payload.gtin or "").strip() or None
    draft.description = (payload.description or "").strip() or None

    if payload.spec_values is not None:
        templates = _load_spec_templates(db, draft.category_id)
        template_map = {row.field_key: row for row in templates}
        existing_rows = {row.attr_key: row for row in draft.specs}
        for attr_key, row in existing_rows.items():
            if attr_key not in template_map:
                db.delete(row)
        for attr_key, template in template_map.items():
            value = (payload.spec_values.get(attr_key, "") if payload.spec_values else "").strip()
            existing = existing_rows.get(attr_key)
            if existing:
                existing.attr_label = template.field_label
                existing.attr_value = value or None
            else:
                db.add(
                    ShopeeListingDraftSpecValue(
                        draft_id=draft.id,
                        attr_key=attr_key,
                        attr_label=template.field_label,
                        attr_value=value or None,
                    )
                )

    db.commit()
    db.refresh(draft)
    draft = _get_owned_draft_or_404(db, draft.id, run.id, user_id)
    return _build_draft_response(draft)


@router.post("/runs/{run_id}/product-drafts/{draft_id}/assets", response_model=ShopeeDraftDetailResponse)
def append_shopee_product_draft_assets(
    run_id: int,
    draft_id: int,
    cover_index_11: int = Form(default=-1),
    cover_index_34: int = Form(default=-1),
    images: list[UploadFile] = File(default=[]),
    images_34: list[UploadFile] = File(default=[]),
    video: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeDraftDetailResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    draft = _get_owned_draft_or_404(db, draft_id, run.id, user_id)

    valid_images_11 = [img for img in images if img and (img.filename or "").strip()]
    valid_images_34 = [img for img in images_34 if img and (img.filename or "").strip()]

    current_11 = sorted([row for row in draft.images if row.image_ratio == "1:1"], key=lambda row: row.sort_order)
    current_34 = sorted([row for row in draft.images if row.image_ratio == "3:4"], key=lambda row: row.sort_order)
    if len(current_11) + len(valid_images_11) > 9 or len(current_34) + len(valid_images_34) > 9:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="1:1 与 3:4 均最多上传 9 张图片")

    upload_urls_11 = [_save_shopee_image(db, img) for img in valid_images_11]
    upload_urls_34 = [_save_shopee_image(db, img) for img in valid_images_34]

    start_11 = len(current_11)
    for idx, image_url in enumerate(upload_urls_11):
        db.add(
            ShopeeListingDraftImage(
                draft_id=draft.id,
                image_url=image_url,
                image_ratio="1:1",
                sort_order=start_11 + idx,
                is_cover=False,
            )
        )

    start_34 = len(current_34)
    for idx, image_url in enumerate(upload_urls_34):
        db.add(
            ShopeeListingDraftImage(
                draft_id=draft.id,
                image_url=image_url,
                image_ratio="3:4",
                sort_order=start_34 + idx,
                is_cover=False,
            )
        )

    if video and (video.filename or "").strip():
        draft.video_url = _save_shopee_video(db, video)

    db.flush()
    draft = _get_owned_draft_or_404(db, draft.id, run.id, user_id)
    images_after_11 = sorted([row for row in draft.images if row.image_ratio == "1:1"], key=lambda row: row.sort_order)
    images_after_34 = sorted([row for row in draft.images if row.image_ratio == "3:4"], key=lambda row: row.sort_order)

    if images_after_11:
        if cover_index_11 >= 0:
            target_11 = min(max(cover_index_11, 0), len(images_after_11) - 1)
            for idx, row in enumerate(images_after_11):
                row.is_cover = idx == target_11
        current_cover_11 = next((row for row in images_after_11 if row.is_cover), None)
        draft.cover_url = (current_cover_11 or images_after_11[0]).image_url

    if images_after_34 and not images_after_11:
        if cover_index_34 >= 0:
            target_34 = min(max(cover_index_34, 0), len(images_after_34) - 1)
            for idx, row in enumerate(images_after_34):
                row.is_cover = idx == target_34
        current_cover_34 = next((row for row in images_after_34 if row.is_cover), None)
        draft.cover_url = (current_cover_34 or images_after_34[0]).image_url

    db.commit()
    draft = _get_owned_draft_or_404(db, draft.id, run.id, user_id)
    return _build_draft_response(draft)


@router.delete("/runs/{run_id}/product-drafts/{draft_id}/images/{image_id}", response_model=ShopeeDraftDetailResponse)
def remove_shopee_product_draft_image(
    run_id: int,
    draft_id: int,
    image_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeDraftDetailResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    draft = _get_owned_draft_or_404(db, draft_id, run.id, user_id)

    target = db.query(ShopeeListingDraftImage).filter(
        ShopeeListingDraftImage.id == image_id,
        ShopeeListingDraftImage.draft_id == draft.id,
    ).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="草稿图片不存在")

    ratio = target.image_ratio
    db.delete(target)
    db.flush()

    same_ratio_rows = db.query(ShopeeListingDraftImage).filter(
        ShopeeListingDraftImage.draft_id == draft.id,
        ShopeeListingDraftImage.image_ratio == ratio,
    ).order_by(ShopeeListingDraftImage.sort_order.asc(), ShopeeListingDraftImage.id.asc()).all()
    for idx, row in enumerate(same_ratio_rows):
        row.sort_order = idx
        row.is_cover = idx == 0

    all_11 = [row for row in draft.images if row.image_ratio == "1:1" and row.id != image_id]
    all_34 = [row for row in draft.images if row.image_ratio == "3:4" and row.id != image_id]
    if all_11:
        sorted_11 = sorted(all_11, key=lambda row: row.sort_order)
        draft.cover_url = sorted_11[0].image_url
    elif all_34:
        sorted_34 = sorted(all_34, key=lambda row: row.sort_order)
        draft.cover_url = sorted_34[0].image_url
    else:
        draft.cover_url = None

    db.commit()
    draft = _get_owned_draft_or_404(db, draft.id, run.id, user_id)
    return _build_draft_response(draft)


@router.delete("/runs/{run_id}/product-drafts/{draft_id}/video", response_model=ShopeeDraftDetailResponse)
def remove_shopee_product_draft_video(
    run_id: int,
    draft_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeDraftDetailResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    draft = _get_owned_draft_or_404(db, draft_id, run.id, user_id)
    draft.video_url = None
    db.commit()
    draft = _get_owned_draft_or_404(db, draft.id, run.id, user_id)
    return _build_draft_response(draft)


@router.post(
    "/runs/{run_id}/product-drafts/{draft_id}/publish",
    response_model=ShopeeDraftPublishResponse,
    status_code=status.HTTP_201_CREATED,
)
def publish_shopee_product_draft(
    run_id: int,
    draft_id: int,
    status_value: str = Form(default="live"),
    quality_status: str = Form(default="内容待完善"),
    price: int = Form(default=0, ge=0),
    stock_available: int = Form(default=0, ge=0),
    min_purchase_qty: int = Form(default=1, ge=1),
    max_purchase_qty: int | None = Form(default=None),
    max_purchase_mode: str = Form(default="none"),
    max_purchase_period_start_date: date | None = Form(default=None),
    max_purchase_period_end_date: date | None = Form(default=None),
    max_purchase_period_qty: int | None = Form(default=None),
    max_purchase_period_days: int | None = Form(default=None),
    max_purchase_period_model: str | None = Form(default=None),
    weight_kg: float | None = Form(default=None),
    parcel_length_cm: int | None = Form(default=None),
    parcel_width_cm: int | None = Form(default=None),
    parcel_height_cm: int | None = Form(default=None),
    shipping_variation_dimension_enabled: bool = Form(default=False),
    shipping_standard_bulk: bool = Form(default=False),
    shipping_standard: bool = Form(default=False),
    shipping_express: bool = Form(default=False),
    preorder_enabled: bool = Form(default=False),
    insurance_enabled: bool = Form(default=False),
    condition_label: str | None = Form(default=None),
    schedule_publish_at: datetime | None = Form(default=None),
    parent_sku: str | None = Form(default=None),
    source_listing_id: int | None = Form(default=None),
    variations_payload: str | None = Form(default=None),
    wholesale_tiers_payload: str | None = Form(default=None),
    variant_images: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeDraftPublishResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)
    draft = _get_owned_draft_or_404(db, draft_id, run.id, user_id)

    status_white_list = {"live", "unpublished"}
    keep_status = (status_value == "keep")
    final_status = status_value if status_value in status_white_list else "live"
    if not draft.category_id or not (draft.category or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请选择商品类目后再发布")

    images_11 = [img for img in draft.images if img.image_ratio == "1:1"]
    images_34 = [img for img in draft.images if img.image_ratio == "3:4"]
    variant_rows = _parse_variants_payload(variations_payload)
    wholesale_tier_rows = _parse_wholesale_tiers_payload(wholesale_tiers_payload)
    valid_variant_images = [img for img in variant_images if img and (img.filename or "").strip()]

    existing_variant_by_id: dict[int, ShopeeListingVariant] = {}
    existing_variant_by_sku: dict[str, ShopeeListingVariant] = {}
    existing_variant_by_option: dict[tuple[str, str], ShopeeListingVariant] = {}
    listing: ShopeeListing
    if source_listing_id and source_listing_id > 0:
        listing = _get_owned_listing_or_404(db, source_listing_id, run.id, user_id)
        existing_variants = list(listing.variants or [])
        existing_variant_by_id = {v.id: v for v in existing_variants}
        existing_variant_by_sku = {str(v.sku or "").strip(): v for v in existing_variants if str(v.sku or "").strip()}
        existing_variant_by_option = {
            (str(v.option_value or "").strip(), str(v.option_note or "").strip()): v
            for v in existing_variants
        }
        if keep_status:
            final_status = (listing.status or "live").strip() or "live"
        listing.category_id = draft.category_id
        listing.title = draft.title
        listing.category = draft.category
        listing.gtin = draft.gtin
        listing.sku_code = draft.gtin
        listing.description = draft.description
        listing.video_url = draft.video_url
        listing.cover_url = draft.cover_url
        listing.price = price
        listing.original_price = price
        listing.stock_available = stock_available
        listing.min_purchase_qty = max(min_purchase_qty, 1)
        listing.max_purchase_qty = max_purchase_qty if (max_purchase_qty is None or max_purchase_qty > 0) else None
        listing.max_purchase_mode = max_purchase_mode if max_purchase_mode in {"none", "per_order", "per_time_period"} else "none"
        listing.max_purchase_period_start_date = max_purchase_period_start_date
        listing.max_purchase_period_end_date = max_purchase_period_end_date
        listing.max_purchase_period_qty = max_purchase_period_qty if (max_purchase_period_qty is None or max_purchase_period_qty > 0) else None
        listing.max_purchase_period_days = max_purchase_period_days if (max_purchase_period_days is None or max_purchase_period_days > 0) else None
        listing.max_purchase_period_model = max_purchase_period_model if max_purchase_period_model in {"single", "recurring"} else None
        listing.weight_kg = weight_kg
        listing.parcel_length_cm = parcel_length_cm if (parcel_length_cm is None or parcel_length_cm > 0) else None
        listing.parcel_width_cm = parcel_width_cm if (parcel_width_cm is None or parcel_width_cm > 0) else None
        listing.parcel_height_cm = parcel_height_cm if (parcel_height_cm is None or parcel_height_cm > 0) else None
        listing.shipping_variation_dimension_enabled = shipping_variation_dimension_enabled
        listing.shipping_standard_bulk = shipping_standard_bulk
        listing.shipping_standard = shipping_standard
        listing.shipping_express = shipping_express
        listing.preorder_enabled = preorder_enabled
        listing.insurance_enabled = insurance_enabled
        listing.condition_label = (condition_label or "").strip() or "全新"
        listing.schedule_publish_at = schedule_publish_at
        listing.parent_sku = (parent_sku or "").strip() or None
        listing.status = final_status
        listing.quality_status = (quality_status or "").strip() or "内容待完善"
        listing.images.clear()
        listing.specs.clear()
        listing.wholesale_tiers.clear()
        db.flush()
    else:
        listing = ShopeeListing(
            run_id=run.id,
            user_id=user_id,
            product_id=None,
            category_id=draft.category_id,
            title=draft.title,
            category=draft.category,
            gtin=draft.gtin,
            sku_code=draft.gtin,
            model_id=None,
            description=draft.description,
            video_url=draft.video_url,
            cover_url=draft.cover_url,
            price=price,
            original_price=price,
            sales_count=0,
            stock_available=stock_available,
            min_purchase_qty=max(min_purchase_qty, 1),
            max_purchase_qty=max_purchase_qty if (max_purchase_qty is None or max_purchase_qty > 0) else None,
            max_purchase_mode=max_purchase_mode if max_purchase_mode in {"none", "per_order", "per_time_period"} else "none",
            max_purchase_period_start_date=max_purchase_period_start_date,
            max_purchase_period_end_date=max_purchase_period_end_date,
            max_purchase_period_qty=max_purchase_period_qty if (max_purchase_period_qty is None or max_purchase_period_qty > 0) else None,
            max_purchase_period_days=max_purchase_period_days if (max_purchase_period_days is None or max_purchase_period_days > 0) else None,
            max_purchase_period_model=max_purchase_period_model if max_purchase_period_model in {"single", "recurring"} else None,
            weight_kg=weight_kg,
            parcel_length_cm=parcel_length_cm if (parcel_length_cm is None or parcel_length_cm > 0) else None,
            parcel_width_cm=parcel_width_cm if (parcel_width_cm is None or parcel_width_cm > 0) else None,
            parcel_height_cm=parcel_height_cm if (parcel_height_cm is None or parcel_height_cm > 0) else None,
            shipping_variation_dimension_enabled=shipping_variation_dimension_enabled,
            shipping_standard_bulk=shipping_standard_bulk,
            shipping_standard=shipping_standard,
            shipping_express=shipping_express,
            preorder_enabled=preorder_enabled,
            insurance_enabled=insurance_enabled,
            condition_label=(condition_label or "").strip() or "全新",
            schedule_publish_at=schedule_publish_at,
            parent_sku=(parent_sku or "").strip() or None,
            status=final_status,
            quality_status=(quality_status or "").strip() or "内容待完善",
        )
        db.add(listing)
        db.flush()

    for img in sorted(images_11, key=lambda row: row.sort_order):
        db.add(
            ShopeeListingImage(
                listing_id=listing.id,
                image_url=img.image_url,
                image_ratio="1:1",
                sort_order=img.sort_order,
                is_cover=img.is_cover,
            )
        )

    for img in sorted(images_34, key=lambda row: row.sort_order):
        db.add(
            ShopeeListingImage(
                listing_id=listing.id,
                image_url=img.image_url,
                image_ratio="3:4",
                sort_order=img.sort_order,
                is_cover=img.is_cover and not images_11,
            )
        )

    for spec in draft.specs:
        db.add(
            ShopeeListingSpecValue(
                listing_id=listing.id,
                attr_key=spec.attr_key,
                attr_label=spec.attr_label,
                attr_value=spec.attr_value,
            )
        )

    matched_existing_variant_ids: set[int] = set()
    for row in variant_rows:
        existing_variant: ShopeeListingVariant | None = None
        source_variant_id = row.get("source_variant_id")
        if isinstance(source_variant_id, int) and source_variant_id > 0:
            existing_variant = existing_variant_by_id.get(source_variant_id)
        if not existing_variant:
            sku_key = str(row.get("sku") or "").strip()
            if sku_key:
                existing_variant = existing_variant_by_sku.get(sku_key)
        if not existing_variant:
            option_key = (
                str(row.get("option_value") or "").strip(),
                str(row.get("option_note") or "").strip(),
            )
            existing_variant = existing_variant_by_option.get(option_key)

        image_url = row.get("image_url")
        image_idx = row.get("image_file_index")
        if image_idx is not None:
            if not isinstance(image_idx, int) or image_idx < 0 or image_idx >= len(valid_variant_images):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="变体图片索引无效")
            image_url = _save_shopee_image(db, valid_variant_images[image_idx])
        if not image_url and existing_variant and existing_variant.image_url:
            image_url = existing_variant.image_url
        if source_listing_id and source_listing_id > 0 and existing_variant:
            existing_variant.variant_name = row["variant_name"]
            existing_variant.option_value = row["option_value"]
            existing_variant.option_note = row["option_note"]
            existing_variant.price = row["price"]
            existing_variant.stock = row["stock"]
            existing_variant.sku = row["sku"]
            existing_variant.gtin = row["gtin"]
            existing_variant.item_without_gtin = row["item_without_gtin"]
            existing_variant.weight_kg = row["weight_kg"]
            existing_variant.parcel_length_cm = row["parcel_length_cm"]
            existing_variant.parcel_width_cm = row["parcel_width_cm"]
            existing_variant.parcel_height_cm = row["parcel_height_cm"]
            existing_variant.image_url = image_url
            existing_variant.sort_order = row["sort_order"]
            matched_existing_variant_ids.add(existing_variant.id)
        else:
            db.add(
                ShopeeListingVariant(
                    listing_id=listing.id,
                    variant_name=row["variant_name"],
                    option_value=row["option_value"],
                    option_note=row["option_note"],
                    price=row["price"],
                    stock=row["stock"],
                    sales_count=0,
                    sku=row["sku"],
                    gtin=row["gtin"],
                    item_without_gtin=row["item_without_gtin"],
                    weight_kg=row["weight_kg"],
                    parcel_length_cm=row["parcel_length_cm"],
                    parcel_width_cm=row["parcel_width_cm"],
                    parcel_height_cm=row["parcel_height_cm"],
                    image_url=image_url,
                    sort_order=row["sort_order"],
                )
            )

    if source_listing_id and source_listing_id > 0:
        for existing in existing_variants:
            if existing.id not in matched_existing_variant_ids:
                db.delete(existing)

    for row in wholesale_tier_rows:
        db.add(
            ShopeeListingWholesaleTier(
                listing_id=listing.id,
                tier_no=row["tier_no"],
                min_qty=row["min_qty"],
                max_qty=row["max_qty"],
                unit_price=row["unit_price"],
            )
        )

    draft_id_value = draft.id
    # Release storage by removing draft after successful publish.
    # ShopeeListingDraft relationships use ORM cascade to delete images/spec rows together.
    db.delete(draft)
    db.commit()
    return ShopeeDraftPublishResponse(draft_id=draft_id_value, listing_id=listing.id, status=final_status)


@router.post("/runs/{run_id}/products", response_model=ShopeeCreateListingResponse, status_code=status.HTTP_201_CREATED)
def create_shopee_product(
    run_id: int,
    title: str = Form(..., min_length=2, max_length=120),
    category_id: int | None = Form(default=None),
    category: str | None = Form(default=None),
    gtin: str | None = Form(default=None),
    sku_code: str | None = Form(default=None),
    model_id: str | None = Form(default=None),
    description: str | None = Form(default=None),
    video: UploadFile | None = File(default=None),
    price: int = Form(default=0, ge=0),
    original_price: int = Form(default=0, ge=0),
    stock_available: int = Form(default=0, ge=0),
    min_purchase_qty: int = Form(default=1, ge=1),
    max_purchase_qty: int | None = Form(default=None),
    max_purchase_mode: str = Form(default="none"),
    max_purchase_period_start_date: date | None = Form(default=None),
    max_purchase_period_end_date: date | None = Form(default=None),
    max_purchase_period_qty: int | None = Form(default=None),
    max_purchase_period_days: int | None = Form(default=None),
    max_purchase_period_model: str | None = Form(default=None),
    weight_kg: float | None = Form(default=None),
    parcel_length_cm: int | None = Form(default=None),
    parcel_width_cm: int | None = Form(default=None),
    parcel_height_cm: int | None = Form(default=None),
    shipping_variation_dimension_enabled: bool = Form(default=False),
    shipping_standard_bulk: bool = Form(default=False),
    shipping_standard: bool = Form(default=False),
    shipping_express: bool = Form(default=False),
    preorder_enabled: bool = Form(default=False),
    insurance_enabled: bool = Form(default=False),
    condition_label: str | None = Form(default=None),
    schedule_publish_at: datetime | None = Form(default=None),
    parent_sku: str | None = Form(default=None),
    quality_status: str = Form(default="内容待完善"),
    status_value: str = Form(default="unpublished"),
    cover_index: int = Form(default=0, ge=0),
    cover_index_34: int = Form(default=0, ge=0),
    images: list[UploadFile] = File(default=[]),
    images_34: list[UploadFile] = File(default=[]),
    wholesale_tiers_payload: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> ShopeeCreateListingResponse:
    user_id = int(current_user["id"])
    run = _get_owned_running_run_or_404(db, run_id, user_id)

    resolved_category_id, resolved_category_path = _resolve_category_or_400(db, category_id, category)

    status_white_list = {"live", "violation", "review", "unpublished"}
    status_key = status_value if status_value in status_white_list else "unpublished"
    wholesale_tier_rows = _parse_wholesale_tiers_payload(wholesale_tiers_payload)
    valid_images_11 = [img for img in images if img and (img.filename or "").strip()]
    valid_images_34 = [img for img in images_34 if img and (img.filename or "").strip()]
    if len(valid_images_11) > 9 or len(valid_images_34) > 9:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="1:1 与 3:4 均最多上传 9 张图片")

    upload_urls_11 = [_save_shopee_image(db, img) for img in valid_images_11]
    upload_urls_34 = [_save_shopee_image(db, img) for img in valid_images_34]
    video_url = None
    if video and (video.filename or "").strip():
        video_url = _save_shopee_video(db, video)

    cover_idx_11 = min(max(cover_index, 0), max(len(upload_urls_11) - 1, 0))
    cover_idx_34 = min(max(cover_index_34, 0), max(len(upload_urls_34) - 1, 0))

    cover_url = None
    if upload_urls_11:
        cover_url = upload_urls_11[cover_idx_11]
    elif upload_urls_34:
        cover_url = upload_urls_34[cover_idx_34]

    row = ShopeeListing(
        run_id=run.id,
        user_id=user_id,
        product_id=None,
        category_id=resolved_category_id,
        title=title.strip(),
        category=resolved_category_path or "未分类",
        gtin=(gtin or "").strip() or None,
        sku_code=(sku_code or "").strip() or None,
        model_id=(model_id or "").strip() or None,
        description=(description or "").strip() or None,
        video_url=video_url,
        cover_url=cover_url,
        price=price,
        original_price=original_price if original_price > 0 else price,
        sales_count=0,
        stock_available=stock_available,
        min_purchase_qty=max(min_purchase_qty, 1),
        max_purchase_qty=max_purchase_qty if (max_purchase_qty is None or max_purchase_qty > 0) else None,
        max_purchase_mode=max_purchase_mode if max_purchase_mode in {"none", "per_order", "per_time_period"} else "none",
        max_purchase_period_start_date=max_purchase_period_start_date,
        max_purchase_period_end_date=max_purchase_period_end_date,
        max_purchase_period_qty=max_purchase_period_qty if (max_purchase_period_qty is None or max_purchase_period_qty > 0) else None,
        max_purchase_period_days=max_purchase_period_days if (max_purchase_period_days is None or max_purchase_period_days > 0) else None,
        max_purchase_period_model=max_purchase_period_model if max_purchase_period_model in {"single", "recurring"} else None,
        weight_kg=weight_kg,
        parcel_length_cm=parcel_length_cm if (parcel_length_cm is None or parcel_length_cm > 0) else None,
        parcel_width_cm=parcel_width_cm if (parcel_width_cm is None or parcel_width_cm > 0) else None,
        parcel_height_cm=parcel_height_cm if (parcel_height_cm is None or parcel_height_cm > 0) else None,
        shipping_variation_dimension_enabled=shipping_variation_dimension_enabled,
        shipping_standard_bulk=shipping_standard_bulk,
        shipping_standard=shipping_standard,
        shipping_express=shipping_express,
        preorder_enabled=preorder_enabled,
        insurance_enabled=insurance_enabled,
        condition_label=(condition_label or "").strip() or "全新",
        schedule_publish_at=schedule_publish_at,
        parent_sku=(parent_sku or "").strip() or None,
        status=status_key,
        quality_status=(quality_status or "").strip() or "内容待完善",
    )
    db.add(row)
    db.flush()

    for idx, image_url in enumerate(upload_urls_11):
        db.add(
            ShopeeListingImage(
                listing_id=row.id,
                image_url=image_url,
                image_ratio="1:1",
                sort_order=idx,
                is_cover=(idx == cover_idx_11),
            )
        )

    for idx, image_url in enumerate(upload_urls_34):
        db.add(
            ShopeeListingImage(
                listing_id=row.id,
                image_url=image_url,
                image_ratio="3:4",
                sort_order=idx,
                is_cover=(not upload_urls_11 and idx == cover_idx_34),
            )
        )

    for tier in wholesale_tier_rows:
        db.add(
            ShopeeListingWholesaleTier(
                listing_id=row.id,
                tier_no=tier["tier_no"],
                min_qty=tier["min_qty"],
                max_qty=tier["max_qty"],
                unit_price=tier["unit_price"],
            )
        )

    db.commit()
    db.refresh(row)
    return ShopeeCreateListingResponse(id=row.id, title=row.title, cover_url=row.cover_url)
