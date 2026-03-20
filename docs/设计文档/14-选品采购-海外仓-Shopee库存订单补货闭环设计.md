# 14-选品采购-海外仓-Shopee库存订单补货闭环设计

## 1. 目标
把前置环节（选品采购/海外仓）与 Shopee 经营环节打通成一条可追溯的库存闭环，解决以下问题：
- 采购入仓后，Shopee 上架库存可实时关联到海外仓真实库存。
- 订单生成、发货、取消、回款、再补货形成闭环，不再是断点流程。
- 支持“可控超卖”策略：允许超过现货销售，但有上限与风险约束。

## 2. 核心结论（业务口径）
### 2.1 库存口径
- **总库存（真实货）**：以海外仓库存为准。
- **Shopee 可售库存**：不是独立手工库存，按“真实库存 + 超卖额度”计算。

### 2.2 超卖口径
- 支持配置 `超卖上限`（示例：2000 件）。
- 允许订单在现货不足时继续生成，但进入“缺货待补”履约路径。
- 超卖不是免费能力，必须绑定取消风险与履约时限。

## 3. 闭环流程（端到端）
1. Step02 选品采购确认后，写入采购记录并生成“入库事件”，增加海外仓 `on_hand`。
2. Shopee 上架商品（按变体）时，绑定仓库 SKU（同一 run 同一玩家）。
3. 订单模拟生成时：
   - 优先消耗 `available`（可发现货）；
   - 超出现货但未超 `oversell_limit` 时，订单仍可生成，标记为“缺货待补”。
4. 安排发货时：
   - 现货单：正常发货，库存真实扣减；
   - 缺货单：若仍缺货，不允许发货，保留在待出货并提示“待补货”。
5. 卖家补货入仓后，自动冲减缺货缺口，订单恢复可发。
6. 超时未发货触发买家取消概率（按既有取消模块规则），取消后释放预占/缺口。
7. 已签收订单进入待入账 -> 已入账（按“完成后3游戏天释放”规则）。

## 4. 库存状态模型
按“仓库库存 + 订单占用 + 缺货缺口”三层管理：
- `on_hand`：仓内现货（真实物理库存）
- `reserved`：已被订单占用但尚未出库
- `shipped`：已出库在途（用于追溯，不回加）
- `backorder_qty`：缺货待补数量（超卖形成）

派生字段：
- `available = max(on_hand - reserved, 0)`
- `sellable_cap = available + oversell_limit_remaining`

## 5. 订单侧新增语义
在现有订单状态之外，增加库存履约语义字段：
- `stock_fulfillment_status`：
  - `in_stock`（现货可发）
  - `backorder`（缺货待补）
  - `restocked`（已补货可发）
- `backorder_qty`：该订单仍缺多少件
- `must_restock_before_at`：最晚补货时间（游戏时间）

## 6. 超卖策略设计
### 6.1 参数
- `oversell_limit_per_listing`：每个上架商品超卖上限（默认 2000）
- `backorder_grace_hours`：缺货单补货宽限（游戏小时，建议 48）

### 6.2 订单生成规则
- 若 `available >= order_qty`：正常占用库存。
- 若 `available < order_qty` 且 `oversell_remaining >= shortfall`：允许下单并记缺口。
- 若超卖额度不足：不生成该单（记录 skip reason: `oversell_limit_reached`）。

### 6.3 风险约束
- 缺货单进入取消风险增强模式：
  - 到达阈值后，取消概率增长斜率高于普通待出货单。
- 缺货单不计入“可立即履约能力”指标。

## 7. 数据模型设计（新增/扩展）
> 说明：以下为设计口径，落地时需补齐 table comment 与 column comment。

### 7.1 扩展库存台账（建议）
可在现有库存明细表基础上增加：
- `reserved_qty`（预占数量）
- `backorder_qty`（缺货待补总量）
- `last_restocked_at`（最近补货时间）

### 7.2 新增库存流水表（建议）`inventory_stock_movements`
- `id`
- `run_id`, `user_id`
- `sku_id` / `variant_id`
- `movement_type`：`purchase_in` / `order_reserve` / `order_ship` / `cancel_release` / `restock_fill`
- `qty_delta_on_hand`
- `qty_delta_reserved`
- `qty_delta_backorder`
- `biz_order_id`（可空）
- `biz_ref`（采购单号/订单号）
- `created_at`

### 7.3 扩展 Shopee 订单表
- `stock_fulfillment_status`（in_stock/backorder/restocked）
- `backorder_qty`
- `must_restock_before_at`

### 7.4 扩展 Shopee 上架变体表
- `oversell_limit`
- `oversell_used`

## 8. 接口设计
### 8.1 库存概览（给 Shopee 列表页）
- `GET /game/runs/{run_id}/inventory/sku-summary`
- 返回：每个 SKU/变体的 `on_hand/reserved/available/backorder/sellable_cap`

### 8.2 订单模拟（增强）
- 现有 simulate 接口内部增加库存判定：
  - 现货占用
  - 超卖占用
  - 超卖不足拒单
- 返回/日志补充：
  - `generated_in_stock_count`
  - `generated_backorder_count`
  - `skipped_oversell_limit_reached`

### 8.3 发货校验（增强）
- `POST /shopee/runs/{run_id}/orders/{order_id}/ship`
- 若 `stock_fulfillment_status=backorder` 且 `backorder_qty>0`：返回业务错误“待补货，暂不可发货”。

### 8.4 补货入仓联动（增强）
- Step02/Step04 入库确认后触发：
  - 自动扫描缺货订单并按创建时间先后冲减缺口。

## 9. 前端展示建议
### 9.1 Shopee 我的产品
每个变体显示：
- 现货可发
- 缺货待补
- 超卖已用 / 超卖上限
- 销量（累计）

### 9.2 Shopee 我的订单
待出货新增标签：
- `现货可发`
- `待补货`
并显示“最晚补货时间”。

### 9.3 选品/仓储页
新增“缺货订单影响”提示：
- 当前缺货总量
- 需补货 SKU Top N
- 若不补货预计取消风险

## 10. 与回款模块联动
- 待入账金额只统计“运输中 + 已完成未释放”的净入账预估；
- 不统计待处理未发货订单（含缺货待补）。
- 已入账金额仅统计“已释放到账”的流水，不受当前筛选误导。

## 11. 验收标准
1. 采购入仓后，Shopee 变体库存实时变化。
2. 现货不足时可在超卖上限内继续产单，并标记为“待补货”。
3. 缺货单在未补货前不可发货，补货后自动恢复可发。
4. 超卖超过上限后不再产单，并记录日志原因。
5. 取消后库存/缺口回补准确，库存台账可追溯。
6. 前后端页面口径一致（库存、订单状态、待入账/已入账）。

## 12. 实施顺序（建议）
1. 数据层：库存字段与库存流水落库。
2. 订单模拟：加入现货/超卖双通道判定。
3. 发货接口：增加“待补货”阻断校验。
4. 补货联动：入库后自动冲减缺口。
5. 前端：商品页/订单页补“待补货、超卖”展示。
6. 联调：取消、回款、收入页面口径回归测试。

## 13. 默认参数建议（首版）
- `oversell_limit_per_listing = 2000`
- `backorder_grace_hours = 48`（游戏小时）
- 缺货单取消概率增幅：在原取消曲线基础上增加 30%~50%

