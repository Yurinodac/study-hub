# Study Hub

Calm Windows desktop study tracker for Project MCATaid.

See:

- Design: project store `docs/study-hub-design.md`
- Windows setup & packaging: `docs/study-hub-windows-setup.md` (in the project agent store)
- Manual test checklist: `docs/study-hub-test-checklist.md` (in the project agent store)

## Quick start

```bat
npm install
npm run dev
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development window |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript checks |
| `npm run build` | Compile main/preload/renderer |
| `npm run dist` | Windows NSIS installer via electron-builder |

Data: SQLite under the Electron `userData` path (`%APPDATA%\StudyHub` on Windows).
