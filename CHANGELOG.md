# Changelog

## 0.1.2 — Experimental source preview

- Keep the Agent watcher independent of the launching host's Windows Job Object, so closing Codex does not also remove the watcher needed for its next launch.
- Explicitly synchronize Windows startup approval with the selected startup mode and keep process temporary directories inside the application runtime.
- Add bounded local startup and watcher diagnostics without account or conversation content.
- Add a native regression that closes a kill-on-close host Job, verifies its worker exits, and confirms the independent child survives.
- Clarify the difference between Windows sign-in startup and Agent-follow startup in both README languages. The maintainer confirmed the Codex close/reopen flow on the current machine.

## 0.1.1 — Experimental source preview

- Fix hover flicker by preserving dock nodes, ignoring duplicate hover opens and false leave events, and raising overlays only on actual occlusion instead of every second.

- Add a rolling 24-hour Token activity option with hourly local samples. Unknown/unobserved intervals are not filled using daily account totals.

- Automatically yield to Windows-reported exclusive Direct3D fullscreen, then restore the user's topmost preference when returning to the desktop.
- Recover the HUD and detail panel above other pinned Windows apps without taking keyboard focus. Respect hidden windows and the always-on-top setting.
- Use the above-taskbar overlay level to avoid losing Windows topmost status with a replacement desktop dock.
- Add isolated native window-order regression checks.

## 0.1.0 — Experimental source preview

- Windows edge-docked quota rings, hover and pinned detail panel.
- Four edges/four corners and multi-monitor work-area placement.
- Read-only Codex account quotas, daily usage and recent-session navigation; JSON snapshot adapters for Claude and DeepSeek.
- Themes, palettes, transparency, sizing, reminders and shortcuts.
- Manual, Windows-login and monitored-Agent startup modes.
- Fine-step arrows and Enter-to-commit numeric inputs on every settings slider.
- Per-page or full default reset, with explicit scope selection.
- Larger settings typography.
- Portable watcher build, isolated tests, Windows CI configuration, license/attributions and private-state exclusions.

This is an experimental source preview. It does not include a signed installer or automatic updater.
