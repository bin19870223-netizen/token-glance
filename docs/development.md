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

使用锁文件安装依赖：`npm ci`。`npm run build:watcher` 从 Windows .NET Framework 编译器构建 `runtime/AgentUsageWatcher.exe` 和 `runtime/FullscreenState.exe`。不提交 exe；用户和 CI 都从源码构建。

`npm test` 使用内存文件系统和假对话框检查真实主进程的设置分支，不操作实际系统启动项。`npm run test:watcher` 运行进程名称分类检查，不启动监控服务。`npm run test:ui` 使用假数据和独立 Electron 用户目录，不读取 Codex 账号，不代表生产账号连接或真实系统对话框已经端到端验证。

CI 运行上述测试和监听器构建。结果见本仓库 [Actions](https://github.com/bin19870223-netizen/token-glance/actions)；本机通过不能替代对应提交的云端结果。

`npm run test:topmost` 在 Windows 桌面创建独立测试窗口及测试进程，复现其他置顶窗口覆盖 HUD，核对真实 Win32 窗口层级、键盘焦点、隐藏和关闭行为。测试期间会短暂出现测试窗口；不读取其他应用的内容、Codex 账号或启动设置。`topmost.cjs` 每秒检查置顶标记，实际被遮挡或窗口显示时才提升层级；空闲时不重复 `moveTop`，避免干扰悬停提示。

`FullscreenState.exe` 由主进程启动并通过管道报告 `SHQueryUserNotificationState`，每 250 毫秒查询一次，仅在状态变化时输出。仅 `QUNS_RUNNING_D3D_FULL_SCREEN`（3）暂停置顶；普通最大化、无边框和浏览器全屏不按独占全屏处理。进入独占时撤销 HUD/概览的置顶标记并停止提升和展开概览，返回桌面立即恢复用户原来的置顶选择，不改写设置。检测未就绪或失败时暂缓置顶；EOF 或应用退出会停止检测进程。原生测试需先执行构建命令，并在普通桌面运行；模拟状态转换验证原生窗口策略，不代表真实游戏兼容性已实测。

主进程仅向检测程序发送本工具的 HUD/概览窗口句柄。检测器查询它们上方是否有其他进程的可见窗口与之重叠，跳过最小化、其他虚拟桌面和同进程窗口（包括本机提示气泡），需要恢复时报告 `restore`。不抓取其他窗口像素或文字。悬停展开保持幂等，延迟收起前重新检查鼠标是否仍在 HUD/概览范围；数据广播保留图标按钮节点。

24 小时模式通过账号累计 Token 的连续采样增量生成 24 个小时段，重启、连接失败和长采样间隔作为缺口处理，不跨缺口补算。数字采样最多保留约 25 小时；7 / 30 天仍走原有按日汇总。`npm run test:ui` 同时覆盖设置页、24 小时面板及悬停节点稳定性。

## 资源测量

README 界面图可用 `node scripts/capture-docs.cjs` 重新生成。脚本在隔离的 Electron 目录中渲染当前 UI，使用示例额度和生成的数字采样，不连接 Codex、不读取真实 runtime 或会话，也不修改用户设置。图片写入 `docs/images/`，缓存写入 `work/docs-capture-runtime/`。中英文说明分别位于 `README.md` 和 `README.en.md`；应用界面目前仍为简体中文。

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
