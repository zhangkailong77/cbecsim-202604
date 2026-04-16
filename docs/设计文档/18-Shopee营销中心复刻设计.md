# 18-Shopee营销中心复刻设计

## 1. 目标
- 在 Step 05（Shopee 店铺运营）新增 `Marketing Centre` 页面，视觉与信息层级高保真复刻 Shopee 官方界面。
- 页面不是纯静态壳子，需与当前对局体系打通，满足 `run_id` 维度的数据隔离、状态持久化、缓存加速与可扩展。
- 本期优先完成“可展示、可配置、可路由、可缓存”的营销中枢首页。

## 2. 范围与非范围
### 2.1 本期范围（V1）
- 新增 Shopee 运营台入口路由：`/u/{public_id}/shopee/marketing-centre`。
- 复刻首页模块：
  - 面包屑：`Home > Marketing Centre`
  - `Announcement` 公告区（3列）
  - `Marketing Tools` 工具卡片区（3列网格）
  - `Shopee Events` 活动区（3列横幅）
- 工具卡支持状态标签：
  - `Boost Sales`
  - `Increase Traffic`
  - `Improve Engagement`
- 卡片点击可进入子模块占位页（后续分阶段实现真实业务逻辑）。
- 后端提供公告、工具、活动、用户偏好接口。
- Redis 提供营销中心首屏缓存与列表缓存。

### 2.2 非范围（V1 不做）
- 不实现折扣/代金券/广告/联盟营销等完整运营引擎。
- 不实现营销预算扣费、自动投放、ROI 归因模型。
- 不实现多语言自动翻译与 AI 文案生成。

## 3. 设计原则
- 高保真复刻：保证布局比例、视觉节奏、卡片层级与交互反馈接近官方页面。
- 系统一致性：延续现有 Shopee 容器结构、菜单体系与等比缩放策略。
- 数据真实性：展示数据从后端接口读取，不使用硬编码常量作为最终口径。
- 可扩展：工具配置中心化，新增工具尽量不改前端结构代码。

## 4. 页面结构与交互设计（前端）
## 4.1 信息架构
- 左侧菜单保持现有分组：命令、产品、营销中心、客户服务、金融、数据。
- 营销中心子菜单（与官方截图一致）：
  - Marketing Centre
  - Cheap on Shopee
  - Shopee Ads
  - Affiliate Marketing
  - Live & Video
  - Discount
  - My Shop's Flash Sale
  - Vouchers
  - Campaign
  - International Platform

## 4.2 页面布局
- 主背景：浅灰背景（与 Shopee 主控台一致）。
- 内容区分段容器：Announcement、Marketing Tools、Shopee Events。
- 网格规则：
  - 公告区：3列
  - 工具区：3列多行
  - 活动区：3列横幅
- 支持 `Collapse/Expand` 折叠工具区。

## 4.3 组件拆分建议
- `frontend/src/modules/shopee/views/MarketingCentreView.tsx`
- `frontend/src/modules/shopee/components/marketing/MarketingAnnouncement.tsx`
- `frontend/src/modules/shopee/components/marketing/MarketingToolGrid.tsx`
- `frontend/src/modules/shopee/components/marketing/MarketingToolCard.tsx`
- `frontend/src/modules/shopee/components/marketing/MarketingEvents.tsx`
- `frontend/src/modules/shopee/components/marketing/MarketingEventCard.tsx`

## 4.4 路由与状态建议
- `ShopeePage` 的 `activeView` 增加 `marketing-centre`。
- `parseShopeeViewFromPath` 与 `buildShopeePath` 增加营销中心分支。
- 历史回溯（`readOnly=true`）下允许浏览，禁止写操作（如偏好保存）。

## 5. 后端设计（FastAPI）
统一延续现有命名风格：`/shopee/runs/{run_id}/...`

### 5.1 首屏聚合接口（推荐）
- `GET /shopee/runs/{run_id}/marketing-centre/bootstrap`
- 返回：
  - `announcements`
  - `tools`
  - `events`
  - `preferences`
  - `meta`（market/lang/current_tick）

### 5.2 公告接口
- `GET /shopee/runs/{run_id}/marketing/announcements`
- 支持参数：`market`、`lang`、`page`、`page_size`

### 5.3 工具接口
- `GET /shopee/runs/{run_id}/marketing/tools`
- 返回工具卡片配置、标签、可用状态、目标路由。

### 5.4 活动接口
- `GET /shopee/runs/{run_id}/marketing/events`
- 支持参数：`market`、`lang`、`status`

### 5.5 用户偏好接口
- `POST /shopee/runs/{run_id}/marketing/preferences`
- 入参示例：
  - `tools_collapsed: boolean`

### 5.6 管理端接口（预留）
- `POST /game/admin/marketing/announcements`
- `POST /game/admin/marketing/tools`
- `POST /game/admin/marketing/events`

## 6. 数据库设计（MySQL）
> 按仓库规则，所有新表与新字段必须维护 table/column comment。

