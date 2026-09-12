# Call Center Performance Dashboard

A rebuilt version of your dashboard for call-center data (Sales + Calls),
themed in your logo's gold (`#FDAC00`).

## Files
- `index.html` — page shell, loads CSS/JS (Chart.js, SheetJS, pako from CDN)
- `css/style.css` — full theme, recolored to your logo's gold/amber
- `config.js` — **the only file you should need to edit** — Apps Script URL, sheet tab names, column aliases
- `js/data-core.js` — fetches + normalizes data, holds app state, local cache
- `js/data-upload.js` — drag-and-drop `.xlsx` upload fallback
- `js/app.js` — renders the whole UI (Overview, Sales, Calls, Agents, Data tabs), charts, tables
- `Code.gs` — Google Apps Script backend to paste into your Sheet's Apps Script editor
- `sample-call-center-data.xlsx` — a sample file with `Sales` + `Calls` tabs to test the upload flow
- `logo.png` — your logo

## Quick start
1. **Open it as-is first**: open `index.html` in a browser. With no Apps
   Script URL set, it runs in upload-only mode — go to the **Data** tab and
   drop in `sample-call-center-data.xlsx` to see it fully populated.
2. **Connect your real spreadsheet** (two tabs: `Sales` and `Calls`):
   - Open your Google Sheet → **Extensions → Apps Script**
   - Paste in `Code.gs`, then **Deploy → New deployment → Web app**
     (Execute as: **Me**, Who has access: **Anyone with the link**)
   - Copy the `/exec` URL it gives you
   - Paste it into `config.js` as `APPS_SCRIPT_URL`
   - Reload `index.html` — it will now pull live data and auto-refresh
     every 5 minutes (configurable in `config.js`)
3. **Match your real column headers**: `config.js` already recognizes common
   header variations (e.g. `"Agent"`, `"Rep"`, `"Sales Rep"` all map to the
   same field). If your sheet uses something not listed, just add it to the
   relevant array in `config.js` — no other code needs to change.

## Hosting it
This is a static site (no server needed beyond the Apps Script API). You can:
- Open `index.html` directly, or
- Host the whole folder on GitHub Pages, Netlify, Vercel, or Google Sites,
  or drop it in Google Drive and open with an extension like "Web Server for
  Chrome" for local testing.

## Notes / assumptions
- "Won"/"Lost" style words in your Sales **Status** column drive revenue and
  win-rate math — edit `SALE_WON_VALUES` / `SALE_LOST_VALUES` in `config.js`
  if your sheet uses different wording (e.g. "Paid", "Refunded").
- "Answered"/"Missed" style words in your Calls **Status** column drive the
  answer-rate math — edit `CALL_ANSWERED_VALUES` / `CALL_MISSED_VALUES`
  the same way.
- Call **Duration** is read as seconds if it's a plain number, or parsed
  from `mm:ss` / `hh:mm:ss` text.
