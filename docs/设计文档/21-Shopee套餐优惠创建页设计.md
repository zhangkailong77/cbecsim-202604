# 21-Shopee套餐优惠创建页设计

## 1. 目标
- 在 Shopee `营销中心 -> 折扣 -> 套餐优惠 -> 创建` 链路中，新增高保真复刻 Shopee 官方 `Create New Bundle Deal` 页面。
- 页面需完整覆盖“基础信息录入、活动时间设置、套餐优惠类型配置、阶梯规则配置、商品添加、移动端预览、提交校验、草稿能力”这几类核心结构。
- 页面不是纯静态复刻，必须与当前对局系统打通，满足 `run_id` 维度隔离、活动数据持久化、商品快照保存、阶梯规则落库、Redis 缓存与历史回溯只读保护。
- 本期默认采用：**页面结构完全复刻，但显示文案中文化**，与当前营销中心、折扣页、单品折扣创建页的中文化风格保持一致。

## 2. 范围与非范围
### 2.1 本期范围（V1）
- 新增 Shopee 套餐优惠创建页路由：`/u/{public_id}/shopee/marketing/discount/create?type=bundle`
- 复刻以下页面区块：
  - 面包屑：`卖家中心 > 营销中心 > 套餐优惠 > 创建套餐优惠`
  - `基础信息` 区块
  - 套餐名称输入框（带字符计数）
  - 活动时间区间选择（开始时间 / 结束时间）
  - 套餐类型选择区
  - 阶梯规则表格区（Tiers）
  - 右侧移动端预览区
  - 限购次数输入框
  - `套餐优惠商品` 区块
  - `添加商品` 按钮
  - 页脚操作：`取消 / 确认`
- 后端提供：
  - 创建页 bootstrap 接口
  - 可选商品列表接口
  - 套餐优惠草稿保存接口
  - 套餐优惠创建接口
  - 套餐优惠详情回填接口
- 数据库完成：
  - 套餐优惠活动主表
  - 套餐商品关联表
  - 套餐阶梯规则表
  - 草稿表 / 草稿商品表 / 草稿阶梯表
- Redis 提供：
  - 创建页 bootstrap 缓存
  - 商品选择器查询缓存
  - 草稿缓存
  - 提交后折扣首页 / 套餐列表缓存失效

### 2.2 非范围（V1 不做）
- 不实现加价购创建页。
- 不实现批量导入套餐商品（Excel/CSV）。
- 不实现套餐优惠与代金券、限时抢购的复杂优先级引擎。
- 不实现套餐推荐算法与自动优惠建议。
- 不实现买家端完整营销展示页，仅在右侧做静态/半静态移动端预览。

## 3. 设计原则
- 高保真复刻：布局、字段间距、单选项、阶梯表格、右侧手机预览、底部按钮节奏尽量贴近 Shopee 官方创建页。
- 中文化一致：标题、标签、提示、按钮、错误文案统一中文展示。
- 规则可执行：套餐优惠的类型、阶梯、购买件数、折扣值、限购次数都必须可校验，不能只停留在展示文案。
- 数据真实：商品列表、价格、库存、SKU、规则校验结果全部由后端接口返回，不以最终硬编码为真实来源。
- 与现有折扣模块兼容：沿用 19 号折扣页的 `bundle` 类型口径，与 20 号单品折扣创建页共享导航、时间组件、商品选择器基础能力。

## 4. 页面结构设计（前端）
## 4.1 路由与导航
- 页面路由：`/u/{public_id}/shopee/marketing/discount/create?type=bundle`
- 面包屑建议：
  - `卖家中心 > 营销中心 > 套餐优惠 > 创建套餐优惠`
- 折扣首页点击“套餐优惠 -> 创建”后进入本页。
- 创建页延续当前 Shopee 创建页规则：
  - 隐藏左侧菜单栏
  - 保留顶部面包屑与返回链路
  - 保留返回工作台按钮

## 4.2 页面分区
### A. 基础信息区
字段建议：
1. `套餐名称`
- 输入框
- 最大长度：25 字符
- 展示字符计数：`0/25`
- 提示文案：套餐名称仅卖家可见，不向买家展示

2. `套餐活动时间`
- 开始时间
- 结束时间
- 日期时间选择器
- 复用 Shopee 现有公共 `DateTimePicker`
- 约束：活动时长必须小于 180 天

3. `套餐类型`
- 单选项，共 3 种：
  - `折扣比例`
  - `固定金额减免`
  - `套餐价`
- 默认选中：`折扣比例`
- 选中不同类型时，中间阶梯配置区联动变化

4. `限购次数`
- 数字输入框
- 表示每位买家最多可购买多少次该套餐优惠
- 辅助文案：单个买家可购买的套餐优惠最大次数