## 6.1 新表：`shopee_marketing_announcements`
- 用途：营销公告配置池（可按市场/语言/时间投放）。
- 字段：
  - `id` bigint PK
  - `market` varchar(16)
  - `lang` varchar(16)
  - `title` varchar(255)
  - `summary` text
  - `badge_text` varchar(64) null
  - `priority` int default 0
  - `start_at` datetime null
  - `end_at` datetime null
  - `status` varchar(32) (`draft/published/offline`)
  - `created_at` datetime
  - `updated_at` datetime

## 6.2 新表：`shopee_marketing_tools`
- 用途：营销工具卡片配置中心。
- 字段：
  - `id` bigint PK
  - `tool_key` varchar(64) unique
  - `tool_name` varchar(128)
  - `tag_type` varchar(64) (`boost_sales/increase_traffic/improve_engagement`)
  - `description` varchar(512)
  - `icon_key` varchar(64)
  - `target_route` varchar(255)
  - `sort_order` int default 0
  - `is_enabled` tinyint(1) default 1
  - `is_visible` tinyint(1) default 1
  - `created_at` datetime
  - `updated_at` datetime

## 6.3 新表：`shopee_marketing_events`
- 用途：营销活动横幅配置。
- 字段：
  - `id` bigint PK
  - `market` varchar(16)
  - `lang` varchar(16)
  - `title` varchar(255)
  - `image_url` varchar(1024)
  - `jump_url` varchar(1024)
  - `start_at` datetime null
  - `end_at` datetime null
  - `status` varchar(32) (`upcoming/ongoing/ended/offline`)
  - `sort_order` int default 0
  - `created_at` datetime
  - `updated_at` datetime

## 6.4 新表：`shopee_user_marketing_preferences`
- 用途：用户在营销中心的展示偏好。
- 字段：
  - `id` bigint PK
  - `run_id` bigint
  - `user_id` bigint
  - `tools_collapsed` tinyint(1) default 0
  - `last_viewed_at` datetime null
  - `created_at` datetime
  - `updated_at` datetime
- 约束：
  - unique(`run_id`, `user_id`)

## 7. Redis 设计
统一延续现有 `REDIS_PREFIX=cbec` 规则。

## 7.1 Key 规划
- `cbec:cache:shopee:marketing:bootstrap:{run_id}:{user_id}:{market}:{lang}`
- `cbec:cache:shopee:marketing:announcements:{market}:{lang}`
- `cbec:cache:shopee:marketing:tools`
- `cbec:cache:shopee:marketing:events:{market}:{lang}`

## 7.2 TTL 建议
- bootstrap：30 秒
- announcements：120 秒
- tools：300 秒
- events：120 秒

## 7.3 失效策略
- 管理端更新公告/工具/活动后，按 prefix 主动删除对应缓存。
- 用户偏好更新后，仅清理该用户 bootstrap 缓存。

## 7.4 限流建议
- 营销中心 bootstrap：`60 req/min/user`
- 管理端写接口：`10 req/min/user`

## 8. 示例响应（bootstrap）
```json
{
  "meta": {
    "run_id": 12,
    "user_id": 101,
    "market": "MY",
    "lang": "zh-CN",
    "current_tick": "2026-04-14T12:00:00"
  },
  "preferences": {
    "tools_collapsed": false
  },
  "announcements": [
    {
      "id": 1,
      "title": "免费！推广奖励升级",
      "summary": "参与活动可获得额外流量扶持",
      "badge_text": "NEW",
      "published_at": "2026-04-13T09:00:00"
    }
  ],
  "tools": [
    {
      "tool_key": "discount",
      "tool_name": "Discount",
      "tag_type": "boost_sales",
      "description": "Set discounts on your products to boost sales",
      "icon_key": "discount",
      "target_route": "/u/{public_id}/shopee/marketing/discount",
      "is_enabled": true
    }
  ],
  "events": [
    {
      "id": 10,
      "title": "Super Voucher Day",
      "image_url": "https://xxx/banner.png",
      "jump_url": "/u/{public_id}/shopee/marketing/campaign",
      "status": "ongoing"
    }
  ]
}
```

## 9. 验收标准
1. 页面结构、区块顺序、卡片样式、标签语义与官方截图对齐。
2. `Marketing Centre` 可从 Shopee 左侧菜单进入并正确高亮。
3. 首屏通过 bootstrap 接口加载，不依赖本地硬编码数据。
4. 公告/工具/活动均可配置并生效，缓存命中与失效符合预期。
5. 历史回溯只读模式下，页面可看但不写入偏好与业务状态。

## 10. 实施顺序建议
1. 数据层：建表 + 注释 +初始化种子数据。
2. 后端：bootstrap 与分项读取接口。
3. 前端：路由接线与页面复刻。
4. Redis：缓存与失效接入。
5. 联调：历史回溯只读保护、加载性能、菜单与面包屑一致性。

## 11. 风险与后续
- 风险：官方页面后续改版导致视觉偏差；活动图资源失效导致白屏。
- 后续：
  - 分期接入 `Discount/Voucher/Ads/Affiliate` 真实业务模块。
  - 增加营销效果统计（曝光、点击、订单贡献）与经营模拟联动。

