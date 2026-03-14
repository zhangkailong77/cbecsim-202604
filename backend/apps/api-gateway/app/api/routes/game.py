from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.core.security import get_current_user
from app.db import get_db
from app.models import (
    GameRun,
    LogisticsShipment,
    LogisticsShipmentOrder,
    MarketProduct,
    ProcurementOrder,
    ProcurementOrderItem,
    User,
)


router = APIRouter(prefix="/game", tags=["game"])


class CreateRunRequest(BaseModel):
    initial_cash: int = Field(ge=1000, le=100000000)
    market: str = Field(min_length=2, max_length=16)
    duration_days: int = Field(ge=30, le=3650)


class RunResponse(BaseModel):
    id: int
    user_id: int
    initial_cash: int
    market: str
    duration_days: int
    day_index: int
    status: str
    created_at: datetime


class CurrentRunResponse(BaseModel):
    run: RunResponse | None


class ProcurementSummaryResponse(BaseModel):
    run_id: int
    total_cash: int
    spent_total: int
    logistics_spent_total: int
    remaining_cash: int


class ProcurementOrderItemPayload(BaseModel):
    product_id: int
    quantity: int = Field(ge=1000, le=1000000)


class ProcurementCreateOrderRequest(BaseModel):
    items: list[ProcurementOrderItemPayload] = Field(min_length=1, max_length=200)


class ProcurementOrderItemResponse(BaseModel):
    product_id: int
    product_name: str
    unit_price: int
    quantity: int
    line_total: int


class ProcurementOrderResponse(BaseModel):
    id: int
    total_amount: int
    created_at: datetime
    items: list[ProcurementOrderItemResponse]


class ProcurementOrdersResponse(BaseModel):
    orders: list[ProcurementOrderResponse]


class ProcurementCreateOrderResponse(BaseModel):
    order_id: int
    total_amount: int
    spent_total: int
    remaining_cash: int


class LogisticsCreateShipmentRequest(BaseModel):
    order_ids: list[int] = Field(min_length=1, max_length=200)
    forwarder_key: str = Field(min_length=2, max_length=32)
    customs_key: str = Field(min_length=2, max_length=32)


class LogisticsShipmentResponse(BaseModel):
    id: int
    order_ids: list[int]
    forwarder_key: str
    forwarder_label: str
    customs_key: str
    customs_label: str
    cargo_value: int
    logistics_fee: int
    customs_fee: int
    total_fee: int
    transport_days: int
    customs_days: int
    created_at: datetime


class LogisticsShipmentsResponse(BaseModel):
    shipments: list[LogisticsShipmentResponse]


class LogisticsCreateShipmentResponse(BaseModel):
    shipment_id: int
    total_fee: int
    spent_total: int
    logistics_spent_total: int
    remaining_cash: int


def _to_run_response(run: GameRun) -> RunResponse:
    return RunResponse(
        id=run.id,
        user_id=run.user_id,
        initial_cash=run.initial_cash,
        market=run.market,
        duration_days=run.duration_days,
        day_index=run.day_index,
        status=run.status,
        created_at=run.created_at,
    )


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


def _calc_run_procurement_spent(db: Session, run_id: int) -> int:
    spent = db.query(func.coalesce(func.sum(ProcurementOrder.total_amount), 0)).filter(ProcurementOrder.run_id == run_id).scalar()
    return int(spent or 0)


def _calc_run_logistics_spent(db: Session, run_id: int) -> int:
    spent = db.query(func.coalesce(func.sum(LogisticsShipment.total_fee), 0)).filter(LogisticsShipment.run_id == run_id).scalar()
    return int(spent or 0)


