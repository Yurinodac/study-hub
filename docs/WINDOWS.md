# Study Hub — Windows development & packaging

Study Hub is an **Electron + React + TypeScript** desktop app (v1.1). Progress is stored in **SQLite** under the OS app-data folder (on Windows: `%APPDATA%\StudyHub`), not in browser storage. Packaging uses **electron-builder** (NSIS installer). Celebration images and the DB live under that userData folder.

Source project path (this machine): `/agent/study-hub`

## Prerequisites (Windows)

1. Install [Node.js LTS](https://nodejs.org/) (18+; 22 recommended).
2. Install [Git](https://git-scm.com/) (optional but helpful).
3. Open **PowerShell** or **Command Prompt**.
4. Copy or clone the `study-hub` project folder onto your PC.

## Install dependencies

**`npm install` must finish successfully before you run `npm run dev`.** Run it from the folder that contains `package.json` (the unzipped `study-hub` folder).

```bat
cd path\to\study-hub
npm install
```

Wait until install completes with no fatal errors. The `postinstall` step rebuilds native modules (`better-sqlite3`) for Electron.

## Run in development

```bat
npm run dev
```

This starts Vite and opens the Study Hub window. Changes to the UI hot-reload; main-process changes usually need a restart.

## Typecheck and unit tests

```bat
npm run typecheck
npm test
```

## Build a Windows installer

Local builds are configured as **unsigned** (`signAndEditExecutable: false`) so you do not need Developer Mode or admin rights for packaging. `npm run dist` / `dist:dir` force-rebuild `better-sqlite3` with `@electron/rebuild` for **Electron 34** (ABI **132**), then verify it loads in Electron before packing (`npmRebuild` is off so electron-builder will not overwrite those natives).

```bat
npm run dist
```

If ABI errors persist (especially under OneDrive), force-clean then rebuild:

```bat
rmdir /s /q node_modules\better-sqlite3\build
npx electron-rebuild -f -w better-sqlite3
npm run verify:native
rmdir /s /q release\win-unpacked
npm run dist:dir
```

Prefer copying the project to `C:\dev\study-hub` if OneDrive keeps interfering with native rebuilds or file locks.

### After updating Study Hub source

Whenever you replace the project folder with a newer zip:

```bat
npm install
npm run dist:dir
```

Then launch with `& ".\release\win-unpacked\Study Hub.exe"` (PowerShell) or double-click the exe.

**Changelog (recent):** MCAT shared categories (8 study tags); practice exams + exam-section reference; categories filter; chapters are resource-local only; sticky top banner; Today tabs; draft-safe textboxes.

Output (typical):

- `release\StudyHub-Setup-1.1.14.exe` — NSIS installer (desktop shortcut: **Study Hub**)
- Intermediate unpackaged files may also appear under `release\win-unpacked\`

Portable/dir-only build (no installer wizard):

```bat
npm run dist:dir
```

Then start the unpacked app:

- **File Explorer:** open `release\win-unpacked\` and double-click `Study Hub.exe`
- **PowerShell** (from the project folder):

```powershell
& ".\release\win-unpacked\Study Hub.exe"
```

In PowerShell, typing a quoted path alone only **echoes** the string — it does not run the program. Use the call operator `&` as above, or double-click in File Explorer.

### After installing

1. Double-click **Study Hub** on the desktop (or Start Menu).
2. No Cursor, terminal, or separate server is required.
3. Data lives in `%APPDATA%\StudyHub\` (survives app updates).
4. Use **Backup & sample** in the app to export/restore JSON backups.

### Opening resources

- Website links open in your default browser (`shell.openExternal`).
- Local files open with the default Windows app (`shell.openPath`).
- Resource fields never run shell commands.

## Cross-building from Linux (this cloud environment)

On the Linux build agent:

| Artifact | Status |
|----------|--------|
| Unit / DB logic tests (`npm test`) | Supported |
| Production JS bundles (`npm run build`) | Supported |
| Unpacked Windows folder (`npm run dist:dir`) | Produced at `release/win-unpacked/Study Hub.exe` — **not executed or verified on Windows** |
| NSIS installer (`npm run dist`) | **Fails without Wine** on this Linux VM (`wine is required`) |

Do **not** treat the unpacked Linux-built `.exe` as a finished, tested installer. Rebuild on Windows for a trustworthy package.

**Remaining Windows steps for you:**

1. Copy `/agent/study-hub` to a Windows PC.
2. `npm install`
3. `npm run dist` → `release\StudyHub-Setup-1.1.14.exe`
4. Install and walk through the manual test checklist.

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `'electron-builder' is not recognized as an internal or external command` | You almost certainly skipped or failed `npm install`. From the folder that contains `package.json`, run `npm install` and wait for it to finish. If it still fails, delete `node_modules` and `package-lock.json`, then run `npm install` again. **`npm install` must succeed before `npm run dev`.** |
| `ERROR: Cannot create symbolic link : A required privilege is not held by the client` (often under `electron-builder\Cache\winCodeSign` / `libcrypto.dylib`) | **Cause:** electron-builder’s winCodeSign cache tries to create macOS symlinks; Windows blocks that without Developer Mode / admin. Unsigned local builds do not need code signing. **Fix:** Delete the folder `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign`, then run `npm run dist` again with the updated project (`build.win.signAndEditExecutable` is `false`). **Optional:** enable Windows Developer Mode, or use `npm run dist:dir` for an unpacked folder instead of an NSIS installer. **Soft note:** if you still see odd file locks, prefer a non-OneDrive path (e.g. `C:\dev\study-hub`) instead of a Desktop folder synced by OneDrive. |
| `lookup github.com: no such host` / `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE` while fetching `electron-builder-binaries` / `nsis-...` | **Cause:** the PC cannot resolve or reach `github.com`. electron-builder downloads NSIS from GitHub to build the Setup.exe installer. **Immediate workaround:** run `npm run dist:dir`, then start the app with `release\win-unpacked\Study Hub.exe` (no NSIS download). **Fix network:** confirm a browser can open https://github.com; try another DNS (e.g. 1.1.14.1 or 8.8.8.8), briefly disable VPN, then retry `npm run dist`. **Soft note:** OneDrive paths can cause other packaging issues — prefer `C:\dev\study-hub` if problems continue. |
| PowerShell “runs” `Study Hub.exe` but nothing happens / it only prints the path | In PowerShell, a quoted path by itself does **not** launch the app. From the project folder run: `& ".\release\win-unpacked\Study Hub.exe"` — or double-click `Study Hub.exe` in File Explorer under `release\win-unpacked\`. |
| `Study Hub.exe` exists (~190MB) but “does not open” (silent) | 1) Confirm `npm run dist:dir` finished without errors. 2) Launch so you can see errors — **PowerShell:** `cd` to the project folder, then `& ".\release\win-unpacked\Study Hub.exe"`; **Command Prompt:** `cd /d path\to\study-hub` then `"release\win-unpacked\Study Hub.exe"`. 3) If a dialog appears, read it; also check `%APPDATA%\StudyHub\startup-error.log`. 4) Capture a console log: `& ".\release\win-unpacked\Study Hub.exe" 2>&1 | Tee-Object -FilePath startup-console.log` then open `startup-console.log`. 5) Allow the app through Windows Defender / SmartScreen if prompted. 6) Prefer a non-OneDrive path such as `C:\dev\study-hub`. 7) Force-clean natives (see NODE_MODULE_VERSION row) then `npm run dist:dir`. |
| `NODE_MODULE_VERSION 127` / `was compiled against a different Node.js version` … `requires NODE_MODULE_VERSION 132` (often `better_sqlite3.node` under `app.asar.unpacked`) | **Cause:** `better-sqlite3` was built for plain Node.js (ABI **127**) instead of Electron **34** (ABI **132**). **Force-clean fix (project folder, PowerShell or cmd):** delete `node_modules\better-sqlite3\build`, run `npx electron-rebuild -f -w better-sqlite3`, run `npm run verify:native` (must print OK / ABI 132), delete `release\win-unpacked`, then `npm run dist:dir`. Launch with `& ".\release\win-unpacked\Study Hub.exe"`. If rebuild keeps failing on a OneDrive Desktop path, move the project to `C:\dev\study-hub` and repeat. |
| `remove ...\release\win-unpacked\d3dcompiler_47.dll: Access is denied` / `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE` | **Cause:** a previous `Study Hub.exe` (or Explorer/antivirus) still has files locked inside `release\win-unpacked`, so electron-builder cannot overwrite them. **Fix:** Quit Study Hub completely; in Task Manager end any **Study Hub** / **Electron** processes; close File Explorer windows open on `release\win-unpacked`; delete the folder `release\win-unpacked` (or the whole `release` folder); then run `npm run dist:dir` again. **Soft note:** OneDrive sync under Desktop can keep locks longer — prefer `C:\dev\study-hub` if this keeps happening. |
| `better-sqlite3` build errors | Re-run `npm install`; ensure build tools are present (Windows: `npm install --global windows-build-tools` is rarely needed on modern Node; install Visual Studio Build Tools if compile fails). |
| Blank window in dev | Check the terminal for Vite/Electron errors; run `npm run build` then `npx electron .` after build. |
| File won’t open | Path may have moved — open resource details → **Update file location**. |
| Want a clean slate | Quit the app, rename `%APPDATA%\StudyHub`, restart (or restore a backup). |
