# Third-party notices

## Bundled provider artwork — Lobe Icons (MIT)

The files below are unchanged PNGs sourced through Agent HUD Open from `@lobehub/icons-static-png` **1.97.0**:

| Local file | Original package file |
| --- | --- |
| `src/ui/assets/chatgpt.png` | `light/openai.png` |
| `src/ui/assets/claude.png` | `light/claude-color.png` |
| `src/ui/assets/deepseek.png` | `light/deepseek-color.png` |

Copyright (c) 2023 LobeHub. Full original MIT text is retained in [src/ui/assets/LobeIcons-LICENSE.txt](src/ui/assets/LobeIcons-LICENSE.txt).

Sources: [Lobe Icons](https://github.com/lobehub/lobe-icons), [upstream asset provenance](https://github.com/jazzenchen/agent-hud-open/blob/main/docs/brand-assets.md). Provider names and logos identify the corresponding services; this project claims no affiliation or endorsement and grants no ownership in their trademarks.

## Design and interaction references

- [jazzenchen/agent-hud-open](https://github.com/jazzenchen/agent-hud-open), Apache-2.0, reference revision `faa3a06fcf06510855ada332ea454f1f6df30ab4`: edge HUD and hover/pin interaction direction. Swift source and installers are not included in this source distribution.
- [CyclicRedundancyCHK/session-model-usage](https://github.com/CyclicRedundancyCHK/session-model-usage), MIT, reference revision `78ddd392de023a2ca006ef2542e423f2928102a4`: Windows settings layout direction. Its source, screenshots and installers are not included in this source distribution.

The application's Electron/JavaScript/C# implementation and local SVG UI glyphs were authored for Token Glance. Reference repositories kept in a maintainer's `references/` directory are excluded from Git and source exports. If future changes incorporate upstream code, add the corresponding original notices and comply with that code's license before release.

## Installed dependencies

Electron is pinned in `package-lock.json`; it and its transitive dependencies retain their own licenses. `node_modules/` and the Electron executable are not included in the source archive. A future executable distribution must also retain Electron/Chromium and other bundled dependency notices, including the files shipped with Electron.
