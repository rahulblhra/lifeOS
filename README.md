# LifeOS

A personal life management app built with React, TypeScript, Vite, IndexedDB, and Google Drive storage. It has no LifeOS backend, analytics, or telemetry. Users sign in with Google before entering the app. Google Drive holds the shared private data file; IndexedDB keeps a local cache. Do not open `index.html` with `file://`.

## Try the visual preview first

Open `preview.html` directly in a browser (double-click it in File Explorer). It is an interactive demo with illustrative sample records: add, edit, complete, and delete tasks, expenses, learning topics, and reminders; create a learning goal with multiple subtopics by entering one per line; try filters, theme switching, and JSON export. It does not need Node.js. Demo changes live only in page memory and disappear when you refresh or close the tab. If you like the workflow, install Node.js and run the full app below for persistent IndexedDB storage.

## Run locally

On Windows, install the **LTS Windows installer** from [nodejs.org](https://nodejs.org/en/download/) and leave the option to add Node.js to `PATH` enabled. This installs both Node.js and npm. Close and reopen PowerShell after installation, then verify both commands:

```powershell
node -v
npm -v
```

Then, in this folder, copy `.env.example` to `.env`, add your Google OAuth web client ID as `VITE_GOOGLE_CLIENT_ID`, and run:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. To create a production build, run `npm run build`; serve the generated `dist` folder from a local HTTP origin to use it without the development server.

## GitHub Pages

The repository includes a GitHub Actions deployment workflow. Push the project to a repository whose default branch is `main`, then choose **Settings → Pages → GitHub Actions**. A push to `main` builds and publishes `dist`; the Vite base path is configured for GitHub project sites.

## Google Drive setup

1. In Google Cloud Console, create a project, enable the Google Drive API, configure the OAuth consent screen, and create an OAuth Client ID with application type **Web application**. Do not create or embed a client secret; this browser app uses a public client ID.
2. Add the deployed GitHub Pages **origin** to Authorized JavaScript origins, for example `https://YOUR-USER.github.io` (no repository path).
3. For local development, add `http://localhost:5173` as another authorized origin.
4. Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID` to the client ID. For GitHub Actions, add a repository **variable** or **secret** named `VITE_GOOGLE_CLIENT_ID` with the same value. The Pages workflow accepts either.
5. On each page load, users select **Continue with Google** and authorize app-specific Drive access before LifeOS opens. The app compares the Drive checkpoint with the browser's IndexedDB checkpoint: a newer Drive copy replaces the local cache; newer unsynced local edits are uploaded, or shown in a conflict chooser when both sides changed. Google authorization tokens stay in memory and are requested again after reload or expiry.

The app requests only the `drive.appdata` scope. Each Google account gets a private app-specific Drive data file; it is hidden in Drive's normal file browser and only accessible to this app. IndexedDB stays as an offline cache. Drive sync needs an internet connection. Keep exported JSON backups: clearing browser storage removes the cache, and deleting the app's Google Drive app data removes the cloud copy. IndexedDB is not encrypted storage. [Drive app data folder](https://developers.google.com/workspace/drive/api/guides/appdata), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Google Identity Services for web](https://developers.google.com/identity/oauth2/web/guides/overview).

## What’s included

- Dashboard summaries derived from saved tasks, expenses, shopping items, learning topics, and reminders.
- Task CRUD, completion, priorities, due dates, search, and filters.
- Expense tracking in INR, month view, categories, notes, and totals.
- Learning goals with a date range and weekday/weekend study-hour commitments. Topic hours are divided evenly by default, can be adjusted individually, and are laid out across available study days.
- Sticky notes with editable titles and text, four colors, and pinning; saved notes sync with the rest of your private app data.
- Job Application Tracker with application stages and history, multiple contacts and Gmail links, interview rounds, activity timelines, and follow-up tracking. Gmail links and metadata are entered manually; LifeOS does not access inbox contents.
- Reminders with one-time, daily, weekly, monthly, or yearly schedules; upcoming, overdue, and completed views. Completing a recurring reminder advances it to the next occurrence. In-app only; reminders cannot be guaranteed when the browser is closed.
- Light/dark theme and versioned JSON backup export/import. Restore validates the full file before offering merge or replace. Replace uses a single IndexedDB read/write transaction.

## Backups, storage, and privacy

Use **Settings → Export backup** to download a JSON file. Use **Settings → Restore backup** to validate a backup, review record counts, and choose whether to merge or replace current data. Keep exported files securely; they may contain sensitive information.

Records are stored in the user's Google Drive appDataFolder and cached in IndexedDB. The GitHub Pages host does not receive the records. Clearing browser site data erases the local cache but not the Drive copy. IndexedDB and Drive appDataFolder are not encrypted by LifeOS, and neither is a substitute for backups. No background notification guarantee is made.

## Current limits

- There is no LifeOS backend. Google sign-in and Drive access are required to open LifeOS.
- Drive access needs internet and a configured OAuth client. Users sign in again after page reload or token expiry. Concurrent editing is not real-time collaboration.
- Reminder alerts are visible only while the app is open.
- Expense analytics currently show monthly totals and category groupings in the record list; no chart view is included yet.
- Browser tests are not bundled in this initial version.
