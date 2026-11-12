# Plannet web and mobile setup

This branch adds an installable Progressive Web App (PWA) alongside the existing local Python app. It uses Supabase for verified email-link login and private account storage. The existing `data/plan-net.sqlite3` is not uploaded, modified, or bundled.

## What is implemented

- Create account / log in by emailed sign-in link; no home-grown password storage.
- After verifying email: name, unique lowercase username, optional private birthdate.
- Account settings, sign out, profile updates, and account deletion.
- The existing planner UI, responsive mobile layouts, PWA manifest and offline app shell.
- Per-account IndexedDB drafts and preferences; cloud sync with revision checks.
- Conflicts preserve the local copy, offer an export, and require confirmation to load the cloud copy. There is no silent last-write-wins overwrite.
- Last ten cloud revisions available to download; explicit desktop JSON import.

The username is a profile identifier. Login uses the verified email, not username. Birthdate is optional and is not used for age verification. This is an installable website, not an App Store / Play Store native binary.

## 1. Install and preview

Install Node.js 22 or newer. Node dependencies are local to the project; Python remains in `.venv` for the desktop version.

```powershell
npm ci
npm test
npm run build
npm run preview
```

Open `http://127.0.0.1:4173`. Without configuration, the page deliberately shows a setup notice and disables sending login links. It does not fake successful signup.

## 2. Create a Supabase project

