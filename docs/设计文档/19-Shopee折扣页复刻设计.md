# 19-Shopee折扣页复刻设计

## 1. 目标
- 在 Shopee `营销中心 -> 折扣` 子模块中，新增高保真复刻 Shopee 官方 `Discount` 首页。
- 页面需完整覆盖“创建折扣入口、活动类型 Tab、促销表现概览、搜索筛选、活动列表、操作列”这几类核心结构。
- 页面不是纯静态复刻，必须与当前对局系统打通，满足 `run_id` 维度隔离、状态持久化、列表查询、Redis 缓存、历史回溯只读保护。
- 本期默认采用：**页面结构完全复刻，但显示文案中文化**，以保持你当前营销中心中文化风格一致。

## 2. 范围与非范围
### 2.1 本期范围（V1）
- 新增 Shopee 折扣页路由：`/u/{public_id}/shopee/marketing/discount`
- 复刻以下页面区块：
  - 面包屑：`Home > Marketing Centre > Discount`
  - `Create Discount` 创建入口区
  - 活动类型 Tab：`全部 / 单品折扣 / 套餐优惠 / 加价购`
  - `Promotion Performance` 促销表现概览区
  - `Promotion List` 活动列表区
  - `Overall Market Discount` 跨站点整体折扣区
  - 搜索筛选栏（名称 / 时间区间 / 查询 / 重置）
  - 活动表格（状态、活动名、类型、商品、周期、操作）
- 后端提供折扣首页首屏聚合接口、活动列表查询接口、折扣活动创建接口、复制接口、详情接口。
- 数据库完成折扣活动主表、活动商品表、表现快照表、用户筛选偏好表设计。
- Redis 提供首页首屏缓存、列表缓存、表现概览缓存、筛选缓存与限流。

### 2.2 非范围（V1 不做）
- 不实现完整营销规则引擎的复杂冲突仲裁（例如折扣与券叠加优先级的全量 Shopee 规则）。
- 不实现加价购、套餐优惠的复杂商品组装算法，只先完成数据结构与页面复刻预埋。
- 不实现折扣分享落地页、站外分享短链、真实社媒传播。
- 不实现复杂统计归因（曝光、点击、收藏）全链路，只先接入可由订单与销售汇总支撑的经营指标。

## 3. 设计原则
- 高保真复刻：页面结构、留白、卡片分组、表格层级、筛选节奏尽量贴近 Shopee 官方折扣页。
- 中文化一致：沿用你当前营销中心中文化方向，标题、按钮、筛选项、状态、表格字段统一使用中文展示。
- 数据真实：活动列表、促销表现、状态标签全部由后端返回，不使用最终硬编码常量作为真实来源。
- 可扩展：折扣页设计要兼容后续 `套餐优惠 / 加价购 / 代金券 / 限时抢购` 子模块复用。
- 经营联动：折扣活动创建后，必须能自然进入你后续的订单模拟、销量变化、利润结算与经营复盘链路。

## 4. 页面结构设计（前端）
## 4.1 路由与导航
- 左侧菜单：`营销中心 -> 折扣`
- 页面路由：`/u/{public_id}/shopee/marketing/discount`
- `ShopeePage.activeView` 建议新增：`marketing-discount`
- 面包屑：
  - `卖家中心 > 营销中心 > 折扣`
- 左侧菜单高亮：
  - 一级：`营销中心`
  - 二级：`折扣`

## 4.2 页面分区
### A. 创建折扣区（Create Discount）
展示三张创建卡片：
1. `单品折扣`
- 说明：为单个商品设置折扣。
- 按钮：`创建`

2. `套餐优惠`
- 说明：将多个商品打包组合销售，提升客单价。
- 按钮：`创建`

3. `加价购`
- 说明：购买主商品后，可加价购买关联商品。
- 按钮：`创建`

交互要求：
- 三张卡片为并列等宽结构。
- 点击 `创建` 后进入对应活动创建页。
- 若功能尚未开放，可按状态展示禁用态或提示，但结构必须预留完整。

### B. 活动类型 Tab 区
- `全部`
- `单品折扣`
- `套餐优惠`
- `加价购`

交互要求：
- Tab 切换会同步更新活动列表与促销表现。
- URL 建议保留查询参数：
  - `discountType=all|discount|bundle|add_on`
  - `status=all|ongoing|upcoming|ended`
  - `page=1`

### C. 促销表现区（Promotion Performance）
展示统计口径时间范围内的核心指标：
- 销售额
- 订单数
- 售出件数
- 买家数

每个指标展示：
- 当前值
- 对比上一个周期变化比例
- 指标提示说明 icon