### B. 阶梯规则区（Tiers）
- 位置：基础信息区中部，在套餐类型下方
- 表头：
  - `阶梯`
  - `操作`
- 默认至少 1 条阶梯

#### B1. 折扣比例模式
- 文案样式参考官方：
  - `买 [件数] 件，享 [百分比] % OFF`
- 字段：
  - 购买件数
  - 折扣比例

#### B2. 固定金额减免模式
- 文案样式建议：
  - `买 [件数] 件，立减 [金额] RM`
- 字段：
  - 购买件数
  - 减免金额

#### B3. 套餐价模式
- 文案样式建议：
  - `买 [件数] 件，套餐价 [金额] RM`
- 字段：
  - 购买件数
  - 套餐总价

#### B4. 阶梯操作
- `新增阶梯`
- `删除阶梯`
- 首条阶梯不可删除，至少保留 1 条
- 阶梯必须按购买件数递增

### C. 移动端预览区
- 位置：基础信息区右侧
- 样式：模拟 Shopee 买家端详情卡片
- 作用：
  - 预览套餐标题
  - 预览优惠文案
  - 预览不同套餐类型在买家端的展示方式
- 首期可采用半静态预览：
  - 样式固定
  - 内容跟随表单输入实时变化

### D. 套餐优惠商品区
- 标题：`套餐优惠商品`
- 辅助文案：请添加商品加入套餐优惠
- 操作按钮：`添加商品`

#### D1. 未添加商品时
- 展示空态区块
- 仅显示 `添加商品` 按钮与说明

#### D2. 已添加商品时
- 显示商品明细表格，建议字段：
  - 勾选框
  - 商品图片
  - 商品名称
  - 规格 / SKU
  - 原价
  - 库存
  - 是否参与全部阶梯
  - 操作（移除）

### E. 页脚操作区
- 左：`取消`
- 右：`确认`
- 提交按钮在以下情况下禁用：
  - 套餐名称为空
  - 时间非法
  - 未添加商品
  - 阶梯规则非法
  - 限购次数非法

## 4.3 页面状态
- `loading`：bootstrap 加载中
- `empty`：未添加任何套餐商品
- `error`：创建页初始化失败，可重试
- `draft`：存在未提交草稿
- `readOnly`：历史回溯只读，禁用所有写操作

## 4.4 前端组件拆分建议
- `frontend/src/modules/shopee/views/BundleCreateView.tsx`
- `frontend/src/modules/shopee/components/marketing-bundle-create/BundleBasicInfoSection.tsx`
- `frontend/src/modules/shopee/components/marketing-bundle-create/BundleTierEditor.tsx`
- `frontend/src/modules/shopee/components/marketing-bundle-create/BundleMobilePreview.tsx`
- `frontend/src/modules/shopee/components/marketing-bundle-create/BundleProductSection.tsx`
- `frontend/src/modules/shopee/components/marketing-bundle-create/BundleProductPickerModal.tsx`
- `frontend/src/modules/shopee/components/marketing-bundle-create/BundleFooterActions.tsx`

## 4.5 前端状态管理建议
bootstrap 返回建议包括：
- `meta`
- `form`
- `rules`
- `tier_templates`
- `product_picker`
- `draft`

本地状态：
- 套餐名称
- 时间范围
- 套餐类型
- 阶梯规则列表
- 限购次数
- 已选商品列表
- 商品搜索关键字
- 提交中状态

后端持久化状态：
- 套餐草稿
- 草稿商品列表
- 草稿阶梯规则
- 正式套餐活动记录

## 5. 业务规则设计
## 5.1 活动类型
本页仅处理：
- `bundle`：套餐优惠

## 5.2 基础校验
- 套餐名称不能为空
- 套餐名称长度 `<= 25`
- 开始时间必须早于结束时间
- 活动时长 `< 180 天`
- 至少添加 1 个商品或 SKU
- 套餐类型必选
- 限购次数如填写，必须为正整数

## 5.3 商品准入规则
商品必须满足以下条件才允许加入套餐优惠：
- 商品状态为 `live`
- 有可售库存
- 商品价格有效且大于 0
- 同一商品 / SKU 在相同活动时段内不被互斥营销活动锁定
- 若商品已在套餐优惠中被占用，需要返回冲突提示

## 5.4 阶梯规则校验
### A. 通用规则
- 至少 1 条阶梯
- 每条阶梯的“购买件数”必须大于 0
- 多阶梯时，购买件数必须严格递增
- 阶梯数量建议上限：10

### B. 折扣比例模式
- 折扣比例范围：`1% ~ 99%`
- 不允许为 0 或 >= 100

### C. 固定金额减免模式
- 减免金额必须大于 0
- 减免金额不能大于套餐原总价

### D. 套餐价模式
- 套餐价必须大于 0
- 套餐价必须小于该阶梯下商品原总价

