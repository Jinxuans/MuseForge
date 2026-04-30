# 实施计划

本文档记录从当前单页 Go 工具逐步迁移到 `ARCHITECTURE_PLAN.md` 所描述平台形态的执行计划。每个阶段都要求保持可运行、可验证，避免一次性重写导致功能断档。

## 当前基线

当前项目状态：

```text
index.html        单页前端，包含 HTML/CSS/JS
main.go           单文件 Go HTTP 服务
go.mod            Go 模块定义
README.md         运行说明
ARCHITECTURE_PLAN.md 架构与产品演进计划
```

当前能力：

```text
同步图片生成代理：POST /images/generations
同步图片编辑代理：POST /images/edits
浏览器本地图库：IndexedDB / File System Access API
Base URL 与 API Key：浏览器 localStorage 或服务端环境变量
```

当前未具备：

```text
React/Vite 前端工程
模块化 Go 后端目录
Go embed 托管 web/dist
PostgreSQL
异步任务
服务端图库
用户体系
```

## 阶段 1：工程迁移

目标：先把项目迁移为“前端源码独立、后端模块化、单 Go 程序部署”的结构，功能保持同步可用。

计划变更：

```text
cmd/server/main.go
internal/httpapi/
internal/config/
web/
  package.json
  index.html
  src/
```

验收标准：

```text
go test ./... 通过
go build ./cmd/server 通过
cd web; npm run build 通过
Go 服务能托管 web/dist
原有 /images/generations 和 /images/edits 同步能力可继续使用
/health 可用
```

状态：已完成

## 阶段 2：异步生成

目标：引入数据库、任务表、worker，使生成任务在关闭浏览器后继续执行。

计划变更：

```text
PostgreSQL 连接与 migrations
tasks 表
assets 表
worker pool
POST /api/tasks/generations
GET /api/tasks
GET /api/tasks/{id}
POST /api/tasks/{id}/cancel
```

验收标准：

```text
提交任务后立即返回 task id
浏览器关闭后任务继续运行
结果保存到服务端 data/results/
任务失败有明确错误
服务重启后 queued/running 任务可恢复、重试或标记失败
```

状态：后端已完成，前端生成入口已接入；任务队列页面和服务端图库页面待阶段 4 完整替换

执行策略：

```text
保留旧同步接口 /images/generations，避免当前页面功能断档。
新增 /api/tasks/generations 等异步接口。
DATABASE_URL 为空时，服务仍可启动，但异步接口返回明确配置错误。
DATABASE_URL 存在时，启动时自动执行基础迁移并恢复 queued/running 任务。
临时 API Key 仅存储在 tasks.provider_api_key_plaintext，任务结束后置空。
```

## 阶段 3：异步编辑

目标：编辑任务也进入后台任务系统，上传文件先持久化。

计划变更：

```text
data/uploads/{task_id}/
POST /api/tasks/edits
worker 读取上传文件并调用上游
结果写入 assets
```

验收标准：

```text
编辑任务提交后立即返回 task id
上传原图和 mask 可持久化
后台执行成功后结果进入服务端图库
```

状态：已完成；旧编辑入口在 DATABASE_URL 启用时优先提交异步任务，未启用时自动使用旧同步接口

执行策略：

```text
保留旧同步接口 /images/edits，避免当前编辑功能断档。
新增 /api/tasks/edits 接收 multipart/form-data。
后端先创建 edit task，再把 image[] 和 mask 保存到 data/uploads/{task_id}/。
tasks.params_json 保存上传文件 storage_key、原始字段和输出参数。
worker 读取上传文件重新组装 multipart 请求，调用上游 /images/edits。
编辑结果继续写入 data/results/{task_id}/ 和 assets 表。
```

## 阶段 4：服务端图库

目标：图库以服务端 assets 为权威数据，同时保留浏览器本地缓存，避免每次打开都重新从服务器读取完整图片。

计划变更：

```text
GET /api/assets
GET /api/assets/{id}
DELETE /api/assets/{id}
GET /files/{asset_id}
Storage 接口
local storage driver
IndexedDB 缓存服务端 assets 元数据
Cache API 缓存 /files/* 图片响应
```

验收标准：

