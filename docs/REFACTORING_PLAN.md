# 重构计划

这份清单用于分阶段、可回退地推进重构。每个任务都应足够小，便于独立评审；除非任务明确说明，否则必须保持现有行为不变。

## 原则

- [ ] 在所有调用方安全迁移前，保留 `useStore` 作为公开的 store 入口。
- [ ] 优先移动代码边界，再修改行为。
- [ ] 在触碰高风险流程前，先补充或调整聚焦测试。
- [ ] 不把视觉重设计和结构重构混在同一个任务里。
- [ ] 除非任务明确针对迁移，否则不修改持久化格式、数据库迁移或导出备份格式。
- [ ] 每个任务完成后运行最小相关测试；每个阶段结束后运行完整测试。

## 第 0 阶段：基线与安全网

- [ ] 记录当前测试基线。
  - 目标：明确哪些失败是已有问题。
  - 建议命令：`go test ./...`、`cd web && npm test`、`cd web && npm run build`。
  - 验收标准：在 PR 或任务说明中记录当前通过/失败状态。

- [x] 确认生成文件和运行时文件不纳入源码重构。
  - 范围：`server.exe`、`web/dist`、`data`、`tmp`、`.claude`。
  - 验收标准：重构任务不编辑生成产物。

- [ ] 后续重构 PR 增加简短状态说明。
  - 内容包括：触碰模块、行为是否变化、运行了哪些测试、已知风险。
  - 验收标准：每个重构 PR 不需要读完整 diff 也能理解意图。

## 第 1 阶段：低风险清理

- [x] 提取共享分类常量。
  - 当前信号：`__uncategorized__` 出现在 `store.ts`、`TaskGrid`、`SearchBar` 和批量选择逻辑中。
  - 目标：提供一个统一导出的常量，例如 `UNCATEGORIZED_CATEGORY_ID`。
  - 验收标准：除常量模块外，不再硬编码 `__uncategorized__`，并且测试通过。

- [x] 打破 `backendTasks.ts` / `backendAssets.ts` 的循环依赖。
  - 当前信号：`backendTasks.ts` 引入 `getAssetPublicUrl`，`backendAssets.ts` 引入 `AssetDTO`。
  - 目标：将共享 DTO 和资产基础 getter 移到中立模块。
  - 验收标准：循环依赖消失，后端 task/asset 相关测试通过。

- [x] 收紧 `Select` 类型。
  - 当前信号：`shared/ui/Select.tsx` 使用 `onChange: (value: any) => void`。
  - 目标：改为泛型或 `string | number` 类型 API。
  - 验收标准：Select 调用方不再需要 `any`。

- [x] 收紧 contentEditable mention 选区边界类型。
  - 当前信号：`contentEditableMentions.ts` 通过 `as any` 处理 root 节点索引。
  - 目标：使用 DOM 类型收窄替代 `any`。
  - 验收标准：主代码扫描不再出现非测试 `as any`。

- [x] 审计 `useDragSelect`。
  - 当前信号：静态扫描未发现 app 代码引用。
  - 目标：决定保留、补文档、补测试，或在独立清理任务中移除。
  - 验收标准：明确其使用状态，同时不影响现有拖拽行为。

- [x] 提取重复的弹窗壳组件。
  - 当前信号：debug/settings/square 弹窗中存在重复的 backdrop 点击处理和关闭按钮。
  - 目标：抽出可复用的 modal frame 或小型辅助组件。
  - 验收标准：视觉和关闭行为不变，并通过手动冒烟测试或组件测试覆盖。
  - [x] 新增 `shared/ui/ModalFrame`，统一遮罩点击关闭和 panel 事件隔离。
  - [x] 接入 debug 原始链接、错误快照和原始响应弹窗。
  - [x] 接入 square 详情和分享弹窗。
  - [x] 接入 settings 导入 URL 和自定义服务商编辑弹窗。

- [x] 收敛内联 SVG 图标。
  - 当前信号：task card actions、search、settings sidebar、batch toolbar 中存在重复 SVG 块。
  - 目标：复用现有 `shared/ui/icons.tsx` 或建立窄范围图标模块。
  - 验收标准：减少重复 SVG 片段，同时不改变按钮标签或行为。
  - [x] 抽取 Settings API Key 显示/隐藏图标到 `shared/ui/icons.tsx`。
  - [x] 抽取 Settings sidebar tab 图标到 `shared/ui/icons.tsx`。
  - [x] 替换 Settings modal 标题内联 SVG 为共享 `SettingsIcon`。
  - [x] 替换 SearchBar 收藏与搜索图标为共享图标。
  - [x] 替换 BatchSelectionToolbar 批量操作图标为共享图标。
  - [x] 替换 TaskActionStrip 任务卡动作图标为共享图标。

