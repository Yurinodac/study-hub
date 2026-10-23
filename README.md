# Study Hub

A calm Windows desktop app for tracking study progress — built for Project MCATaid and everyday MCAT prep.

See what’s next on **Today**, open textbooks/videos/Anki/question banks, and update where you stopped. Progress is saved locally (no account required).

## Install on Windows (users)

1. Go to **Releases**: https://github.com/Yurinodac/study-hub/releases
2. Download **`StudyHub-Setup-….exe`** (or the portable zip if that’s what was published).
3. Run the installer — or unzip the portable zip to a folder you like.
4. Open **Study Hub** from the Desktop shortcut or the Start Menu.
5. Windows may warn **“Unknown publisher”** (unsigned build). Click **More info**, then **Run anyway** if you trust this download.
6. You do **not** need Node, Cursor, or a terminal for everyday use.
7. Your data stays on this PC in `%APPDATA%\StudyHub`.

## MCAT categories

An **MCAT** project seeds eight shared study categories (tags for whole resources — **not** the four official AAMC exam sections):

Biology · Biochemistry · General Chemistry · Organic Chemistry · Physics · Psychology · Sociology · CARS

Filter **My Resources** by category chips, and tag resources when you add them. Official exam section info and a simple practice-exam score log live under **Backup & projects**.

## For developers

Needs [Node.js LTS](https://nodejs.org/) (18+).

```bat
cd study-hub
npm install
npm run dev
```

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development window |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript checks |
| `npm run dist` | Windows NSIS installer (`release\`) |
| `npm run dist:dir` | Unpacked app only (no installer) |

More detail: [docs/GITHUB.md](./docs/GITHUB.md) (publish a Release), [docs/DESIGN.md](./docs/DESIGN.md), [docs/WINDOWS.md](./docs/WINDOWS.md).

## License

MIT
