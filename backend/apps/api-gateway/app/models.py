from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    public_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
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


class OssStorageConfig(Base):
    __tablename__ = "oss_storage_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="s3")
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    bucket: Mapped[str] = mapped_column(String(128), nullable=False)
    access_key: Mapped[str] = mapped_column(String(255), nullable=False)
    access_secret: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


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
    shopee_listings = relationship("ShopeeListing", back_populates="run")
    shopee_listing_drafts = relationship("ShopeeListingDraft", back_populates="run")
    shopee_orders = relationship("ShopeeOrder", back_populates="run")
    shopee_order_logistics_events = relationship("ShopeeOrderLogisticsEvent", back_populates="run")
    shopee_order_settlements = relationship("ShopeeOrderSettlement", back_populates="run")
    shopee_finance_ledger_entries = relationship("ShopeeFinanceLedgerEntry", back_populates="run")
    cash_adjustments = relationship("GameRunCashAdjustment", back_populates="run")
    shopee_bank_accounts = relationship("ShopeeBankAccount", back_populates="run")
    shopee_order_generation_logs = relationship("ShopeeOrderGenerationLog", back_populates="run")


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
    inbound_orders = relationship("WarehouseInboundOrder", back_populates="shipment")


class LogisticsShipmentOrder(Base):
    __tablename__ = "logistics_shipment_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("logistics_shipments.id"), nullable=False, index=True)
    procurement_order_id: Mapped[int] = mapped_column(ForeignKey("procurement_orders.id"), nullable=False, index=True)
    order_total_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    order_total_quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    shipment = relationship("LogisticsShipment", back_populates="orders")
    procurement_order = relationship("ProcurementOrder", back_populates="logistics_links")


class WarehouseStrategy(Base):
    __tablename__ = "warehouse_strategies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    market: Mapped[str] = mapped_column(String(16), nullable=False, default="MY")
    warehouse_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    warehouse_location: Mapped[str] = mapped_column(String(32), nullable=False)
    one_time_cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    inbound_cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rent_cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    delivery_eta_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fulfillment_accuracy: Mapped[float] = mapped_column(nullable=False, default=0.0)
    warehouse_cost_per_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    inbound_orders = relationship("WarehouseInboundOrder", back_populates="strategy")


class WarehouseInboundOrder(Base):
    __tablename__ = "warehouse_inbound_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("warehouse_strategies.id"), nullable=False, index=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("logistics_shipments.id"), nullable=False, unique=True, index=True)
    total_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    total_value: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="completed")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    strategy = relationship("WarehouseStrategy", back_populates="inbound_orders")
    shipment = relationship("LogisticsShipment", back_populates="inbound_orders")
    inventory_lots = relationship("InventoryLot", back_populates="inbound_order")


class InventoryLot(Base):
    __tablename__ = "inventory_lots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("market_products.id"), nullable=False, index=True)
    inbound_order_id: Mapped[int] = mapped_column(ForeignKey("warehouse_inbound_orders.id"), nullable=False, index=True)
    quantity_available: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quantity_locked: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reserved_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    backorder_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unit_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    last_restocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    inbound_order = relationship("WarehouseInboundOrder", back_populates="inventory_lots")


class InventoryStockMovement(Base):
    __tablename__ = "inventory_stock_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("market_products.id"), nullable=True, index=True)
    listing_id: Mapped[int | None] = mapped_column(ForeignKey("shopee_listings.id"), nullable=True, index=True)
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("shopee_listing_variants.id"), nullable=True, index=True)
    inventory_lot_id: Mapped[int | None] = mapped_column(ForeignKey("inventory_lots.id"), nullable=True, index=True)
    biz_order_id: Mapped[int | None] = mapped_column(ForeignKey("shopee_orders.id"), nullable=True, index=True)
    movement_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    qty_delta_on_hand: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    qty_delta_reserved: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    qty_delta_backorder: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    biz_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    remark: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )


