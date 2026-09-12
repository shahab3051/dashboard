/* =========================================================================
   CALL CENTER DASHBOARD — CONFIG
   This is the only file you should need to touch after deployment.
   ========================================================================= */

window.DASHBOARD_CONFIG = {

  // 1) PASTE YOUR DEPLOYED GOOGLE APPS SCRIPT WEB APP URL HERE.
  //    (Deploy the included Code.gs as a Web App -> "Execute as: Me" ->
  //    "Who has access: Anyone with the link" -> copy the /exec URL below.)
  //    Leave empty to run in "upload only" mode (drag-and-drop an .xlsx file).
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxRlQmpOpHl79pqtS13xj-bWjsIMGdxLlrgMgS06nN56CPZEdKUOoPWEc1R9oT200fA/exec",

  // 2) Names of the two tabs in your Google Sheet.
  SHEET_TABS: {
    sales: "Sales",
    calls: "Calls"
  },

  // 3) How often to auto-refresh from the Apps Script API (minutes). 0 = off.
  AUTO_REFRESH_MINUTES: 5,

  // 4) Currency symbol used for revenue figures.
  CURRENCY: "$",

  // 5) COLUMN MAPPING — tells the dashboard which header in your sheet maps
  //    to which field it needs. Add any alternate spellings your sheet uses
  //    to the arrays below (matching is case-insensitive and ignores extra
  //    spaces/underscores), and the dashboard will find them automatically.
  COLUMNS: {
    sales: {
      date:      ["date", "sale date", "order date", "timestamp"],
      agent:     ["agent", "agent name", "rep", "sales rep", "employee"],
      customer:  ["customer", "customer name", "client", "account"],
      product:   ["product", "plan", "item", "package"],
      amount:    ["amount", "revenue", "sale amount", "value", "price"],
      status:    ["status", "sale status", "deal status", "result"],
      region:    ["region", "store", "location", "market", "branch"],
      payment:   ["payment method", "payment", "payment type"]
    },
    calls: {
      date:       ["date", "call date", "timestamp"],
      agent:      ["agent", "agent name", "rep", "employee"],
      customer:   ["customer", "customer name", "caller", "client"],
      type:       ["call type", "type", "direction"],
      duration:   ["duration", "call duration", "talk time", "handle time", "aht", "duration (sec)", "duration (mins)"],
      status:     ["status", "call status", "call outcome", "outcome", "disposition"],
      queue:      ["queue", "department", "team", "campaign"],
      waitTime:   ["wait time", "hold time", "queue time"]
    }
  },

  // Statuses treated as a "won"/successful sale for KPI + win-rate math.
  SALE_WON_VALUES: ["won", "closed", "closed won", "sale", "success", "completed", "paid"],
  SALE_LOST_VALUES: ["lost", "closed lost", "cancelled", "canceled", "declined", "refunded"],

  // Statuses treated as "answered" vs "missed" for call KPI math.
  CALL_ANSWERED_VALUES: ["answered", "completed", "connected", "resolved"],
  CALL_MISSED_VALUES: ["missed", "abandoned", "no answer", "dropped", "voicemail"]
};
