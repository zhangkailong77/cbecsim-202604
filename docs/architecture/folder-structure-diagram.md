# CBEC_SIM 文件结构图（架构版）

```txt
cbec_sim/
├─ frontend/                                  # 前端主工程（React + Vite，单入口）
│  ├─ public/                                 # 静态资源（不经打包处理）
│  ├─ src/                                    # 前端源码
│  │  ├─ app/                                 # 应用壳层（路由/providers 预留）
│  │  ├─ assets/                              # 全局资源（含 home/logo.png）
│  │  ├─ components/                          # 通用组件（含系统登录弹窗）
│  │  ├─ features/                            # 功能域（预留）
│  │  ├─ hooks/                               # 通用 hooks（预留）
│  │  ├─ modules/                             # 业务模块容器
│  │  │  └─ shopee/                           # Shopee 页面模块（系统内一个模块）
│  │  ├─ pages/                               # 页面层（预留）
│  │  ├─ services/                            # API 调用封装（预留）
│  │  ├─ store/                               # 全局状态（预留）
│  │  ├─ styles/                              # 样式层（主题/变量/全局样式）
│  │  ├─ types/                               # 全局类型定义（预留）
│  │  ├─ utils/                               # 工具函数（预留）
│  │  ├─ App.tsx                              # 系统入口页面（先登录，后进入 Shopee）
│  │  ├─ main.tsx                             # React 挂载入口
│  │  └─ index.css                            # 全局样式与动画（含 logo 呼吸光晕）
│  ├─ apps/                                   # 历史/预留目录（当前不作为启动入口）
│  ├─ dlc/                                    # 历史/预留目录（当前已不放独立 Shopee 工程）
│  ├─ packages/                               # 预留共享包目录
│  ├─ tests/                                  # 前端测试目录（预留）
│  ├─ index.html                              # Vite 页面入口
│  ├─ vite.config.ts                          # Vite 配置（默认端口 3001）
│  ├─ tsconfig.json                           # TypeScript 配置
│  └─ package.json                            # 前端依赖与启动脚本（npm run dev）
├─ backend/                                   # 后端总目录（Python + FastAPI）
│  ├─ apps/                                   # 后端服务应用（按职责拆分）
│  │  ├─ api-gateway/                         # 已实现服务：认证、鉴权、健康检查
│  │  ├─ sim-orchestrator/                    # 仿真调度：时间推进/结算触发
│  │  ├─ market-service/                      # 市场机制：流量/曝光/竞争
│  │  ├─ order-service/                       # 订单生命周期与异常处理
│  │  ├─ inventory-service/                   # 库存/仓储/履约管理
│  │  ├─ finance-service/                     # 回款/现金流/财务计算
│  │  ├─ multiplayer-service/                 # 多人模式：房间/赛季/排行
│  │  └─ event-service/                       # 事件系统：市场/政策/渠道事件
│  ├─ packages/                               # 后端共享Python包
│  │  ├─ core_domain/                         # 核心领域模型（Pydantic）
│  │  ├─ core_engine/                         # 核心仿真引擎
│  │  ├─ channel_sdk/                         # 渠道后端适配协议
│  │  ├─ contracts/                           # 后端契约模型（与前端对齐）
│  │  └─ common/                              # 公共能力（日志/配置/中间件）
│  ├─ dlc/                                    # 渠道后端扩展模块
│  │  ├─ shopee_my/                           # Shopee渠道规则与适配实现
│  │  └─ tiktok_my/                           # TikTok渠道规则与适配实现
│  ├─ tests/                                  # 后端测试目录
│  └─ alembic/                                # 数据库迁移
├─ docs/                                      # 项目文档
│  └─ architecture/                           # 架构文档与结构图
├─ infra/                                     # 部署与基础设施（Docker/K8s/Terraform）
└─ shopee_my_sim_plan/                        # 现有方案资料（历史规划文档）
```
