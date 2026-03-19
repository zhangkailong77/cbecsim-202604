from __future__ import annotations

from datetime import datetime, timedelta
from math import asin, cos, radians, sin, sqrt
from random import randint
from uuid import uuid4


def haversine_km(warehouse_latlng: tuple[float, float], buyer_latlng: tuple[float, float]) -> float:
    w_lat, w_lng = warehouse_latlng
    b_lat, b_lng = buyer_latlng
    lat1, lon1, lat2, lon2 = map(radians, [w_lat, w_lng, b_lat, b_lng])
    d_lat = lat2 - lat1
    d_lon = lon2 - lon1
    a = sin(d_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(d_lon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return round(6371 * c, 3)


def calc_shipping_cost(distance_km: float, shipping_channel: str) -> float:
    channel_base = {
        "快捷快递": (4.5, 0.14),
        "标准大件": (8.0, 0.11),
        "标准快递": (6.0, 0.12),
    }
    base, per_km = channel_base.get(shipping_channel, channel_base["标准快递"])
    return round(base + max(0.0, distance_km) * per_km, 2)


def calc_eta(distance_km: float, shipping_channel: str, shipped_at: datetime) -> tuple[datetime, datetime]:
    if distance_km <= 80:
        min_days, max_days = 1.0, 2.0
    elif distance_km <= 300:
        min_days, max_days = 2.0, 3.0
    elif distance_km <= 800:
        min_days, max_days = 3.0, 5.0
    else:
        min_days, max_days = 5.0, 7.0

    if shipping_channel == "快捷快递":
        min_days, max_days = min_days - 1.0, max_days - 0.5
    elif shipping_channel == "标准大件":
        min_days, max_days = min_days + 1.0, max_days + 1.0

    min_days = max(0.5, min_days)
    max_days = max(min_days, max_days)
    eta_start = shipped_at + timedelta(hours=int(min_days * 24))
    eta_end = shipped_at + timedelta(hours=int(max_days * 24))
    return eta_start, eta_end


def gen_tracking_no(now: datetime | None = None) -> str:
    at = now or datetime.utcnow()
    return f"TRK{at.strftime('%Y%m%d%H%M%S')}{randint(100, 999)}"


def gen_waybill_no(now: datetime | None = None) -> str:
    at = now or datetime.utcnow()
    return f"WB{at.strftime('%Y%m%d')}{uuid4().hex[:10].upper()}"


def calc_settlement(
    *,
    buyer_payment: float,
    shipping_cost: float,
    shipping_channel: str,
    commission_rate: float = 0.06,
    payment_fee_rate: float = 0.02,
) -> dict[str, float]:
    subsidy_rate_by_channel = {
        "快捷快递": 0.20,
        "标准快递": 0.12,
        "标准大件": 0.08,
    }
    subsidy_rate = subsidy_rate_by_channel.get(shipping_channel, 0.10)
    platform_commission = round(buyer_payment * commission_rate, 2)
    payment_fee = round(buyer_payment * payment_fee_rate, 2)
    shipping_subsidy = round(shipping_cost * subsidy_rate, 2)
    net_income = round(
        buyer_payment - platform_commission - payment_fee - shipping_cost + shipping_subsidy,
        2,
    )
    return {
        "buyer_payment": round(buyer_payment, 2),
        "platform_commission_amount": platform_commission,
        "payment_fee_amount": payment_fee,
        "shipping_cost_amount": round(shipping_cost, 2),
        "shipping_subsidy_amount": shipping_subsidy,
        "net_income_amount": net_income,
    }
