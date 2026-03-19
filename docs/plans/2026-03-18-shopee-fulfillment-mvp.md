# Shopee Fulfillment MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成 Shopee 订单履约 MVP（安排发货、物流轨迹、签收结算），打通 `toship -> shipping -> completed`。

**Architecture:** 采用“数据层先行 + 领域服务收口 + 接口编排 + 前端接线”的分层方式。先补表结构与注释，再实现统一履约计算服务，最后串接 API 与页面交互，保证关键状态全量落库并可测试。

**Tech Stack:** FastAPI, SQLAlchemy, React + TypeScript, MySQL

---

### Task 1: 数据模型与注释补齐（P0 + P0.5）

**Files:**
- Modify: `backend/apps/api-gateway/app/models.py`
- Modify: `backend/apps/api-gateway/app/db.py`
- Test: `backend/apps/api-gateway/tests/test_api.py`

**Step 1: 为买家与订单补齐新字段（先写失败测试断言字段存在）**

```python
def test_shopee_fulfillment_columns_exist(client):
    # Query information_schema or SQLAlchemy inspector and assert columns exist
    assert True  # replace with real assertions
```

**Step 2: 运行测试确认失败**

Run: `cd backend/apps/api-gateway && pytest tests/test_api.py::test_shopee_fulfillment_columns_exist -v`  
Expected: FAIL（字段不存在）

**Step 3: 修改模型与增量补字段函数**

```python
# models.py
class SimBuyerProfile(Base):
    city_code = mapped_column(String(32), nullable=True, index=True)
    lat = mapped_column(Float, nullable=True)
    lng = mapped_column(Float, nullable=True)

class ShopeeOrder(Base):
    tracking_no = mapped_column(String(64), nullable=True, index=True)
    waybill_no = mapped_column(String(64), nullable=True, index=True)
    ship_by_at = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    shipped_at = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    delivered_at = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    eta_start_at = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    eta_end_at = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    distance_km = mapped_column(Float, nullable=True)

class ShopeeOrderLogisticsEvent(Base):
    ...

class ShopeeOrderSettlement(Base):
    ...
```

```python
# db.py
def _ensure_sim_buyer_profiles_columns():
    ...

def _ensure_shopee_orders_fulfillment_columns():
    ...

def _ensure_shopee_order_logistics_events_table():
    ...

def _ensure_shopee_order_settlements_table():
    ...
```

**Step 4: 补充 table/column 注释映射**

```python
# db.py -> _ensure_table_comments / _ensure_column_comments
table_comments["shopee_order_logistics_events"] = "Shopee 订单物流轨迹事件表"
table_comments["shopee_order_settlements"] = "Shopee 订单结算明细表"
```

**Step 5: 运行测试验证通过**

Run: `cd backend/apps/api-gateway && pytest tests/test_api.py::test_shopee_fulfillment_columns_exist -v`  
Expected: PASS

**Step 6: Commit**

```bash
git add backend/apps/api-gateway/app/models.py backend/apps/api-gateway/app/db.py backend/apps/api-gateway/tests/test_api.py
git commit -m "feat: add shopee fulfillment schema and comments"
```

### Task 2: 履约计算服务（P1）

**Files:**
- Create: `backend/apps/api-gateway/app/services/shopee_fulfillment.py`
- Test: `backend/apps/api-gateway/tests/test_api.py`

**Step 1: 写失败测试（距离/ETA/运费/结算）**

```python
def test_haversine_km_is_stable():
    km = haversine_km((3.1390, 101.6869), (5.4141, 100.3288))
    assert round(km, 1) == 287.0
```

**Step 2: 运行测试确认失败**

Run: `cd backend/apps/api-gateway && pytest tests/test_api.py -k "haversine_km_is_stable or calc_eta or calc_settlement" -v`  
Expected: FAIL（函数未定义）

**Step 3: 实现最小服务函数**

```python
def haversine_km(warehouse_latlng: tuple[float, float], buyer_latlng: tuple[float, float]) -> float: ...
def calc_shipping_cost(distance_km: float, shipping_channel: str) -> float: ...
def calc_eta(distance_km: float, shipping_channel: str, shipped_at: datetime) -> tuple[datetime, datetime]: ...
def gen_tracking_no(now: datetime) -> str: ...
def gen_waybill_no(now: datetime) -> str: ...
def calc_settlement(...) -> dict[str, float]: ...
```

**Step 4: 运行测试验证通过**

Run: `cd backend/apps/api-gateway && pytest tests/test_api.py -k "haversine_km_is_stable or calc_eta or calc_settlement" -v`  
Expected: PASS

**Step 5: Commit**

```bash
git add backend/apps/api-gateway/app/services/shopee_fulfillment.py backend/apps/api-gateway/tests/test_api.py
git commit -m "feat: add shopee fulfillment calculation service"
```

### Task 3: 安排发货接口（P2）

**Files:**
- Modify: `backend/apps/api-gateway/app/api/routes/shopee.py`
- Modify: `backend/apps/api-gateway/app/services/shopee_order_simulator.py`
- Test: `backend/apps/api-gateway/tests/test_api.py`

**Step 1: 写失败测试（仅 toship 可发货）**

```python
def test_ship_order_rejects_non_toship(client, token):
    resp = client.post("/shopee/runs/1/orders/1/ship", headers={"Authorization": f"Bearer {token}"}, json={})
    assert resp.status_code == 400
```

**Step 2: 运行测试确认失败**

Run: `cd backend/apps/api-gateway && pytest tests/test_api.py -k "ship_order" -v`  
Expected: FAIL（接口不存在）

**Step 3: 实现发货接口与状态流转**

