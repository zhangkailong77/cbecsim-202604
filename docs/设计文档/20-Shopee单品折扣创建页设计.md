# 20-Shopee单品折扣创建页设计

## 1. 目标
- 在 Shopee `营销中心 -> 折扣 -> 单品折扣 -> 创建` 链路中，新增高保真复刻 Shopee 官方 `Create New Discount Promotion` 页面。
- 页面需完整覆盖“基础信息录入、活动时间设置、折扣商品添加、商品折扣配置、提交校验、取消返回、草稿能力”这几类核心结构。
- 页面不是纯静态复刻，必须与当前对局系统打通，满足 `run_id` 维度隔离、活动数据持久化、商品快照保存、校验规则落库、Redis 缓存与历史回溯只读保护。
- 本期默认采用：**页面结构完全复刻，但显示文案中文化**，与当前营销中心、折扣页的中文化风格保持一致。

## 2. 范围与非范围
### 2.1 本期范围（V1）
- 新增 Shopee 单品折扣创建页路由：`/u/{public_id}/shopee/marketing/discount/create?type=discount`
- 复刻以下页面区块：
  - 面包屑：`卖家中心 > 营销中心 > 折扣 > 创建单品折扣`
  - `基础信息` 区块
  - 活动名称输入框（带字符计数）
  - 活动时间区间选择（开始时间 / 结束时间）
  - `单品折扣商品` 区块
  - `添加商品` 按钮
  - 已选商品列表区（商品卡/表格）
  - 页脚操作：`取消 / 确认`
- 新增“添加商品”弹窗/抽屉设计：
  - 查询可参与折扣的商品
  - 勾选商品或变体
  - 配置折扣方式与折后价
- 后端提供：
  - 创建页 bootstrap 接口
  - 可选商品列表接口
  - 创建单品折扣接口
  - 草稿保存接口
  - 单活动详情回填接口
- 数据库完成：
  - 单品折扣活动主表扩展字段
  - 活动商品明细扩展字段
  - 创建页草稿表/草稿商品表（建议）
  - 校验日志与错误快照（可选）
- Redis 提供：
  - 创建页 bootstrap 缓存
  - 商品选择器查询缓存
  - 草稿缓存
  - 提交后相关首页/列表缓存失效

### 2.2 非范围（V1 不做）
- 不实现套餐优惠与加价购创建页。
- 不实现批量导入折扣商品（Excel/CSV）。
- 不实现复杂的自动推荐折扣策略。
- 不实现跨站点整体折扣创建页（该部分在 19 号文档中预留，后续单独展开）。

## 3. 设计原则
- 高保真复刻：布局、表单间距、字段层级、底部按钮节奏尽量贴近 Shopee 官方创建页。
- 中文化一致：标题、标签、提示、按钮、错误文案统一中文展示。
- 数据真实：商品列表、价格、库存、变体、校验结果全部由后端接口返回，不以最终硬编码为真实来源。
- 规则明确：创建页必须把“哪些商品能参加活动、折扣如何计算、哪些组合非法”说清楚并可校验。
- 闭环联动：活动提交成功后，需自然回流到 19 号折扣首页列表，并纳入后续订单与表现统计链路。

## 4. 页面结构设计（前端）
## 4.1 路由与导航
- 页面路由：`/u/{public_id}/shopee/marketing/discount/create?type=discount`
- 面包屑建议：
  - `卖家中心 > 营销中心 > 折扣 > 创建单品折扣`
- 左侧菜单高亮：
  - 一级：`营销中心`
  - 二级：`折扣`
- 页面返回逻辑：
  - 点击 `取消` 返回折扣首页
  - 提交成功后自动返回折扣首页并提示“创建成功”

## 4.2 页面分区
### A. 基础信息区
字段建议：
1. `活动名称`
- 输入框
- 最大长度：150 字符
- 展示字符计数：`0/150`
- 提示文案：活动名称仅卖家可见，不向买家展示

2. `活动时间`
- 开始时间
- 结束时间
- 日期时间选择器
- 约束：活动时长必须小于 180 天

### B. 单品折扣商品区
- 标题：`单品折扣商品`
- 辅助文案：将商品加入活动并设置折扣价格
- 操作按钮：`添加商品`

