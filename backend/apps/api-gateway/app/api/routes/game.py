from datetime import datetime, timedelta
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.core.security import get_current_user
from app.db import get_db
from app.models import (
    GameRun,
    GameRunCashAdjustment,
    InventoryLot,
    LogisticsShipment,
    LogisticsShipmentOrder,
    MarketProduct,
    ProcurementOrder,
    ProcurementOrderItem,
    SimBuyerProfile,
    ShopeeOrderGenerationLog,
    User,
    WarehouseInboundOrder,
    WarehouseLandmark,
    WarehouseStrategy,
)
from app.services.shopee_order_simulator import simulate_orders_for_run
from app.services.shopee_order_cancellation import auto_cancel_overdue_orders_by_tick


router = APIRouter(prefix="/game", tags=["game"])
REAL_SECONDS_PER_GAME_DAY = 30 * 60
BOOKED_SECONDS = 10


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
    initial_cash: float
    income_withdrawal_total: float
    total_expense: float
    current_balance: float
    total_cash: float
    spent_total: int
    logistics_spent_total: int
    warehouse_spent_total: int
    remaining_cash: float


class GameFinanceDetailRowResponse(BaseModel):
    id: str
    direction: str
    type: str
    type_label: str
    amount: float
    created_at: datetime
    remark: str | None = None


class GameFinanceDetailsResponse(BaseModel):
    tab: str
    page: int
    page_size: int
    total: int
    rows: list[GameFinanceDetailRowResponse]


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
    remaining_cash: float


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
    warehouse_spent_total: int
    remaining_cash: float


class WarehouseInboundCandidateItem(BaseModel):
    shipment_id: int
    cargo_value: int
    total_quantity: int
    created_at: datetime
    forwarder_label: str
    customs_label: str
    status: str


class WarehouseInboundCandidatesResponse(BaseModel):
    candidates: list[WarehouseInboundCandidateItem]


class WarehouseOptionsResponse(BaseModel):
    warehouse_modes: list[dict]
    warehouse_locations: list[dict]


class WarehouseLandmarkPointResponse(BaseModel):
    point_code: str
    point_name: str
    warehouse_mode: str
    warehouse_location: str
    lng: float
    lat: float
    sort_order: int


class WarehouseLandmarksResponse(BaseModel):
    market: str
    points: list[WarehouseLandmarkPointResponse]


class WarehouseStrategyCreateRequest(BaseModel):
    warehouse_mode: str = Field(min_length=2, max_length=32)
    warehouse_location: str = Field(min_length=2, max_length=32)


class WarehouseStrategyResponse(BaseModel):
    id: int
    warehouse_mode: str
    warehouse_location: str
    one_time_cost: int
    inbound_cost: int
    rent_cost: int
    total_cost: int
    delivery_eta_score: int
    fulfillment_accuracy: float
    warehouse_cost_per_order: int
    created_at: datetime


class WarehouseCreateStrategyResponse(BaseModel):
    strategy: WarehouseStrategyResponse
    remaining_cash: float


class WarehouseInboundRequest(BaseModel):
    # 按文档保留接口结构；V1 默认空则代表一次性入全部可入仓物流单
    shipment_ids: list[int] = Field(default_factory=list, max_length=500)


class WarehouseInboundResponse(BaseModel):
    inbound_count: int
    shipment_ids: list[int]
    inventory_lot_count: int
    remaining_cash: float


class WarehouseSummaryResponse(BaseModel):
    strategy: WarehouseStrategyResponse | None
    pending_inbound_count: int
    completed_inbound_count: int
    inventory_total_quantity: int
    inventory_total_sku: int


class AdminBuyerPoolProfileResponse(BaseModel):
    id: int
    buyer_code: str
    nickname: str
    gender: str | None
    age: int | None
    city: str | None
    occupation: str | None
    background: str | None
    preferred_categories: list[str]
    base_buy_intent: float
    price_sensitivity: float
    quality_sensitivity: float
    brand_sensitivity: float
    impulse_level: float
    purchase_power: float
    current_hour_active_prob: float
    current_hour_order_intent_prob: float
    peak_hour: int


class AdminBuyerPoolOverviewResponse(BaseModel):
    selected_run_id: int | None
    selected_run_status: str | None
    selected_run_market: str | None
    selected_run_username: str | None
    selected_run_day_index: int | None
    selected_run_created_at: datetime | None
    server_time: datetime
    game_clock: str
    game_hour: int
    game_minute: int
    buyer_count: int
    currently_active_estimate: float
    expected_orders_per_hour: float
    profiles: list[AdminBuyerPoolProfileResponse]


