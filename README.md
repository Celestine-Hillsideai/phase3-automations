# phase3-automations

Trigger.dev project for Phase 3 automations.

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API key |
| `FIRECRAWL_API_KEY` | Firecrawl API key |
| `GOOGLE_SHEETS_CLIENT_ID` | OAuth 2.0 Client ID (Google Cloud Console) |
| `GOOGLE_SHEETS_CLIENT_SECRET` | OAuth 2.0 Client secret |
| `GOOGLE_SHEETS_REFRESH_TOKEN` | Obtained once via `npm run google:auth` (see below) — also used for Drive access |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID of the target spreadsheet |
| `GOOGLE_DRIVE_FOLDER_ID` | ID of the Drive folder that generated reports are uploaded into |

`.env` is git-ignored. The Trigger.dev CLI loads it automatically in `dev`; import values in tasks via `env` from [src/env.ts](src/env.ts) rather than reading `process.env` directly.

For deployed (staging/prod) runs, set the same variables in the Trigger.dev dashboard under your project's Environment Variables, since `.env` is never deployed.

### Google Sheets + Drive auth (one-time)

Sheets and Drive access both use OAuth (acting as your own Google account), not a service account, and share the same client/refresh token. After setting `GOOGLE_SHEETS_CLIENT_ID` and `GOOGLE_SHEETS_CLIENT_SECRET` in `.env`:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), on that OAuth client, add `http://localhost:3577/oauth2callback` to **Authorized redirect URIs** (only required if the client type is "Web application" — "Desktop app" clients accept any loopback port automatically).
2. Run `npm run google:auth`, open the printed URL, and grant access. The consent screen will ask for both a Sheets scope and a Drive `drive.file` scope (least-privilege — only grants access to files this app creates).
3. Copy the printed `GOOGLE_SHEETS_REFRESH_TOKEN` value into `.env`.
4. Set `GOOGLE_DRIVE_FOLDER_ID` to the ID of the Drive folder reports should land in (the id in that folder's URL).

If you already had a refresh token from before Drive support was added, re-run step 2 — the old token's scope doesn't include Drive and needs replacing.

Use [src/google-sheets.ts](src/google-sheets.ts)'s `getSheetsClient()` or [src/google-drive.ts](src/google-drive.ts)'s `getDriveClient()`/`uploadDocxToDrive()` in tasks to get an authenticated client.

## Tasks

### `daily-research`

[src/trigger/daily-research.ts](src/trigger/daily-research.ts) runs unattended every morning at 08:00 America/New_York (declared via the `cron` property on `schedules.task` — no dashboard registration needed, just deploy). It searches a fixed topic with Firecrawl, synthesizes the results with OpenAI, and appends one row to the target spreadsheet. Every phase (search, synthesis, sheet write) is logged independently, and a failure in search or synthesis degrades to a logged fallback value rather than failing the run — only a failed sheet write fails the run, since Trigger.dev's retry + dashboard then become the trace of record.

**Prerequisite:** the target spreadsheet (`GOOGLE_SHEETS_SPREADSHEET_ID`) must already have a tab named `Sheet1` — the task appends to `Sheet1!A:G` and does not create sheets/tabs.

**Testing locally:** run `npx trigger.dev@latest dev`, then fire a manual "Test Run" of `daily-research` from the Trigger.dev dashboard — cron schedules don't self-trigger on demand in dev.

### `generate-company-report`

[src/trigger/generate-company-report.ts](src/trigger/generate-company-report.ts) generates a client report on demand from a JSON payload of `COMPANY_NAME`, `INDUSTRY`, `GOAL`, `CHALLENGE`. It writes the report body with OpenAI, renders it to a `.docx` (via [src/report-docx.ts](src/report-docx.ts)), and uploads the file to the Drive folder in `GOOGLE_DRIVE_FOLDER_ID` (via [src/google-drive.ts](src/google-drive.ts)). Every phase (validation, synthesis, docx build, Drive upload) is logged independently; a missing/empty required field fails the run immediately with a clear message, and a failure in any later phase is logged and rethrown so Trigger.dev's retries (configured in `trigger.config.ts`) and dashboard become the trace of record — nothing here crashes the process.

This task has no cron schedule — it's meant to be triggered externally (e.g. from an n8n form/webhook), not run on its own. To trigger it, POST to Trigger.dev's task-trigger API for task id `generate-company-report` with your project's secret key and a JSON body containing the four fields; get the exact endpoint/request shape for your project from the Trigger.dev dashboard's page for this task (API surface can change between SDK versions, so the dashboard is the source of truth, not this README). The task runs async and returns `{ status, id, webViewLink, fileName }` — check the Trigger.dev dashboard run output for the resulting Drive link.

**Testing locally:** run `npx trigger.dev@latest dev`, then fire a manual "Test Run" of `generate-company-report` from the Trigger.dev dashboard with a sample payload.

## Development

```bash
npx trigger.dev@latest dev
```

This starts the local Trigger.dev dev server and runs your tasks in `src/trigger/`.

## Deploy

```bash
npx trigger.dev@latest deploy
```