@router.get("/runs/current", response_model=CurrentRunResponse)
def get_current_run(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentRunResponse:
    run = (
        db.query(GameRun)
        .filter(
            GameRun.user_id == current_user["id"],
            GameRun.status == "running",
        )
        .order_by(GameRun.id.desc())
        .first()
    )
    if not run:
        return CurrentRunResponse(run=None)
    return CurrentRunResponse(run=_to_run_response(run))


@router.post("/runs", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
def create_run(
    payload: CreateRunRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunResponse:
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user")
    if user.role != "player":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only player can create runs")

    existing_running = (
        db.query(GameRun)
        .filter(
            GameRun.user_id == user.id,
            GameRun.status == "running",
        )
        .first()
    )
    if existing_running:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A running game already exists",
        )

    run = GameRun(
        user_id=user.id,
        initial_cash=payload.initial_cash,
        market=payload.market.strip().upper(),
        duration_days=payload.duration_days,
        day_index=1,
        status="running",
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return _to_run_response(run)


@router.post("/runs/reset-current", response_model=RunResponse)
def reset_current_run(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunResponse:
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user")
    if user.role != "player":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only player can reset runs")

    run = (
        db.query(GameRun)
        .filter(
            GameRun.user_id == user.id,
            GameRun.status == "running",
        )
        .order_by(GameRun.id.desc())
        .first()
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No running game found")

    run.status = "abandoned"
    db.commit()
    db.refresh(run)
    return _to_run_response(run)


@router.get("/runs/{run_id}/procurement/cart-summary", response_model=ProcurementSummaryResponse)
def get_procurement_cart_summary(
    run_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProcurementSummaryResponse:
    run = _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])
    spent_total = _calc_run_procurement_spent(db, run.id)
    logistics_spent_total = _calc_run_logistics_spent(db, run.id)
    remaining_cash = max(0, run.initial_cash - spent_total - logistics_spent_total)
    return ProcurementSummaryResponse(
        run_id=run.id,
        total_cash=run.initial_cash,
        spent_total=spent_total,
        logistics_spent_total=logistics_spent_total,
        remaining_cash=remaining_cash,
    )


@router.get("/runs/{run_id}/procurement/orders", response_model=ProcurementOrdersResponse)
def list_procurement_orders(
    run_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProcurementOrdersResponse:
    run = _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])
    rows = (
        db.query(ProcurementOrder)
        .options(selectinload(ProcurementOrder.items))
        .filter(ProcurementOrder.run_id == run.id)
        .order_by(ProcurementOrder.id.desc())
        .all()
    )
    return ProcurementOrdersResponse(
        orders=[
            ProcurementOrderResponse(
                id=row.id,
                total_amount=row.total_amount,
                created_at=row.created_at,
                items=[
                    ProcurementOrderItemResponse(
                        product_id=item.product_id,
                        product_name=item.product_name_snapshot,
                        unit_price=item.unit_price,
                        quantity=item.quantity,
                        line_total=item.line_total,
                    )
                    for item in row.items
                ],
            )
            for row in rows
        ]
    )


@router.post("/runs/{run_id}/procurement/orders", response_model=ProcurementCreateOrderResponse, status_code=status.HTTP_201_CREATED)
def create_procurement_order(
    run_id: int,
    payload: ProcurementCreateOrderRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProcurementCreateOrderResponse:
    run = _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])

    quantity_map: dict[int, int] = {}
    for item in payload.items:
        quantity_map[item.product_id] = quantity_map.get(item.product_id, 0) + item.quantity

    products = (
        db.query(MarketProduct)
        .filter(
            MarketProduct.id.in_(list(quantity_map.keys())),
            MarketProduct.market == run.market,
        )
        .all()
    )
    product_map = {product.id: product for product in products}
    missing = [pid for pid in quantity_map if pid not in product_map]
    if missing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Some products are invalid for this market")

    line_items: list[tuple[MarketProduct, int, int]] = []
    order_total = 0
    for product_id, quantity in quantity_map.items():
        product = product_map[product_id]
        line_total = product.supplier_price * quantity
        order_total += line_total
        line_items.append((product, quantity, line_total))

    spent_total = _calc_run_procurement_spent(db, run.id)
    logistics_spent_total = _calc_run_logistics_spent(db, run.id)
    remaining_cash = run.initial_cash - spent_total - logistics_spent_total
    if order_total > remaining_cash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient cash balance, remaining {max(0, remaining_cash)}",
        )

    order = ProcurementOrder(
        run_id=run.id,
        user_id=current_user["id"],
        total_amount=order_total,
    )
    db.add(order)
    db.flush()

    for product, quantity, line_total in line_items:
        db.add(
            ProcurementOrderItem(
                order_id=order.id,
                product_id=product.id,
                product_name_snapshot=product.product_name,
                unit_price=product.supplier_price,
                quantity=quantity,
                line_total=line_total,
            )
        )

    db.commit()
    db.refresh(order)

    updated_spent = spent_total + order_total
    return ProcurementCreateOrderResponse(
        order_id=order.id,
        total_amount=order_total,
        spent_total=updated_spent,
        remaining_cash=max(0, run.initial_cash - updated_spent - logistics_spent_total),
    )


@router.get("/runs/{run_id}/logistics/shipments", response_model=LogisticsShipmentsResponse)
def list_logistics_shipments(
    run_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LogisticsShipmentsResponse:
    run = _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])
    rows = (
        db.query(LogisticsShipment)
        .options(selectinload(LogisticsShipment.orders))
        .filter(LogisticsShipment.run_id == run.id)
        .order_by(LogisticsShipment.id.desc())
        .all()
    )
    return LogisticsShipmentsResponse(
        shipments=[
            LogisticsShipmentResponse(
                id=row.id,
                order_ids=[item.procurement_order_id for item in row.orders],
                forwarder_key=row.forwarder_key,
                forwarder_label=row.forwarder_label,
                customs_key=row.customs_key,
                customs_label=row.customs_label,
                cargo_value=row.cargo_value,
                logistics_fee=row.logistics_fee,
                customs_fee=row.customs_fee,
                total_fee=row.total_fee,
                transport_days=row.transport_days,
                customs_days=row.customs_days,
                created_at=row.created_at,
            )
            for row in rows
        ]
    )