## 5.5 套餐商品规则
- 套餐优惠允许多个商品共同组成营销组合。
- 首期建议：
  - 按 SKU 维度参与
  - 同一 SKU 可加入同一套餐一次
  - 套餐中的商品默认共享阶梯规则，不做“某 SKU 仅参加部分阶梯”的复杂配置
- 后续如需增强，可扩展为：
  - 主商品 / 搭配商品
  - 指定商品池命中规则

## 5.6 限购规则
- 限购次数为空时，表示不限制或使用平台默认值（需在接口层明确）
- 限购次数填写时：
  - 必须为整数
  - 建议范围：`1 ~ 999`

## 5.7 草稿规则
- 用户填写过程中允许保存草稿
- 草稿与正式活动分离
- 草稿不进入折扣首页“促销表现”统计

## 5.8 冲突规则
- 同一商品 / SKU 在同一时段内，不允许被两个互斥套餐优惠同时生效
- 若与单品折扣、加价购、限时抢购存在优先级冲突：
  - 本期先记录冲突提示
  - 后续在营销规则引擎统一处理优先级

## 6. 后端接口设计（FastAPI）
统一延续现有风格：`/shopee/runs/{run_id}/...`

## 6.1 创建页 bootstrap
### `GET /shopee/runs/{run_id}/marketing/bundle/create/bootstrap`
参数建议：
- `campaign_type=bundle`
- `draft_id`（可选）
- `source_campaign_id`（可选，用于复制活动）

返回建议：
- `meta`
- `form`
- `rules`
- `tiers`
- `selected_products`
- `mobile_preview`
- `product_picker`
- `draft`

## 6.2 可选商品列表接口
### `GET /shopee/runs/{run_id}/marketing/bundle/eligible-products`
参数建议：
- `keyword`
- `search_field=name|product_id|sku`
- `category`
- `page`
- `page_size`
- `status=live`
- `has_stock=true`

返回：
- 商品基础信息
- SKU 信息
- 原价
- 库存
- 是否冲突
- 冲突原因
- 分类路径

## 6.3 草稿保存接口
### `POST /shopee/runs/{run_id}/marketing/bundle/drafts`
用途：保存或更新当前创建页草稿。

入参建议：
- 基础信息
- 套餐类型
- 阶梯规则
- 已选商品列表
- 限购次数

返回：
- `draft_id`
- `saved_at`

## 6.4 草稿详情接口
### `GET /shopee/runs/{run_id}/marketing/bundle/drafts/{draft_id}`
用途：回填创建页。

## 6.5 创建正式套餐活动接口
### `POST /shopee/runs/{run_id}/marketing/bundle/campaigns`
用途：提交并创建套餐优惠活动。

后端职责：
- 校验基础信息
- 校验商品准入
- 校验阶梯规则
- 生成活动快照
- 写入活动主表 / 商品表 / 阶梯表
- 失效相关 Redis 缓存

## 6.6 套餐活动详情接口
### `GET /shopee/runs/{run_id}/marketing/bundle/campaigns/{campaign_id}`
用途：
- 详情查看
- 复制活动
- 编辑回填（后续）

## 7. 数据模型设计（数据库）
> 按仓库规则：必须补齐 table comment 与 column comment。

## 7.1 主表：`shopee_bundle_campaigns`
用途：存储套餐优惠主记录。

字段建议：
- `id` PK
- `run_id`
- `user_id`
- `campaign_code`
- `campaign_name`
- `campaign_type` 固定为 `bundle`
- `bundle_discount_type` `percent|fixed_amount|bundle_price`
- `purchase_limit`
- `start_at`
- `end_at`
- `status` `draft|scheduled|ongoing|ended|cancelled`
- `currency`
- `created_at`
- `updated_at`

## 7.2 商品表：`shopee_bundle_campaign_items`
用途：记录套餐优惠包含的商品 / SKU。

字段建议：
- `id` PK
- `campaign_id`
- `run_id`
- `listing_id`
- `product_id`
- `sku_id`
- `sku_name`
- `product_name_snapshot`
- `image_url_snapshot`
- `original_price_snapshot`
- `stock_snapshot`
- `sort_order`
- `created_at`

## 7.3 阶梯表：`shopee_bundle_campaign_tiers`
用途：记录套餐优惠的阶梯规则。

字段建议：
- `id` PK
- `campaign_id`
- `run_id`
- `tier_no`
- `buy_quantity`
- `discount_type`
- `discount_percent`（可空）
- `discount_amount`（可空）
- `bundle_price`（可空）
- `created_at`
- `updated_at`

## 7.4 草稿主表：`shopee_bundle_drafts`
用途：保存创建页未提交草稿。

