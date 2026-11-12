# Contributing to Plannet

## Local setup

Follow the virtual-environment setup in [README.md](README.md). The desktop version has no third-party Python dependencies or build step. For the web/PWA version, use Node.js 22+, run `npm ci`, and follow [WEB_SETUP.md](docs/WEB_SETUP.md).

## Source layout

| Path | Purpose |
| --- | --- |
| `server.py` | Local HTTP server, validation, SQLite persistence, and legacy schedule migration |
| `static/index.html` | Page structure, forms, and in-app help |
| `static/app.js` | Task UI, timed schedules, drag reordering, clock, and preferences |
| `static/style.css` | Responsive layout and visual styles |
| `static/favicon.svg` | Plannet icon |
| `restore_backup.py` | Validated JSON restore with a database backup |
| `test_server.py` | Backend regression tests |
| `start.ps1` / `Start Plannet.bat` | Windows launchers |

## Checks

Run the existing backend tests with your virtual-environment Python:

```powershell
.\.venv\Scripts\python.exe -m unittest -v
```

If Node.js is installed, check frontend syntax:

```sh
node --check static/app.js
```

For manual testing, use `PLAN_NET_DB` with a separate database and a separate port, as shown in the README. Avoid testing destructive actions against your personal planner.

For relevant UI changes, check task creation/editing, completion, collapsed subtasks, duration inputs, timed-tab ordering, save/reload behavior, and narrow screens. Check keyboard access as well as pointer interactions. The existing automated suite focuses on backend behavior; it is not a complete browser test suite.

## Data compatibility

The server stores the planner as a JSON snapshot with a revision number in SQLite. Keep old backups readable and preserve tasks during migrations. Task durations currently use decimal hours in storage; the UI converts them to whole minutes. Timed tabs store their start date/time and ordered task IDs. References to tasks deleted elsewhere are removed during saves.

Do not bypass revision checks when changing save behavior. Browser preferences are separate from exported planner data.

## Public repository hygiene

- Keep `.venv/`, `data/`, database files, exported personal backups, and local environment files out of Git.
- Use fictional tasks in screenshots and examples. Exclude names, private notes, and personal schedules.
- Review `git status` and staged changes before committing. Ignore rules do not remove files that were already tracked.
- Describe the change and the checks run in pull requests. Add focused regression coverage for behavior changes where practical.

The repository does not yet include a license; the owner must choose one before describing it as open source.

## Web/PWA development

`web/build.mjs` bundles `web/cloud.mjs` and adapts the shared frontend from `static/` into `dist/`. Do not edit generated `dist/` files. The desktop entry point remains separate and its SQLite database is never bundled.

- `web/store.mjs`: account-scoped IndexedDB persistence and cloud conflict handling.
- `web/account.html`, `web/mobile.css`: onboarding, account controls, and responsive layouts.
- `web/sw.js`: public-asset-only service worker.
- `supabase/migrations/`: database schema, row-level policies, and restricted RPC functions.
- `web/tests/`: isolated IndexedDB tests and SQL integration tests using PGlite with mocked identity roles.

Run `npm test` and `npm run build`. Keep `package-lock.json` committed and keep `.env`, `node_modules/`, and `dist/` untracked. Only public configuration belongs in a client bundle. Never add a secret/service-role key. Follow the hosted verification checklist in the setup guide before releasing accounts to real users.