class ShopeeListing(Base):
    __tablename__ = "shopee_listings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("market_products.id"), nullable=True, index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("shopee_category_nodes.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gtin: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sku_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str | None] = mapped_column(String(5000), nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    original_price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sales_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stock_available: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    min_purchase_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_purchase_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_purchase_mode: Mapped[str] = mapped_column(String(24), nullable=False, default="none")
    max_purchase_period_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    max_purchase_period_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    max_purchase_period_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_purchase_period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_purchase_period_model: Mapped[str | None] = mapped_column(String(24), nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    parcel_length_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parcel_width_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parcel_height_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shipping_variation_dimension_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    shipping_standard_bulk: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    shipping_standard: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    shipping_express: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    preorder_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    insurance_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    condition_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    schedule_publish_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    parent_sku: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="live", index=True)
    quality_status: Mapped[str] = mapped_column(String(64), nullable=False, default="内容合格")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    run = relationship("GameRun", back_populates="shopee_listings")
    images = relationship("ShopeeListingImage", back_populates="listing", cascade="all, delete-orphan")
    specs = relationship("ShopeeListingSpecValue", back_populates="listing", cascade="all, delete-orphan")
    variants = relationship("ShopeeListingVariant", back_populates="listing", cascade="all, delete-orphan")
    wholesale_tiers = relationship("ShopeeListingWholesaleTier", back_populates="listing", cascade="all, delete-orphan")


class ShopeeListingDraft(Base):
    __tablename__ = "shopee_listing_drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("shopee_category_nodes.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gtin: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str | None] = mapped_column(String(5000), nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="drafting", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    run = relationship("GameRun", back_populates="shopee_listing_drafts")
    images = relationship("ShopeeListingDraftImage", back_populates="draft", cascade="all, delete-orphan")
    specs = relationship("ShopeeListingDraftSpecValue", back_populates="draft", cascade="all, delete-orphan")


class ShopeeListingDraftImage(Base):
    __tablename__ = "shopee_listing_draft_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("shopee_listing_drafts.id"), nullable=False, index=True)
    image_url: Mapped[str] = mapped_column(String(255), nullable=False)
    image_ratio: Mapped[str] = mapped_column(String(16), nullable=False, default="1:1")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_cover: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    draft = relationship("ShopeeListingDraft", back_populates="images")


class ShopeeSpecTemplate(Base):
    __tablename__ = "shopee_spec_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Backward-compatible with legacy schema; new logic uses category_id.
    category_root: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    category_id: Mapped[int] = mapped_column(ForeignKey("shopee_category_nodes.id"), nullable=False, index=True)
    field_key: Mapped[str] = mapped_column("attr_key", String(64), nullable=False, index=True)
    field_label: Mapped[str] = mapped_column("attr_label", String(128), nullable=False)
    field_type: Mapped[str] = mapped_column("input_type", String(16), nullable=False, default="select")
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    options = relationship("ShopeeSpecTemplateOption", back_populates="template", cascade="all, delete-orphan")


class ShopeeSpecTemplateOption(Base):
    __tablename__ = "shopee_spec_template_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("shopee_spec_templates.id"), nullable=False, index=True)
    option_value: Mapped[str] = mapped_column(String(128), nullable=False)
    option_label: Mapped[str] = mapped_column(String(128), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    template = relationship("ShopeeSpecTemplate", back_populates="options")


class ShopeeCategoryNode(Base):
    __tablename__ = "shopee_category_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("shopee_category_nodes.id"), nullable=True, index=True)
    level: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class ShopeeListingDraftSpecValue(Base):
    __tablename__ = "shopee_listing_draft_spec_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("shopee_listing_drafts.id"), nullable=False, index=True)
    attr_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    attr_label: Mapped[str] = mapped_column(String(128), nullable=False)
    attr_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    draft = relationship("ShopeeListingDraft", back_populates="specs")


class ShopeeListingSpecValue(Base):
    __tablename__ = "shopee_listing_spec_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("shopee_listings.id"), nullable=False, index=True)
    attr_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    attr_label: Mapped[str] = mapped_column(String(128), nullable=False)
    attr_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    listing = relationship("ShopeeListing", back_populates="specs")


class ShopeeListingImage(Base):
    __tablename__ = "shopee_listing_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("shopee_listings.id"), nullable=False, index=True)
    image_url: Mapped[str] = mapped_column(String(255), nullable=False)
    image_ratio: Mapped[str] = mapped_column(String(16), nullable=False, default="1:1")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_cover: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    listing = relationship("ShopeeListing", back_populates="images")


class ShopeeListingVariant(Base):
    __tablename__ = "shopee_listing_variants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("shopee_listings.id"), nullable=False, index=True)
    variant_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    option_value: Mapped[str] = mapped_column(String(128), nullable=False)
    option_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sales_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    oversell_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)
    oversell_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sku: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gtin: Mapped[str | None] = mapped_column(String(64), nullable=True)
    item_without_gtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    parcel_length_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parcel_width_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parcel_height_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    listing = relationship("ShopeeListing", back_populates="variants")


class ShopeeListingWholesaleTier(Base):
    __tablename__ = "shopee_listing_wholesale_tiers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("shopee_listings.id"), nullable=False, index=True)
    tier_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    min_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unit_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    listing = relationship("ShopeeListing", back_populates="wholesale_tiers")


class ShopeeOrder(Base):
    __tablename__ = "shopee_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    order_no: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    buyer_name: Mapped[str] = mapped_column(String(64), nullable=False)
    buyer_payment: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    order_type: Mapped[str] = mapped_column(String(24), nullable=False, default="order", index=True)
    listing_id: Mapped[int | None] = mapped_column(ForeignKey("shopee_listings.id"), nullable=True, index=True)
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("shopee_listing_variants.id"), nullable=True, index=True)
    type_bucket: Mapped[str] = mapped_column(String(24), nullable=False, default="toship", index=True)
    process_status: Mapped[str] = mapped_column(String(24), nullable=False, default="processing", index=True)
    stock_fulfillment_status: Mapped[str] = mapped_column(String(24), nullable=False, default="in_stock", index=True)
    backorder_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    must_restock_before_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    shipping_priority: Mapped[str] = mapped_column(String(24), nullable=False, default="today", index=True)
    shipping_channel: Mapped[str] = mapped_column(String(64), nullable=False, default="SPX快递")
    delivery_line_key: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    delivery_line_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    destination: Mapped[str] = mapped_column(String(128), nullable=False, default="吉隆坡")
    countdown_text: Mapped[str] = mapped_column(String(128), nullable=False, default="请在今日内处理")
    action_text: Mapped[str] = mapped_column(String(64), nullable=False, default="查看详情")
    ship_by_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    tracking_no: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    waybill_no: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    ship_by_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    eta_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    eta_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cancel_source: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    run = relationship("GameRun", back_populates="shopee_orders")
    items = relationship("ShopeeOrderItem", back_populates="order")
    logistics_events = relationship("ShopeeOrderLogisticsEvent", back_populates="order")
    settlement = relationship("ShopeeOrderSettlement", back_populates="order", uselist=False)
    finance_ledger_entries = relationship("ShopeeFinanceLedgerEntry", back_populates="order")


