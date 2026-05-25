# 架构与产品演进计划

本文档记录 MuseForge 的目标架构、当前已落地能力和后续产品演进方向。项目已经完成从早期单页工具到 Go + React/Vite 模块化单体的迁移。下一阶段先把 TokFlux（原 TokenFlux）image2 体验产品化，并把所有模型调用默认收敛到 Go 后端统一转发；分享广场后端、用户体系和社区发布排在模型调用出口稳定之后。

## 当前形态

源码层面前后端分离，部署层面保持一个 Go 程序启动：

```text
React/Vite 前端 -> 构建生成 web/dist
Go 后端 -> embed web/dist
运行时只启动 museforge.exe / museforge
```

`web/dist` 是本地构建产物，由 `npm run build --prefix web` 生成，不提交到仓库。由于 Go 使用 `//go:embed all:dist`，运行或编译 Go 服务前必须先生成 `web/dist`。

当前已具备：

```text
同步图片生成、编辑和 Responses API 代理
异步生成和编辑任务
服务端图库与本地浏览器缓存
匿名客户端隔离
渠道配置
任务重试、错误快照和日志脱敏
提示词库、分类、收藏、回收站、任务链
图片分享广场前端界面、分享弹窗和 Share Manifest 构建逻辑
```

当前尚未具备：

```text
TokFlux 一等默认渠道体验
所有自定义 API 默认经 Go 转发
后端化 Agent Run 和 Agent 会话持久化
Go 内置分享广场后端
登录用户体系
图库作品发布为社区内容
点赞、收藏、评论
积分、计费和运营后台
```

## 技术选型

```text
前端：React + Vite + TypeScript + Zustand + Vitest
后端：Go 标准库 net/http 模块化单体
数据库：PostgreSQL
存储：本地文件存储，后续可替换为 S3/R2/OSS
任务：Go 进程内 worker pool，任务状态落 PostgreSQL
部署：单 Go 二进制 + .env + data/ 或对象存储
```

当前阶段不建议拆微服务。更合适的形态是模块化单体：结构清楚、部署简单、后期可按模块拆分。

## 工程结构

当前主要结构：

```text
cmd/server/          Go 程序入口
internal/config/     配置和 .env 读取
internal/db/         PostgreSQL 连接和迁移
internal/httpapi/    HTTP API、同步代理和静态文件托管
internal/providers/  渠道配置仓库
internal/redact/     敏感信息脱敏
internal/storage/    本地文件存储
internal/tasks/      任务仓库、worker 和清理器
migrations/          数据库迁移
web/                 React/Vite 前端工程
web/src/             前端源码
web/public/          PWA manifest、图标和 service worker
web/dist/            本地构建产物，忽略入库
data/                本地上传和生成结果，运行时产生
```

生产构建：

```powershell
npm install --prefix web
npm run build --prefix web
go build -buildvcs=false -o museforge.exe ./cmd/server
.\museforge.exe
```

## 产品边界

需要区分两个系统：

```text
大模型中转站：
负责供应商接入、Key 管理、计费、限流、日志、路由、价格和失败重试。

图片创作平台：
负责用户、任务、图片资产、图库、作品、社区、评论、点赞、收藏和审核。
```

MuseForge 可以调用自己的中转站，也可以兼容其他 OpenAI-compatible 中转站。两者不应强耦合。

当前产品策略是 TokFlux-first：

```text
默认渠道：
TokFlux image2，默认上游 https://api.tokenflux.cloud/v1。

兼容渠道：
其他 OpenAI-compatible 图片和 Responses API。

后续渠道：
自有模型、本地模型、Fal、ComfyUI/工作流引擎等。
```

无论用户选择默认 TokFlux 还是自定义 API，默认请求路径都应是：

```text
浏览器 -> MuseForge Go -> 上游模型服务
```

浏览器直连外部 API 仅保留为高级调试能力，不作为默认产品路径。

Agent 当前不是简单聊天代理。现有前端已经实现了一个客户端 Agent Runtime：

```text
Responses gpt-5.5：
负责理解用户意图，并可调用内置 image_generation 工具。

MuseForge 前端 Runtime：
负责注入图片引用上下文、声明 image_generation/web_search/function tools、
处理 generate_image_batch 和 continue_generation、
解析流式 partial image、把 image_generation_call 结果落为本地任务和图库图片。
```

因此 Agent 后端化不是把能力降级为“纯转发 Responses”，而是逐步把现有前端 Runtime 迁移到 Go：

```text
第一步：
保留现有前端编排，先让所有 Agent HTTP 请求默认经过 Go。

第二步：
Go 增加 Agent Run，复刻当前多轮 Responses + function_call_output 续跑逻辑。

第三步：
Agent 生成图片、批量子任务、引用图和会话状态统一进入服务端 tasks/assets。
```

## 核心概念

```text
task：
一次生成或编辑过程。

asset：
生成出来的图片文件或上传文件。

prompt：
可复用、可收藏、可分享的提示词。

share：
用户主动分享到广场的任务或提示词。

work：
后续用户主动发布到社区的正式作品。
```

不要把历史记录直接等同于社区作品。用户应先生成图片，再从图库或任务中选择是否分享或发布。

## 后端 API

当前已落地 API：

