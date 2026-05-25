# 实施状态

本文档记录 MuseForge 当前实现状态和接下来建议推进的工作。早期“从单页 Go 工具迁移到 React/Vite + Go 模块化后端”的实施计划已经完成，因此这里不再保留旧阶段草稿。

## 当前已完成

```text
Go + React/Vite 工程结构
Go embed 托管 web/dist
同步图片生成、编辑和 Responses API 代理
PostgreSQL 异步任务系统
异步生成和异步编辑
服务端图库和本地缓存
渠道配置
匿名客户端隔离
任务重试、磁盘保留策略和日志脱敏
图库分类、收藏、回收站、右键菜单、任务链
提示词库
失败任务调试快照
图片分享广场前端界面
分享弹窗和 Share Manifest 构建逻辑
```

## 当前构建规则

`web/dist` 是本地构建产物，不进入仓库。运行或编译 Go 服务前先生成前端构建产物：

```powershell
npm install --prefix web
npm run build --prefix web
go run ./cmd/server
```

编译发布包：

```powershell
npm run build --prefix web
go build -buildvcs=false -o museforge.exe ./cmd/server
```

## 当前前端状态

MuseForge 前端已经不再是早期单页页面，当前主应用位于 `web/src`，主要包含：

```text
图库模式
Agent 创作模式
分享广场模式
设置和本地数据管理
```

从 GPT_Image_Playground 移植的前端能力已经完成 MuseForge 品牌化处理，浏览器本地数据 key 也已切换为 MuseForge 命名。项目不需要兼容迁移前的本地浏览器历史和设置。

## 分享广场状态

已完成：

```text
广场浏览界面
分享详情弹窗
我的分享列表
分享删除入口
任务和提示词分享弹窗
Share Manifest 构建逻辑
远端 /api/v1 协议客户端
```

尚未完成：

```text
MuseForge Go 服务内置 /api/v1 分享广场后端
分享图片的服务端持久化和公开访问策略
登录用户与分享身份绑定
分享内容审核
```

当前前端需要在构建前设置 `VITE_SQUARE_API_URL` 才会连接远端分享服务；未设置时广场页面显示等待连接状态，不影响本地图库和 Agent 创作。

## 第三方来源

图片分享广场相关前端移植来源：

```text
https://github.com/insistanan/GPT_Image_Playground.git
```

同步过的上游修复参考：

```text
https://github.com/CookSleep/gpt_image_playground/commit/61185bf85afbe892236e44d7f1185bcb6c03e406
```

第三方代码来源与 MIT 许可保留在 `THIRD_PARTY_NOTICES.md`。

## 下一步主线：TokFlux-first 与统一 Go 转发

MuseForge 当前首先服务于 TokFlux（原 TokenFlux）大模型 API 的 image2 创作体验。下一阶段优先把系统从“前端可直连外部 API 的工具”收敛为“以 TokFlux 为默认渠道、所有模型调用默认经过 Go 后端转发的创作平台”。分享广场、登录用户体系和社区互动仍然重要，但应排在统一模型调用出口之后。

目标请求链路：

```text
浏览器
  -> MuseForge Go
    -> TokFlux / 自定义 OpenAI-compatible API / 后续自有模型
```

### 阶段 1：TokFlux 一等渠道

```text
[x] 后端默认上游改为 https://api.tokenflux.cloud/v1，保留 OPENAI_BASE_URL / DEFAULT_PROVIDER_BASE_URL 覆盖能力
[x] 前端默认渠道命名为 TokFlux，默认模型使用当前 TokFlux image2 模型名
[ ] 设置页主路径只要求填写 TokFlux API Key，Base URL 放入高级配置
[x] README 和 .env.example 明确 TokFlux 是默认体验，OpenAI-compatible 是兼容扩展
[ ] 错误提示针对 TokFlux 常见问题优化：缺 Key、余额/额度、模型名错误、上游超时
```

验收标准：

```text
首次打开应用时默认渠道显示 TokFlux
用户只填 TokFlux API Key 即可发起图片生成
/health 和 /api/v1/health-capabilities 显示默认上游为 TokFlux
仍可通过环境变量切回其他 OpenAI-compatible 上游
```

### 阶段 2：自定义 API 默认经 Go 转发

