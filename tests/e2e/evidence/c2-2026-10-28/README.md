# C2 Figma/app pairs — 2026-10-28

Each JPEG is 780×844: Figma's native-scale 390×844 crop on the left, JodSa's 390×844 Playwright screenshot on the right. The app side uses only test user A with disposable accounts. The design frames are taller than the viewport, so top and bottom crops expose both the portfolio grid and the consequence/save area.

| Flow | Top | Bottom | Figma node |
| --- | --- | --- | --- |
| Invest | [pair-invest-top.jpg](pair-invest-top.jpg) | [pair-invest-bottom.jpg](pair-invest-bottom.jpg) | `27:1654` |
| Divest | [pair-divest-top.jpg](pair-divest-top.jpg) | [pair-divest-bottom.jpg](pair-divest-bottom.jpg) | `27:1816` |

Figma file: `85YURQNppODPO2dFxD8O6W`, page “D — Honey · All screens”. App screenshots come from `tests/e2e/c2-invest-divest.spec.ts`. The persistence case is skipped while the live test database lacks migration 0012; no C2 write was attempted against it.