class AdminRunOptionResponse(BaseModel):
    run_id: int
    user_id: int
    username: str
    status: str
    market: str
    day_index: int
    created_at: datetime


class AdminRunOptionsResponse(BaseModel):
    runs: list[AdminRunOptionResponse]


class AdminSimulateOrdersResponse(BaseModel):
    tick_time: datetime
    active_buyer_count: int
    candidate_product_count: int
    generated_order_count: int
    skip_reasons: dict[str, int] = Field(default_factory=dict)
    shop_context: dict[str, Any] = Field(default_factory=dict)
    buyer_journeys: list[dict[str, Any]] = Field(default_factory=list)
    cancellation_logs: list[dict[str, Any]] = Field(default_factory=list)


def _require_super_admin_or_403(current_user: dict):
    if (current_user.get("role") or "").strip() != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可访问")


def _parse_float_list(raw_json: str, expected_len: int, fallback: float) -> list[float]:
    try:
        raw = json.loads(raw_json or "[]")
    except Exception:
        raw = []
    if not isinstance(raw, list):
        raw = []
    values = []
    for i in range(expected_len):
        item = raw[i] if i < len(raw) else fallback
        try:
            num = float(item)
        except Exception:
            num = fallback
        values.append(max(0.0, min(1.0, num)))
    return values


def _parse_str_list(raw_json: str) -> list[str]:
    try:
        raw = json.loads(raw_json or "[]")
    except Exception:
        return []
    if not isinstance(raw, list):
        return []
    result: list[str] = []
    for item in raw:
        text = str(item).strip()
        if text:
            result.append(text)
    return result