```text
[x] 前端 OpenAI-compatible 图片生成默认请求同源 /v1/images/generations
[x] 前端 OpenAI-compatible 图片编辑默认请求同源 /v1/images/edits
[x] 前端普通 Responses 图片模式默认请求同源 /v1/responses；Agent 暂按现有前端 Runtime 保持不重构
[x] 前端把用户填写的自定义 Base URL 和 API Key 作为内部转发字段传给 Go
[x] Go 继续使用 __upstream_base_url、__api_key、__provider_profile_id 解析上游配置
[x] 浏览器直连外部 API 改为高级调试开关，默认关闭
[ ] 前端网络错误提示区分“本地 Go 不可达”和“上游 TokFlux/自定义 API 失败”
```

验收标准：

```text
浏览器 Network 默认只出现 127.0.0.1 或当前站点的 /v1 请求
自定义 API URL + Key 也由 Go 转发到上游
关闭 Go 服务时前端提示本地服务不可达
Go 日志显示上游目标但不泄露 API Key
```

### 阶段 3：服务端渠道配置优先

```text
[ ] 有 DATABASE_URL 时，设置页优先保存渠道到 /api/v1/provider-profiles
[ ] 前端任务优先携带 provider_profile_id，不再长期保存完整 API Key
[ ] Go 从数据库读取渠道密钥并转发请求
[ ] 无 DATABASE_URL 时保留轻量模式：前端临时 Key -> Go 同步代理 -> 上游
[ ] 增加渠道导入/导出和“从浏览器临时配置迁移到服务端渠道”的入口
[ ] 明确服务端保存 Key 的安全说明，后续公网部署需加密存储或托管凭据
```

验收标准：

```text
保存渠道后刷新页面仍可使用该渠道
不同 X-Client-ID 不能互相读取渠道
前端任务记录只保存 provider_profile_id 和 key hint，不保存完整 Key
删除渠道后相关任务给出可理解的错误提示
```

### 阶段 4：图片任务全部后端化

```text
[ ] 有 DATABASE_URL 时，图片生成默认走 /api/v1/tasks/generations
[ ] 有 DATABASE_URL 时，图片编辑默认走 /api/v1/tasks/edits
[ ] Go worker 调用 TokFlux/自定义上游并保存输出到 assets
[ ] 前端只轮询任务状态并从 /api/v1/assets 同步图库
[ ] 同步 /v1 代理保留为无数据库轻量模式和调试模式
[ ] 补齐失败重试、取消、上传清理、结果保留策略的端到端测试
```

验收标准：

```text
关闭浏览器后任务仍继续执行
刷新页面后能看到服务端任务和结果图
图片结果由 Go 保存到 data/results 或后续对象存储
任务失败时前端展示 request_id、上游错误摘要和重试信息
```

### 阶段 5：迁移现有 Agent Runtime 到后端

```text
[ ] 保留当前 Agent 行为：Responses gpt-5.5 可调用 image_generation 工具
[ ] 保留当前前端已有编排语义：generate_image_batch、continue_generation、引用图 ref 注入、工具轮次限制
[ ] 第一小步只改 HTTP 出口：callAgentResponsesApi、callAgentConversationTitleApi、callBatchImageSingle 默认请求同源 Go
[ ] 第二小步在 Go 增加 Agent Run API，复刻当前前端 executeAgentRound 的多轮循环和 function_call_output 续跑逻辑
[ ] Go 保存 Agent 会话、上下文、response output、图片引用、工具调用结果和错误快照
[ ] Agent 中的 image_generation_call 结果进入同一套 task/assets 管线
[ ] generate_image_batch 的并发子图生成逐步从前端迁移到 Go worker 或 Agent Run 内部执行器
[ ] 前端最终只负责渲染会话、发送用户输入、展示进度和轮询/订阅 Agent Run 状态
```

验收标准：

```text
Agent 会话刷新后可从服务端恢复
Agent 生成的图片进入同一套 assets/图库
Responses gpt-5.5 仍能自己调用 image_generation 工具
generate_image_batch 和 continue_generation 行为与当前前端实现一致
前端不直接请求外部 Responses API
后续可替换 Agent 执行器而不重写前端 Agent UI
```

## 后续平台化排期

统一模型调用出口完成后，再推进：

```text
1. 实现 MuseForge 自有分享广场后端，兼容当前前端使用的 /api/v1 协议
2. 明确分享图片上传、存储、访问 URL 和删除策略
3. 设计登录用户体系，把匿名客户端数据迁移到用户资产
4. 将分享广场升级为正式社区作品流，补齐审核、互动和运营能力
5. 接入更多自有模型、本地模型或工作流引擎
```

## 验证命令

常用验证：

```powershell
npm run test --prefix web
npm run build --prefix web
go build -buildvcs=false -o museforge-check.exe ./cmd/server
Remove-Item .\museforge-check.exe
```