```text
生成结果刷新页面后仍可从服务端看到
删除资产会删除数据库记录和本地文件
图片文件不依赖浏览器本地存储
图库首屏优先使用本地缓存渲染
服务端资产列表后台刷新
图片优先从浏览器 Cache API 读取，缓存缺失时才请求 /files/*
```

状态：已完成；创建/编辑入口仍复用 legacy，服务端图库和任务列表已迁移到 React

执行策略：

```text
服务端 assets 是权威数据，浏览器缓存只做加速和离线近似展示。
GET /api/assets 返回资产及所属任务的 prompt/type，方便图库显示。
前端启动时先读取 IndexedDB 中的 server_assets 缓存并渲染。
随后后台请求 /api/assets，更新 IndexedDB 元数据缓存。
渲染服务端图片时先查 Cache API；命中则使用缓存 blob，未命中再 fetch public_url 并写入 Cache。
旧 IndexedDB 历史继续保留，用于未启用 DATABASE_URL 或旧数据迁移。
```

## 阶段 5：渠道配置与安全加固

目标：把临时渠道、保存渠道、官方渠道边界落到后端模型中，并补齐安全检查。

计划变更：

```text
provider_profiles 表
临时 API Key 生命周期
Base URL SSRF 防护
日志脱敏
前端不回显完整 Key
```

验收标准：

```text
API Key 不出现在日志
任务完成后删除临时 Key
Base URL 默认只允许 https
拦截 localhost、127.0.0.1、内网 IP、file:// 等地址
```

状态：已完成；provider profiles 当前为无用户绑定形态，阶段 6 会接入 user_id/session

执行策略：

```text
默认允许用户配置 http/https 上游，方便本地中转站调试。
公开部署可设置 STRICT_UPSTREAM_SECURITY=1 开启严格 SSRF 防护。
严格模式拦截 localhost、loopback、link-local、内网 IP、IPv6 私有/本地地址。
严格模式解析域名后再次检查 IP，降低 DNS 指向内网的 SSRF 风险。
日志和任务错误写入前做 Authorization、Bearer、sk-* 等敏感字段脱敏。
先提供无用户绑定的 provider profiles API，为阶段 6 user_id 绑定预留。
```

## 阶段 6：用户体系

目标：加入账号、session、用户资产归属。

状态：待开始

## 阶段 7：社区

目标：用户可从图库发布作品，支持公开作品流和互动。

状态：待开始

## 阶段 8：官方中转站和运营

目标：接入官方通道、积分额度、后台审核和运营数据。

状态：待开始

## 执行记录