@router.post("/runs/{run_id}/logistics/shipments", response_model=LogisticsCreateShipmentResponse, status_code=status.HTTP_201_CREATED)
def create_logistics_shipment(
    run_id: int,
    payload: LogisticsCreateShipmentRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LogisticsCreateShipmentResponse:
    run = _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])

    order_ids = list(dict.fromkeys(payload.order_ids))
    orders = (
        db.query(ProcurementOrder)
        .options(selectinload(ProcurementOrder.items))
        .filter(
            ProcurementOrder.run_id == run.id,
            ProcurementOrder.id.in_(order_ids),
        )
        .all()
    )
    if len(orders) != len(order_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Some procurement orders are invalid")

    existing_links = (
        db.query(LogisticsShipmentOrder)
        .join(LogisticsShipment, LogisticsShipment.id == LogisticsShipmentOrder.shipment_id)
        .filter(
            LogisticsShipment.run_id == run.id,
            LogisticsShipmentOrder.procurement_order_id.in_(order_ids),
        )
        .all()
    )
    if existing_links:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Some procurement orders are already shipped")

    forwarder_map = {
        "economy": {"label": "经济线（马来）", "fee_rate": 0.035, "fixed_fee": 1800, "eta_days": 18},
        "standard": {"label": "标准线（马来）", "fee_rate": 0.052, "fixed_fee": 2600, "eta_days": 12},
        "express": {"label": "快速线（马来）", "fee_rate": 0.075, "fixed_fee": 3600, "eta_days": 8},
    }
    customs_map = {
        "normal": {"label": "标准清关", "add_fee": 0, "days": 4},
        "priority": {"label": "加急清关", "add_fee": 1200, "days": 2},
    }
    if payload.forwarder_key not in forwarder_map:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid forwarder key")
    if payload.customs_key not in customs_map:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid customs key")

    selected_forwarder = forwarder_map[payload.forwarder_key]
    selected_customs = customs_map[payload.customs_key]
    cargo_value = int(sum(order.total_amount for order in orders))
    logistics_fee = int(round(cargo_value * selected_forwarder["fee_rate"]) + selected_forwarder["fixed_fee"])
    customs_fee = int(round(cargo_value * 0.02) + 600 + selected_customs["add_fee"])
    total_fee = logistics_fee + customs_fee

    procurement_spent_total = _calc_run_procurement_spent(db, run.id)
    logistics_spent_total = _calc_run_logistics_spent(db, run.id)
    remaining_cash = run.initial_cash - procurement_spent_total - logistics_spent_total
    if total_fee > remaining_cash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient cash balance, remaining {max(0, remaining_cash)}",
        )

    shipment = LogisticsShipment(
        run_id=run.id,
        user_id=current_user["id"],
        market=run.market,
        forwarder_key=payload.forwarder_key,
        forwarder_label=selected_forwarder["label"],
        customs_key=payload.customs_key,
        customs_label=selected_customs["label"],
        cargo_value=cargo_value,
        logistics_fee=logistics_fee,
        customs_fee=customs_fee,
        total_fee=total_fee,
        transport_days=selected_forwarder["eta_days"],
        customs_days=selected_customs["days"],
    )
    db.add(shipment)
    db.flush()

    for order in orders:
        total_quantity = sum(item.quantity for item in order.items)
        db.add(
            LogisticsShipmentOrder(
                shipment_id=shipment.id,
                procurement_order_id=order.id,
                order_total_amount=order.total_amount,
                order_total_quantity=total_quantity,
            )
        )

    db.commit()

    updated_logistics_spent = logistics_spent_total + total_fee
    return LogisticsCreateShipmentResponse(
        shipment_id=shipment.id,
        total_fee=total_fee,
        spent_total=procurement_spent_total,
        logistics_spent_total=updated_logistics_spent,
        remaining_cash=max(0, run.initial_cash - procurement_spent_total - updated_logistics_spent),
    )
