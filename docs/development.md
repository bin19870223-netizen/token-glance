# 开发说明

## 目录

```text
src/                   Electron 主进程、数据模型、Codex RPC、HTML/CSS/JS、C# 监听器
tests/                 Node 单元测试、Electron 隔离界面检查
tests/watcher/         C# 进程识别测试和人工端到端测试用等待进程
scripts/               监听器构建、界面测试入口、资源测量、干净源码导出
examples/              明确标注的格式示例
docs/                  开发、隐私和验收边界
.github/workflows/     Windows CI 配置
runtime/               本机数据及已构建监听器，忽略，不上传
work/                  本机测试产物和开发证据，忽略，不上传
references/            维护者本机的上游参考检出，忽略，不上传
node_modules/          本机安装的依赖，忽略，不上传
```

`src/main.cjs` 管理窗口、托盘、系统启动项与 IPC；`model.cjs` 管理设置约束、页面恢复范围、用量语义和窗口几何；`codex.cjs` 是只读 RPC 适配器；`ui/` 不拥有 Node 权限；`AgentUsageWatcher.cs` 只识别配置的进程并控制工具启动。

界面样式为手写 CSS，没有前端打包器。当前源码保持早期原型的紧凑风格，后续可单独整理可读性；不要把功能修改与大面积格式化混成一个补丁。

## 构建和验证

使用锁文件安装依赖：`npm ci`。`npm run build:watcher` 从 Windows .NET Framework 编译器构建 `runtime/AgentUsageWatcher.exe`。不提交 exe；用户和 CI 都从源码构建。

`npm test` 使用内存文件系统和假对话框检查真实主进程的设置分支，不操作实际系统启动项。`npm run test:watcher` 运行进程名称分类检查，不启动监控服务。`npm run test:ui` 使用假数据和独立 Electron 用户目录，不读取 Codex 账号，不代表生产账号连接或真实系统对话框已经端到端验证。

CI 运行上述测试和监听器构建。结果见本仓库 [Actions](https://github.com/bin19870223-netizen/token-glance/actions)；本机通过不能替代对应提交的云端结果。

## 资源测量

启动工具后可运行：

```powershell
powershell -NoProfile -File scripts/measure-resources.ps1 -Label idle -Samples 3 -IntervalSeconds 5
```

报告保存在 `work/resources-idle.json`，包含进程 ID 和资源量；发布前不要直接上传个人机器报告。CPU 按逻辑处理器总量归一化，内存区分 working set / private，GPU 计数器可能不可用。不同窗口、驱动和 Electron 版本下占用会变化；本项目目前不承诺超低内存。

## 导出可分享源码

```powershell
npm run export:source -- 'D:\Exports\token-glance-source'
```

目标必须是仓库以外的新目录。工具按显式清单复制源码、文档、示例、测试和元数据，拒绝符号链接与运行产物；不依赖「先把整个目录压缩再删隐私文件」。发布前仍要人工核对导出文件、LICENSE、第三方声明和截图。导出不是上传，也不会建立 GitHub 仓库。

## 维护注意

- 不提交真实 `runtime/`、账号读数、会话标题、日志、链接快捷方式或认证信息。
- `work/probe.cjs` 等旧的本机探针只作内部历史证据，可能输出账号/会话信息，未纳入公开源码。
- Codex 实验接口变化时先补兼容测试；缺字段应显示未知，不伪造额度或活动。
- 保持只读 RPC 方法白名单，不新增登录、凭据解析、任务执行或审批能力作为普通维护的一部分。
- 保留 `AgentHUD.Windows` 内部启动标识，避免升级时留下重复启动项。
