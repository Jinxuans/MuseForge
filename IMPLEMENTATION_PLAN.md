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

## 下一步建议

优先级从高到低：

```text
1. 实现 MuseForge 自有分享广场后端，兼容当前前端使用的 /api/v1 协议
2. 明确分享图片上传、存储、访问 URL 和删除策略
3. 增加分享广场后端测试和前端集成测试
4. 设计登录用户体系，把匿名客户端数据迁移到用户资产
5. 将分享广场升级为正式社区作品流，补齐审核、互动和运营能力
```

## 验证命令

常用验证：

```powershell
npm run test --prefix web
npm run build --prefix web
go build -buildvcs=false -o museforge-check.exe ./cmd/server
Remove-Item .\museforge-check.exe
```
