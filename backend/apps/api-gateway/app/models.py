from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="player")
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    major: Mapped[str | None] = mapped_column(String(128), nullable=True)
    class_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    school = relationship("School", back_populates="users")
    game_runs = relationship("GameRun", back_populates="user")


class School(Base):
    __tablename__ = "schools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    users = relationship("User", back_populates="school")


class GameRun(Base):
    __tablename__ = "game_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    initial_cash: Mapped[int] = mapped_column(Integer, nullable=False)
    market: Mapped[str] = mapped_column(String(16), nullable=False, default="MY")
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=365)
    day_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="running")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="game_runs")
    procurement_orders = relationship("ProcurementOrder", back_populates="run")
    logistics_shipments = relationship("LogisticsShipment", back_populates="run")


class MarketProduct(Base):
    __tablename__ = "market_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    market: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    board_type: Mapped[str] = mapped_column(String(16), nullable=False, default="sales", index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    supplier_price: Mapped[int] = mapped_column(Integer, nullable=False)
    suggested_price: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_sales: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    monthly_revenue: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    new_score: Mapped[float] = mapped_column(nullable=False, default=0.0)
    hot_score: Mapped[float] = mapped_column(nullable=False, default=0.0)
    growth_rate: Mapped[float] = mapped_column(nullable=False, default=0.0)
    competition_level: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    cover_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class ProcurementOrder(Base):
    __tablename__ = "procurement_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    run = relationship("GameRun", back_populates="procurement_orders")
    items = relationship("ProcurementOrderItem", back_populates="order")
    logistics_links = relationship("LogisticsShipmentOrder", back_populates="procurement_order")


class ProcurementOrderItem(Base):
    __tablename__ = "procurement_order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("procurement_orders.id"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("market_products.id"), nullable=False, index=True)
    product_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[int] = mapped_column(Integer, nullable=False)

    order = relationship("ProcurementOrder", back_populates="items")


class LogisticsShipment(Base):
    __tablename__ = "logistics_shipments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    market: Mapped[str] = mapped_column(String(16), nullable=False, default="MY")
    forwarder_key: Mapped[str] = mapped_column(String(32), nullable=False)
    forwarder_label: Mapped[str] = mapped_column(String(64), nullable=False)
    customs_key: Mapped[str] = mapped_column(String(32), nullable=False)
    customs_label: Mapped[str] = mapped_column(String(64), nullable=False)
    cargo_value: Mapped[int] = mapped_column(Integer, nullable=False)
    logistics_fee: Mapped[int] = mapped_column(Integer, nullable=False)
    customs_fee: Mapped[int] = mapped_column(Integer, nullable=False)
    total_fee: Mapped[int] = mapped_column(Integer, nullable=False)
    transport_days: Mapped[int] = mapped_column(Integer, nullable=False)
    customs_days: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    run = relationship("GameRun", back_populates="logistics_shipments")
    orders = relationship("LogisticsShipmentOrder", back_populates="shipment")


class LogisticsShipmentOrder(Base):
    __tablename__ = "logistics_shipment_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("logistics_shipments.id"), nullable=False, index=True)
    procurement_order_id: Mapped[int] = mapped_column(ForeignKey("procurement_orders.id"), nullable=False, index=True)
    order_total_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    order_total_quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    shipment = relationship("LogisticsShipment", back_populates="orders")
    procurement_order = relationship("ProcurementOrder", back_populates="logistics_links")