@router.get("/admin/buyer-pool/overview", response_model=AdminBuyerPoolOverviewResponse)
def get_admin_buyer_pool_overview(
    run_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> AdminBuyerPoolOverviewResponse:
    _require_super_admin_or_403(current_user)

    selected_run: GameRun | None = None
    selected_run_username: str | None = None
    selected_run_day_index: int | None = None
    if run_id is not None:
        selected_run = db.query(GameRun).filter(GameRun.id == run_id).first()
        if not selected_run:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    else:
        selected_run = db.query(GameRun).order_by(GameRun.id.desc()).first()
    if selected_run:
        selected_run_username = (
            db.query(User.username).filter(User.id == selected_run.user_id).scalar()
        )

    server_now = datetime.now()
    if selected_run:
        run_created = selected_run.created_at
        elapsed_seconds = max(0, int((server_now - run_created).total_seconds()))
        total_real_seconds = 7 * 24 * 60 * 60
        game_day_float = (elapsed_seconds / total_real_seconds) * 365 + 1
        selected_run_day_index = min(365, max(1, int(game_day_float)))
        frac = game_day_float - int(game_day_float)
        seconds_of_day = max(0, int(frac * 24 * 60 * 60))
    else:
        seconds_of_day = server_now.hour * 3600 + server_now.minute * 60 + server_now.second
    game_minutes = seconds_of_day % (24 * 60)
    game_hour = game_minutes // 60
    game_minute = game_minutes % 60
    game_clock = f"{game_hour:02d}:{game_minute:02d}:{seconds_of_day % 60:02d}"

    rows = (
        db.query(SimBuyerProfile)
        .filter(SimBuyerProfile.is_active == True)
        .order_by(SimBuyerProfile.buyer_code.asc())
        .all()
    )

    profiles: list[AdminBuyerPoolProfileResponse] = []
    currently_active_estimate = 0.0
    expected_orders_per_hour = 0.0

    for row in rows:
        active_hours = _parse_float_list(row.active_hours_json, 24, 0.05)
        current_hour_active = active_hours[game_hour]
        peak_hour = max(range(24), key=lambda i: active_hours[i])
        base_intent = max(0.0, min(1.0, float(row.base_buy_intent or 0.0)))
        current_hour_order_intent = max(0.0, min(1.0, current_hour_active * base_intent))

        currently_active_estimate += current_hour_active
        expected_orders_per_hour += current_hour_order_intent

        profiles.append(
            AdminBuyerPoolProfileResponse(
                id=row.id,
                buyer_code=row.buyer_code,
                nickname=row.nickname,
                gender=row.gender,
                age=row.age,
                city=row.city,
                occupation=row.occupation,
                background=row.background,
                preferred_categories=_parse_str_list(row.preferred_categories_json),
                base_buy_intent=base_intent,
                price_sensitivity=max(0.0, min(1.0, float(row.price_sensitivity or 0.0))),
                quality_sensitivity=max(0.0, min(1.0, float(row.quality_sensitivity or 0.0))),
                brand_sensitivity=max(0.0, min(1.0, float(row.brand_sensitivity or 0.0))),
                impulse_level=max(0.0, min(1.0, float(row.impulse_level or 0.0))),
                purchase_power=max(0.0, min(1.0, float(row.purchase_power or 0.0))),
                current_hour_active_prob=current_hour_active,
                current_hour_order_intent_prob=current_hour_order_intent,
                peak_hour=peak_hour,
            )
        )

    return AdminBuyerPoolOverviewResponse(
        selected_run_id=selected_run.id if selected_run else None,
        selected_run_status=selected_run.status if selected_run else None,
        selected_run_market=selected_run.market if selected_run else None,
        selected_run_username=selected_run_username,
        selected_run_day_index=selected_run_day_index if selected_run else None,
        selected_run_created_at=selected_run.created_at if selected_run else None,
        server_time=server_now,
        game_clock=game_clock,
        game_hour=game_hour,
        game_minute=game_minute,
        buyer_count=len(profiles),
        currently_active_estimate=round(currently_active_estimate, 3),
        expected_orders_per_hour=round(expected_orders_per_hour, 3),
        profiles=profiles,
    )


@router.get("/admin/runs/options", response_model=AdminRunOptionsResponse)
def get_admin_run_options(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> AdminRunOptionsResponse:
    _require_super_admin_or_403(current_user)

    rows = (
        db.query(GameRun, User.username)
        .join(User, User.id == GameRun.user_id)
        .order_by(GameRun.id.desc())
        .limit(200)
        .all()
    )
    runs = [
        AdminRunOptionResponse(
            run_id=run.id,
            user_id=run.user_id,
            username=username,
            status=run.status,
            market=run.market,
            day_index=run.day_index,
            created_at=run.created_at,
        )
        for run, username in rows
    ]
    return AdminRunOptionsResponse(runs=runs)


@router.post("/admin/runs/{run_id}/orders/simulate", response_model=AdminSimulateOrdersResponse)
def admin_simulate_orders(
    run_id: int,
    tick_time: datetime | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> AdminSimulateOrdersResponse:
    _require_super_admin_or_403(current_user)
    run = db.query(GameRun).filter(GameRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    if (run.status or "").strip() != "running":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Run is not running")

    effective_tick_time = tick_time
    if effective_tick_time is None:
        last_log = (
            db.query(ShopeeOrderGenerationLog)
            .filter(
                ShopeeOrderGenerationLog.run_id == run.id,
                ShopeeOrderGenerationLog.user_id == run.user_id,
            )
            .order_by(ShopeeOrderGenerationLog.tick_time.desc(), ShopeeOrderGenerationLog.id.desc())
            .first()
        )
        if last_log and last_log.tick_time:
            effective_tick_time = last_log.tick_time + timedelta(hours=1)
        else:
            effective_tick_time = datetime.utcnow()

    result = simulate_orders_for_run(db, run_id=run.id, user_id=run.user_id, tick_time=effective_tick_time)
    cancellation_logs = auto_cancel_overdue_orders_by_tick(
        db,
        run_id=run.id,
        user_id=run.user_id,
        current_tick=result["tick_time"],
        commit=True,
    )
    owner_username = db.query(User.username).filter(User.id == run.user_id).scalar()
    return AdminSimulateOrdersResponse(
        tick_time=result["tick_time"],
        active_buyer_count=result["active_buyer_count"],
        candidate_product_count=result["candidate_product_count"],
        generated_order_count=result["generated_order_count"],
        skip_reasons=result["skip_reasons"],
        shop_context={
            "run_id": run.id,
            "user_id": run.user_id,
            "username": owner_username,
            "market": run.market,
            "status": run.status,
        },
        buyer_journeys=result.get("buyer_journeys") or [],
        cancellation_logs=cancellation_logs,
    )


def _to_warehouse_strategy_response(row: WarehouseStrategy) -> WarehouseStrategyResponse:
    return WarehouseStrategyResponse(
        id=row.id,
        warehouse_mode=row.warehouse_mode,
        warehouse_location=row.warehouse_location,
        one_time_cost=row.one_time_cost,
        inbound_cost=row.inbound_cost,
        rent_cost=row.rent_cost,
        total_cost=row.total_cost,
        delivery_eta_score=row.delivery_eta_score,
        fulfillment_accuracy=row.fulfillment_accuracy,
        warehouse_cost_per_order=row.warehouse_cost_per_order,
        created_at=row.created_at,
    )


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


def _calc_run_warehouse_spent(db: Session, run_id: int) -> int:
    spent = db.query(func.coalesce(func.sum(WarehouseStrategy.total_cost), 0)).filter(WarehouseStrategy.run_id == run_id).scalar()
    return int(spent or 0)


def _calc_run_cash_adjustment_in(db: Session, run_id: int) -> float:
    amount = (
        db.query(func.coalesce(func.sum(GameRunCashAdjustment.amount), 0.0))
        .filter(
            GameRunCashAdjustment.run_id == run_id,
            GameRunCashAdjustment.direction == "in",
        )
        .scalar()
        or 0.0
    )
    return round(float(amount), 2)


def _calc_run_withdrawal_income_total(db: Session, run_id: int) -> float:
    amount = (
        db.query(func.coalesce(func.sum(GameRunCashAdjustment.amount), 0.0))
        .filter(
            GameRunCashAdjustment.run_id == run_id,
            GameRunCashAdjustment.direction == "in",
            GameRunCashAdjustment.source == "shopee_withdrawal",
        )
        .scalar()
        or 0.0
    )
    return round(float(amount), 2)


def _calc_run_cash_adjustment_out(db: Session, run_id: int) -> float:
    amount = (
        db.query(func.coalesce(func.sum(GameRunCashAdjustment.amount), 0.0))
        .filter(
            GameRunCashAdjustment.run_id == run_id,
            GameRunCashAdjustment.direction == "out",
        )
        .scalar()
        or 0.0
    )
    return round(float(amount), 2)


def _calc_run_total_cash(db: Session, run: GameRun) -> float:
    adjustment_in = _calc_run_cash_adjustment_in(db, run.id)
    adjustment_out = _calc_run_cash_adjustment_out(db, run.id)
    return round(float(run.initial_cash) + adjustment_in - adjustment_out, 2)


def _calc_run_remaining_cash(
    db: Session,
    run: GameRun,
    *,
    procurement_spent_total: int,
    logistics_spent_total: int,
    warehouse_spent_total: int,
) -> float:
    total_cash = _calc_run_total_cash(db, run)
    remaining = total_cash - float(procurement_spent_total) - float(logistics_spent_total) - float(warehouse_spent_total)
    return round(max(0.0, remaining), 2)


def _list_run_income_detail_rows(db: Session, run_id: int) -> list[GameFinanceDetailRowResponse]:
    rows = (
        db.query(GameRunCashAdjustment)
        .filter(
            GameRunCashAdjustment.run_id == run_id,
            GameRunCashAdjustment.direction == "in",
            GameRunCashAdjustment.source == "shopee_withdrawal",
        )
        .order_by(GameRunCashAdjustment.created_at.desc(), GameRunCashAdjustment.id.desc())
        .all()
    )
    return [
        GameFinanceDetailRowResponse(
            id=f"cash_adj:{row.id}",
            direction="in",
            type="withdrawal_transfer",
            type_label="提现转入",
            amount=round(float(row.amount or 0), 2),
            created_at=row.created_at,
            remark=row.remark,
        )
        for row in rows
    ]


def _list_run_expense_detail_rows(db: Session, run_id: int) -> list[GameFinanceDetailRowResponse]:
    procurement_rows = (
        db.query(ProcurementOrder)
        .filter(ProcurementOrder.run_id == run_id)
        .order_by(ProcurementOrder.created_at.desc(), ProcurementOrder.id.desc())
        .all()
    )
    logistics_rows = (
        db.query(LogisticsShipment)
        .filter(LogisticsShipment.run_id == run_id)
        .order_by(LogisticsShipment.created_at.desc(), LogisticsShipment.id.desc())
        .all()
    )
    warehouse_rows = (
        db.query(WarehouseStrategy)
        .filter(WarehouseStrategy.run_id == run_id)
        .order_by(WarehouseStrategy.created_at.desc(), WarehouseStrategy.id.desc())
        .all()
    )

    merged: list[GameFinanceDetailRowResponse] = []
    merged.extend(
        [
            GameFinanceDetailRowResponse(
                id=f"procurement:{row.id}",
                direction="out",
                type="procurement",
                type_label="采购支出",
                amount=round(float(row.total_amount or 0), 2),
                created_at=row.created_at,
                remark=f"采购单 #{row.id}",
            )
            for row in procurement_rows
        ]
    )
    merged.extend(
        [
            GameFinanceDetailRowResponse(
                id=f"logistics:{row.id}",
                direction="out",
                type="logistics",
                type_label="物流支出",
                amount=round(float(row.total_fee or 0), 2),
                created_at=row.created_at,
                remark=f"物流单 #{row.id}",
            )
            for row in logistics_rows
        ]
    )
    merged.extend(
        [
            GameFinanceDetailRowResponse(
                id=f"warehouse:{row.id}",
                direction="out",
                type="warehouse",
                type_label="仓储支出",
                amount=round(float(row.total_cost or 0), 2),
                created_at=row.created_at,
                remark=f"仓储策略 #{row.id}",
            )
            for row in warehouse_rows
        ]
    )
    merged.sort(key=lambda item: (item.created_at, item.id), reverse=True)
    return merged


def _warehouse_mode_options() -> dict[str, dict]:
    return {
        "official": {
            "label": "Shopee 官方仓",
            "one_time_base": 0,
            "inbound_rate": 0.018,
            "rent_base": 8000,
            "delivery_eta_score": 92,
            "fulfillment_accuracy": 0.992,
            "warehouse_cost_per_order": 6,
        },
        "third_party": {
            "label": "第三方仓",
            "one_time_base": 0,
            "inbound_rate": 0.012,
            "rent_base": 5200,
            "delivery_eta_score": 78,
            "fulfillment_accuracy": 0.945,
            "warehouse_cost_per_order": 4,
        },
        "self_built": {
            "label": "自建仓",
            "one_time_base": 50000,
            "inbound_rate": 0.009,
            "rent_base": 2800,
            "delivery_eta_score": 95,
            "fulfillment_accuracy": 0.995,
            "warehouse_cost_per_order": 3,
        },
    }


def _warehouse_location_options() -> dict[str, dict]:
    return {
        "near_kl": {
            "label": "近吉隆坡仓位",
            "rent_delta": 2200,
            "eta_delta": 4,
        },
        "far_kl": {
            "label": "远吉隆坡仓位",
            "rent_delta": -1000,
            "eta_delta": -3,
        },
    }


def _calc_shipment_status(shipment: LogisticsShipment, now: datetime) -> str:
    created = shipment.created_at
    if created.tzinfo is not None and now.tzinfo is None:
        now = now.replace(tzinfo=created.tzinfo)
    elif created.tzinfo is None and now.tzinfo is not None:
        now = now.replace(tzinfo=None)
    elapsed_seconds = max(0, int((now - created).total_seconds()))
    transport_seconds = max(1, int(shipment.transport_days * REAL_SECONDS_PER_GAME_DAY))
    customs_seconds = max(1, int(shipment.customs_days * REAL_SECONDS_PER_GAME_DAY))
    if elapsed_seconds >= BOOKED_SECONDS + transport_seconds + customs_seconds:
        return "customs_cleared"
    if elapsed_seconds >= BOOKED_SECONDS + transport_seconds:
        return "customs_processing"
    if elapsed_seconds >= BOOKED_SECONDS:
        return "in_transit"
    return "booked"


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
    warehouse_spent_total = _calc_run_warehouse_spent(db, run.id)
    income_withdrawal_total = _calc_run_withdrawal_income_total(db, run.id)
    total_expense = float(spent_total + logistics_spent_total + warehouse_spent_total)
    total_cash = _calc_run_total_cash(db, run)
    remaining_cash = _calc_run_remaining_cash(
        db,
        run,
        procurement_spent_total=spent_total,
        logistics_spent_total=logistics_spent_total,
        warehouse_spent_total=warehouse_spent_total,
    )
    return ProcurementSummaryResponse(
        run_id=run.id,
        initial_cash=float(run.initial_cash),
        income_withdrawal_total=income_withdrawal_total,
        total_expense=round(total_expense, 2),
        current_balance=remaining_cash,
        total_cash=total_cash,
        spent_total=spent_total,
        logistics_spent_total=logistics_spent_total,
        warehouse_spent_total=warehouse_spent_total,
        remaining_cash=remaining_cash,
    )


@router.get("/runs/{run_id}/finance/details", response_model=GameFinanceDetailsResponse)
def list_run_finance_details(
    run_id: int,
    tab: str = Query(default="income"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GameFinanceDetailsResponse:
    run = _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])
    normalized_tab = (tab or "income").strip().lower()
    if normalized_tab not in {"income", "expense"}:
        normalized_tab = "income"

    if normalized_tab == "income":
        all_rows = _list_run_income_detail_rows(db, run.id)
    else:
        all_rows = _list_run_expense_detail_rows(db, run.id)

    total = len(all_rows)
    start = (page - 1) * page_size
    end = start + page_size
    rows = all_rows[start:end]
    return GameFinanceDetailsResponse(
        tab=normalized_tab,
        page=page,
        page_size=page_size,
        total=total,
        rows=rows,
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
    warehouse_spent_total = _calc_run_warehouse_spent(db, run.id)
    remaining_cash = _calc_run_remaining_cash(
        db,
        run,
        procurement_spent_total=spent_total,
        logistics_spent_total=logistics_spent_total,
        warehouse_spent_total=warehouse_spent_total,
    )
    if order_total > remaining_cash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient cash balance, remaining {remaining_cash}",
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
        remaining_cash=_calc_run_remaining_cash(
            db,
            run,
            procurement_spent_total=updated_spent,
            logistics_spent_total=logistics_spent_total,
            warehouse_spent_total=warehouse_spent_total,
        ),
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
    warehouse_spent_total = _calc_run_warehouse_spent(db, run.id)
    remaining_cash = _calc_run_remaining_cash(
        db,
        run,
        procurement_spent_total=procurement_spent_total,
        logistics_spent_total=logistics_spent_total,
        warehouse_spent_total=warehouse_spent_total,
    )
    if total_fee > remaining_cash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient cash balance, remaining {remaining_cash}",
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
        warehouse_spent_total=warehouse_spent_total,
        remaining_cash=_calc_run_remaining_cash(
            db,
            run,
            procurement_spent_total=procurement_spent_total,
            logistics_spent_total=updated_logistics_spent,
            warehouse_spent_total=warehouse_spent_total,
        ),
    )


@router.get("/runs/{run_id}/warehouse/options", response_model=WarehouseOptionsResponse)
def get_warehouse_options(
    run_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WarehouseOptionsResponse:
    _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])
    mode_items = []
    for key, val in _warehouse_mode_options().items():
        mode_items.append(
            {
                "key": key,
                "label": val["label"],
                "one_time_base": val["one_time_base"],
                "inbound_rate": val["inbound_rate"],
                "rent_base": val["rent_base"],
                "delivery_eta_score": val["delivery_eta_score"],
                "fulfillment_accuracy": val["fulfillment_accuracy"],
                "warehouse_cost_per_order": val["warehouse_cost_per_order"],
            }
        )
    location_items = []
    for key, val in _warehouse_location_options().items():
        location_items.append(
            {
                "key": key,
                "label": val["label"],
                "rent_delta": val["rent_delta"],
                "eta_delta": val["eta_delta"],
            }
        )
    return WarehouseOptionsResponse(warehouse_modes=mode_items, warehouse_locations=location_items)


@router.get("/runs/{run_id}/warehouse/landmarks", response_model=WarehouseLandmarksResponse)
def get_warehouse_landmarks(
    run_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WarehouseLandmarksResponse:
    run = _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])
    points = (
        db.query(WarehouseLandmark)
        .filter(
            WarehouseLandmark.market == run.market,
            WarehouseLandmark.is_active.is_(True),
        )
        .order_by(
            WarehouseLandmark.warehouse_location.asc(),
            WarehouseLandmark.warehouse_mode.asc(),
            WarehouseLandmark.sort_order.asc(),
            WarehouseLandmark.id.asc(),
        )
        .all()
    )
    return WarehouseLandmarksResponse(
        market=run.market,
        points=[
            WarehouseLandmarkPointResponse(
                point_code=row.point_code,
                point_name=row.point_name,
                warehouse_mode=row.warehouse_mode,
                warehouse_location=row.warehouse_location,
                lng=float(row.lng),
                lat=float(row.lat),
                sort_order=row.sort_order,
            )
            for row in points
        ],
    )


@router.get("/runs/{run_id}/warehouse/inbound-candidates", response_model=WarehouseInboundCandidatesResponse)
def get_warehouse_inbound_candidates(
    run_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WarehouseInboundCandidatesResponse:
    run = _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])
    inbounded_shipment_ids = {
        row[0]
        for row in db.query(WarehouseInboundOrder.shipment_id).filter(WarehouseInboundOrder.run_id == run.id).all()
    }

    shipments = (
        db.query(LogisticsShipment)
        .options(selectinload(LogisticsShipment.orders))
        .filter(LogisticsShipment.run_id == run.id)
        .order_by(LogisticsShipment.id.desc())
        .all()
    )
    now = datetime.utcnow()
    candidates: list[WarehouseInboundCandidateItem] = []
    for shipment in shipments:
        if shipment.id in inbounded_shipment_ids:
            continue
        status = _calc_shipment_status(shipment, now)
        if status != "customs_cleared":
            continue
        total_qty = int(sum(item.order_total_quantity for item in shipment.orders))
        candidates.append(
            WarehouseInboundCandidateItem(
                shipment_id=shipment.id,
                cargo_value=shipment.cargo_value,
                total_quantity=total_qty,
                created_at=shipment.created_at,
                forwarder_label=shipment.forwarder_label,
                customs_label=shipment.customs_label,
                status=status,
            )
        )
    return WarehouseInboundCandidatesResponse(candidates=candidates)


@router.post("/runs/{run_id}/warehouse/strategy", response_model=WarehouseCreateStrategyResponse, status_code=status.HTTP_201_CREATED)
def create_warehouse_strategy(
    run_id: int,
    payload: WarehouseStrategyCreateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WarehouseCreateStrategyResponse:
    run = _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])
    mode_options = _warehouse_mode_options()
    location_options = _warehouse_location_options()
    if payload.warehouse_mode not in mode_options:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid warehouse_mode")
    if payload.warehouse_location not in location_options:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid warehouse_location")

    candidates_resp = get_warehouse_inbound_candidates(run.id, current_user=current_user, db=db)
    if not candidates_resp.candidates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No customs-cleared shipments available for inbound")

    cargo_total = int(sum(item.cargo_value for item in candidates_resp.candidates))
    selected_mode = mode_options[payload.warehouse_mode]
    selected_location = location_options[payload.warehouse_location]

    is_first_self_built = (
        payload.warehouse_mode == "self_built"
        and db.query(WarehouseStrategy)
        .filter(WarehouseStrategy.run_id == run.id, WarehouseStrategy.warehouse_mode == "self_built")
        .count()
        == 0
    )
    one_time_cost = selected_mode["one_time_base"] if is_first_self_built else 0
    inbound_cost = int(round(cargo_total * selected_mode["inbound_rate"]))
    rent_cost = int(max(0, selected_mode["rent_base"] + selected_location["rent_delta"]))
    total_cost = one_time_cost + inbound_cost + rent_cost

    procurement_spent_total = _calc_run_procurement_spent(db, run.id)
    logistics_spent_total = _calc_run_logistics_spent(db, run.id)
    warehouse_spent_total = _calc_run_warehouse_spent(db, run.id)
    remaining_cash = _calc_run_remaining_cash(
        db,
        run,
        procurement_spent_total=procurement_spent_total,
        logistics_spent_total=logistics_spent_total,
        warehouse_spent_total=warehouse_spent_total,
    )
    if total_cost > remaining_cash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient cash balance, remaining {remaining_cash}",
        )

    strategy = WarehouseStrategy(
        run_id=run.id,
        user_id=current_user["id"],
        market=run.market,
        warehouse_mode=payload.warehouse_mode,
        warehouse_location=payload.warehouse_location,
        one_time_cost=one_time_cost,
        inbound_cost=inbound_cost,
        rent_cost=rent_cost,
        total_cost=total_cost,
        delivery_eta_score=max(1, min(100, selected_mode["delivery_eta_score"] + selected_location["eta_delta"])),
        fulfillment_accuracy=selected_mode["fulfillment_accuracy"],
        warehouse_cost_per_order=selected_mode["warehouse_cost_per_order"],
        status="active",
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)

    return WarehouseCreateStrategyResponse(
        strategy=_to_warehouse_strategy_response(strategy),
        remaining_cash=_calc_run_remaining_cash(
            db,
            run,
            procurement_spent_total=procurement_spent_total,
            logistics_spent_total=logistics_spent_total,
            warehouse_spent_total=warehouse_spent_total + total_cost,
        ),
    )


