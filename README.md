# Plannet

A local task planner for everyday tasks, projects, learning, and content ideas. Organize work into tabs, break tasks into subtasks, or turn a tab into an ordered schedule with an estimated finish time.

Built with Python’s standard library, SQLite, and plain HTML, CSS, and JavaScript. No third-party packages, accounts, or external services are required.

## Features

- **Custom tabs:** rename, recolor, reorder, and delete tabs. New planners start with Personal, Work, Learning, and Content.
- **Categories and subtasks:** collapsible groups, nested tasks, wrapped descriptions, and notes.
- **Task details:** deadline, duration in hours and minutes, progress, and a completion checkbox.
- **Deadline views:** green for due today, red for overdue, plus search, status filters, and summary counts.
- **Timed tabs:** choose a start date/time, create tasks directly, and drag six-dot handles to order them. See each time slot, total duration, and estimated finish date—even across multiple days.
- **Personalization:** a clock without seconds, a selectable time zone, and named greetings in English, Filipino, Japanese, Simplified Chinese, and Spanish.
- **Local persistence:** automatic SQLite saves, JSON exports, and a backup restore utility.

## Quick start

Requires **Python 3.10 or newer**. Create a project-local virtual environment; there are no packages to install.

### Windows

From the project folder:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe server.py --open
```

Alternatively, double-click **Start Plannet.bat**. The launcher creates `.venv` if needed, starts the server, and opens the app. `Start Plan-Net.bat` is a compatibility launcher for the previous name.

### macOS / Linux

```sh
python3 -m venv .venv
.venv/bin/python server.py --open
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765) if the browser does not open automatically. Keep the server running while using Plannet; press **Ctrl+C** in its terminal to stop it.

The Windows launcher is provided for convenience. The Python entry point is platform-independent; macOS and Linux UI behavior has not been manually verified.

## Using Plannet

### Regular tabs

1. Choose **New tab** and give it a name.
2. Add categories, then create tasks with **New task** or a category’s **＋ Task** control.
3. Click a task title to edit it. Use its plus button to add a subtask.
4. Use the pencil and trash icons in the tab header to edit or delete the tab. Hover for labels.

Completion is independent for each task and subtask. Completing a parent does not complete its children. Summary counts include both. Overview prioritizes due-today tasks, then overdue, upcoming, and undated tasks. Use **Show completed** to find finished items.

### Timed tabs

Enable **Timed tab** when creating or editing a tab. A clock icon identifies timed tabs.

1. Set a **Start date** and **Start time**.
2. Choose **New task** to create a task in the tab and append it to the schedule. You can also expand **Add an existing task** to reference work from another tab.
3. Give each task a **Duration** in hours and minutes.
4. Drag the six-dot handle to reorder. Keyboard users can focus the handle and press **Arrow Up** or **Arrow Down**.

The finish estimate updates from the ordered durations. Missing durations are flagged until the estimate can be completed. Dates are displayed when the schedule crosses midnight.

Schedules are consecutive planned time slots, not a running timer. Add breaks or sleep as tasks if needed. Completed tasks retain their planned slots. There is no automatic working-hours calendar, parallel-task scheduling, or daylight-saving transition adjustment; calculations use the selected zone’s local clock.

Durations are per task. Parent durations do not automatically include subtasks; adding both to a schedule counts both. Removing an item from a schedule keeps the original task available in **Overview**. Referenced tasks remain in their original tabs. Deleting a timed tab deletes tasks owned by it, but not tasks referenced from other tabs.

Turning **Timed tab** off keeps the tasks and saved schedule. Turning it back on restores the schedule. Older day plans are automatically converted into named timed tabs when loaded.

### Clock and greetings

Click the clock or **Add your name / Edit greeting** to set your name, time zone, and greeting language. Automatic language selection uses the selected time zone; you can override it with any of the five supported languages. This changes the greeting, not the entire interface language.

Due-today and overdue checks follow the selected time zone. Name, language, time zone, and collapsed-group preferences are saved in the browser; tasks and schedules are saved in SQLite. Different browsers, ports, or `localhost` versus `127.0.0.1` can have separate preferences.

## Data and backups

The default database is **`data/plan-net.sqlite3`**, created on first launch. Keep it when updating the source code. A fresh database includes a few example tasks.

Use **Backup** to download a JSON export containing tabs, categories, tasks, and schedules. Browser preferences are not part of that export.

To restore, stop the server and run:

```powershell
.\.venv\Scripts\python.exe restore_backup.py "C:\path\to\plannet-backup.json"
```

On macOS/Linux, use `.venv/bin/python` instead. Restore validates the export and preserves the previous database as `data/before-restore-<timestamp>.sqlite3` before replacing its contents. Restart the server afterward.

To use a separate database, set `PLAN_NET_DB` before launching:

```powershell
$env:PLAN_NET_DB = Join-Path $PWD 'data/demo.sqlite3'
.\.venv\Scripts\python.exe server.py --port 8766
```

If the project is in a cloud-synced folder, the database may be synced by that service. Stop the server before manually copying it, and avoid opening the same database on multiple computers at once.

## Local-use scope

Plannet binds to `127.0.0.1` and is intended for one user on one computer. It has no login system or multi-user access controls. Publishing the source repository does **not** host the app or publish your planner data. Do not expose the local server through a public tunnel as a hosted service.

Changes save automatically. Conflicting edits from another window are rejected rather than silently overwriting newer data. A failed save shows a message; keep the editor open and retry after resolving the connection or conflict.

There are no background notifications, reminders while closed, or cloud collaboration. Deleting a task, category, or tab requires confirmation and has no in-app undo; export a backup before large changes.

## Troubleshooting

- **Port already in use:** stop the other Plannet instance, or run `server.py --port 8766 --open` with your virtual-environment Python.
- **Changes not visible:** refresh the browser after editing frontend files. Restart the server after editing Python files.
- **Virtual environment no longer works:** recreate `.venv` using an installed Python version. Keep `data/` intact.
- **Different greeting/settings:** browser preferences are separate for each browser and local origin.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the source layout, checks, and contribution notes.

```powershell
.\.venv\Scripts\python.exe -m unittest -v
```

Tests use temporary databases. For frontend syntax checks, Node.js is optional:

```sh
node --check static/app.js
```

## License

No license has been selected yet. A public repository alone does not grant an open-source license.