```text
2026-04-26 创建实施计划，准备开始阶段 1 工程迁移。
2026-04-26 完成阶段 1 工程迁移：新增 cmd/server、internal/config、internal/httpapi、web React/Vite 工程；Go embed 托管 web/dist；旧单页迁移到 web/public/legacy.html 保持同步功能可用。
2026-04-26 推进阶段 2：加入 PostgreSQL 迁移、数据库连接层、任务仓库、本地结果存储、异步生成 worker、/api/tasks/generations、/api/tasks、/api/tasks/{id}、/api/tasks/{id}/cancel、/api/assets、/files/*；旧页面生成按钮在 DATABASE_URL 启用时优先提交异步任务，未启用时自动使用旧同步接口。
2026-04-26 完成阶段 3：新增 edit task 类型、/api/tasks/edits multipart 接口、上传文件持久化到 data/uploads/{task_id}/、worker 后台重组 multipart 调用上游 /images/edits、编辑结果写入 data/results/{task_id}/ 和 assets；旧页面编辑按钮在 DATABASE_URL 启用时优先提交异步任务，未启用时自动使用旧同步接口。
2026-04-26 优化阶段 4 方案并部分实现：/api/assets 返回任务 prompt/type；旧图库启动时先读取 IndexedDB 中的 server_assets 元数据缓存，后台刷新 /api/assets；服务端图片优先从 Cache API 读取，缺失时请求 /files/* 并写入缓存；保留旧 IndexedDB 历史作为旧数据和无数据库模式的图库来源。
2026-04-26 继续阶段 4：新增 DELETE /api/assets/{id}，删除数据库资产记录和本地文件；旧图库支持删除服务端资产，并同步移除 IndexedDB 元数据缓存和 Cache API 图片缓存。
2026-04-26 完成阶段 4：React 应用外壳新增创建、图库、任务视图；创建/编辑继续嵌入 legacy 页面；图库原生 React 化，读取 IndexedDB server_assets 缓存并后台刷新 /api/assets，图片使用 Cache API 缓存；任务页原生 React 化并轮询 /api/tasks。
2026-04-26 完成阶段 5：Base URL 安全策略改为可选严格模式，STRICT_UPSTREAM_SECURITY=1 时强制 SSRF 防护并可配合 ALLOW_INSECURE_UPSTREAMS 控制 http；新增日志/错误脱敏；新增 provider profiles 仓库和 GET/POST/DELETE /api/provider-profiles；React 渠道页支持保存、选择、删除渠道；legacy 创建/编辑提交时支持 __provider_profile_id。
2026-04-26 配置方式优化：新增 .env 文件配置支持和 .env.example；默认读取 .env，可通过 CONFIG_FILE 指定其他文件；环境变量优先级高于文件配置；OPENAI_BASE_URL、OPENAI_API_KEY、DATABASE_URL、DATA_DIR、WORKER_CONCURRENCY、ALLOW_INSECURE_UPSTREAMS 等均支持文件配置。
2026-04-26 创建页渠道选择优化：legacy 创建/编辑页新增“渠道”下拉框，加载 /api/provider-profiles；选择已保存渠道后禁用 Base URL/API Key 手填并提交 __provider_profile_id；选择“临时自定义”恢复手填配置。
2026-04-26 创建页布局优化：legacy 右侧 Gallery 区域改为“本次结果”，不再加载历史图库或服务端图库；生成/编辑返回后只展示本次图片，历史与服务端资产统一进入 React“图库”页。
2026-04-26 设置归属调整：React 图库页新增刷新、清理图片缓存、导出旧历史、导入旧历史；React 渠道页新增危险区，提供清理本地设置和重置浏览器数据。
2026-04-26 队列重试增强：新增 tasks.attempt_count、max_attempts、next_run_at、last_error；worker 遇到 429/5xx/网络错误时自动将同一 task 立即重排为 queued；最大尝试次数由 TASK_MAX_ATTEMPTS 配置，默认 3；4xx 参数错误直接 failed；任务页展示尝试次数、下次重试时间和最后错误。
2026-04-26 匿名客户端隔离：废弃 ADMIN_TOKEN 作为渠道隔离方案；前端首次打开自动生成本地 client_id 并在请求中携带 X-Client-ID；服务端存储其 sha256 到 provider_profiles.anonymous_token_hash / tasks.anonymous_token_hash，并按该标志隔离渠道列表、渠道取密、任务列表、任务详情、图库资产和资产删除；新增 migrations/003_client_isolation.sql。
2026-04-26 日志机制补强：新增 LOG_LEVEL / LOG_FORMAT 配置，后端切换到 slog；HTTP 层加入 request_id、访问日志、panic recover、状态码/耗时/字节数记录，并更新 CORS 支持 X-Client-ID/DELETE；worker 记录任务开始、重试、失败、成功和资产创建；迁移、渠道创建/删除、资产删除增加结构化日志。
2026-04-26 URL 渠道导入：legacy.html 支持 address/key 预填；同时传 name、channel 或 channel_name 时自动保存为当前匿名客户端的渠道并选中，保存后清理 URL 参数；渠道名继续允许重复。
2026-04-26 轮询优化：React 任务页改为首次加载一次，只有存在 queued/running 任务时才每 8 秒继续刷新；legacy 任务详情轮询从 2 秒放慢到 5 秒；异步生成/编辑成功后显示非阻塞完成提示。
2026-04-26 入口参数兼容：React 根入口会把 address/key/name/channel/channel_name 查询参数转发给内嵌 legacy.html，并清理父页面地址栏，直接访问域名也可完成渠道预填/自动保存。
2026-04-26 磁盘保留策略：新增 RESULT_RETENTION_HOURS、CLEANUP_INTERVAL_MINUTES、CLEANUP_BATCH_SIZE 配置；编辑任务在终态后立即删除 data/uploads/{task_id} 原图；后台清理器按保留时长定期删除过期结果图和对应 assets 记录，并记录释放空间日志。
```
