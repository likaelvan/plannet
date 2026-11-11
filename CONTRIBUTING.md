# Contributing to Plannet

## Local setup

Follow the virtual-environment setup in [README.md](README.md). The app has no third-party Python or frontend dependencies and no build step.

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
