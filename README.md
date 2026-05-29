# MuseForge

MuseForge 是一个开源 AI 创作平台，当前以 TokFlux（原 TokenFlux）image2 图片生成和编辑为默认体验，后续可扩展多模型工作流与视频生成能力。

项目采用 Go + React/Vite 实现，不再依赖 PHP，并适配为由 Go 服务托管前端构建产物和同源 `/v1` 代理转发。普通图片生成和编辑默认只请求当前站点的 `/v1/images/generations`、`/v1/images/edits`，再由 Go 转发到 TokFlux 或你在前端填写的 OpenAI-compatible 上游。

源码层面前后端分离，部署时可由 Go 二进制托管前端构建产物。`web/dist` 是本地构建产物，不提交到仓库；本地开发时可以先启动 Go API，再由 Vite 托管前端：

项目结构约定见 [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md)。

- 页面入口：`http://127.0.0.1:5000/`
- 健康检查：`http://127.0.0.1:5000/health`
- 图片生成：`POST /v1/images/generations` 或 `POST /images/generations`
- 图片编辑：`POST /v1/images/edits` 或 `POST /images/edits`
- Responses API：`POST /v1/responses`
- 异步生成：`POST /api/v1/tasks/generations`
- 异步编辑：`POST /api/v1/tasks/edits`
- 任务列表：`GET /api/v1/tasks`
- 服务端资产：`GET /api/v1/assets`
- 删除资产：`DELETE /api/v1/assets/{id}`
- 渠道列表：`GET /api/v1/provider-profiles`
- 保存渠道：`POST /api/v1/provider-profiles`
- 删除渠道：`DELETE /api/v1/provider-profiles/{id}`

浏览器首次打开时会在本地生成一个匿名客户端 ID，前端请求会自动携带 `X-Client-ID`。服务端按该 ID 隔离已保存渠道、任务列表和图库资产；不同浏览器不会看到彼此保存的渠道和生成记录。这个机制用于匿名隔离，不等同于登录鉴权。

根路径支持通过 URL 预填临时 API 配置：

```text
/index.html?apiUrl=https://api.tokenflux.cloud/v1&apiKey=sk-xxx
```

也可以传入模型、API 模式等参数：

```text
/index.html?apiUrl=https://api.tokenflux.cloud/v1&apiKey=sk-xxx&apiMode=responses&model=gpt-5.5
```

## 运行

启动 Go 服务。未生成 `web/dist` 时，API 仍可正常启动；页面开发请配合下面的 Vite 开发服务：

```powershell
go run ./cmd/server
```

Windows 下也可以一键启动后端和 Vite：

```powershell
.\scripts\dev.ps1
```

如果需要构建单二进制并内嵌前端产物：

```powershell
.\scripts\build-release.ps1
```

## 本地开发

前端开发模式使用 Vite，后端仍由 Go 提供 API。

终端 1：

```powershell
go run ./cmd/server
```

终端 2：

```powershell
npm run dev --prefix web
```

访问：

```text
http://127.0.0.1:5171
```

Vite 会把后端请求统一代理到 `VITE_BACKEND_URL`，默认是 `http://127.0.0.1:5000`：

```text
/api
/images
/v1
/files
/health
```

如需改后端地址：

```powershell
$env:VITE_BACKEND_URL='http://127.0.0.1:8080'
npm run dev --prefix web
```

## 文件配置

推荐复制 `.env.example` 为 `.env` 后修改：

```powershell
Copy-Item .env.example .env
notepad .env
go run ./cmd/server
```

默认会读取当前目录的 `.env`。也可以指定其他配置文件：

```powershell
$env:CONFIG_FILE='D:\path\to\production.env'
go run ./cmd/server
```

优先级：

```text
环境变量 > CONFIG_FILE 指定的文件 > .env > 内置默认值
```

默认监听 `:5000`，可通过环境变量修改：

```powershell
$env:ADDR=':8080'
go run ./cmd/server
```

## 配置

MuseForge 默认使用 TokFlux 兼容地址 `https://api.tokenflux.cloud/v1` 和图片模型 `gpt-image-2`。可继续在页面里填写 TokFlux 或自定义 OpenAI-compatible 的 Base URL 和 API Key；默认情况下这些请求会交给 Go 同源 `/v1` 代理转发，API Key 不会写入服务端日志。也可以在 `.env` 里配置服务端默认值：

```powershell
OPENAI_API_KEY=你的 API Key
OPENAI_BASE_URL=https://api.tokenflux.cloud/v1
go run ./cmd/server
```

设置页保留“浏览器直连调试”高级开关。只有开启该开关时，浏览器才会直接请求外部 API URL；默认关闭。

异步任务需要 PostgreSQL，可写入 `.env`：

```powershell
DATABASE_URL=postgres://user:password@127.0.0.1:5432/museforge?sslmode=disable
DATA_DIR=./data
WORKER_CONCURRENCY=2
TASK_MAX_ATTEMPTS=3
RESULT_RETENTION_HOURS=168
CLEANUP_INTERVAL_MINUTES=30
CLEANUP_BATCH_SIZE=200
LOG_LEVEL=info
LOG_FORMAT=json
npm run build --prefix web
go run ./cmd/server
```

如果没有设置 `DATABASE_URL`，服务仍会正常启动，同步生成、编辑和 Responses 代理继续可用；异步接口会返回配置错误。