#### B1. 未添加商品时
- 展示空态区块
- 仅显示 `添加商品` 按钮与说明

#### B2. 已添加商品时
- 显示商品明细列表，建议字段：
  - 商品图片
  - 商品名称
  - 规格/变体
  - 原价
  - 折扣方式
  - 折扣值
  - 折后价
  - 活动库存上限（可选）
  - 剩余库存
  - 操作（删除）

### C. 页脚操作区
- 左：`取消`
- 右：`确认`
- 提交按钮在以下情况下禁用：
  - 活动名称为空
  - 时间非法
  - 未添加商品
  - 存在折扣规则校验错误

## 4.3 添加商品弹窗/抽屉设计
### A. 顶部
- 标题：`添加商品`
- 搜索框：按商品名称 / SKU 搜索
- 筛选项：
  - 商品状态（上架中）
  - 类目（可选）
  - 是否有可用库存

### B. 列表区
每个商品展示：
- 图片
- 商品名称
- 价格
- 库存
- 可参与活动状态
- 是否含变体

### C. 选择规则
- 单品折扣默认支持按“变体”维度参与活动。
- 若商品无变体，则按商品本身参与。
- 同一商品/变体不可在同一活动中重复添加。
- 已被同时间段同类型活动占用的商品，需提示冲突。

### D. 确认后回填
- 回填至创建页的“单品折扣商品区”
- 每个商品可独立配置折扣值与折后价

## 4.4 页面状态
- `loading`：bootstrap 加载中
- `empty`：未添加任何活动商品
- `error`：创建页初始化失败，可重试
- `draft`：存在未提交草稿
- `readOnly`：历史回溯只读，禁用所有写操作

## 4.5 前端组件拆分建议
- `frontend/src/modules/shopee/views/DiscountCreateView.tsx`
- `frontend/src/modules/shopee/components/marketing-discount-create/DiscountBasicInfoSection.tsx`
- `frontend/src/modules/shopee/components/marketing-discount-create/DiscountProductSection.tsx`
- `frontend/src/modules/shopee/components/marketing-discount-create/DiscountSelectedProductsTable.tsx`
- `frontend/src/modules/shopee/components/marketing-discount-create/DiscountProductPickerModal.tsx`
- `frontend/src/modules/shopee/components/marketing-discount-create/DiscountFooterActions.tsx`

## 4.6 前端状态管理建议
bootstrap 返回建议包括：
- `meta`
- `form`
- `rules`
- `product_picker`
- `draft`

本地状态：
- 活动名称
- 时间范围
- 已选商品列表
- 商品搜索关键字
- 折扣配置草稿
- 提交中状态

后端持久化状态：
- 活动草稿
- 草稿商品列表
- 正式活动记录

## 5. 业务规则设计
## 5.1 活动类型
本页仅处理：
- `discount`：单品折扣

## 5.2 基础校验
- 活动名称不能为空
- 活动名称长度 `<= 150`
- 开始时间必须早于结束时间
- 活动时长 `< 180 天`
- 至少添加 1 个商品或变体

## 5.3 商品准入规则
商品必须满足以下条件才允许加入单品折扣：
- 商品状态为 `live`
- 有可售库存或允许活动库存配置
- 不在同时间段被相同维度的冲突活动锁定
- 商品价格有效且大于 0

## 5.4 折扣配置规则
建议支持两种配置方式：
1. 按折扣百分比
- 例如：`10% off`

2. 直接填写折后价
- 系统自动反推折扣比例

规则约束建议：
- 折扣比例范围：`1% ~ 99%`
- 折后价必须 `> 0`
- 折后价必须 `< 原价`
- 若商品存在最低利润保护规则，可在后端做业务拦截（首版可先提示，不强制）

## 5.5 冲突规则
- 同一商品/变体在同一时段内，不允许被两个“单品折扣”活动同时生效。
- 若与后续 `限时抢购 / 代金券 / 整体折扣` 存在优先级冲突：
  - 本期先记录冲突提示
  - 后续在营销规则引擎统一处理优先级

## 5.6 草稿规则
- 用户填写过程中允许保存草稿
- 草稿与正式活动分离
- 草稿不进入折扣首页“促销表现”统计

## 6. 后端接口设计（FastAPI）
统一延续现有风格：`/shopee/runs/{run_id}/...`