字段建议：
- `id` PK
- `run_id`
- `user_id`
- `campaign_name`
- `bundle_discount_type`
- `purchase_limit`
- `start_at`
- `end_at`
- `status` `editing|abandoned`
- `created_at`
- `updated_at`

## 7.5 草稿商品表：`shopee_bundle_draft_items`
用途：保存草稿中的商品列表。

字段建议：
- `id` PK
- `draft_id`
- `run_id`
- `listing_id`
- `product_id`
- `sku_id`
- `sort_order`
- `created_at`

## 7.6 草稿阶梯表：`shopee_bundle_draft_tiers`
用途：保存草稿中的阶梯规则。

字段建议：
- `id` PK
- `draft_id`
- `run_id`
- `tier_no`
- `buy_quantity`
- `discount_type`
- `discount_percent`
- `discount_amount`
- `bundle_price`
- `created_at`
- `updated_at`

## 7.7 表关系建议
- `shopee_bundle_campaigns` 1 -> N `shopee_bundle_campaign_items`
- `shopee_bundle_campaigns` 1 -> N `shopee_bundle_campaign_tiers`
- `shopee_bundle_drafts` 1 -> N `shopee_bundle_draft_items`
- `shopee_bundle_drafts` 1 -> N `shopee_bundle_draft_tiers`

## 8. Redis 设计
## 8.1 Key 设计
- `cbec:cache:shopee:bundle:create:bootstrap:{run_id}:{user_id}:{draft_id}`
- `cbec:cache:shopee:bundle:eligible-products:{run_id}:{user_id}:{hash}`
- `cbec:cache:shopee:bundle:draft:{run_id}:{draft_id}`
- `cbec:cache:shopee:bundle:list:{run_id}:{user_id}:{hash}`
- `cbec:cache:shopee:bundle:detail:{run_id}:{campaign_id}`

## 8.2 TTL 建议
- `bootstrap`：60s
- `eligible-products`：60s
- `draft`：300s
- `list`：60s
- `detail`：120s

## 8.3 失效策略
- 创建/更新/删除套餐活动后：
  - 失效折扣首页列表缓存
  - 失效套餐详情缓存
  - 失效当前用户创建页 bootstrap 缓存
- 草稿更新后：
  - 失效对应 `draft` 缓存
  - 失效对应 `bootstrap` 缓存

## 8.4 限流建议
- 创建页 bootstrap：`60 req/min/user`
- 商品选择器：`120 req/min/user`
- 提交创建：`20 req/min/user`

## 9. 前后端字段口径建议
- `campaign_type`
  - `bundle`
- `bundle_discount_type`
  - `percent`
  - `fixed_amount`
  - `bundle_price`
- `status`
  - `draft`
  - `scheduled`
  - `ongoing`
  - `ended`
  - `cancelled`

## 10. 页面交互细节建议
- 套餐名称为空时：
  - 在输入框下方显示红色错误提示
  - 仅在输入框失焦后展示
- 时间非法时：
  - 在时间输入区下方显示红色错误提示
  - 日期组件自身不可确认越界时间
- 切换套餐类型时：
  - 阶梯区的字段与文案即时切换
  - 已录入但不兼容的数据需二次确认或清空
- 添加商品后：
  - 右侧预览区同步刷新优惠展示文案

## 11. 验收标准
1. 页面结构与官方截图一致，包括基础信息、套餐类型、阶梯区、手机预览、商品区与页脚按钮。
2. 套餐名称、时间、类型、阶梯、限购次数、商品列表均可由真实接口驱动。
3. 套餐类型切换后，阶梯配置区字段联动正确。
4. 日期组件必须复用 Shopee 现有公共日期时间组件。
5. 活动时长 `< 180 天` 规则必须真实可用，而非仅文案提示。
6. 创建成功后能返回折扣首页并正确落入“套餐优惠”类型列表。
7. Redis 缓存命中与失效策略明确，草稿回填正常。
8. 历史回溯只读模式下页面可浏览但不可写。

## 12. 分期建议
- Phase 1：高保真 UI + bootstrap + 商品选择器 + 草稿与正式创建
- Phase 2：套餐详情 / 复制 / 编辑回填
- Phase 3：套餐表现统计、订单归因、营销优先级联动

## 13. 与现有文档的衔接
- 与 [19-Shopee折扣页复刻设计.md](./19-Shopee折扣页复刻设计.md) 衔接：作为 `bundle` 类型的创建页落地。
- 与 [20-Shopee单品折扣创建页设计.md](./20-Shopee单品折扣创建页设计.md) 衔接：复用创建页整体壳层、公共时间组件、商品选择器基础能力与草稿机制。
- 后续如进入实现阶段，建议优先复用单品折扣创建页中的：
  - 面包屑与创建页容器布局
  - `DateTimePicker`
  - 商品选择器弹窗
  - 草稿与缓存基础设施
