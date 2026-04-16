# CBEC_SIM 本地开发调试说明

本项目采用前后端分离架构：

- 前端：React + TypeScript + Vite
- 后端：FastAPI + SQLAlchemy
- Python 环境：Python 3.12（默认 conda 环境名 `cbec-py312`）
- 默认本地依赖：MySQL 3306、Redis 6379

## 1. 环境要求

本地启动前请先准备以下环境：

- Node.js 20+（建议配套使用 npm）
- Conda（用于管理后端 Python 运行环境）
- Python 3.12
- MySQL 8.x
- Redis 7.x

可选依赖：

- Ollama：仅在需要使用 Shopee AI 质量评分能力时启用

## 2. 目录说明

- `frontend/`：前端项目，默认开发端口 `3001`
- `backend/apps/api-gateway/`：后端 API 服务，默认端口 `8000`
- `start-dev.sh`：前后端一键联启脚本
- `backend/.env`：后端本地环境变量
- `frontend/.env`：前端本地环境变量

## 3. 首次环境配置

### 3.1 前端依赖安装

```bash
cd frontend
npm install
```

仓库内已存在 `frontend/package-lock.json`，日常也可以使用：

```bash
cd frontend
npm ci
```

### 3.2 后端 Conda 环境准备

创建环境：

```bash
conda create -n cbec-py312 python=3.12 -y
conda activate cbec-py312
```

安装后端依赖：

```bash
cd backend/apps/api-gateway
pip install -r requirements.txt
```

如果你习惯在 `backend/` 目录统一安装，也可以使用根级依赖文件：

```bash
cd backend
pip install -r requirements.txt
```

### 3.3 数据库与缓存准备

本地需确保以下服务已启动：

- MySQL：`127.0.0.1:3306`
- Redis：`127.0.0.1:6379`

后端默认会连接：

```env
DATABASE_URL=mysql+pymysql://root:root@127.0.0.1:3306
DB_NAME=cbec_sim
REDIS_URL=redis://127.0.0.1:6379/0
```

注意：

- 后端启动时会自动创建 `cbec_sim` 数据库（若不存在）
- 后端启动时会自动执行建表和历史字段补齐逻辑

### 3.4 环境变量配置

前端示例：

```bash
cp frontend/.env.example frontend/.env
```

推荐将 `frontend/.env` 中的接口地址改为本机可访问地址：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

后端示例：

```bash
cp backend/.env.example backend/.env
```

`backend/.env` 里建议至少确认以下字段：

```env
DATABASE_URL=mysql+pymysql://root:root@127.0.0.1:3306
DB_NAME=cbec_sim
JWT_SECRET=cbec-dev-secret-change-this-in-production-32chars
CORS_ALLOW_ORIGINS=http://127.0.0.1:3001,http://localhost:3001
REDIS_URL=redis://127.0.0.1:6379/0
```

如果需要使用 Shopee 质量评分相关能力，再额外确认：

```env
QUALITY_SCORER_ENABLED=true
QUALITY_SCORER_PROVIDER=ollama
QUALITY_SCORER_BASE_URL=http://127.0.0.1:11434
QUALITY_SCORER_MODEL=gemma4:e2b
```

## 4. 启动方式

### 4.1 推荐：一键联启

在仓库根目录执行：

```bash
./start-dev.sh
```

脚本会自动完成以下动作：

- 启动前端：`frontend -> npm run dev`
- 激活 conda 环境：默认 `cbec-py312`
- 启动后端：`backend/apps/api-gateway -> uvicorn app.main:app --host 0.0.0.0 --reload`

脚本默认依赖本机已安装并可直接使用的 `conda`。如果你的环境名不是 `cbec-py312`，可以这样启动：

```bash
CBEC_CONDA_ENV=你的环境名 ./start-dev.sh
```

停止方式：

```bash
Ctrl + C
```

### 4.2 手动分开启动

前端：

```bash
cd frontend
npm run dev
```

前端默认地址：

```text
http://127.0.0.1:3001
```

后端：

```bash
conda activate cbec-py312
cd backend/apps/api-gateway
uvicorn app.main:app --host 0.0.0.0 --reload
```

后端默认地址：

```text
http://127.0.0.1:8000
```

健康检查接口：

```text
GET http://127.0.0.1:8000/health
```

返回示例：

```json
{"status":"ok"}
```

## 5. 本地验证步骤

启动完成后，建议按下面顺序快速自检：

1. 浏览器打开 `http://127.0.0.1:3001`
2. 确认前端页面正常加载，无白屏
3. 访问 `http://127.0.0.1:8000/health`
4. 确认后端返回 `{"status":"ok"}`
5. 检查前端是否能正常请求后端接口，无跨域报错

## 6. 默认账号

若本地数据库为空，后端启动时会自动初始化一个超级管理员账号：

- 用户名：`yzcube`
- 密码：`Yanzhi2026.`

如用于多人开发或演示环境，建议在 `backend/.env` 中自行修改：

- `SUPER_ADMIN_USERNAME`
- `SUPER_ADMIN_INIT_PASSWORD`

## 7. 常见问题

### 7.1 `conda` 不在 PATH 中

`start-dev.sh` 会先检查 `conda` 是否可用。如果报错，请先完成 Conda 初始化，或改为手动启动前后端。

### 7.2 前端能打开，但接口请求失败

优先检查：

- `frontend/.env` 中 `VITE_API_BASE_URL` 是否写成了当前机器可访问的后端地址
- `backend/.env` 中 `CORS_ALLOW_ORIGINS` 是否包含 `http://127.0.0.1:3001` 或 `http://localhost:3001`

### 7.3 后端启动时报数据库连接失败

优先检查：

- MySQL 是否已启动
- `DATABASE_URL` 用户名、密码、端口是否正确
- 本地是否具备创建数据库权限

### 7.4 Redis 未启动

部分缓存、限流和订单相关逻辑依赖 Redis。开发时建议始终启动本地 Redis，避免出现功能行为与正式环境不一致。

### 7.5 AI 评分相关功能异常

如果你本地没有启动 Ollama，可先关闭以下配置，避免影响常规开发：

```env
QUALITY_SCORER_ENABLED=false
```

## 8. 常用命令

前端类型检查：

```bash
cd frontend
npm run lint
```

后端测试：

```bash
conda activate cbec-py312
cd backend/apps/api-gateway
pytest
```

Redis 订单缓存回归检查（涉及订单缓存逻辑改动时执行）：

```bash
cd backend/apps/api-gateway/scripts
python verify_redis_orders_cache.py --username <username> --password <password> --no-flush
```
