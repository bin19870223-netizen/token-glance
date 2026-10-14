# 隐私与安全边界

## 数据流

本工具 → 本机官方 `codex.exe app-server --listen stdio://` → Codex 自己的账号服务。

工具允许 `initialize`、`account/read`、`account/rateLimits/read`、`account/usage/read`、`thread/list`，以及协议初始化通知；没有发起模型任务或审批请求的接口。实验能力通过初始化显式启用。`account/read` 不请求刷新凭据；本工具不解析 Codex 凭据文件。

账号服务是否联网、如何保存登录、是否自行更新凭据由 Codex 控制。本工具不保证其子进程完全不产生网络流量或第三方运行日志。

## 持久化

| 位置 | 内容 | 是否应公开 |
| --- | --- | --- |
| `runtime/settings.json` | 偏好、监控进程名称、显示器 ID | 否 |
| `runtime/usage.json` | 聚合额度、按日用量、计划类型、采样时间 | 否 |
| `runtime/sources.json` | 用户选择的 JSON 文件路径 | 否 |
| `runtime/user-data/`、缓存/日志/崩溃目录 | Electron 本地运行信息 | 否 |
| 内存 | 最近会话标题和 ID | 不持久化到用量缓存 |

用量 JSON 并不是密码，但仍是个人活动信息。即使没有 API Key，也不应把运行目录推到 GitHub。

## 本地信任边界

- Electron 渲染器启用 context isolation、sandbox、web security，禁用 Node integration；CSP 限制为本地资源，禁止任意新窗口与页面导航。
- IPC 限定为本工具窗口的主 frame；设置修改和恢复必须来自设置窗口。
- 会话跳转仅接受当前列表中符合格式的 ID，由系统处理 `codex://` 协议。
- 快照 JSON 只解析用户选择的文件，不执行其中的内容，读取上限 1 MiB。
- 监听器只把经过 exe 文件名约束的名字拼入 WMI 查询；不把名称作为 shell 命令。
- 源码导出与 Git 忽略规则保护已知的运行产物，但不能替代人工审查。

能够修改应用目录、二进制、系统 PATH 或环境变量的本机用户仍属于信任边界。本工具不是本机恶意软件隔离系统。自定义 `AGENT_HUD_CODEX` 应指向用户信任的官方可执行文件。