## 第 2 阶段：Store 边界重构

- [x] 将 `AppState` 拆成领域接口。
  - 目标领域：app mode、settings、input、tasks、collections、agent conversations、UI/dialogs。
  - 验收标准：`AppState` 由更小的导出接口组合而成。

- [x] 将 `web/src/store` 平铺文件按领域目录分组。
  - 当前信号：`store` 目录下存在大量 `agent*`、`task*`、`settings*`、`image*`、`backend*` 文件平铺。
  - 目标：形成 `store/agent`、`store/tasks`、`store/settings`、`store/input`、`store/images`、`store/ui`、`store/persistence` 等目录。
  - 验收标准：`store` 根目录只保留组合入口、共享类型/工具和少量跨领域文件；公开 `useStore` 入口保持不变。
  - [x] 移动 app mode 领域文件到 `store/app`。
  - [x] 移动 UI 领域文件到 `store/ui`。
  - [x] 移动 settings 领域文件到 `store/settings`。
  - [x] 移动 input 领域文件到 `store/input`。
  - [x] 移动 collection 领域文件到 `store/collection`。
  - [x] 移动 images 领域文件到 `store/images`。
  - [x] 移动 tasks 领域文件到 `store/tasks`。
  - [x] 移动 agent 领域文件到 `store/agent`。
  - [x] 移动 persistence 领域文件到 `store/persistence`。
  - [x] 移动 support prompt action 到 `store/tasks`。

- [x] 将 store 编排逻辑移出 `store.ts`。
  - 当前信号：`store.ts` 扇出依赖高，同时连接持久化、任务执行、Agent 执行、清理和图片生命周期。
  - 目标：让 `store.ts` 主要负责创建 Zustand store 和导出公开 action。
  - 验收标准：`store.ts` 成为组合层，而不是业务编排层。
  - [x] 抽取 task execution、backend sync、task cleanup 的 context 工厂到 `store/orchestration`。
  - [x] 抽取任务更新和支持提示触发逻辑到 `store/orchestration`。
  - [x] 抽取 Agent 当前会话读取和会话更新逻辑到 `store/orchestration`。
  - [x] 抽取 Zustand root slice 组合到 `store/orchestration`。
  - [x] 抽取 store persistence bridge 创建和连接适配到 `store/orchestration`。
  - [x] 抽取 task cleanup action 装配到 `store/orchestration`。
  - [x] 抽取 backend sync action 装配到 `store/orchestration`。
  - [x] 抽取 data portability action 装配到 `store/orchestration`。
  - [x] 抽取 image lifecycle action 装配到 `store/orchestration`。
  - [x] 抽取 init store action 装配到 `store/orchestration`。
  - [x] 抽取 task submission/reuse/execution action 装配到 `store/orchestration`。
  - [x] 抽取 Agent title/round/message action 装配到 `store/orchestration`。

- [ ] 按领域拆分 `store.test.ts`。
  - 当前信号：单个测试文件约 1800 行。
  - 建议文件：`store.persistence.test.ts`、`store.tasks.test.ts`、`store.agent.test.ts`、`store.settings.test.ts`。
  - 验收标准：测试可按领域运行，且不存在隐藏的顺序依赖。
  - [x] 拆出 error toast message 测试到 `store.errorMessages.test.ts`。
  - [x] 拆出 interrupted OpenAI running tasks 纯函数测试到 `store.tasks.test.ts`。
  - [x] 拆出 agent round deletion 纯函数测试到 `store.agent.test.ts`。
  - [x] 拆出 queued backend task 可取消判断测试到 `store.tasks.test.ts`。
  - [x] 拆出 stale agent draft 清理测试到 `store.agent.test.ts`。
  - [x] 拆出 task API profile 解析测试到 `store.tasks.test.ts`。
  - [x] 拆出 input/localStorage persistence 规则测试到 `store.persistence.test.ts`。
  - [x] 拆出 persisted state 迁移净化测试到 `store.persistence.test.ts`。
  - [x] 拆出 agent conversation creation 领域测试到 `store.agent.test.ts`。
  - [x] 拆出 agent draft app mode / conversation switch 领域测试到 `store.agent.test.ts`。
  - [x] 拆出 agent draft persistence 测试到 `store.persistence.test.ts`。
  - [x] 拆出 active agent conversation no-op 切换测试到 `store.agent.test.ts`。
  - [x] 拆出 input draft image replacement 测试到 `store.input.test.ts`。