## 6.1 创建页 bootstrap
### `GET /shopee/runs/{run_id}/marketing/discount/create/bootstrap`
参数建议：
- `campaign_type=discount`
- `draft_id`（可选）
- `source_campaign_id`（可选，用于复制活动）

返回建议：
- `meta`
- `form`
- `rules`
- `selected_products`
- `product_picker`
- `draft`

## 6.2 可选商品列表接口
### `GET /shopee/runs/{run_id}/marketing/discount/eligible-products`
参数建议：
- `keyword`
- `page`
- `page_size`
- `status=live`
- `has_stock=true`

返回：
- 商品基础信息
- 变体信息
- 原价
- 库存
- 是否冲突
- 冲突原因

## 6.3 草稿保存接口
### `POST /shopee/runs/{run_id}/marketing/discount/drafts`
用途：保存或更新当前创建页草稿。

入参建议：
- `draft_id`（可空）
- `campaign_type`
- `campaign_name`
- `start_at`
- `end_at`
- `items[]`

## 6.4 草稿详情接口
### `GET /shopee/runs/{run_id}/marketing/discount/drafts/{draft_id}`
用途：回填创建页。

## 6.5 创建正式活动接口
### `POST /shopee/runs/{run_id}/marketing/discount/campaigns`
用途：创建正式单品折扣活动。

入参建议：
- `campaign_type=discount`
- `campaign_name`
- `start_at`
- `end_at`
- `items[]`

`items[]` 建议字段：
- `listing_id`
- `variant_id`
- `discount_mode` (`percent|final_price`)
- `discount_percent`
- `final_price`
- `activity_stock_limit`（可选）

## 6.6 单活动详情接口
### `GET /shopee/runs/{run_id}/marketing/discount/campaigns/{campaign_id}`
用途：活动详情查看与编辑回填。

## 6.7 删除草稿接口（可选）
### `DELETE /shopee/runs/{run_id}/marketing/discount/drafts/{draft_id}`

## 7. 数据库设计（MySQL）
> 按仓库规则，所有新表与新字段必须维护 table comment 与 column comment。

## 7.1 扩展表：`shopee_discount_campaigns`
新增/强调字段：
- `campaign_name`
- `campaign_type=discount`
- `campaign_status`
- `start_at`
- `end_at`
- `rules_json`
- `source_campaign_id`

建议 `rules_json` 结构：
```json
{
  "campaign_scope": "single_product_discount",
  "discount_mode_summary": ["percent", "final_price"],
  "max_duration_days": 180
}
```

## 7.2 扩展表：`shopee_discount_campaign_items`
建议补齐字段：
- `discount_mode` varchar(32) `percent|final_price`
- `discount_percent` decimal(6,2) null
- `activity_stock_limit` int null
- `conflict_snapshot_json` json null

现有字段继续复用：
- `listing_id`
- `variant_id`
- `product_name_snapshot`
- `image_url_snapshot`
- `sku_snapshot`
- `original_price`
- `discount_value`
- `final_price`

## 7.3 新表：`shopee_discount_drafts`
用途：创建页草稿主表。

建议字段：
- `id` bigint PK
- `run_id` bigint
- `user_id` bigint
- `campaign_type` varchar(32)
- `campaign_name` varchar(255)
- `start_at` datetime null
- `end_at` datetime null
- `status` varchar(32) `draft`
- `source_campaign_id` bigint null
- `created_at` datetime
- `updated_at` datetime

## 7.4 新表：`shopee_discount_draft_items`
用途：创建页草稿商品明细。

建议字段：
- `id` bigint PK
- `draft_id` bigint
- `listing_id` bigint
- `variant_id` bigint null
- `product_name_snapshot` varchar(255)
- `image_url_snapshot` varchar(1024) null
- `sku_snapshot` varchar(128) null
- `original_price` decimal(12,2)
- `discount_mode` varchar(32)
- `discount_percent` decimal(6,2) null
- `final_price` decimal(12,2) null
- `activity_stock_limit` int null
- `created_at` datetime
- `updated_at` datetime

## 7.5 可选表：`shopee_discount_validation_logs`
用途：记录提交校验失败原因，便于调试与审计。

