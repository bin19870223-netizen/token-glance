# Token Glance

[简体中文](README.md) · [English](README.en.md)

**A quiet AI usage companion for Windows. Keep your quota at the edge of your screen.**

A small ring stays docked to the edge. Hover to see quota and Token activity, or click to pin the panel while you work.

Windows 10 / 11 · MIT · **v0.1.1 experimental source preview**

[Get the source](https://github.com/bin19870223-netizen/token-glance/releases/tag/v0.1.1) · [Changelog](CHANGELOG.md) · [Report an issue](https://github.com/bin19870223-netizen/token-glance/issues)

![Edge dock and usage panels in light and dark themes](docs/images/overview.png)

> Screenshots come from the current app running in an isolated demo environment with synthetic quota and Token data. No real accounts or conversations are shown. The application UI currently uses Simplified Chinese.

## See your usage at a glance

- **Remaining quota:** a docked ring, percentage, short-term / weekly limits, and reset countdowns.
- **Token activity:** locally sampled activity over the last 24 hours, daily account totals over 7 / 30 days, and lifetime Token usage.
- **Recent conversations:** open a recent conversation in Codex. Conversation titles and IDs stay in memory.
- **Quick controls:** hover to expand, click to pin, right-click for settings, drag to dock, or use a keyboard shortcut.

## Make it fit your desktop

Choose light, dark, or system theme; adjust colors, transparency, text, and ring size. Place the HUD on any edge or corner and select a monitor. Every slider supports fine-step arrows and numeric entry. Restore defaults for the current page or all settings.

| Appearance and colors | Position and layout |
| --- | --- |
| [![Appearance settings with themes, palettes, and a ring preview](docs/images/settings-appearance.png)](docs/images/settings-appearance.png) | [![Layout settings with edge and corner placement, spacing, sizing, and hover delay](docs/images/settings-layout.png)](docs/images/settings-layout.png) |

Click an image to view it at full size.

## A 24-hour view and flexible startup

The 24-hour chart groups **increments sampled while the app is running** into hourly slots, starting after the update. Offline periods, connection failures, and restart gaps remain unobserved. Daily billing totals are never used to invent hourly history. The 7 / 30-day charts continue to use daily account aggregates.

Start manually, at Windows sign-in, or with a monitored Agent. Agent-follow mode checks enabled Agents every five seconds. When all monitored Agents exit, the UI and its usage connection also exit.

| Last 24 hours · local samples | Start with a monitored Agent |
| --- | --- |
| [![Hourly local samples with coverage information and lifetime Tokens](docs/images/activity-24h.png)](docs/images/activity-24h.png) | [![Startup settings for manual launch, Windows sign-in, and monitored Agents](docs/images/settings-startup.png)](docs/images/settings-startup.png) |

The HUD recovers above ordinary apps when covered, without taking keyboard focus. It yields when Windows reports exclusive Direct3D fullscreen, then restores your preference on return. Real exclusive games, other graphics APIs, and fullscreen-optimization combinations still need testing.

## Data sources

| Source | Current support | Limitations |
| --- | --- | --- |
| Codex | Quotas, Tokens, and recent conversations returned by the local official app-server | Experimental API; fields and availability may change |
| Claude / DeepSeek | A local JSON usage snapshot selected by the user | No live account integration or hourly details yet |

Unavailable readings appear as “—”. Tokens and subscription quotas are separate measures and are not converted into each other. Daily data may be delayed. Live approvals, task execution status, and per-conversation Token breakdowns are not implemented.

## Run from source

Requires Windows 10 / 11, Node.js **22.12+**, npm, and the Windows .NET Framework 4.x C# compiler. Put the source in a writable directory, then run:

```powershell
npm ci
npm run build:watcher
npm start
```

The build creates both the Agent startup watcher and the fullscreen / occlusion detector. After installation and building, you can also double-click `START.vbs` for a quiet launch.

**This release contains source code, not a signed installer, portable executable, or automatic updater.** Install and sign in to Codex separately. The app checks the local installation and `codex.exe` on PATH. A custom path can be supplied using the retained compatibility variable:

```powershell
$env:AGENT_HUD_CODEX = 'D:\Tools\codex.exe'
npm start
```

Closing settings does not quit the app. Use the tray menu or “About → Quit Token Glance”. Quit before upgrading or rebuilding. In Agent-follow mode, first select manual startup and let the watcher exit. After moving the source directory, reselect the startup mode to update its path.

## Privacy and project scope

Preferences, aggregate usage, numeric samples, an account identifier digest, and caches stay in the local `runtime/` directory and are excluded from public source exports. The app does not directly read or store passwords, cookies, or API keys, and has no telemetry server. It uses the official Codex app-server's existing sign-in and allows only read-only methods.

This is an independent community project, not an official release from OpenAI, Anthropic, DeepSeek, or the reference projects. It does not start model tasks, approve actions, or redeem usage resets.

[Privacy and security details](docs/privacy.md) · [Validation scope](docs/validation.md) · [Example snapshot format](examples/usage-snapshot.json)

## Development and contributions

```powershell
npm test
npm run test:watcher
npm run test:ui
npm run test:topmost
```

Build before running native window tests, and run them on a normal Windows desktop. See the [development guide](docs/development.md) for resource measurement and clean source exports, and read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing. Do not commit runtime data, logs, or test artifacts.

## License and credits

Code is available under the [MIT license](LICENSE). Interaction references: [Agent HUD Open](https://github.com/jazzenchen/agent-hud-open); settings layout reference: [session-model-usage](https://github.com/CyclicRedundancyCHK/session-model-usage). This is an independent Electron / C# implementation.

Provider logos come from LobeHub's Lobe Icons and identify their respective services; they do not imply endorsement. Sources and retained licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