1. Create a project in your own [Supabase dashboard](https://supabase.com/dashboard). Keep its database password private.
2. In the SQL editor, run `supabase/migrations/202611120001_profiles.sql` **once on the new project**. It creates profiles, planners, history, row-level policies, and the restricted save functions.
3. Obtain your project URL and **publishable key** from project settings. A legacy public `anon` key also works. Do not use `service_role`, `sb_secret_`, or a database password in the website.
4. Copy `.env.example` to `.env`, replace the two values, and run `npm run build` again. `.env` is ignored by Git. Public URL/key values are intentionally included in the browser bundle; database policies provide access control.

The migration uses verified `auth.uid()` ownership. Clients cannot choose another owner when saving. Profile names and birthdates are not publicly readable. Planner writes use a locked revision check, not direct table updates.

## 3. Configure email authentication

Enable email authentication and signups; keep email confirmation enabled. Leave Supabase’s default **Confirm signup** and **Magic Link** templates unchanged. Plannet now accepts the default sign-in link, so template editing is not required for testing.

Under **Authentication → URL Configuration**, set both the **Site URL** and an allowed **Redirect URL** to:

```text
http://127.0.0.1:4173/
```

The app requests a link back to its current origin. If you use `localhost` instead of `127.0.0.1`, add that exact origin too. When deploying, set Site URL to the public HTTPS origin and allow its redirect URL. Local links must be opened on the same computer where preview is running; `127.0.0.1` on a phone points to the phone.

Click **Send sign-in link**, then open the newest email link. The Supabase SDK verifies the returned session and removes its token fragment; Plannet opens profile setup for new accounts or the planner for existing profiles. No numeric code is required. Expired or previously used links require a fresh email. The app uses Supabase’s implicit flow to support email opening in another browser.

If you previously changed a template to show only a code, restore its default link using Supabase’s template reset control. On the default sender, test only with an authorized organization-member email; do not add ordinary users as organization members just to enable delivery.

After rebuilding, close all Plannet tabs/app windows and reopen the preview so the updated offline app shell activates. Opening an InPrivate/Incognito window is an easy way to check a fresh build without clearing saved data.

**Public signup needs custom SMTP.** Supabase's built-in sender is for testing and restricts recipients/delivery. Configure your own email provider in Auth SMTP settings and verify its sending domain. Provider quotas and a custom domain can introduce costs; a free backend is not a guarantee of free unlimited email. Configure appropriate email rate limits before opening signups.

Official references: [passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 4. Deploy the web app

Cloudflare Pages can host the static output. Connect your repository and use:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Node version | 22 or newer |
| Environment variables | `PLANNET_SUPABASE_URL`, `PLANNET_SUPABASE_PUBLISHABLE_KEY` |

Publish only `dist/`, never the repository root. The build does not copy `data/`, `.env`, tests, or the desktop server. Generated `_headers` configures a Content Security Policy for the configured Supabase origin. Any alternate hosting provider must apply equivalent headers.

Cloudflare's supplied HTTPS subdomain is enough; a purchased domain is optional. See [Pages limits](https://developers.cloudflare.com/pages/platform/limits/). Supabase currently lists a 500 MB database on Free and pauses free projects after inactivity; see [current pricing](https://supabase.com/pricing). Check quotas and export backups regularly. Do not promise users unlimited storage or uninterrupted availability on free tiers.

## 5. Verify before inviting users

The local automated suite executes the SQL against isolated PostgreSQL via PGlite with mocked Supabase identity roles, and tests IndexedDB drafts. It does **not** verify your hosted project, SMTP, delivered links, or real mobile installation.

After configuring your project:

1. Sign up using two test email accounts and verify link delivery and expired-link handling.
2. Choose distinct usernames. Verify a duplicate username is rejected.
3. Add different tasks under each account. Sign out and switch accounts; check isolation on refresh and in another browser.
4. Open one account on two devices. Save on one, then save an older offline copy on the other. Verify conflict export and explicit resolution.
5. Turn off network after opening a planner. Make an edit, refresh, then reconnect and verify it reaches the cloud.
6. Import a fictional desktop backup, reorder timed tasks, and export a backup. Check it contains the expected tasks.
7. Test account deletion on a disposable account and confirm its cloud rows are removed.
8. Check Android installation and iPhone Safari **Share → Add to Home Screen**. Confirm touch reordering, forms, and offline launch on the devices you plan to support.

The service worker caches only public app assets, not API responses or private data. Updates wait for existing app windows to close to avoid interrupting edits. Close/reopen installed app windows after deploying a new version.

## Data lifecycle and practical limits

- Signing out hides the planner and clears the login session; unsynced account-specific drafts remain on the device for the next login. Shared-device users should clear site data after exporting anything they need.
- A cached session/profile can open previously loaded data offline. First login, profile setup, and an expired-session refresh need internet. Device storage is not encrypted by this app and browsers can evict it.
- Account deletion removes cloud rows and the current device cache. It cannot erase exported files or disconnected devices. A disconnected copy cannot sync into a newly created account with a different user ID.
- Snapshots are limited to ten prior successful saves per account. This helps recovery but is not a permanent backup service. Planner payloads are capped at 1 MB and 10,000 records per collection.
- Whole-planner snapshots are a first-release design. If usage grows, migrate to per-record tables and incremental sync to reduce bandwidth and history storage. Keep owner policies and revision checks during that migration.
- Timed schedules are plans, not background timers or notifications. Calendar-aware breaks and daylight-saving elapsed-time scheduling are not implemented.

Before a public launch, add an owner contact and a privacy policy that accurately describes your hosting/email providers, retention, intended audience, and account-deletion behavior. The in-app data explanation is a feature summary, not a substitute for your published policy.

## Desktop migration

Run the original desktop app and download **Backup**. Sign in to the web app and use **Import backup**; review its task count and confirm replacement of that account's planner. Imports are explicit and never automatically upload the local SQLite database. Keep the desktop backup until you have verified the synced copy.


### Repeating-task update

For an existing Supabase project, run only `supabase/migrations/202611120002_repeating_tasks.sql` in the SQL editor once. It adds repeat validation without deleting accounts or tasks. For a new project, run both migration files in filename order. Then run `npm run build` and restart `npm run preview`; close old Plannet tabs so the cached app can update.

Desktop testing via Start Plannet.bat needs no Supabase connection. Restart the desktop server after updating, then refresh your browser.

For monthly/yearly repeats, also run `supabase/migrations/202611120003_calendar_repeats.sql` once after migration 002. Existing data is preserved. Rebuild the web app afterward.