右上角：`更多`
- 后续可跳促销分析页，本期可先预留。

### D. 活动列表搜索区（Promotion List Filters）
筛选项建议包括：
- 搜索字段类型：
  - `活动名称`
  - `活动 ID`
- 关键字输入框
- 活动时间范围
- 查询按钮
- 重置按钮

### E. 活动列表区（Promotion List Table）
表头建议：
- 活动名称 / 状态
- 活动类型
- 商品
- 活动周期
- 操作

行内展示要求：
- 状态标签：`进行中 / 即将开始 / 已结束 / 已停用`
- 商品列展示：最多 5 张缩略图 + 剩余数量叠层计数
- 活动周期：开始时间 - 结束时间
- 操作列：根据状态展示不同组合
  - `编辑`
  - `复制`
  - `分享`
  - `详情`
  - `订单`
  - `更多`

### F. 跨站点整体折扣区（Overall Market Discount）
- 位置：位于活动列表与分页区下方，作为独立卡片区块展示。
- 目标：复刻 Shopee 官方“对海外店铺全部商品统一设置折扣”的入口。
- 展示字段建议：
  - 国际站点
  - 折扣比例
  - 状态
  - 活动周期
  - 操作
- 首版默认展示市场行：
  - 新加坡
  - 马来西亚
  - 越南
  - 菲律宾
  - 老挝
- 首版交互：
  - 若该站点尚未配置整体折扣，则各字段显示 `-`
  - 操作列展示 `创建`
  - 点击后进入后续“跨站点整体折扣创建页”或先提示“下一阶段接入”
- 页面文案口径：
  - 该区块前端显示统一中文化
  - 标题建议为：`跨站点整体折扣`
  - 辅助说明建议为：`为海外店铺中的全部商品统一设置折扣。`

## 4.3 页面状态
- `loading`：骨架屏/占位行
- `empty`：暂无活动，提示创建首个折扣活动
- `error`：首屏加载失败，可重试
- `readOnly`：历史回溯只可浏览，不允许创建、编辑、复制

## 4.4 前端组件拆分建议
- `frontend/src/modules/shopee/views/MarketingDiscountView.tsx`
- `frontend/src/modules/shopee/components/marketing-discount/DiscountCreateCards.tsx`
- `frontend/src/modules/shopee/components/marketing-discount/DiscountTypeTabs.tsx`
- `frontend/src/modules/shopee/components/marketing-discount/DiscountPerformancePanel.tsx`
- `frontend/src/modules/shopee/components/marketing-discount/DiscountFilters.tsx`
- `frontend/src/modules/shopee/components/marketing-discount/DiscountListTable.tsx`
- `frontend/src/modules/shopee/components/marketing-discount/DiscountProductThumbGroup.tsx`
- `frontend/src/modules/shopee/components/marketing-discount/OverallMarketDiscountTable.tsx`

## 4.5 前端状态管理建议
页面首屏建议由 bootstrap 聚合接口返回：
- `meta`
- `create_cards`
- `tabs`
- `performance`
- `filters`
- `list`
- `preferences`

本地状态：
- 当前 Tab
- 搜索输入值
- 时间筛选值
- 分页页码

后端持久化状态：
- 用户最近一次折扣页筛选偏好
- 折扣活动数据
- 促销表现快照

## 5. 后端接口设计（FastAPI）
统一延续现有风格：`/shopee/runs/{run_id}/...`

## 5.1 首屏聚合接口
### `GET /shopee/runs/{run_id}/marketing/discount/bootstrap`
用途：折扣页首屏初始化。

返回建议：
- `meta`
- `create_cards`
- `tabs`
- `performance`
- `filters`
- `list`
- `overall_market_discount`
- `preferences`

说明：
- 该接口是折扣页的首屏初始化聚合接口，减少前端多接口并发与闪烁。
- 需支持按 `discountType/status/page/keyword/date_range` 聚合当前列表结果。

## 5.2 列表查询接口
### `GET /shopee/runs/{run_id}/marketing/discount/campaigns`
参数建议：
- `discount_type`
- `status`
- `search_field`
- `keyword`
- `start_at`
- `end_at`
- `page`
- `page_size`

返回：
- `items`
- `pagination`
- `summary`

## 5.3 表现概览接口
### `GET /shopee/runs/{run_id}/marketing/discount/performance`
参数建议：
- `discount_type`
- `status`
- `date_from`
- `date_to`

返回：
- `sales_amount`
- `orders_count`
- `units_sold`
- `buyers_count`
- `vs_previous_period`

