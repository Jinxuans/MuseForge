# 架构与产品演进计划

本文档记录当前项目从单页工具演进为可上线创作平台的计划。目标是先快速上线异步图片生成能力，同时为后续用户体系、官方中转站通道、社区分享和运营后台预留清晰边界。

## 目标形态

源码层面前后端分离，部署层面保持一个 Go 程序启动：

```text
React/Vite 前端 -> build 到 web/dist
Go 后端 -> embed web/dist
运行时只启动 app.exe / app
```

第一版保留：

```text
Base URL + API Key
异步任务
服务端图库
关闭浏览器后任务继续执行
```

后期扩展：

```text
用户体系
保存多个渠道配置
官方中转站通道
社区发布
点赞、收藏、评论
积分和计费
后台审核和运营
```

## 技术选型

```text
前端：React + Vite + TypeScript + TanStack Query
后端：Go + chi
数据库：PostgreSQL
存储：Storage 接口，先本地文件，后续可换 S3/R2/OSS
任务：Go 进程内 worker pool，任务状态落数据库
部署：单 Go 二进制 + .env + data/ 或对象存储
```

当前阶段不建议拆微服务。更合适的形态是模块化单体：结构清楚、部署简单、后期可按模块拆分。

## 工程结构

建议目标结构：

```text
project/
  cmd/server/main.go
  internal/
    httpapi/
    auth/
    tasks/
    assets/
    providers/
    storage/
    worker/
    db/
    config/
  web/
    package.json
    src/
    dist/
  migrations/
  data/
  go.mod
```

生产构建：

```powershell
cd web; npm run build
go build -o app ./cmd/server
.\app
```

## 产品边界

需要区分两个系统：

```text
大模型中转站：
负责供应商接入、Key 管理、计费、限流、日志、路由、价格和失败重试。

图片创作平台：
负责用户、任务、图片资产、图库、作品、社区、评论、点赞、收藏和审核。
```

图片平台可以调用自己的中转站，也可以兼容其他中转站。两者不应强耦合。

## 核心概念

```text
task：
一次生成或编辑过程。

asset：
生成出来的图片文件或上传文件。

work：
用户主动发布到社区的作品。
```

不要把历史记录直接等同于社区作品。用户应先生成图片，再从图库选择是否发布。

## 核心数据表

第一版就按未来平台设计，即使部分表暂时不启用。

```text
users
- id
- email / username
- password_hash
- role
- created_at

provider_profiles
- id
- user_id nullable
- name
- type: custom / official / temporary
- base_url
- api_key_plaintext nullable
- api_key_hint
- created_at
- deleted_at

tasks
- id
- user_id nullable
- anonymous_token_hash nullable
- provider_profile_id nullable
- provider_base_url_snapshot
- type: generation / edit
- model
- prompt
- params_json
- status: queued / running / succeeded / failed / canceled
- error
- cost_estimate
- created_at
- started_at
- completed_at

assets
- id
- user_id nullable
- task_id
- storage_key
- public_url
- mime
- width
- height
- size_bytes
- sha256
- created_at

works
- id
- user_id
- cover_asset_id
- title
- description
- visibility: private / unlisted / public
- prompt_visible
- created_at
- published_at

usage_logs
- id
- user_id nullable
- task_id
- provider
- model
- amount
- raw_json
- created_at
```

## 后端 API 规划

第一版 API：

```text
POST   /api/tasks/generations
POST   /api/tasks/edits
GET    /api/tasks
GET    /api/tasks/{id}
POST   /api/tasks/{id}/cancel

GET    /api/assets
GET    /api/assets/{id}
DELETE /api/assets/{id}

GET    /files/{asset_id}

GET    /api/health
```

用户和渠道阶段：

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me

GET    /api/provider-profiles
POST   /api/provider-profiles
DELETE /api/provider-profiles/{id}
```

社区阶段：

```text
POST   /api/works
GET    /api/works
GET    /api/works/{id}
POST   /api/works/{id}/like
POST   /api/works/{id}/favorite
POST   /api/works/{id}/comments
```

## 异步任务流程

生成任务：

```text
用户提交 prompt、参数、Base URL、API Key
后端创建 task，状态 queued
如果是临时 Key，明文保存到 temporary provider
worker 取任务，状态改为 running
worker 调上游 /images/generations
上游返回 b64_json 或 url
后端统一保存成图片文件
写入 assets
任务状态改为 succeeded
任务完成后删除临时 Key，保存渠道的 Key 继续保留
前端轮询 /api/tasks/{id} 或刷新任务列表
```

编辑任务：

```text
用户上传原图和可选 mask
后端先保存 uploads/task_id/
创建 task
worker 从磁盘读取上传文件
调用上游 /images/edits
保存结果图
写入 assets
更新 task 状态
```

任务状态固定为：

```text
queued
running
succeeded
failed
canceled
```

## Base URL 和 API Key 策略

第一版保留用户自带渠道，以便兼容其他中转站用户。

```text
访客：
提交任务时带 Base URL 和 API Key。
后端仅为本次任务临时明文保存。
任务完成后删除临时 Key。

