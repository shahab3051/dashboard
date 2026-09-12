/* =========================================================================
   DATA CORE
   - Fetches JSON from the Google Apps Script Web App (config.js -> APPS_SCRIPT_URL)
   - Normalizes raw sheet rows into a predictable shape regardless of the
     exact header names used in the spreadsheet (see config.js COLUMNS)
   - Holds the single source of truth (window.DashboardData) that app.js
     and data-upload.js both read from / write to
   ========================================================================= */

(function () {
  const CFG = window.DASHBOARD_CONFIG;
  const CACHE_KEY = "ccdash_cache_v1";

  // ---------- header matching helpers ----------
  function normKey(s) {
    return String(s == null ? "" : s).toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  }

  // Given one sample record (plain object with the sheet's real headers as
  // keys) and an alias map like { date:["date","sale date"], ... }, return
  // { field: actualKeyInRecord }
  function resolveHeaderMap(sampleRecord, aliasMap) {
    const actualKeys = Object.keys(sampleRecord || {});
    const normToActual = {};
    actualKeys.forEach((k) => { normToActual[normKey(k)] = k; });

    const resolved = {};
    Object.keys(aliasMap).forEach((field) => {
      const aliases = aliasMap[field];
      let found = null;
      for (const alias of aliases) {
        const n = normKey(alias);
        if (normToActual[n] !== undefined) { found = normToActual[n]; break; }
      }
      // fallback: partial/contains match
      if (!found) {
        for (const alias of aliases) {
          const n = normKey(alias);
          const hit = actualKeys.find((k) => normKey(k).includes(n) || n.includes(normKey(k)));
          if (hit) { found = hit; break; }
        }
      }
      resolved[field] = found; // may be null if truly absent
    });
    return resolved;
  }

  function toNumber(v) {
    if (typeof v === "number") return v;
    if (v == null || v === "") return 0;
    const cleaned = String(v).replace(/[^0-9.\-]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function toDate(v) {
    if (v instanceof Date && !isNaN(v)) return v;
    if (typeof v === "number") {
      // Excel serial date fallback
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(excelEpoch.getTime() + v * 86400000);
    }
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }

  // duration -> seconds. Accepts "mm:ss", "hh:mm:ss", or a plain number
  // (treated as seconds, per config.js comment).
  function toDurationSeconds(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return v;
    const str = String(v).trim();
    if (str.includes(":")) {
      const parts = str.split(":").map((p) => parseInt(p, 10) || 0);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    return toNumber(str);
  }

  function normText(v) {
    return String(v == null ? "" : v).trim();
  }

  // ---------- record normalizers ----------
  function normalizeSales(rawRecords) {
    if (!rawRecords || !rawRecords.length) return [];
    const map = resolveHeaderMap(rawRecords[0], CFG.COLUMNS.sales);
    return rawRecords.map((r) => {
      const statusRaw = map.status ? normText(r[map.status]) : "";
      const statusLower = statusRaw.toLowerCase();
      return {
        date: map.date ? toDate(r[map.date]) : null,
        agent: map.agent ? normText(r[map.agent]) || "Unassigned" : "Unassigned",
        customer: map.customer ? normText(r[map.customer]) : "",
        product: map.product ? normText(r[map.product]) : "",
        amount: map.amount ? toNumber(r[map.amount]) : 0,
        status: statusRaw || "Unknown",
        isWon: CFG.SALE_WON_VALUES.includes(statusLower),
        isLost: CFG.SALE_LOST_VALUES.includes(statusLower),
        region: map.region ? normText(r[map.region]) || "Unspecified" : "Unspecified",
        payment: map.payment ? normText(r[map.payment]) : "",
        raw: r
      };
    }).filter((r) => r.date); // drop rows without a usable date
  }

  function normalizeCalls(rawRecords) {
    if (!rawRecords || !rawRecords.length) return [];
    const map = resolveHeaderMap(rawRecords[0], CFG.COLUMNS.calls);
    return rawRecords.map((r) => {
      const statusRaw = map.status ? normText(r[map.status]) : "";
      const statusLower = statusRaw.toLowerCase();
      return {
        date: map.date ? toDate(r[map.date]) : null,
        agent: map.agent ? normText(r[map.agent]) || "Unassigned" : "Unassigned",
        customer: map.customer ? normText(r[map.customer]) : "",
        type: map.type ? normText(r[map.type]) || "Inbound" : "Inbound",
        durationSec: map.duration ? toDurationSeconds(r[map.duration]) : 0,
        status: statusRaw || "Unknown",
        isAnswered: CFG.CALL_ANSWERED_VALUES.includes(statusLower),
        isMissed: CFG.CALL_MISSED_VALUES.includes(statusLower),
        queue: map.queue ? normText(r[map.queue]) || "General" : "General",
        waitSec: map.waitTime ? toDurationSeconds(r[map.waitTime]) : 0,
        raw: r
      };
    }).filter((r) => r.date);
  }

  // ---------- state ----------
  const state = {
    sales: [],
    calls: [],
    status: "idle", // idle | loading | live | uploaded | error
    error: null,
    lastUpdated: null,
    source: ""
  };
  const subscribers = [];

  function notify() {
    subscribers.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
  }

  function setState(patch) {
    Object.assign(state, patch);
    notify();
  }

  // ---------- cache (localStorage, gzip via pako if available) ----------
  function saveCache() {
    try {
      const payload = JSON.stringify({
        sales: state.sales, calls: state.calls,
        lastUpdated: state.lastUpdated, source: state.source
      });
      if (window.pako) {
        const compressed = window.pako.deflate(payload, { to: "string" });
        localStorage.setItem(CACHE_KEY, "gz:" + btoa(compressed));
      } else {
        localStorage.setItem(CACHE_KEY, payload);
      }
    } catch (e) { /* storage full / disabled — non-fatal */ }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      let payload;
      if (raw.startsWith("gz:") && window.pako) {
        const compressed = atob(raw.slice(3));
        payload = window.pako.inflate(compressed, { to: "string" });
      } else if (raw.startsWith("gz:")) {
        return null; // compressed but pako unavailable
      } else {
        payload = raw;
      }
      const parsed = JSON.parse(payload);
      parsed.sales.forEach((s) => { s.date = s.date ? new Date(s.date) : null; });
      parsed.calls.forEach((c) => { c.date = c.date ? new Date(c.date) : null; });
      return parsed;
    } catch (e) { return null; }
  }

  // ---------- public API ----------
  async function refreshFromServer() {
    if (!CFG.APPS_SCRIPT_URL) {
      setState({ status: "error", error: "No Apps Script URL configured yet." });
      return;
    }
    setState({ status: "loading", error: null });
    try {
      const res = await fetch(CFG.APPS_SCRIPT_URL, { method: "GET" });
      if (!res.ok) throw new Error("Server responded with " + res.status);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const sales = normalizeSales(json[CFG.SHEET_TABS.sales.toLowerCase()] || json.sales || []);
      const calls = normalizeCalls(json[CFG.SHEET_TABS.calls.toLowerCase()] || json.calls || []);
      setState({
        sales, calls, status: "live", error: null,
        lastUpdated: new Date(), source: "Live — Google Sheet"
      });
      saveCache();
    } catch (err) {
      const cached = loadCache();
      if (cached) {
        setState({
          sales: cached.sales, calls: cached.calls, status: "error",
          error: err.message + " — showing last cached data.",
          lastUpdated: cached.lastUpdated ? new Date(cached.lastUpdated) : null,
          source: cached.source + " (cached)"
        });
      } else {
        setState({ status: "error", error: err.message });
      }
    }
  }

  function loadFromUpload(rawSales, rawCalls, filename) {
    const sales = normalizeSales(rawSales);
    const calls = normalizeCalls(rawCalls);
    setState({
      sales, calls, status: "uploaded", error: null,
      lastUpdated: new Date(), source: "Uploaded file — " + (filename || "spreadsheet")
    });
    saveCache();
  }

  function subscribe(fn) {
    subscribers.push(fn);
    return () => { const i = subscribers.indexOf(fn); if (i > -1) subscribers.splice(i, 1); };
  }

  function init() {
    const cached = loadCache();
    if (cached && (cached.sales.length || cached.calls.length)) {
      setState({
        sales: cached.sales, calls: cached.calls, status: cached.source && cached.source.includes("Upload") ? "uploaded" : "live",
        lastUpdated: cached.lastUpdated ? new Date(cached.lastUpdated) : null,
        source: cached.source
      });
    }
    if (CFG.APPS_SCRIPT_URL) {
      refreshFromServer();
      if (CFG.AUTO_REFRESH_MINUTES > 0) {
        setInterval(refreshFromServer, CFG.AUTO_REFRESH_MINUTES * 60 * 1000);
      }
    } else if (!cached) {
      setState({ status: "idle" });
    }
  }

  window.DashboardData = {
    getState: () => state,
    subscribe,
    refreshFromServer,
    loadFromUpload,
    init,
    // exposed for data-upload.js / debugging
    _normalizeSales: normalizeSales,
    _normalizeCalls: normalizeCalls
  };
})();