@router.post("/runs/{run_id}/warehouse/inbound", response_model=WarehouseInboundResponse, status_code=status.HTTP_201_CREATED)
def warehouse_inbound(
    run_id: int,
    payload: WarehouseInboundRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WarehouseInboundResponse:
    run = _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])
    strategy = (
        db.query(WarehouseStrategy)
        .filter(WarehouseStrategy.run_id == run.id, WarehouseStrategy.status == "active")
        .order_by(WarehouseStrategy.id.desc())
        .first()
    )
    if not strategy:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please create warehouse strategy first")

    candidates_resp = get_warehouse_inbound_candidates(run.id, current_user=current_user, db=db)
    candidate_ids = [item.shipment_id for item in candidates_resp.candidates]
    if not candidate_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No customs-cleared shipments available for inbound")

    if payload.shipment_ids:
        requested = set(payload.shipment_ids)
        if not requested.issubset(set(candidate_ids)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Some shipment_ids are invalid for inbound")
        target_ids = [sid for sid in candidate_ids if sid in requested]
    else:
        # V1：一次性入仓全部可入仓物流单
        target_ids = candidate_ids

    shipments = (
        db.query(LogisticsShipment)
        .options(selectinload(LogisticsShipment.orders))
        .filter(LogisticsShipment.id.in_(target_ids), LogisticsShipment.run_id == run.id)
        .all()
    )
    shipment_map = {row.id: row for row in shipments}
    now = datetime.utcnow()
    created_inbound_count = 0
    created_lot_count = 0

    for shipment_id in target_ids:
        shipment = shipment_map.get(shipment_id)
        if not shipment:
            continue
        total_quantity = int(sum(item.order_total_quantity for item in shipment.orders))
        inbound_order = WarehouseInboundOrder(
            run_id=run.id,
            strategy_id=strategy.id,
            shipment_id=shipment.id,
            total_quantity=total_quantity,
            total_value=shipment.cargo_value,
            status="completed",
            completed_at=now,
        )
        db.add(inbound_order)
        db.flush()
        created_inbound_count += 1

        order_ids = [item.procurement_order_id for item in shipment.orders]
        if not order_ids:
            continue
        order_items = (
            db.query(ProcurementOrderItem)
            .filter(ProcurementOrderItem.order_id.in_(order_ids))
            .all()
        )
        for row in order_items:
            db.add(
                InventoryLot(
                    run_id=run.id,
                    product_id=row.product_id,
                    inbound_order_id=inbound_order.id,
                    quantity_available=row.quantity,
                    quantity_locked=0,
                    unit_cost=row.unit_price,
                )
            )
            created_lot_count += 1

    db.commit()

    procurement_spent_total = _calc_run_procurement_spent(db, run.id)
    logistics_spent_total = _calc_run_logistics_spent(db, run.id)
    warehouse_spent_total = _calc_run_warehouse_spent(db, run.id)
    remaining_cash = _calc_run_remaining_cash(
        db,
        run,
        procurement_spent_total=procurement_spent_total,
        logistics_spent_total=logistics_spent_total,
        warehouse_spent_total=warehouse_spent_total,
    )

    return WarehouseInboundResponse(
        inbound_count=created_inbound_count,
        shipment_ids=target_ids,
        inventory_lot_count=created_lot_count,
        remaining_cash=remaining_cash,
    )


@router.get("/runs/{run_id}/warehouse/summary", response_model=WarehouseSummaryResponse)
def get_warehouse_summary(
    run_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WarehouseSummaryResponse:
    run = _get_owned_running_run_or_404(db, run_id=run_id, user_id=current_user["id"])
    strategy = (
        db.query(WarehouseStrategy)
        .filter(WarehouseStrategy.run_id == run.id, WarehouseStrategy.status == "active")
        .order_by(WarehouseStrategy.id.desc())
        .first()
    )

    completed_count = (
        db.query(func.count(WarehouseInboundOrder.id))
        .filter(WarehouseInboundOrder.run_id == run.id, WarehouseInboundOrder.status == "completed")
        .scalar()
        or 0
    )
    pending_count = (
        db.query(func.count(WarehouseInboundOrder.id))
        .filter(WarehouseInboundOrder.run_id == run.id, WarehouseInboundOrder.status != "completed")
        .scalar()
        or 0
    )
    inventory_total_quantity = (
        db.query(func.coalesce(func.sum(InventoryLot.quantity_available), 0))
        .filter(InventoryLot.run_id == run.id)
        .scalar()
        or 0
    )
    inventory_total_sku = (
        db.query(func.count(func.distinct(InventoryLot.product_id)))
        .filter(InventoryLot.run_id == run.id)
        .scalar()
        or 0
    )

    return WarehouseSummaryResponse(
        strategy=_to_warehouse_strategy_response(strategy) if strategy else None,
        pending_inbound_count=int(pending_count),
        completed_inbound_count=int(completed_count),
        inventory_total_quantity=int(inventory_total_quantity),
        inventory_total_sku=int(inventory_total_sku),
    )