登录用户：
可选择保存多个渠道配置。
Key 明文入库，前端只展示尾号。
用户可随时删除。

官方通道：
后期接入自己的中转站。
新用户默认推荐官方通道。
老用户仍可继续使用自带渠道。
```

安全要求：

```text
API Key 不能出现在日志中
前端不能回显完整 Key
任务完成后删除临时 Key
Base URL 默认只允许 https
拦截 localhost、127.0.0.1、内网 IP、file:// 等 SSRF 风险地址
任务失败日志不能包含 Authorization
```

风险说明：

```text
第一版按业务决策明文存储 API Key。
这会让数据库、备份和管理员查询具备读取完整 Key 的能力。
后期如果产品开放给更多外部用户，建议再迁移为加密存储。
```

## 前端页面规划

第一版：

```text
/create      生成和编辑页面
/tasks       任务队列和状态
/gallery     我的图库
/settings    Base URL / Key / 渠道设置
```

后期：

```text
/login
/profile
/work/:id
/explore
/admin
```

第一版交互：

```text
提交任务后立即显示“任务已提交，可以关闭页面”
任务列表显示 queued / running / succeeded / failed
图库从服务端 assets 加载
生成完成后自动出现在图库
```

## 存储策略

通过 Storage 接口隔离业务代码和具体存储实现：

```text
Save()
Open()
URL()
Delete()
```

第一版可以使用本地文件：

```text
data/
  uploads/
    task_id/
      input_0.png
      mask.png
  results/
    task_id/
      0.png
      1.png
```

后期切换到 S3/R2/OSS 时，只替换 Storage 实现，不改任务和图库业务。

## 上线阶段

### 阶段 1：工程迁移

```text
单 index.html 迁移到 React/Vite
Go 改成正式路由结构
Go 托管前端静态文件
功能先保持同步可用
```

### 阶段 2：异步生成

```text
加入 PostgreSQL
加入任务表、资产表、worker
生成任务支持关闭浏览器后继续执行
结果图片保存到服务端
```

### 阶段 3：异步编辑

```text
上传文件持久化
编辑任务后台执行
支持 mask 和多图输入
```

### 阶段 4：服务端图库

```text
图库从后端读取
IndexedDB 仅作为缓存或旧数据导入来源
支持删除资产
```

### 阶段 5：渠道配置

```text
支持临时 Base URL / API Key
登录用户可保存多个渠道
预留官方渠道
```

### 阶段 6：用户体系

```text
账号密码登录
session cookie
任务和图片绑定 user_id
访客任务后续可认领到账号
```

### 阶段 7：社区

```text
图库图片发布为作品
公开作品流
点赞、收藏、评论
用户主页
```

### 阶段 8：官方中转站和运营

```text
默认官方通道
积分和额度
后台任务排查
用户管理
内容审核
失败率和成本统计
```

## 部署计划

推荐 docker compose：

```text
app
postgres
caddy 或 nginx
```

环境变量：

```text
APP_URL=https://your-domain.com
DATABASE_URL=postgres://...
DATA_DIR=./data
STORAGE_DRIVER=local
WORKER_CONCURRENCY=2
MAX_UPLOAD_MB=64
DEFAULT_PROVIDER_BASE_URL=你的中转站地址，可为空
DEFAULT_PROVIDER_API_KEY=官方内部 token，可为空
```

如果使用本地磁盘存储，需要备份：

```text
PostgreSQL
data/
```

如果准备公开社区，建议尽早切到对象存储。

## 上线验收标准

第一版上线前至少满足：

```text
关闭浏览器后任务仍继续执行
服务重启后 queued/running 任务能恢复、重试或明确标记失败
图片结果保存在服务端
用户 Key 不出现在日志
前端不回显完整 Key
Base URL 有 SSRF 防护
任务失败能看到明确错误
Go 单程序可启动完整站点
```

## 当前建议

下一步优先做 MVP：

```text
React/Vite 前端
Go 模块化后端
PostgreSQL
异步任务
服务端图库
自带 Base URL / API Key
```

社区和官方通道先预留数据模型和接口边界，不急着实现界面。
