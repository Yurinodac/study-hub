# Study Hub — design note (v1.1)

## Stack and why

| Choice | Reason |
|--------|--------|
| **Electron + React + TypeScript** | Real Windows desktop app (not a browser mockup). |
| **electron-builder** | NSIS installer / portable build via `npm run dist`. |
| **SQLite (`better-sqlite3`)** | Durable local file under `%APPDATA%\StudyHub`. |
| **Vite** | Fast React/TS toolchain for the renderer. |
| **Electron `shell.openExternal` / `shell.openPath`** | Open websites, local files, and desktop apps (e.g. Anki `.exe`). |

No accounts, cloud sync, or paid APIs. Offline tracking works; only linked websites need the network. Opening Anki launches the app only — Study Hub does not sync Anki decks.

## Essential structure

**Study project → resources, organized with shared category tags.**

Everyday workflow:
1. See what to study **Today** (Queue / Continue / History tabs) — schedule for today, tomorrow, a picked date, or a multi-day range.
2. **Open resource** (OS opens the website, file, or app such as Anki).
3. **Update progress** / where you stopped — each resource shows a completion/activity bar (never a cross-resource overall %).

### Categories (study tags)

- Each project has a **shared category list**.
- **MCAT preset** seeds eight study categories once: Biology, Biochemistry, General Chemistry, Organic Chemistry, Physics, Psychology, Sociology, CARS.
- Resources are tagged with **one or more categories** (whole-resource tags only in v1).
- My Resources filters by category and shows each resource’s own concrete progress.
- These are study categories, **not** the four official AAMC exam sections.
- Non-MCAT projects use their own editable category lists.

### Progress (per resource)

Template-specific **completion / activity** bars:

- Reading / videos: toward a recorded total. Readings prefer **completed chapters ÷ total chapters** when a chapter total is set (completed count auto-tracks from distinct chapters in progress history, and stays manually editable). Otherwise section units or optional page totals. Videos: lessons completed vs total. % only when a total exists.
- Anki / question banks: bar = **correct ÷ attempted**. Concrete counts shown too. Sessions this week / bank size are notes only — not the bar fill.

Plus “Where I stopped” and optional Next action. No overall % across resources. Scheduling a next action (Today / Tomorrow / date / range) is part of the **Update progress → Next action** controls — not a separate calendar section. The Today page still has its own queue.

Chapters/sections stay **optional and resource-local**.

### Official exam sections (reference)

C/P, CARS, B/B, and P/S with question counts and times are shown as reference (Backup & projects → Exam info). Users do **not** assign exam sections when adding resources.

### Practice exams

Score log: name, date, four section scores (118–132 each), calculated total, review status. Per section: log **missed questions** (prompt, answer, commentary) and review them as **flashcards** with confidence marks and remove-from-rotation.

### Completion celebration

Marking a Today queue item complete shows a short modal. Optional user-uploaded celebration image lives under `%APPDATA%\StudyHub` (not in git).

## Three main screens

1. **Today** — Queue (calendar scheduling), Continue, History; completion celebration popup; top status banner.
2. **My Resources** — Cards with category tags and completion bars; Anki can link as a desktop app.
3. **Resource Details** — Tabs: Overview / Progress / Chapters / History. Chapters are optional local lists for that resource only.

## Save and backup

- SQLite under `app.getPath('userData')`.
- Autosave on create/update/complete.
- JSON backup includes projects (with preset), categories, resources, sections, history, queue, and practice exams.

## Out of scope (deferred)

Automatic scheduling, Anki live sync, cloud sync, multi-user, AI, complex analytics, chapter-level category tags, shared topic trees across resources.