- [x] 定义 store action 的依赖契约。
  - 目标：action factory 接收小型 typed context，而不是跨整个 `AppState` 取值。
  - 验收标准：task、agent、data portability action 可以用窄 fake 对象测试。
  - [x] 收紧 support prompt、task cleanup、task recovery action 的 `getState` 依赖类型。
  - [x] 收紧 task submission、task reuse、task execution action 的 `getState` 依赖类型。
  - [x] 收紧 Agent message、Agent round execution action 的 `getState` 依赖类型。
  - [x] 收紧 data portability、init store action 的 `getState` 依赖类型。
  - [x] 收紧 image lifecycle action 和 task store update helper 的状态依赖类型。

## 第 3 阶段：Settings 与服务商配置

- [x] 提取 Settings profile 列表行为。
  - 当前信号：`SettingsModal.tsx` 同时管理 profile 切换、复制、删除、拖拽排序和触摸排序。
  - 目标：拆成 hook 或组件组合，专门负责 profile 列表状态与事件。
  - 验收标准：profile 排序和 active profile 切换行为不变。
  - [x] 抽取 profile 新增、复制、切换、删除、桌面拖拽和触摸排序到 `useProfileListBehavior`。

- [x] 提取服务端 provider profile 操作。
  - 范围：保存、更新、删除后端 provider profile。
  - 目标：形成 service 或 hook，提供 typed 输入输出和统一 toast 文案。
  - 验收标准：`SettingsModal.tsx` 不再包含后端请求编排。
  - [x] 抽取后端 provider profile 保存/删除编排到 `useBackendProviderProfileActions`。

- [x] 提取导入 URL 与剪贴板逻辑。
  - 当前信号：copy URL 选项、localStorage、clipboard 和 tooltip 定时都混在 modal state 中。
  - 目标：放入 `profileSettingsHelpers` 和聚焦 hook。
  - 验收标准：包含 API Key 和占位符 API Key 的复制路径都保持可用。
  - [x] 抽取 profile 导入 URL 弹窗、复制和 tooltip 计时器到 `useProfileImportUrlActions`。

- [x] 拆分 settings tab 渲染。
  - 目标：API、Data、Agent、General、About tab 分别成为可独立阅读的组件。
  - 验收标准：`SettingsModal.tsx` 变成协调器，不再是 1000 行以上的大组件。
  - [x] 抽取 API tab 渲染到 `ApiSettingsTab`，Settings modal 仅保留状态和动作编排。

- [ ] 为 provider 导入/合并边界补充聚焦测试。
  - 范围：重复 provider、缺失 API Key、自定义 provider ID 冲突、Markdown 包裹 JSON。
  - 验收标准：高风险 settings 逻辑在继续拆 UI 前已有测试保护。

## 第 4 阶段：任务执行与后端同步

- [x] 分离任务执行策略。
  - 目标策略：直连 OpenAI-compatible、fal.ai、自定义服务商、后端异步任务。
  - 验收标准：`taskExecution.ts` 将策略相关工作委托给更小的模块。
  - [x] 抽取后端异步任务执行、输出保存和排队取消到 `services/backendTaskExecution.ts`。
  - [x] 抽取 OpenAI-compatible、fal.ai、自定义服务商共享的图片 API 请求和成功落库到 `services/imageApiTaskExecution.ts`。
  - [x] 抽取 fal.ai / 自定义异步任务恢复完成逻辑到 `services/taskRecoveryCompletion.ts`。
  - [x] 抽取 Agent 图片任务创建、流式任务复用和完成写回到 `services/agentTaskExecution.ts`。
  - [x] 抽取任务提交准备到 `services/taskSubmissionPreparation.ts`，抽取重试任务创建到 `services/taskRetryExecution.ts`。

- [x] 提取后端轮询策略。
  - 当前信号：轮询延迟硬编码在任务执行流程中。
  - 目标：命名常量和独立轮询 helper。
  - 验收标准：行为不变，超时和取消行为清晰。
  - [x] 抽取 `backendTaskPolling` helper 和 `BACKEND_TASK_POLL_INTERVAL_MS`。