```text
POST   /v1/images/generations
POST   /images/generations
POST   /v1/images/edits
POST   /images/edits
POST   /v1/responses

POST   /api/v1/tasks/generations
POST   /api/v1/tasks/edits
GET    /api/v1/tasks
GET    /api/v1/tasks/{id}
POST   /api/v1/tasks/{id}/cancel

GET    /api/v1/assets
DELETE /api/v1/assets/{id}
GET    /files/{asset_id}

GET    /api/v1/provider-profiles
POST   /api/v1/provider-profiles
DELETE /api/v1/provider-profiles/{id}

GET    /health
```

分享广场前端当前按远端服务协议访问：

```text
GET    /api/v1/square
GET    /api/v1/me/shares
GET    /api/v1/shares/{id}
POST   /api/v1/shares
POST   /api/v1/shares/{id}/delete
POST   /api/v1/identity
```

这些 `/api/v1` 分享接口尚未由当前 Go 服务实现。构建前设置 `VITE_SQUARE_API_URL` 后，前端会访问对应远端分享服务；未设置时只显示等待连接状态。

后续用户和社区阶段计划：

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me

POST   /api/works
GET    /api/works
GET    /api/works/{id}
POST   /api/works/{id}/like
POST   /api/works/{id}/favorite
POST   /api/works/{id}/comments
```

## 数据模型

当前已落地或预留的核心表：

```text
provider_profiles
tasks
assets
```

后续平台化建议补齐：

```text
users
works
work_assets
comments
favorites
likes
usage_logs
audit_logs
```

分享广场后端如果落到 MuseForge Go 服务中，建议单独建模 `shares` 与 `share_assets`，避免直接把本地任务表暴露成公开社区表。

## 任务流程

生成任务：

```text
用户提交 prompt、参数和渠道
后端创建 task，状态 queued
worker 取任务，状态改为 running
worker 调上游 /images/generations
上游返回 b64_json 或 url
后端统一保存成图片文件
写入 assets
任务状态改为 succeeded
前端刷新任务列表和图库
```

编辑任务：

```text
用户上传原图和可选 mask
后端先保存 uploads/task_id/
创建 edit task
worker 从磁盘读取上传文件
调用上游 /images/edits
保存结果图
写入 assets
更新 task 状态
任务终态后清理上传原图
```

任务状态固定为：

```text
queued
running
succeeded
failed
canceled
```

## 安全策略

```text
API Key 不能出现在日志中
前端不能回显完整 Key
任务完成后删除临时 Key
公开部署可设置 STRICT_UPSTREAM_SECURITY=1 开启严格 SSRF 防护
严格模式会拦截 localhost、127.0.0.1、内网 IP、link-local、multicast 等地址
严格模式会解析域名到 IP 后再次检查
严格模式下如必须使用 http 上游，可显式设置 ALLOW_INSECURE_UPSTREAMS=1
```

当前按业务决策保留“用户自带渠道”和“保存渠道”能力。保存渠道的 Key 仍应在更开放的公网产品阶段迁移为加密存储或托管凭据。

## 前端页面

当前前端主要模式：

```text
图库：分类、收藏、回收站、任务链、批量选择、右键菜单
Agent：多轮图片创作、引用历史图片、Responses API
广场：浏览分享、查看详情、复用提示词、发起分享
设置：渠道、本地数据、缓存管理
```

后续建议：

```text
/login
/profile
/work/:id
/explore
/admin
```

## 存储策略

通过 Storage 接口隔离业务代码和具体存储实现：

```text
Save()
Open()
URL()
Delete()
```

当前本地文件布局：

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

后期切换到 S3/R2/OSS 时，应只替换 Storage 实现，尽量不改任务和图库业务。

## 演进阶段

已完成：

```text
阶段 1：工程迁移到 React/Vite + Go 模块化后端
阶段 2：异步生成
阶段 3：异步编辑
阶段 4：服务端图库
阶段 5：渠道配置、安全加固、匿名客户端隔离
阶段 6：前端创作体验增强和 GPT_Image_Playground 分享广场前端移植
```

下一步建议：

```text
阶段 7：TokFlux 一等默认渠道，简化 API Key 配置路径
阶段 8：所有 OpenAI-compatible 图片和 Responses 调用默认经 Go 转发
阶段 9：服务端渠道配置优先，前端任务只携带 provider_profile_id
阶段 10：图片生成/编辑默认后端任务化，结果统一进入 assets
阶段 11：迁移现有前端 Agent Runtime 到 Go，Responses gpt-5.5 先作为默认执行器
阶段 12：实现 MuseForge 自有分享广场后端，兼容当前 /api/v1 协议
阶段 13：登录用户体系、社区作品流、互动和审核
阶段 14：更多自有模型、本地模型、工作流引擎和运营能力
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
OPENAI_BASE_URL=https://api.tokenflux.cloud/v1，可用其他 OpenAI-compatible 地址覆盖
OPENAI_API_KEY=默认 API Key，可为空
VITE_SQUARE_API_URL=远端分享广场服务地址，可为空，需在前端构建前设置
```

如果使用本地磁盘存储，需要备份：

```text
PostgreSQL
data/
```

如果准备公开社区或长期保存分享图片，建议尽早切到对象存储。

## 上线验收标准

第一版公开部署前至少满足：

```text
关闭浏览器后任务仍继续执行
服务重启后 queued/running 任务能恢复、重试或明确标记失败
图片结果保存在服务端
用户 Key 不出现在日志
前端不回显完整 Key
Base URL 严格模式可开启 SSRF 防护
任务失败能看到明确错误
Go 单程序可启动完整站点
web/dist 由构建步骤生成，不进入仓库
第三方来源和 MIT 许可保留在 THIRD_PARTY_NOTICES.md
```
