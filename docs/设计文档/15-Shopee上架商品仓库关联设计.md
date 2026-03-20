# 15-Shopee上架商品仓库关联设计

## 1. 目标
- 将 Shopee 新增商品页右侧「Shopee 标准商品」区域替换为「仓库关联商品」。
- 在上架发布时显式绑定 `shopee_listings.product_id`，确保订单与海外仓库存口径打通。
- 避免出现“有订单流水但海外仓库存不变”的错位现象。

## 2. 背景与问题
- 当前发布链路中，`shopee_listings.product_id` 默认写入 `NULL`。
- 订单可生成并写入库存流水，但因缺失 `product_id`，无法映射到 `inventory_lots` 实际批次。
- 结果表现为：
  - Step04「库存变动明细」可看到 `order_reserve/cancel_release`；
  - `inventory_lots.quantity_available/reserved_qty` 不变化；
  - 海外仓总览长期停留在初始入仓值（如 4000）。

## 3. 设计范围
- 前端：Shopee 新增/编辑商品页右侧关联卡片。
- 后端：提供“可关联仓库商品列表”接口；发布接口接收并校验 `source_product_id`。
- 数据：复用现有字段 `shopee_listings.product_id`，不新增主表。

不在本次范围：
- 历史 `product_id IS NULL` 数据自动修复脚本（另立任务）。
- 智能图文匹配与 AI 推荐关联（后续增强）。

## 4. 流程设计
1. 玩家进入 Shopee「添加新商品」页面。
2. 右侧展示「仓库关联商品」卡片，默认加载当前 run 已入仓商品。
3. 玩家可按关键词检索并单选一个仓库商品。
4. 选择后在页面展示“已关联：商品名 + product_id + 可用库存”摘要。
5. 点击「保存并发布」时，提交 `source_product_id`。
6. 后端校验通过后写入 `shopee_listings.product_id=source_product_id`。
7. 后续订单占用/发货统一按该 `product_id` 扣减 `inventory_lots`。

## 5. 业务规则
- 关联规则：
  - 每个 Shopee Listing 必须关联且仅关联一个 `product_id`（MVP）。
  - 同一 `product_id` 可被多个 listing 复用（沿用当前商品池能力）。
- 发布规则：
  - `status_value=live` 时必须提供有效 `source_product_id`。
  - `status_value=unpublished` 可放宽为可选（便于先存草稿，后关联发布）。
- 校验规则：
  - `source_product_id` 必须存在于当前 `run_id` 的已入仓商品集合。
  - 仅允许关联当前用户所属 run 的库存商品，禁止跨 run/跨用户。
- 编辑规则：
  - 编辑已有关联的 listing 时默认回显原关联。
  - 若切换关联商品，需要二次确认提示“将影响后续库存口径”。

## 6. 数据模型
复用现有模型字段：
- `shopee_listings.product_id`：外键 `market_products.id`，用于库存映射主键。

建议补充（可选）：
- 在接口响应中增加关联展示字段（非落库）：
  - `linked_product_name`
  - `linked_product_available_qty`

## 7. 接口设计
### 7.1 查询可关联仓库商品
- `GET /shopee/runs/{run_id}/warehouse-link-products?keyword=&page=&page_size=`
- 返回字段：
  - `product_id`
  - `product_name`
  - `available_qty`
  - `reserved_qty`
  - `backorder_qty`
  - `inbound_lot_count`
- 数据来源：
  - `inventory_lots`（按 `product_id` 聚合）
  - 关联 `market_products.product_name`

### 7.2 发布/更新商品（增强）
- 现有接口：`POST /shopee/runs/{run_id}/product-drafts/{draft_id}/publish`
- 新增参数：`source_product_id`（int，可选但 live 建议必填）
- 后端处理：
  - 参数校验通过后写入 `listing.product_id`。
  - 非法时返回 `400`，提示“请先关联仓库商品后发布”。

### 7.3 商品详情/列表（增强）
- 商品列表与详情响应补充：
  - `product_id`
  - `linked_product_name`（可选）
  - `linked_inventory_snapshot`（可选）

## 8. 前端交互与展示
右侧卡片替换方案：
- 标题：`仓库关联商品`
- 搜索：输入框支持 `product_name/product_id`
- 列表项展示：
  - 商品名
  - `ID: xxx`
  - `可用/已占用/待补货`
- 选中态：高亮 + 勾选图标
- 状态提示：
  - 未选择：显示“发布前需关联仓库商品”
  - 已选择：显示关联摘要

交互细节：
- 页面初次加载自动请求第一页数据。
- 若编辑已有关联，自动滚动定位并选中对应项。
- 关键词为空时展示默认 Top（按可用库存倒序）。

## 9. 异常与边界
- 无入仓商品：
  - 卡片展示空状态“暂无可关联库存商品，请先完成 Step04 入仓”。
  - 发布按钮禁用或提交时报错拦截。
- 关联商品库存为 0：
  - 允许关联但给出风险提示“当前无可用库存，订单将走待补货路径”。
- 关联商品被下架/失效（理论低概率）：
  - 发布时以后端实时校验为准，返回明确错误文案。

## 10. 验收标准
1. 新建商品发布后，`shopee_listings.product_id` 不再为 `NULL`。
2. Step04 库存流水中 `order_reserve/order_ship/cancel_release` 均带有效 `product_id`。
3. 订单产生与发货后，`inventory_lots.quantity_available/reserved_qty` 按规则变化。
4. 页面可正确显示已关联商品与库存摘要，编辑场景可回显。
5. 未关联时发布拦截文案准确、路径清晰。

## 11. 实施顺序
1. 后端新增“仓库关联商品列表”查询接口。
2. 后端发布接口增加 `source_product_id` 参数与校验。
3. 前端替换右侧卡片 UI 并接入查询、选择、提交。
4. 联调库存口径：订单模拟 -> 发货 -> 取消 -> Step04 总览。
5. 回归测试（新建、编辑、未关联、空库存、无入仓商品）。

## 12. 风险与回滚
- 风险：
  - 老数据 `product_id=NULL` 仍可能继续出现历史口径不一致。
  - 多 listing 共享同一 `product_id` 会引入并发占用竞争（符合业务但需提示）。
- 回滚：
  - 可临时放开发布强校验（仅告警不拦截）作为灰度策略。
  - 保留原卡片文案作为 feature flag fallback（前端配置开关）。