class ShopeeOrderItem(Base):
    __tablename__ = "shopee_order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("shopee_orders.id"), nullable=False, index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    variant_name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    order = relationship("ShopeeOrder", back_populates="items")


class ShopeeOrderLogisticsEvent(Base):
    __tablename__ = "shopee_order_logistics_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("shopee_orders.id"), nullable=False, index=True)
    event_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    event_title: Mapped[str] = mapped_column(String(64), nullable=False)
    event_desc: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    run = relationship("GameRun", back_populates="shopee_order_logistics_events")
    order = relationship("ShopeeOrder", back_populates="logistics_events")


class ShopeeOrderSettlement(Base):
    __tablename__ = "shopee_order_settlements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("shopee_orders.id"), nullable=False, unique=True, index=True)
    buyer_payment: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    platform_commission_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    payment_fee_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    shipping_cost_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    shipping_subsidy_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    net_income_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    settlement_status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending", index=True)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    run = relationship("GameRun", back_populates="shopee_order_settlements")
    order = relationship("ShopeeOrder", back_populates="settlement")


class ShopeeOrderGenerationLog(Base):
    __tablename__ = "shopee_order_generation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    tick_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    active_buyer_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    candidate_product_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    generated_order_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skip_reasons_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    debug_payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    run = relationship("GameRun", back_populates="shopee_order_generation_logs")


class ShopeeFinanceLedgerEntry(Base):
    __tablename__ = "shopee_finance_ledger_entries"
    __table_args__ = (
        UniqueConstraint("order_id", "entry_type", name="uq_shopee_finance_ledger_order_entry_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("shopee_orders.id"), nullable=True, index=True)
    entry_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="income_from_order")
    direction: Mapped[str] = mapped_column(String(8), nullable=False, index=True, default="in")
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    balance_after: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True, default="completed")
    remark: Mapped[str | None] = mapped_column(String(255), nullable=True)
    credited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    run = relationship("GameRun", back_populates="shopee_finance_ledger_entries")
    order = relationship("ShopeeOrder", back_populates="finance_ledger_entries")


class GameRunCashAdjustment(Base):
    __tablename__ = "game_run_cash_adjustments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="manual_adjustment")
    direction: Mapped[str] = mapped_column(String(8), nullable=False, index=True, default="in")
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    remark: Mapped[str | None] = mapped_column(String(255), nullable=True)
    related_ledger_id: Mapped[int | None] = mapped_column(ForeignKey("shopee_finance_ledger_entries.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    run = relationship("GameRun", back_populates="cash_adjustments")


class ShopeeBankAccount(Base):
    __tablename__ = "shopee_bank_accounts"
    __table_args__ = (
        UniqueConstraint("run_id", "user_id", "account_no", name="uq_shopee_bank_accounts_run_user_account"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("game_runs.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    account_holder: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    account_no: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    account_no_masked: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="RM")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    verify_status: Mapped[str] = mapped_column(String(16), nullable=False, default="verified", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    run = relationship("GameRun", back_populates="shopee_bank_accounts")


class SimBuyerProfile(Base):
    __tablename__ = "sim_buyer_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    buyer_code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    nickname: Mapped[str] = mapped_column(String(64), nullable=False)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    city: Mapped[str | None] = mapped_column(String(64), nullable=True)
    city_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(64), nullable=True)
    background: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_categories_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    active_hours_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    weekday_factors_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    base_buy_intent: Mapped[float] = mapped_column(Float, nullable=False, default=0.2)
    price_sensitivity: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    quality_sensitivity: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    brand_sensitivity: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    impulse_level: Mapped[float] = mapped_column(Float, nullable=False, default=0.3)
    purchase_power: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class WarehouseLandmark(Base):
    __tablename__ = "warehouse_landmarks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    market: Mapped[str] = mapped_column(String(16), nullable=False, index=True, default="MY")
    warehouse_mode: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    warehouse_location: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    point_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    point_name: Mapped[str] = mapped_column(String(128), nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