## 5.4 创建活动接口
### `POST /shopee/runs/{run_id}/marketing/discount/campaigns`
用途：创建单品折扣 / 套餐优惠 / 加价购活动。

入参建议：
- `campaign_type`
- `campaign_name`
- `start_at`
- `end_at`
- `items[]`
- `rules`

说明：
- 本文档先定义首页及数据结构，具体创建页可在后续 20 号文档继续展开。

## 5.5 复制活动接口
### `POST /shopee/runs/{run_id}/marketing/discount/campaigns/{campaign_id}/duplicate`
用途：复制已有活动，生成草稿。

## 5.6 活动详情接口
### `GET /shopee/runs/{run_id}/marketing/discount/campaigns/{campaign_id}`
用途：活动详情、编辑回填、只读查看。

## 5.7 用户筛选偏好接口
### `POST /shopee/runs/{run_id}/marketing/discount/preferences`
保存用户最近一次折扣页筛选设置。

建议字段：
- `selected_discount_type`
- `selected_status`
- `search_field`
- `keyword`
- `date_from`
- `date_to`

## 5.8 跨站点整体折扣接口（预留）
### `GET /shopee/runs/{run_id}/marketing/discount/overall-market`
- 用途：读取跨站点整体折扣表格数据。

### `POST /shopee/runs/{run_id}/marketing/discount/overall-market`
- 用途：创建或更新某一国际站点的整体折扣规则。
- 本期页面先完成结构预留，可在后续阶段接入真实保存逻辑。

## 6. 业务规则设计
## 6.1 活动类型
- `discount`：单品折扣
- `bundle`：套餐优惠
- `add_on`：加价购

## 6.2 活动状态
- `draft`：草稿
- `upcoming`：即将开始
- `ongoing`：进行中
- `ended`：已结束
- `disabled`：已停用

前端中文映射：
- `draft` -> `草稿`
- `upcoming` -> `即将开始`
- `ongoing` -> `进行中`
- `ended` -> `已结束`
- `disabled` -> `已停用`

## 6.3 活动生效规则（首页口径）
- 首页列表仅显示当前对局、当前玩家所属店铺的折扣活动。
- 草稿活动默认不在 `全部` Tab 展示，可按产品策略决定是否纳入；首版建议：
  - 商家运营列表展示草稿
  - 对外统计不计入表现概览
- `Promotion Performance` 默认统计：
  - 当前筛选条件下、近 7 游戏天内、已生效活动带来的销售结果
- 活动复制后：
  - 新活动默认 `draft`
  - 不继承实际效果数据

## 6.4 订单与销量归因规则（V1）
为支持折扣页表现概览，需定义最小归因口径：
- 若订单命中某折扣活动商品，且下单时活动处于 `ongoing`，则记录 `campaign_id`。
- 促销表现统计优先按订单明细汇总：
  - `sales_amount`：命中活动订单实付金额汇总
  - `orders_count`：命中活动订单数
  - `units_sold`：命中活动售出件数
- `buyers_count`：命中活动的去重买家数

## 6.5 跨站点整体折扣规则（预留口径）
- 该区块表示“针对海外店铺全部商品的统一折扣策略”，与单个活动列表并列展示。
- 首版只做结构和数据模型预留，不强制进入订单模拟计算。
- 后续若接入经营模拟，建议优先级低于明确绑定商品的单品折扣活动，避免全店折扣覆盖更细粒度活动。

## 7. 数据库设计（MySQL）
> 按仓库规则，所有新表与新字段必须维护 table comment 与 column comment。

## 7.1 新表：`shopee_discount_campaigns`
用途：折扣活动主表，存储单品折扣/套餐优惠/加价购活动定义。

建议字段：
- `id` bigint PK
- `run_id` bigint
- `user_id` bigint
- `campaign_type` varchar(32) `discount|bundle|add_on`
- `campaign_name` varchar(255)
- `campaign_status` varchar(32) `draft|upcoming|ongoing|ended|disabled`
- `start_at` datetime
- `end_at` datetime
- `market` varchar(16)
- `currency` varchar(16)
- `rules_json` json
- `share_token` varchar(128) null
- `source_campaign_id` bigint null
- `created_at` datetime
- `updated_at` datetime

建议索引：
- `idx_discount_campaigns_run_user`
- `idx_discount_campaigns_status`
- `idx_discount_campaigns_type`
- `idx_discount_campaigns_time`

## 7.2 新表：`shopee_discount_campaign_items`
用途：折扣活动关联商品/变体明细。