开启 `DATABASE_URL` 后，服务端异步任务接口可用。上传的编辑原图会保存到 `data/uploads/{task_id}/`，生成结果会保存到 `data/results/{task_id}/`。

磁盘保留策略：

```text
编辑任务的上传原图会在任务最终成功或失败后立即清理
结果图默认保留 168 小时（7 天）
后台清理器默认每 30 分钟扫描一次，按批次删除过期结果图和数据库 assets 记录
可通过 RESULT_RETENTION_HOURS=0 关闭自动清理
可通过 CLEANUP_INTERVAL_MINUTES 和 CLEANUP_BATCH_SIZE 调整频率和单次清理量
```

任务重试策略：

```text
同一个 task 自动重试，不新建任务
429、5xx、网络错误会回到 queued 并立即重试
最大尝试次数由 TASK_MAX_ATTEMPTS 配置，默认 3
4xx 参数错误直接 failed
任务页会显示 attempt_count、max_attempts、next_run_at 和 last_error
```

图库缓存策略：

```text
服务端 assets 是权威数据
IndexedDB 缓存 /api/v1/assets 返回的元数据
Cache API 缓存 /files/* 图片响应
页面打开时优先渲染本地缓存，再后台刷新服务端资产列表
删除服务端资产时同步清理 IndexedDB 元数据缓存和 Cache API 图片缓存
图库页提供刷新、清理图片缓存、导入旧历史、导出旧历史
```

前端创作工作流：

```text
画廊支持分类、收藏、回收站、批量选择、右键菜单和任务链查看
提示词库用于保存、复用和分享常用提示词
失败任务会保留前端错误快照，便于复制完整排查信息
广场前端支持浏览任务/提示词、查看分享详情、复用提示词，以及发起分享
```

图片分享广场：

```text
广场前端使用 /api/v1 协议访问远端分享服务
构建前设置 VITE_SQUARE_API_URL 后，前端会读取 /api/v1/square、/api/v1/shares 等接口
未设置 VITE_SQUARE_API_URL 时，广场页面会显示等待连接状态，不影响本地画廊和 Agent
当前仓库已移植广场前端界面、分享弹窗和 Share Manifest 构建逻辑
广场后端建议后续由 MuseForge 的 Go 服务实现同一套 /api/v1 协议
```

本地数据设置：

```text
设置页的数据管理操作只影响当前浏览器，不会批量删除服务端任务、渠道或图片
```

安全策略：

```text
默认允许用户配置 http/https 上游，方便本地中转站调试
公开部署可设置 STRICT_UPSTREAM_SECURITY=1 开启严格 SSRF 防护
严格模式会拦截 localhost、127.0.0.1、内网 IP、link-local、multicast 等地址
严格模式会解析域名到 IP 后再次检查，降低 SSRF 风险
日志和任务错误会脱敏 Authorization、Bearer token、sk-* 等敏感信息
严格模式下如必须使用 http 上游，可显式设置 ALLOW_INSECURE_UPSTREAMS=1
```

日志：

```text
LOG_LEVEL 支持 debug/info/warn/error，默认 info
LOG_FORMAT 支持 text/json，生产环境建议 json
后端会记录 HTTP 请求、request_id、状态码、耗时、任务创建/运行/重试/失败、渠道保存/删除、资产删除和数据库迁移
日志会复用脱敏逻辑，避免直接输出 Authorization、Bearer token、sk-* 等敏感内容
```

## 编译

```powershell
npm run build --prefix web
go build -buildvcs=false -tags with_embed -o museforge.exe ./cmd/server
```

Windows 下可直接运行：

```powershell
.\scripts\build-release.ps1
```

## 自托管验证

发布前建议至少跑一遍：

```powershell
.\scripts\check.ps1
```

如果本机可用 Docker，可以额外启动一次临时 PostgreSQL，验证数据库迁移幂等性和匿名客户端隔离：

```powershell
.\scripts\verify-postgres.ps1
```

最小 smoke test：

```powershell
$env:DATABASE_URL='postgres://user:password@127.0.0.1:5432/museforge?sslmode=disable'
$env:DATA_DIR='./data'
.\museforge.exe
Invoke-RestMethod http://127.0.0.1:5000/health
Invoke-RestMethod http://127.0.0.1:5000/api/v1/health-capabilities
```

## 目录结构

```text
cmd/server/          Go 程序入口
internal/config/     配置读取
internal/httpapi/    HTTP API、同步代理、V1 envelope、任务/资产/渠道 handlers
internal/db/         PostgreSQL 连接和迁移执行
internal/tasks/      任务仓库与 worker
internal/storage/    本地文件存储
migrations/          数据库迁移
scripts/             本地开发、发布构建和验证脚本
web/                 React/Vite 前端工程
web/src/             完整 React 前端应用
web/src/components/  前端组件
web/src/components/settings/ 设置页子组件
web/src/store/       从 Zustand store 抽出的低耦合工具模块
web/src/types/       按领域拆分的类型定义，web/src/types.ts 保持兼容重导出
web/public/          PWA manifest、图标和 service worker
web/dist/            前端本地构建产物，可由 Go embed 打包，不提交到仓库
```

## 许可说明

第三方前端代码来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本次图片分享广场相关前端移植来源为 [insistanan/GPT_Image_Playground.git](https://github.com/insistanan/GPT_Image_Playground.git)。
