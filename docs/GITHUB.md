# Publish Study Hub on GitHub

Public repo: **https://github.com/Yurinodac/study-hub**

Users download builds from **Releases**:  
https://github.com/Yurinodac/study-hub/releases

Current app version in `package.json`: **1.1.14**

## Before you start (Windows)

1. Log into GitHub as **Yurinodac**.
2. Install [Git](https://git-scm.com/) and [GitHub CLI](https://cli.github.com/).
3. In PowerShell:

```powershell
gh auth login
```

(GitHub.com → HTTPS → Log in with browser.)

4. Open the `study-hub` folder that contains `package.json`.

## Create the repo and push (first time)

```powershell
git init
git add .
git commit -m "Study Hub 1.1.14"
gh repo create Yurinodac/study-hub --public --source=. --remote=origin --push
```

If the empty repo already exists on GitHub:

```powershell
git init
git add .
git commit -m "Study Hub 1.1.14"
git branch -M main
git remote add origin https://github.com/Yurinodac/study-hub.git
git push -u origin main
```

## Build Windows installer (v1.1.14)

```powershell
cd path\to\study-hub
npm install
npm run dist
```

Typical output: `release\StudyHub-Setup-1.1.14.exe`

If NSIS download fails:

```powershell
npm run dist:dir
Compress-Archive -Path ".\release\win-unpacked\*" -DestinationPath ".\release\StudyHub-portable.zip"
```

## Publish GitHub Release v1.1.14

```powershell
gh release create v1.1.14 "release\StudyHub-Setup-1.1.14.exe" --title "Study Hub 1.1.14" --notes "Completion progress bars, multi-day calendar queue, practice-exam missed questions + flashcards, Open Anki app, and completion celebration picture. Download the Setup exe, install, and open Study Hub from the Start Menu."
```

Or for the portable zip:

```powershell
gh release create v1.1.14 "release\StudyHub-portable.zip" --title "Study Hub 1.1.14" --notes "Portable Windows build. Unzip and run Study Hub.exe."
```

## Install (what to tell users)

Same as the top of the project `README.md`:

1. Go to **Releases**: https://github.com/Yurinodac/study-hub/releases
2. Download **`StudyHub-Setup-….exe`** (or the portable zip if that’s what was published).
3. Run the installer — or unzip the portable zip.
4. Open **Study Hub** from the Desktop or Start Menu.
5. Windows may warn **“Unknown publisher”** — **More info** → **Run anyway** if they trust you.
6. No Node, Cursor, or terminal needed.
7. Data stays in `%APPDATA%\StudyHub`.

## Later updates

```powershell
git add .
git commit -m "Describe your changes"
git push
npm run dist
gh release create v1.1.14 "release\StudyHub-Setup-1.1.14.exe" --title "Study Hub 1.1.14" --notes "What changed"
```

Bump `version` in `package.json` when you want the Setup filename version to change.
