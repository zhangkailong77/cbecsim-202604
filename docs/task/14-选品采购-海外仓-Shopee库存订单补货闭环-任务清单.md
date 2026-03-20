# 14-选品采购-海外仓-Shopee库存订单补货闭环-任务清单

## 一、目标
- 打通“选品采购 -> 海外仓 -> Shopee 上架/产单 -> 发货 -> 取消/回款 -> 再补货”的库存经营闭环。
- 支持可控超卖：允许在超卖上限内产单，但缺货单必须补货后才能发货。

## 二、后端与数据库
- [x] 扩展库存/订单/变体字段并自动补字段：
  - `inventory_lots.reserved_qty/backorder_qty/last_restocked_at`
  - `shopee_listing_variants.oversell_limit/oversell_used`
  - `shopee_orders.listing_id/variant_id/stock_fulfillment_status/backorder_qty/must_restock_before_at`
- [x] 增加字段注释与索引补齐逻辑（初始化时自动执行）。
- [x] 订单模拟支持“现货 + 超卖”双通道：
  - 现货足够：`in_stock`
  - 现货不足但超卖剩余额度足够：`backorder`
  - 超卖额度不足：拒单并记 `oversell_limit_reached`
- [x] 订单落库写入库存履约语义字段：
  - `stock_fulfillment_status/backorder_qty/must_restock_before_at`
  - 关联 `listing_id/variant_id`
- [x] 取消回补逻辑改为优先按 `listing_id/variant_id` 精确回滚：
  - 回补现货扣减部分
  - 释放 `oversell_used`
  - 回滚销量
- [x] 发货接口增加阻断：
  - `backorder` 且 `backorder_qty > 0` 时返回“待补货，暂不可发货”。
- [x] 订单/商品接口补充新字段透出给前端。

## 三、前端
- [x] `我的订单`：
  - 待出货行显示“现货可发 / 待补货（缺口x件）”
  - 待补货订单显示“最晚补货时间”
- [x] `我的产品`：
  - 变体行显示“超卖已用/超卖上限”
  - 保留变体库存与销量展示

## 四、联调验收
- [ ] 场景1：现货足够产单 -> 可发货 -> 运输 -> 完成。
- [ ] 场景2：现货不足但超卖内产单 -> 待补货阻断发货。
- [ ] 场景3：取消缺货单 -> `oversell_used` 回退、库存/销量回滚正确。
- [ ] 场景4：超卖达到上限后不再产单，并在模拟日志看到 `oversell_limit_reached`。
- [ ] 场景5：订单页与商品页展示口径一致（缺口、超卖占用、可发状态）。

## 五、后续迭代（下一步）
- [x] 补货入仓后自动冲减缺口（Step04 入库事件联动 backorder 订单）。
- [x] 新增库存流水台账 `inventory_stock_movements`（可追溯每次库存变化来源）。
- [x] 海外仓页同页接入库存流水明细（`入仓决策/库存变动明细` 双 Tab + 右侧最近5条预览）。
- [x] 新增库存流水查询接口：`GET /game/runs/{run_id}/warehouse/stock-movements`（分页/类型/关键字）。
- [x] 增加“缺货风险看板”（缺货总量、受影响订单、取消风险预估）。
- [x] 增加“库存总览卡片”（库存SKU、总库存、可用库存、已占用、待补货），并放在 Step04 `库存变动明细` 页顶部。