建议字段：
- `id` bigint PK
- `campaign_id` bigint
- `listing_id` bigint
- `variant_id` bigint null
- `product_name_snapshot` varchar(255)
- `image_url_snapshot` varchar(1024) null
- `sku_snapshot` varchar(128) null
- `original_price` decimal(12,2)
- `discount_type` varchar(32) `percent|fixed_price|bundle|add_on`
- `discount_value` decimal(12,2)
- `final_price` decimal(12,2) null
- `sort_order` int default 0
- `created_at` datetime
- `updated_at` datetime

## 7.3 新表：`shopee_discount_performance_daily`
用途：折扣活动日维度表现快照，用于首页统计与趋势扩展。

建议字段：
- `id` bigint PK
- `run_id` bigint
- `user_id` bigint
- `campaign_id` bigint
- `stat_date` date
- `sales_amount` decimal(12,2) default 0
- `orders_count` int default 0
- `units_sold` int default 0
- `buyers_count` int default 0
- `created_at` datetime
- `updated_at` datetime

说明：
- 若首版不想做异步汇总，也可先从订单实时聚合；但建议预留此表，便于后续性能优化。

## 7.4 新表：`shopee_user_discount_preferences`
用途：保存玩家在折扣页的筛选偏好。

建议字段：
- `id` bigint PK
- `run_id` bigint
- `user_id` bigint
- `selected_discount_type` varchar(32)
- `selected_status` varchar(32)
- `search_field` varchar(32)
- `keyword` varchar(255) null
- `date_from` datetime null
- `date_to` datetime null
- `last_viewed_at` datetime null
- `created_at` datetime
- `updated_at` datetime

约束建议：
- unique(`run_id`, `user_id`)

## 7.5 新表：`shopee_overall_market_discounts`（预留）
用途：存储各国际站点的整体折扣设置。

建议字段：
- `id` bigint PK
- `run_id` bigint
- `user_id` bigint
- `market_code` varchar(16)
- `market_label` varchar(64)
- `discount_rate` decimal(6,2) null
- `status` varchar(32) `draft|upcoming|ongoing|ended|disabled`
- `start_at` datetime null
- `end_at` datetime null
- `created_at` datetime
- `updated_at` datetime

说明：
- 本期前端可先使用固定站点行结构展示；
- 后续接入真实功能时再落该表与对应接口。

## 7.5 现有表扩展建议
### `shopee_orders`
为活动归因增加字段：
- `marketing_campaign_type` varchar(32) null
- `marketing_campaign_id` bigint null
- `marketing_campaign_name_snapshot` varchar(255) null

说明：
- 下单时固化命中的折扣活动，避免后续活动修改导致统计漂移。

## 8. Redis 设计
统一延续现有 `REDIS_PREFIX=cbec` 规则。

## 8.1 Key 规划
- `cbec:cache:shopee:discount:bootstrap:{run_id}:{user_id}:{discount_type}:{status}:{page}:{hash}`
- `cbec:cache:shopee:discount:list:{run_id}:{user_id}:{discount_type}:{status}:{page}:{hash}`
- `cbec:cache:shopee:discount:performance:{run_id}:{user_id}:{discount_type}:{status}:{date_from}:{date_to}`
- `cbec:cache:shopee:discount:detail:{run_id}:{campaign_id}`
- `cbec:cache:shopee:discount:preferences:{run_id}:{user_id}`
- `cbec:cache:shopee:discount:overall-market:{run_id}:{user_id}`

其中 `hash` 用于编码：
- `search_field`
- `keyword`
- `date_range`

## 8.2 TTL 建议
- bootstrap：30 秒
- list：30 秒
- performance：60 秒
- detail：60 秒
- preferences：300 秒
- overall-market：120 秒

## 8.3 失效策略
- 创建/编辑/复制/停用折扣活动后：
  - 清理该 `run_id + user_id` 下的 bootstrap/list/detail/performance 缓存
- 更新跨站点整体折扣后：
  - 清理 `overall-market` 与 `bootstrap` 缓存
- 新订单命中折扣活动后：
  - 清理相关 `performance` 缓存
  - 按需清理首页 `bootstrap` 缓存
- 用户更新筛选偏好后：
  - 清理该用户 `preferences` 与 `bootstrap` 缓存

## 8.4 限流建议
- 折扣页 bootstrap：`60 req/min/user`
- 活动列表查询：`120 req/min/user`
- 创建/复制活动：`20 req/min/user`

