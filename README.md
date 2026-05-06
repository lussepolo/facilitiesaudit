# facilitiesaudit

Escola Concept Facilities Audit app.

The application lives in `espacos-deploy/`. It is a Vite + React app with:

- audit `AREAS`
- audit `SLOTS`
- scoring from `0` to `5`
- local audit history in `localStorage`
- offline queue for failed Google Sheets sync
- optional Google Sheets persistence through `VITE_SHEETS_URL`

The production `VITE_SHEETS_URL` value is configured in Netlify environment variables. Do not commit the real Google Apps Script URL to this repository.

## MVP scope

- This is a mobile field audit MVP.
- Local history is stored in this device/browser.
- Completed audits are submitted to Google Sheets when `VITE_SHEETS_URL` is configured.
- Indicadores currently reflects local device history, not a consolidated campus-wide leadership dashboard.

## Local development

```bash
cd espacos-deploy
npm install
npm run dev
```

The app runs in local-only mode when `VITE_SHEETS_URL` is not configured. In that mode, audits and pending sync data stay in this browser through `localStorage`.

To enable Google Sheets locally:

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```bash
VITE_SHEETS_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

`.env.local` is gitignored and must not be committed.

## Google Sheets setup

1. Create a Google Sheet for audit submissions.
2. Open Extensions > Apps Script.
3. Add a web app endpoint that accepts `POST` requests from the app.
4. Parse the JSON body with a `rows` array and append each row to the sheet.
5. Deploy the script as a Web app.
6. Copy the `/exec` deployment URL into `VITE_SHEETS_URL`.

The app sends one row per audited area with fields including `id`, `campus`, `date`, `slot_id`, `slot_label`, `auditor`, `area_id`, `area_label`, `room_number`, `area_score`, `overall_score`, `notes`, `photo_data`, and `created_at`.

## Production build

```bash
cd espacos-deploy
npm run build
npm run preview
```

## Deploy to Vercel

1. Import this GitHub repo in Vercel.
2. Set the project root directory to `espacos-deploy`.
3. Use the default Vite settings:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Add `VITE_SHEETS_URL` in Project Settings > Environment Variables only if Google Sheets sync should be enabled.

## Deploy to Netlify

1. Create a new site from this GitHub repo.
2. Set the base directory to `espacos-deploy`.
3. Use:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Confirm `VITE_SHEETS_URL` is configured in Site configuration > Environment variables. This production value lives in Netlify, not in the repository.

`espacos-deploy/netlify.toml` already contains the build and SPA redirect settings for Netlify when the base directory is `espacos-deploy`.