建议字段：
- `id` bigint PK
- `run_id` bigint
- `user_id` bigint
- `draft_id` bigint null
- `payload_snapshot_json` json
- `errors_json` json
- `created_at` datetime

## 8. Redis 设计
统一延续现有 `REDIS_PREFIX=cbec` 规则。

## 8.1 Key 规划
- `cbec:cache:shopee:discount:create:bootstrap:{run_id}:{user_id}:{campaign_type}:{draft_id}`
- `cbec:cache:shopee:discount:eligible-products:{run_id}:{user_id}:{page}:{hash}`
- `cbec:cache:shopee:discount:draft:{run_id}:{user_id}:{draft_id}`
- `cbec:cache:shopee:discount:campaign-detail:{run_id}:{campaign_id}`

其中 `hash` 用于编码：
- `keyword`
- `status`
- `has_stock`
- `category`

## 8.2 TTL 建议
- create bootstrap：30 秒
- eligible products：20 秒
- draft：300 秒
- campaign detail：60 秒

## 8.3 失效策略
- 草稿保存后：
  - 清理该草稿 `draft` 与 `create bootstrap` 缓存
- 创建正式活动成功后：
  - 清理折扣首页 `bootstrap/list/performance` 缓存
  - 清理创建页草稿缓存
  - 清理活动详情缓存
- 商品状态或库存变化后：
  - 清理 `eligible-products` 缓存

## 8.4 限流建议
- 创建页 bootstrap：`60 req/min/user`
- 可选商品查询：`120 req/min/user`
- 草稿保存：`60 req/min/user`
- 正式提交：`20 req/min/user`

## 9. 接口返回结构建议
## 9.1 创建页 bootstrap 示例
```json
{
  "meta": {
    "run_id": 12,
    "user_id": 101,
    "campaign_type": "discount",
    "read_only": false,
    "current_tick": "2026-04-14T16:00:00"
  },
  "form": {
    "campaign_name": "",
    "name_max_length": 150,
    "start_at": "2026-04-14T16:00:00",
    "end_at": "2026-04-14T17:00:00",
    "max_duration_days": 180
  },
  "rules": {
    "discount_modes": ["percent", "final_price"],
    "discount_percent_range": [1, 99],
    "requires_at_least_one_product": true
  },
  "selected_products": [],
  "product_picker": {
    "default_page_size": 20
  },
  "draft": null
}
```

## 10. 前后端口径约束
- 页面显示中文，但接口枚举值保留英文 key，便于程序逻辑稳定。
- 商品价格与库存以创建时接口返回值为准，提交时后端必须再次校验，不能完全相信前端缓存。
- 商品名称、图片、SKU 必须在提交时固化快照，避免后续商品编辑影响历史活动展示。
- 提交成功后写入正式活动表，草稿可删除或标记为已转正。

## 11. 验收标准
1. 点击“单品折扣 -> 创建”可进入创建页，结构与官方截图对齐。
2. 页面可填写活动名称、时间范围，并显示字符计数与校验提示。
3. 可通过“添加商品”选择符合条件的商品/变体并回填。
4. 提交前会校验活动名称、时间、商品数量、折扣规则是否合法。
5. 提交成功后回到折扣首页，并在活动列表中可见。
6. 历史回溯模式下只允许浏览，不允许保存草稿与正式提交。
7. Redis 缓存命中、失效与限流策略明确且可落地。

## 12. 实施顺序建议
1. 先确定创建页 bootstrap 结构与商品选择器字段。
2. 落地草稿表、草稿商品表与正式活动商品扩展字段。
3. 实现 bootstrap、eligible-products、draft、create 接口。
4. 前端复刻创建页、商品选择器与页脚按钮。
5. 联调提交成功回流折扣首页与缓存失效。
6. 后续进入编辑页与详情页。

## 13. 与当前项目的衔接结论
- 本文档是 19 号折扣首页文档的下一层子模块，直接承接“点击单品折扣创建”的交互入口。
- 前端可复用现有 Shopee 容器、左侧菜单、Header 面包屑、DateOnlyPicker 与折扣页结构。
- 后端可复用当前 `bootstrap + 列表 + Redis 缓存 + run_id 隔离 + 只读保护` 模式。
- 数据层会在现有 `shopee_discount_campaigns / shopee_discount_campaign_items` 基础上继续扩展，避免重复建模。