- [x] 集中任务状态映射。
  - 范围：后端状态、前端状态、可恢复状态、取消文案。
  - 验收标准：状态映射有聚焦测试，不再重复判断字符串。
  - [x] 提取后端任务基础状态 patch helper，减少状态字段重复拼装。
  - [x] 抽取 `backendTaskStatus`，集中后端状态映射、取消文案和 lastError 字段兼容。
  - [x] 将 queued 后端任务可取消判断迁入 `backendTaskStatus` 并通过旧 store 入口兼容导出。

- [x] 规范错误 payload 形状。
  - 当前信号：部分模块抛普通 `Error`，部分模块通过类型断言挂调试字段。
  - 目标：提供 typed app error/debug payload helper。
  - 验收标准：raw response payload 和 raw image URLs 仍可用于调试，新代码不再使用 `(err as any)`。
  - [x] 新增 `lib/errorDebugPayload.ts`，统一附加和读取 raw response / raw image URL 调试 payload。

- [ ] 增加后端资产 fallback 测试。
  - 范围：资产下载成功、资产下载失败但元数据持久化、缓存命中、缓存未命中。
  - 验收标准：继续重构前，后端资产同步行为已有测试保护。

## 第 5 阶段：Agent 工作流

- [x] 拆分 Agent 工作区视图区域。
  - 目标区域：conversation sidebar、message list、asset panel、input footer、mobile header。
  - 验收标准：`AgentWorkspace.tsx` 不再拥有所有区域的大块渲染逻辑。
  - [x] 保持 conversation sidebar 独立在 `components/agent/AgentConversationSidebar.tsx`。
  - [x] 抽取移动端头部和下拉提示到 `components/agent/AgentMobileHeader.tsx`。
  - [x] 抽取单条聊天消息渲染、消息操作按钮和任务卡片嵌入到 `components/agent/AgentChatMessageItem.tsx`。
  - [x] 抽取消息列表外壳、空状态和运行中占位到 `components/agent/AgentMessageList.tsx`。

- [x] 提取 Agent round 执行状态机。
  - 当前信号：`executeAgentRound` 同时处理 streaming、tool calls、image tasks、continuation、abort 和最终消息。
  - 目标：显式阶段和小型纯 helper。
  - 验收标准：stop、regenerate、continue 行为有测试覆盖。
  - [x] 抽取 Agent round 最终 assistant message 拼装到 `agentRoundCompletion`。
  - [x] 抽取 continuation 输入拼装到 `agentContinuationInput`。
  - [x] 抽取 Agent 响应图片完成、引用回填和 raw payload 回填到 `agentImageResultCompletion`。
  - [x] 抽取 Agent round 失败消息归一化到 `agentRoundFailure`。
  - [x] 抽取 Agent 响应文本累积和工具调用分隔符处理到 `agentResponseTextAccumulator`。
  - [x] 抽取 Agent streaming 回调装配到 `agentResponseStreamCallbacks`。
  - [x] 抽取 Agent round task 桥接、流式任务复用和引用图解析到 `agentRoundTaskBridge`。
  - [x] 抽取单次 Agent response 处理到 `agentResponseTurnProcessing`。
  - [x] 抽取 Agent round 主循环到 `agentRoundStateMachine`。

- [x] 隔离 tool-call 处理。
  - 目标：`generate_image_batch`、`continue_generation` 和 function-call-output 处理从主 store action 文件中移出。
  - 验收标准：新增 tool call 不需要深度修改主执行循环。
  - [x] 抽取 `agentToolCallOutputs`，集中生成 batch / continue 的 function-call-output 和工具调用计数。
  - [x] 删除 `executeAgentRound` 中遗留的 batch tool-call 局部处理函数。

- [ ] 增加 Agent 中断回归测试。
  - 范围：stream 前 abort、stream 中 abort、image task 中 abort、达到最大 tool-call 限制。
  - 验收标准：后续重构不需要手动覆盖每条 Agent 路径。

## 第 6 阶段：图片详情、Lightbox 与 Mask Editor

- [x] 提取 Detail modal 数据准备逻辑。
  - 目标：为 stream previews、mask preview、output image metadata、debug snapshot 建立 hooks/helpers。
  - 验收标准：`DetailModal.tsx` 的渲染代码和数据加载决策分离。
  - [x] 抽取 stream preview 列表构造到 `detailHelpers.buildStreamPreviewItems`。
  - [x] 抽取输入/输出图缓存、尺寸比例和 mask preview 到 `useDetailImages`。

- [x] 提取重复的下载/复制 action。
  - 范围：单图下载、批量输出图下载、partial image 下载、prompt 复制。
  - 验收标准：toast 行为统一，并且只需在一处测试。
  - [x] 抽取 Detail modal 文本复制、参考图复制和图片下载 toast/error 分支到 `detailActions`。