```python
@router.post("/runs/{run_id}/orders/{order_id}/ship")
def ship_order(...):
    # validate toship + channel
    # generate tracking/waybill
    # calc distance/shipping/eta
    # create logistics event label_created
    # update order to shipping
    return {...}
```

**Step 4: 修正模拟订单字段兼容**

```python
# shopee_order_simulator.py
# 写入 ship_by_at（保留 ship_by_date 兼容过渡）
```

**Step 5: 运行测试验证通过**

Run: `cd backend/apps/api-gateway && pytest tests/test_api.py -k "ship_order" -v`  
Expected: PASS

**Step 6: Commit**

```bash
git add backend/apps/api-gateway/app/api/routes/shopee.py backend/apps/api-gateway/app/services/shopee_order_simulator.py backend/apps/api-gateway/tests/test_api.py
git commit -m "feat: add shopee ship order endpoint"
```

### Task 4: 物流详情与手动推进（P2.5）

**Files:**
- Modify: `backend/apps/api-gateway/app/api/routes/shopee.py`
- Test: `backend/apps/api-gateway/tests/test_api.py`

**Step 1: 写失败测试（节点合法流转）**

```python
def test_logistics_progress_only_allows_next_event(client, token):
    assert True  # create event then skip one step should fail
```

**Step 2: 运行测试确认失败**

Run: `cd backend/apps/api-gateway && pytest tests/test_api.py -k "logistics_progress" -v`  
Expected: FAIL

**Step 3: 实现 logistics 查询和 progress 接口**

```python
@router.get("/runs/{run_id}/orders/{order_id}/logistics")
def get_order_logistics(...): ...

@router.post("/runs/{run_id}/orders/{order_id}/logistics/progress")
def progress_order_logistics(...): ...
```

**Step 4: delivered 时触发 completed + settlement 写入**

```python
if next_event == "delivered":
    order.type_bucket = "completed"
    # insert settlement
```

**Step 5: 运行测试验证通过**

Run: `cd backend/apps/api-gateway && pytest tests/test_api.py -k "logistics_progress or delivered_settlement" -v`  
Expected: PASS

**Step 6: Commit**

```bash
git add backend/apps/api-gateway/app/api/routes/shopee.py backend/apps/api-gateway/tests/test_api.py
git commit -m "feat: add order logistics timeline and manual progress"
```

### Task 5: 结算详情接口（P3）

**Files:**
- Modify: `backend/apps/api-gateway/app/api/routes/shopee.py`
- Test: `backend/apps/api-gateway/tests/test_api.py`

**Step 1: 写失败测试（签收后可查结算）**

```python
def test_get_settlement_after_delivered(client, token):
    resp = client.get("/shopee/runs/1/orders/1/settlement", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
```

**Step 2: 运行测试确认失败**

Run: `cd backend/apps/api-gateway && pytest tests/test_api.py -k "settlement" -v`  
Expected: FAIL

**Step 3: 实现结算详情接口**

```python
@router.get("/runs/{run_id}/orders/{order_id}/settlement")
def get_order_settlement(...): ...
```

**Step 4: 运行测试验证通过**

Run: `cd backend/apps/api-gateway && pytest tests/test_api.py -k "settlement" -v`  
Expected: PASS

**Step 5: Commit**

```bash
git add backend/apps/api-gateway/app/api/routes/shopee.py backend/apps/api-gateway/tests/test_api.py
git commit -m "feat: add shopee settlement detail endpoint"
```

### Task 6: 前端订单页接线（P4）

**Files:**
- Modify: `frontend/src/modules/shopee/views/MyOrdersView.tsx`

**Step 1: 扩展订单类型定义与请求类型**

```ts
interface OrderRow {
  tracking_no?: string | null;
  waybill_no?: string | null;
  eta_start_at?: string | null;
  eta_end_at?: string | null;
  distance_km?: number | null;
}
```

**Step 2: 接入“安排发货”动作**

```ts
async function handleShipOrder(orderId: number) {
  await fetch(`/shopee/runs/${runId}/orders/${orderId}/ship`, { method: 'POST', ... });
}
```

**Step 3: 接入“查看物流详情/打印面单/结算详情”真实行为**

```ts
// logistics modal + settlement modal
```

**Step 4: 运输中显示 tracking_no + ETA**

```ts
{row.type_bucket === 'shipping' && <div>{row.tracking_no} / {formatEtaRange(...)}</div>}
```

**Step 5: 运行前端检查**

Run: `cd frontend && npm run lint`  
Expected: PASS（允许存在历史非本模块告警时，记录清单）

**Step 6: Commit**

```bash
git add frontend/src/modules/shopee/views/MyOrdersView.tsx
git commit -m "feat: wire shopee order fulfillment actions in my orders view"
```

### Task 7: 回归、文档与进度同步（P5 + P6）

**Files:**
- Modify: `docs/当前进度.md`
- Modify: `docs/task/09-履约发货物流结算-任务清单.md`

**Step 1: 运行后端核心测试**

Run: `cd backend/apps/api-gateway && pytest tests/test_api.py -k "shopee and (ship_order or logistics or settlement)" -v`  
Expected: PASS

**Step 2: 手工联调关键链路**

```text
待出货 -> 安排发货 -> 查看物流 -> 手动推进 delivered -> 查看结算
```

**Step 3: 更新进度文档**

```markdown
- 已完成：09 履约发货物流结算 MVP（手动推进版）
- 当前阶段：Step05 履约链路闭环
- 下一步：自动节点推进任务
```

**Step 4: Commit**

```bash
git add docs/当前进度.md docs/task/09-履约发货物流结算-任务清单.md
git commit -m "docs: update progress and task status for fulfillment mvp"
```