## 9. 接口返回结构建议
## 9.1 bootstrap 示例
```json
{
  "meta": {
    "run_id": 12,
    "user_id": 101,
    "market": "MY",
    "currency": "RM",
    "read_only": false,
    "current_tick": "2026-04-14T14:00:00"
  },
  "create_cards": [
    {
      "type": "discount",
      "title": "单品折扣",
      "description": "为单个商品设置折扣。",
      "enabled": true,
      "target_route": "/u/usr_xxx/shopee/marketing/discount/create?type=discount"
    },
    {
      "type": "bundle",
      "title": "套餐优惠",
      "description": "组合销售多个商品，提升客单价。",
      "enabled": true,
      "target_route": "/u/usr_xxx/shopee/marketing/discount/create?type=bundle"
    },
    {
      "type": "add_on",
      "title": "加价购",
      "description": "购买主商品后可优惠加购关联商品。",
      "enabled": true,
      "target_route": "/u/usr_xxx/shopee/marketing/discount/create?type=add_on"
    }
  ],
  "tabs": [
    {"key": "all", "label": "全部", "count": 6, "active": true},
    {"key": "discount", "label": "单品折扣", "count": 3, "active": false},
    {"key": "bundle", "label": "套餐优惠", "count": 2, "active": false},
    {"key": "add_on", "label": "加价购", "count": 1, "active": false}
  ],
  "performance": {
    "label": "促销表现",
    "range_text": "统计时间：2026-04-07 至 2026-04-14",
    "metrics": [
      {"key": "sales_amount", "label": "销售额", "value": "RM 1280.00", "delta": 0.12},
      {"key": "orders_count", "label": "订单数", "value": 26, "delta": 0.08},
      {"key": "units_sold", "label": "售出件数", "value": 31, "delta": 0.15},
      {"key": "buyers_count", "label": "买家数", "value": 19, "delta": 0.05}
    ]
  },
  "filters": {
    "search_field": "campaign_name",
    "keyword": "夏季",
    "date_from": null,
    "date_to": null
  },
  "list": {
    "items": [
      {
        "id": 1001,
        "campaign_name": "夏季折扣 1",
        "status": "ongoing",
        "status_label": "进行中",
        "campaign_type": "discount",
        "campaign_type_label": "单品折扣",
        "products": [
          {"image_url": "https://.../1.png"},
          {"image_url": "https://.../2.png"}
        ],
        "products_overflow_count": 2,
        "period_text": "2026-04-10 20:30 - 2026-04-20 21:30",
        "actions": ["edit", "duplicate", "share", "more"]
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 10,
      "total": 6
    }
  },
  "preferences": {
    "selected_discount_type": "all",
    "selected_status": "all"
  }
}
```

## 10. 前后端口径约束
- 页面展示用中文，但接口枚举值仍保留英文 key，便于程序逻辑稳定。
- 活动状态以服务端计算为准，不允许前端根据时间自行推断最终状态。
- 活动商品名称、图片、SKU 使用创建当时快照字段，避免商品后续编辑影响历史活动展示。
- 促销表现默认按当前筛选条件聚合，而不是全店所有折扣活动汇总。

## 11. 验收标准
1. 折扣页结构、区块顺序、表格层级、筛选栏布局与官方截图保持一致。
2. 左侧菜单点击 `折扣` 可进入页面，菜单与面包屑高亮正确。
3. 首屏数据通过 bootstrap 接口完成初始化，不依赖前端硬编码假数据作为最终口径。
4. 促销表现可随 Tab 与筛选条件变化更新。
5. 活动列表支持分页、搜索、时间范围筛选与状态展示。
6. 历史回溯模式下只允许浏览，不允许创建、编辑、复制与偏好写入。
7. Redis 缓存命中、失效与限流策略明确且可落地。

## 12. 实施顺序建议
1. 文档确认：先锁定首页结构、枚举值、状态流与列表字段。
2. 数据层：落地折扣活动主表、商品表、偏好表、表现快照表与注释。
3. 后端：实现 bootstrap、list、performance、detail、duplicate、preferences 接口。
4. 前端：新增 `marketing-discount` 路由、页面复刻、筛选与表格展示。
5. Redis：接入缓存、失效与限流。
6. 联调：校验历史回溯只读、URL 参数同步、表现统计口径。
7. 后续二期：继续细化创建页、编辑页、商品选择器与真实营销规则。

## 13. 与当前项目的衔接结论
- 该页是 `18-Shopee营销中心复刻设计` 的下一层子模块，自然承接 `Marketing Centre -> Discount` 路由。
- 前端可直接复用现有 Shopee 容器、左侧菜单、顶部面包屑与等比缩放布局。
- 后端可延续当前 `bootstrap + 分项接口 + Redis 缓存 + run_id 隔离` 的工程模式。
- 数据口径与后续订单模拟、销量统计、回款与财务页天然联动，符合你现在“经营闭环优先”的项目路线。