- [x] 将 Mask editor 指针逻辑移入 hooks。
  - 目标 hooks：pointer drawing、pinch/pan、history stack、save lifecycle。
  - 验收标准：Canvas 渲染 helper 尽可能保持纯函数。
  - [x] 抽取 undo/redo 快照栈到 `maskEditor/useMaskHistory`。
  - [x] 抽取遮罩保存 session/token 和写回 store 流程到 `maskEditor/useMaskSaveLifecycle`。
  - [x] 抽取预览重绘、光标绘制和画笔绘制到 `maskEditor/useMaskCanvasDrawing`。
  - [x] 抽取 pinch/pan 手势和视图变换状态到 `maskEditor/useMaskViewportGestures`。

- [ ] 为纯 mask/editor helper 补测试。
  - 范围：viewport transform、mask preprocessing、save guards、history stack 规则。
  - 验收标准：高风险指针 UI 可以依靠 helper 级测试继续重构。

## 第 7 阶段：后端可维护性

- [x] 拆分 provider profile PATCH 解析。
  - 当前信号：`handleProviderProfileByID` 包含很长的解析/校验分支。
  - 目标：typed patch parser 加 handler 编排。
  - 验收标准：provider profile handler 测试覆盖非法类型和字段别名。
  - [x] 抽取 `providerProfilePatch` 和 `parseProviderProfilePatch`。
  - [x] 补充 PATCH 字段别名、归一化和非法字段 parser 测试。

- [x] 在可行处替换通用 V1 envelope map 转换。
  - 当前信号：`v1_envelope.go` 使用大量 `map[string]any` 转换。
  - 目标：为 tasks/assets/provider profiles 建立 typed DTO builder。
  - 验收标准：现有 V1 响应结构不变。
  - [x] 新增 `v1_dto.go`，为 task、asset、provider profile 建立带 JSON tag 的 DTO struct。
  - [x] 保留 envelope 输入兼容，同时把输出 DTO 字面量从匿名 map 收敛到 typed builder。

- [x] 提取 worker upstream client。
  - 当前信号：`worker.go` 同时处理队列、HTTP 调用、响应解析、存储、重试和资产创建。
  - 目标：拆成 queue runner、upstream image client、asset saver。
  - 验收标准：retry 和 redaction 行为保持测试覆盖。
  - [x] 抽取 generation/edit/remote image download 的 HTTP 调用到 `tasks/upstream_image_client.go`。
  - [x] 抽取图片响应解析、本地资产保存和远程 URL fallback 到 `tasks/asset_saver.go`。
  - [x] 抽取 worker 启动、唤醒、claim loop 和 runOne 状态流到 `tasks/worker_runner.go`。

- [x] 集中 size/time limit。
  - 范围：上传大小、图片下载大小、worker 超时、单任务最大图片数。
  - 验收标准：限制值有清晰名称，并被测试或文档说明。
  - [x] 新增 `tasks/limits.go`，命名 worker 轮询间隔、上游请求超时、图片下载超时、远程图片下载大小和单任务图片数。
  - [x] 命名 storage 上传读取上限为 `maxUploadReadBytes`。

## 暂时不要动

- [ ] 不修改数据库迁移历史，除非有明确迁移任务。
- [ ] 结构重构期间不修改 IndexedDB 数据库名/版本或 Zustand persist version。
- [ ] 无关清理期间不修改备份导出/导入 JSON 结构。
- [ ] 拆分 UI 时不修改 Agent 协议提示词、tool 名称或响应解析。
- [ ] 前端清理期间不修改 upstream security、redaction 或 SSRF 限制。
- [ ] 不把生成产物清理和源码重构混在同一个任务中。

## 阶段完成检查

- [x] 相关单元测试通过。
  - 已运行：`cd web && npm test`，24 个测试文件 / 183 个测试通过。
- [x] 前端完整 build 通过。
  - 已运行：`cd web && npm run build`。
- [x] Go 完整测试通过。
  - 已运行：`go test ./...`。
- [x] 没有引入新的 import cycle。
  - 已由 `go test ./...` 覆盖编译检查。
- [x] 没有包含无关的纯格式化改动。
  - 本轮仅对触碰的 Go 文件运行 `gofmt`。
- [x] 如存在公开行为变化，已明确记录。
  - 本轮为结构重构和命名收敛，无预期公开行为变化。
