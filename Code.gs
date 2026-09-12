/**
 * =============================================================================
 * CALL CENTER DASHBOARD — GOOGLE APPS SCRIPT BACKEND
 * =============================================================================
 * WHAT THIS DOES
 * Reads the "Sales" and "Calls" tabs of the spreadsheet this script is bound
 * to, and serves them as JSON so the dashboard (index.html) can fetch them.
 *
 * HOW TO DEPLOY
 * 1. Open your Google Sheet (it must have a "Sales" tab and a "Calls" tab —
 *    change SALES_SHEET_NAME / CALLS_SHEET_NAME below if yours are named
 *    differently).
 * 2. Extensions -> Apps Script.
 * 3. Delete anything in Code.gs and paste this whole file in.
 * 4. Click Deploy -> New deployment.
 * 5. Select type: "Web app".
 *    - Description: anything, e.g. "Dashboard API"
 *    - Execute as: Me
 *    - Who has access: Anyone with the link
 * 6. Click Deploy, authorize the script when prompted.
 * 7. Copy the "Web app URL" (it ends in /exec).
 * 8. Paste that URL into config.js as APPS_SCRIPT_URL, in the dashboard files.
 *
 * Whenever you edit this script, you must create a NEW deployment version
 * (Deploy -> Manage deployments -> pencil icon -> New version) for the
 * changes to take effect on the existing /exec URL.
 * =============================================================================
 */

// ---- change these if your tabs are named differently ----
var SALES_SHEET_NAME = "Sales";
var CALLS_SHEET_NAME = "Calls";

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var payload = {
      sales: sheetToObjects(ss.getSheetByName(SALES_SHEET_NAME)),
      calls: sheetToObjects(ss.getSheetByName(CALLS_SHEET_NAME)),
      generatedAt: new Date().toISOString()
    };
    return jsonOutput(payload);
  } catch (err) {
    return jsonOutput({ error: String(err) });
  }
}

// Converts a sheet's data range into an array of plain objects keyed by
// the first row's header text. Skips fully-blank rows. Dates are sent as
// ISO strings so the browser can parse them reliably.
function sheetToObjects(sheet) {
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = values.slice(1);

  return rows
    .filter(function (row) {
      return row.some(function (cell) { return cell !== "" && cell !== null; });
    })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) {
        var v = row[i];
        obj[h] = (v instanceof Date) ? v.toISOString() : v;
      });
      return obj;
    });
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
