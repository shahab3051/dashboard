/* =========================================================================
   APP — renders the whole dashboard into #app and reacts to DashboardData
   ========================================================================= */

(function () {
  const CFG = window.DASHBOARD_CONFIG;
  const $app = document.getElementById("app");
  const charts = {}; // chart.js instances keyed by canvas id, destroyed on re-render

  let currentPage = "overview";

  // ---------------------------------------------------------------- icons
  const ICON = {
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
    sales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    calls: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    agents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 5 17 10"/><line x1="12" y1="5" x2="12" y2="15"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>'
  };

  // ---------------------------------------------------------------- utils
  const fmtInt = (n) => Math.round(n || 0).toLocaleString();
  const fmtMoney = (n) => CFG.CURRENCY + (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const fmtPct = (n) => (isFinite(n) ? n.toFixed(1) : "0.0") + "%";
  const fmtDur = (secs) => {
    secs = Math.round(secs || 0);
    const m = Math.floor(secs / 60), s = secs % 60;
    return m + "m " + String(s).padStart(2, "0") + "s";
  };
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dayLabel = (key) => { const p = key.split("-"); return p[1] + "/" + p[2]; };
  const initials = (name) => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

  function toast(msg, type) {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.innerHTML = (type === "success" ? ICON.check : type === "error" ? ICON.alert : "") + `<span>${msg}</span>`;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function css(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  // ------------------------------------------------------------ aggregates
  function computeSalesKPIs(sales) {
    const won = sales.filter((s) => s.isWon);
    const lost = sales.filter((s) => s.isLost);
    const totalRevenue = won.reduce((a, s) => a + s.amount, 0);
    const winRate = (won.length + lost.length) ? (won.length / (won.length + lost.length)) * 100 : 0;
    const avgDeal = won.length ? totalRevenue / won.length : 0;
    return { totalRevenue, dealsWon: won.length, dealsLost: lost.length, totalDeals: sales.length, winRate, avgDeal };
  }

  function computeCallKPIs(calls) {
    const answered = calls.filter((c) => c.isAnswered);
    const missed = calls.filter((c) => c.isMissed);
    const other = calls.length - answered.length - missed.length;
    const answerRate = calls.length ? (answered.length / calls.length) * 100 : 0;
    const avgHandle = answered.length ? answered.reduce((a, c) => a + c.durationSec, 0) / answered.length : 0;
    const avgWait = calls.length ? calls.reduce((a, c) => a + c.waitSec, 0) / calls.length : 0;
    return { total: calls.length, answered: answered.length, missed: missed.length, other, answerRate, avgHandle, avgWait };
  }

  function computeAgentStats(sales, calls) {
    const map = new Map();
    const get = (name) => {
      if (!map.has(name)) map.set(name, { agent: name, calls: 0, answered: 0, handleSum: 0, deals: 0, won: 0, revenue: 0 });
      return map.get(name);
    };
    calls.forEach((c) => {
      const a = get(c.agent);
      a.calls++;
      if (c.isAnswered) { a.answered++; a.handleSum += c.durationSec; }
    });
    sales.forEach((s) => {
      const a = get(s.agent);
      a.deals++;
      if (s.isWon) { a.won++; a.revenue += s.amount; }
    });
    return Array.from(map.values()).map((a) => ({
      ...a,
      avgHandle: a.answered ? a.handleSum / a.answered : 0,
      conversion: a.calls ? (a.won / a.calls) * 100 : 0
    })).sort((a, b) => b.revenue - a.revenue || b.calls - a.calls);
  }

  function buildDailySeries(sales, calls, days) {
    const map = new Map();
    const touch = (d) => { const k = dayKey(d); if (!map.has(k)) map.set(k, { key: k, calls: 0, revenue: 0 }); return map.get(k); };
    calls.forEach((c) => { touch(c.date).calls++; });
    sales.forEach((s) => { if (s.isWon) touch(s.date).revenue += s.amount; });
    const sorted = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
    return sorted.slice(-days);
  }

  // ------------------------------------------------------------ table component
  function renderTable(mountEl, opts) {
    const { columns, rows, searchableKeys = [], pageSize = 8, emptyLabel = "No records yet" } = opts;
    let state = { q: "", sortKey: null, sortDir: 1, page: 1 };

    function computeRows() {
      let r = rows;
      if (state.q) {
        const q = state.q.toLowerCase();
        r = r.filter((row) => searchableKeys.some((k) => String(row[k] ?? "").toLowerCase().includes(q)));
      }
      if (state.sortKey) {
        r = [...r].sort((a, b) => {
          const av = a[state.sortKey], bv = b[state.sortKey];
          if (typeof av === "number" && typeof bv === "number") return (av - bv) * state.sortDir;
          return String(av ?? "").localeCompare(String(bv ?? "")) * state.sortDir;
        });
      }
      return r;
    }

    function draw() {
      const filtered = computeRows();
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      state.page = Math.min(state.page, totalPages);
      const pageRows = filtered.slice((state.page - 1) * pageSize, state.page * pageSize);

      mountEl.innerHTML = `
        <div class="table-toolbar">
          <div class="tt-search">${ICON.search}<input type="text" placeholder="Search…" value="${state.q}"></div>
          <button class="tt-export" type="button">${ICON.data}<span>Export CSV</span></button>
        </div>
        <div class="table-wrap">
          ${filtered.length === 0 ? `<div class="empty-state">${ICON.empty}<b>${emptyLabel}</b><span>Try a different search, or connect / upload your data on the Data tab.</span></div>` : `
          <table class="dtable">
            <thead><tr>${columns.map((c) => `<th data-key="${c.key}" class="${state.sortKey === c.key ? "sorted " + (state.sortDir === 1 ? "asc" : "desc") : ""}">${c.label}</th>`).join("")}</tr></thead>
            <tbody>${pageRows.map((row) => `<tr>${columns.map((c) => `<td class="${c.align === "num" ? "num" : ""}">${c.render ? c.render(row) : (row[c.key] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>`}
        </div>
        <div class="pagination">
          <span>${filtered.length} record${filtered.length === 1 ? "" : "s"} · page ${state.page} of ${totalPages}</span>
          <div class="pg-btns">
            <button type="button" data-act="prev" ${state.page <= 1 ? "disabled" : ""}>‹</button>
            <button type="button" data-act="next" ${state.page >= totalPages ? "disabled" : ""}>›</button>
          </div>
        </div>`;

      mountEl.querySelector(".tt-search input").addEventListener("input", (e) => { state.q = e.target.value; state.page = 1; draw(); });
      mountEl.querySelectorAll("th[data-key]").forEach((th) => th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (state.sortKey === key) state.sortDir *= -1; else { state.sortKey = key; state.sortDir = 1; }
        draw();
      }));
      const prevBtn = mountEl.querySelector('[data-act="prev"]');
      const nextBtn = mountEl.querySelector('[data-act="next"]');
      if (prevBtn) prevBtn.addEventListener("click", () => { state.page--; draw(); });
      if (nextBtn) nextBtn.addEventListener("click", () => { state.page++; draw(); });
      mountEl.querySelector(".tt-export").addEventListener("click", () => exportCsv(columns, computeRows()));
    }
    draw();
  }

  function exportCsv(columns, rows) {
    const header = columns.map((c) => `"${c.label}"`).join(",");
    const lines = rows.map((row) => columns.map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "export.csv";
    a.click();
  }

  // ------------------------------------------------------------ shell
  function renderShell() {
    const navItems = [
      { key: "overview", label: "Overview", icon: ICON.overview },
      { key: "sales", label: "Sales", icon: ICON.sales },
      { key: "calls", label: "Calls", icon: ICON.calls },
      { key: "agents", label: "Agents", icon: ICON.agents },
      { key: "data", label: "Data", icon: ICON.data }
    ];

    $app.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <img src="logo.png" class="brand-logo-img" alt="logo">
          <div class="brand-text"><b>Call Center</b><span>Performance Dashboard</span></div>
        </div>
        <nav class="nav">
          ${navItems.map((n) => `<button class="nav-item" data-page="${n.key}">${n.icon}<span class="nav-label">${n.label}</span></button>`).join("")}
        </nav>
        <div class="sidebar-spacer"></div>
        <div class="history-card">
          <div class="hc-top">
            <div class="hc-icon">${ICON.refresh}</div>
          </div>
          <div class="hc-text"><b>Live sync</b><span id="sidebar-status">Not connected yet</span></div>
          <button class="hc-btn" id="sidebar-refresh-btn">Refresh data</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="menu-btn" id="menu-btn">☰</button>
          <div>
            <div class="page-title" id="page-title">Overview</div>
            <div class="page-sub" id="page-sub">Sales &amp; calls performance at a glance</div>
          </div>
          <div class="topbar-spacer"></div>
          <div class="data-status" id="data-status"><span class="dot"></span><span id="data-status-text">Loading…</span></div>
          <button class="refresh-btn" id="refresh-btn">${ICON.refresh}<span>Refresh</span></button>
          <div class="profile">
            <div class="avatar">CC</div>
            <div class="profile-text"><b>Operations</b><span>Call Center</span></div>
          </div>
        </header>
        <div class="content" id="page-content"></div>
      </div>
      <div class="scrim hidden" id="scrim"></div>`;

    $app.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => setPage(btn.dataset.page)));
    document.getElementById("refresh-btn").addEventListener("click", doRefresh);
    document.getElementById("sidebar-refresh-btn").addEventListener("click", doRefresh);
    document.getElementById("menu-btn").addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("mobile-open");
      document.getElementById("scrim").classList.toggle("hidden");
    });
    document.getElementById("scrim").addEventListener("click", () => {
      document.getElementById("sidebar").classList.remove("mobile-open");
      document.getElementById("scrim").classList.add("hidden");
    });
  }

  async function doRefresh() {
    const btn = document.getElementById("refresh-btn");
    btn.classList.add("spinning");
    if (window.DASHBOARD_CONFIG.APPS_SCRIPT_URL) {
      await window.DashboardData.refreshFromServer();
    } else {
      toast("No Apps Script URL set — add one in config.js, or upload a file on the Data tab.", "error");
    }
    btn.classList.remove("spinning");
  }

  function updateStatusUI(state) {
    const pill = document.getElementById("data-status");
    const text = document.getElementById("data-status-text");
    const sidebarStatus = document.getElementById("sidebar-status");
    if (!pill) return;
    pill.className = "data-status " + (state.status === "live" ? "live" : state.status === "uploaded" ? "uploaded" : state.status === "error" ? "error" : state.status === "loading" ? "loading" : "");
    const labelMap = {
      live: "Live — synced with Google Sheet",
      uploaded: "Uploaded file",
      error: "Connection issue",
      loading: "Refreshing…",
      idle: "Not connected yet"
    };
    text.textContent = labelMap[state.status] || "—";
    if (sidebarStatus) sidebarStatus.textContent = state.lastUpdated ? "Updated " + state.lastUpdated.toLocaleTimeString() : (labelMap[state.status] || "Not connected yet");
  }

  // ------------------------------------------------------------ pages
  function setPage(page) {
    currentPage = page;
    $app.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    document.getElementById("sidebar").classList.remove("mobile-open");
    document.getElementById("scrim").classList.add("hidden");
    const titles = {
      overview: ["Overview", "Sales & calls performance at a glance"],
      sales: ["Sales", "Revenue, deals and win rate"],
      calls: ["Calls", "Volume, handle time and outcomes"],
      agents: ["Agents", "Leaderboard across calls and sales"],
      data: ["Data", "Connect your Google Sheet or upload a file"]
    };
    document.getElementById("page-title").textContent = titles[page][0];
    document.getElementById("page-sub").textContent = titles[page][1];
    renderPage();
  }

  function renderPage() {
    const state = window.DashboardData.getState();
    const content = document.getElementById("page-content");
    Object.keys(charts).forEach(destroyChart);

    if (currentPage === "overview") content.innerHTML = pageOverview(state);
    else if (currentPage === "sales") content.innerHTML = pageSales(state);
    else if (currentPage === "calls") content.innerHTML = pageCalls(state);
    else if (currentPage === "agents") content.innerHTML = pageAgents(state);
    else if (currentPage === "data") content.innerHTML = pageData(state);

    // post-render wiring per page
    if (currentPage === "overview") wireOverview(state);
    else if (currentPage === "sales") wireSales(state);
    else if (currentPage === "calls") wireCalls(state);
    else if (currentPage === "agents") wireAgents(state);
    else if (currentPage === "data") wireData(state);
  }

  function kpiCard(label, value, icon, tint, delta) {
    return `<div class="kpi-card">
      <div class="kpi-top">
        <div class="kpi-icon" style="background:${tint}22;color:${tint}">${icon}</div>
      </div>
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      ${delta ? `<div class="kpi-delta ${delta.dir}">${delta.dir === "up" ? ICON.up : ICON.down}<span>${delta.text}</span></div>` : ""}
    </div>`;
  }

  function configBannerIfNeeded() {
    if (CFG.APPS_SCRIPT_URL) return "";
    return `<div class="config-banner">${ICON.alert}<div>No live data source yet. Paste your Google Apps Script Web App URL into <code>config.js</code> (see <code>Code.gs</code> for the backend script), or head to the <b>Data</b> tab to upload a spreadsheet instead.</div></div>`;
  }

  // ---- Overview ----
  function pageOverview(state) {
    const sk = computeSalesKPIs(state.sales), ck = computeCallKPIs(state.calls);
    const conversion = ck.total ? (sk.dealsWon / ck.total) * 100 : 0;
    return `
      ${configBannerIfNeeded()}
      <div class="kpi-grid">
        ${kpiCard("Total Calls", fmtInt(ck.total), ICON.calls, css("--primary"))}
        ${kpiCard("Total Revenue", fmtMoney(sk.totalRevenue), ICON.sales, css("--positive"))}
        ${kpiCard("Call → Sale Conversion", fmtPct(conversion), ICON.agents, css("--teal"))}
        ${kpiCard("Avg Handle Time", fmtDur(ck.avgHandle), ICON.overview, css("--amber"))}
      </div>
      <div class="row cols-3">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Calls &amp; Revenue Trend</div><div class="panel-sub">Last 14 days</div></div></div>
          <div class="chart-box"><canvas id="chart-trend"></canvas></div>
        </div>
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Call Outcomes</div><div class="panel-sub">${fmtInt(ck.total)} total calls</div></div></div>
          <div class="donut-wrap"><canvas id="chart-outcome"></canvas>
            <div class="donut-center"><b>${fmtPct(ck.answerRate)}</b><span>Answered</span></div>
          </div>
          <div class="chart-legend">
            <div class="leg-item"><span class="leg-dot" style="background:${css("--positive")}"></span>Answered · ${fmtInt(ck.answered)}</div>
            <div class="leg-item"><span class="leg-dot" style="background:${css("--negative")}"></span>Missed · ${fmtInt(ck.missed)}</div>
            <div class="leg-item"><span class="leg-dot" style="background:${css("--ink-faint")}"></span>Other · ${fmtInt(ck.other)}</div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Top Agents</div><div class="panel-sub">By revenue closed</div></div></div>
          <div id="overview-agents"></div>
        </div>
      </div>`;
  }

  function wireOverview(state) {
    const daily = buildDailySeries(state.sales, state.calls, 14);
    const ctx = document.getElementById("chart-trend");
    if (ctx && window.Chart) {
      charts["chart-trend"] = new Chart(ctx, {
        type: "line",
        data: {
          labels: daily.map((d) => dayLabel(d.key)),
          datasets: [
            { label: "Calls", data: daily.map((d) => d.calls), borderColor: css("--primary"), backgroundColor: css("--primary") + "22", yAxisID: "y", tension: .35, fill: true },
            { label: "Revenue", data: daily.map((d) => d.revenue), borderColor: css("--teal"), backgroundColor: css("--teal") + "22", yAxisID: "y1", tension: .35, fill: true }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            y: { position: "left", grid: { display: false }, title: { display: true, text: "Calls" } },
            y1: { position: "right", grid: { display: false }, title: { display: true, text: "Revenue" } }
          },
          plugins: { legend: { position: "bottom" } }
        }
      });
    }
    const ck = computeCallKPIs(state.calls);
    const oc = document.getElementById("chart-outcome");
    if (oc && window.Chart) {
      charts["chart-outcome"] = new Chart(oc, {
        type: "doughnut",
        data: { labels: ["Answered", "Missed", "Other"], datasets: [{ data: [ck.answered, ck.missed, ck.other], backgroundColor: [css("--positive"), css("--negative"), css("--ink-faint")], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: "72%", plugins: { legend: { display: false } } }
      });
    }
    const agents = computeAgentStats(state.sales, state.calls).slice(0, 5);
    document.getElementById("overview-agents").innerHTML = agents.length ? agents.map((a) => `
      <div class="agent-row">
        <div class="agent-avatar">${initials(a.agent)}</div>
        <div class="agent-body"><div class="agent-name">${a.agent}</div><div class="agent-sub">${fmtInt(a.calls)} calls · ${fmtInt(a.won)} won</div></div>
        <div class="agent-metric"><b>${fmtMoney(a.revenue)}</b><span>revenue</span></div>
      </div>`).join("") : `<div class="empty-state">${ICON.empty}<b>No data yet</b><span>Connect a sheet or upload a file.</span></div>`;
  }

  // ---- Sales ----
  function pageSales(state) {
    const sk = computeSalesKPIs(state.sales);
    return `
      <div class="kpi-grid">
        ${kpiCard("Total Revenue", fmtMoney(sk.totalRevenue), ICON.sales, css("--positive"))}
        ${kpiCard("Deals Won", fmtInt(sk.dealsWon), ICON.check, css("--primary"))}
        ${kpiCard("Avg Deal Size", fmtMoney(sk.avgDeal), ICON.overview, css("--teal"))}
        ${kpiCard("Win Rate", fmtPct(sk.winRate), ICON.agents, css("--amber"))}
      </div>
      <div class="row cols-2">
        <div class="panel"><div class="panel-head"><div class="panel-title">Revenue Trend</div></div><div class="chart-box"><canvas id="chart-sales-trend"></canvas></div></div>
        <div class="panel"><div class="panel-head"><div class="panel-title">Revenue by Region</div></div><div class="chart-box"><canvas id="chart-sales-region"></canvas></div></div>
      </div>
      <div class="panel"><div class="panel-head"><div class="panel-title">All Sales</div><div class="panel-sub">${fmtInt(state.sales.length)} records</div></div><div id="sales-table"></div></div>`;
  }

  function wireSales(state) {
    const daily = buildDailySeries(state.sales, [], 14);
    const ctx = document.getElementById("chart-sales-trend");
    if (ctx && window.Chart) charts["chart-sales-trend"] = new Chart(ctx, {
      type: "bar",
      data: { labels: daily.map((d) => dayLabel(d.key)), datasets: [{ label: "Revenue", data: daily.map((d) => d.revenue), backgroundColor: css("--primary"), borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { display: false } }, x: { grid: { display: false } } } }
    });
    const byRegion = {};
    state.sales.filter((s) => s.isWon).forEach((s) => { byRegion[s.region] = (byRegion[s.region] || 0) + s.amount; });
    const regions = Object.entries(byRegion).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const rc = document.getElementById("chart-sales-region");
    if (rc && window.Chart) charts["chart-sales-region"] = new Chart(rc, {
      type: "bar",
      data: { labels: regions.map((r) => r[0]), datasets: [{ label: "Revenue", data: regions.map((r) => r[1]), backgroundColor: css("--teal"), borderRadius: 6 }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { display: false } } } }
    });
    renderTable(document.getElementById("sales-table"), {
      columns: [
        { key: "dateStr", label: "Date" }, { key: "agent", label: "Agent" }, { key: "customer", label: "Customer" },
        { key: "product", label: "Product" }, { key: "region", label: "Region" },
        { key: "status", label: "Status", render: (r) => `<span class="badge ${r.isWon ? "sale" : r.isLost ? "refund" : "sor"}">${r.status}</span>` },
        { key: "amount", label: "Amount", align: "num", render: (r) => fmtMoney(r.amount) }
      ],
      rows: state.sales.map((s) => ({ ...s, dateStr: s.date.toLocaleDateString() })),
      searchableKeys: ["agent", "customer", "product", "region", "status"]
    });
  }

  // ---- Calls ----
  function pageCalls(state) {
    const ck = computeCallKPIs(state.calls);
    return `
      <div class="kpi-grid">
        ${kpiCard("Total Calls", fmtInt(ck.total), ICON.calls, css("--primary"))}
        ${kpiCard("Answered", fmtInt(ck.answered) + " (" + fmtPct(ck.answerRate) + ")", ICON.check, css("--positive"))}
        ${kpiCard("Missed", fmtInt(ck.missed), ICON.x, css("--negative"))}
        ${kpiCard("Avg Wait Time", fmtDur(ck.avgWait), ICON.overview, css("--amber"))}
      </div>
      <div class="row cols-2">
        <div class="panel"><div class="panel-head"><div class="panel-title">Call Volume</div></div><div class="chart-box"><canvas id="chart-call-volume"></canvas></div></div>
        <div class="panel"><div class="panel-head"><div class="panel-title">Calls by Agent</div></div><div class="chart-box"><canvas id="chart-calls-agent"></canvas></div></div>
      </div>
      <div class="panel"><div class="panel-head"><div class="panel-title">All Calls</div><div class="panel-sub">${fmtInt(state.calls.length)} records</div></div><div id="calls-table"></div></div>`;
  }

  function wireCalls(state) {
    const daily = buildDailySeries([], state.calls, 14);
    const ctx = document.getElementById("chart-call-volume");
    if (ctx && window.Chart) charts["chart-call-volume"] = new Chart(ctx, {
      type: "line",
      data: { labels: daily.map((d) => dayLabel(d.key)), datasets: [{ label: "Calls", data: daily.map((d) => d.calls), borderColor: css("--primary"), backgroundColor: css("--primary") + "22", tension: .35, fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { display: false } }, x: { grid: { display: false } } } }
    });
    const byAgent = {};
    state.calls.forEach((c) => { byAgent[c.agent] = (byAgent[c.agent] || 0) + 1; });
    const agents = Object.entries(byAgent).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const ac = document.getElementById("chart-calls-agent");
    if (ac && window.Chart) charts["chart-calls-agent"] = new Chart(ac, {
      type: "bar",
      data: { labels: agents.map((a) => a[0]), datasets: [{ label: "Calls", data: agents.map((a) => a[1]), backgroundColor: css("--c2"), borderRadius: 6 }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { display: false } } } }
    });
    renderTable(document.getElementById("calls-table"), {
      columns: [
        { key: "dateStr", label: "Date" }, { key: "agent", label: "Agent" }, { key: "customer", label: "Customer" },
        { key: "type", label: "Type" }, { key: "queue", label: "Queue" },
        { key: "status", label: "Status", render: (r) => `<span class="badge ${r.isAnswered ? "sale" : r.isMissed ? "refund" : "sor"}">${r.status}</span>` },
        { key: "durationSec", label: "Duration", align: "num", render: (r) => fmtDur(r.durationSec) }
      ],
      rows: state.calls.map((c) => ({ ...c, dateStr: c.date.toLocaleDateString() })),
      searchableKeys: ["agent", "customer", "type", "queue", "status"]
    });
  }

  // ---- Agents ----
  function pageAgents(state) {
    return `<div class="panel"><div class="panel-head"><div><div class="panel-title">Agent Leaderboard</div><div class="panel-sub">Calls handled and sales closed, combined</div></div></div><div id="agents-table"></div></div>`;
  }

  function wireAgents(state) {
    const agents = computeAgentStats(state.sales, state.calls);
    renderTable(document.getElementById("agents-table"), {
      columns: [
        { key: "agent", label: "Agent", render: (r) => `<div class="name-cell"><div class="agent-avatar" style="width:26px;height:26px;font-size:10.5px;margin-right:8px;">${initials(r.agent)}</div>${r.agent}</div>` },
        { key: "calls", label: "Calls", align: "num" },
        { key: "answered", label: "Answered", align: "num" },
        { key: "avgHandle", label: "Avg Handle", align: "num", render: (r) => fmtDur(r.avgHandle) },
        { key: "won", label: "Deals Won", align: "num" },
        { key: "revenue", label: "Revenue", align: "num", render: (r) => fmtMoney(r.revenue) },
        { key: "conversion", label: "Conversion", align: "num", render: (r) => fmtPct(r.conversion) }
      ],
      rows: agents,
      searchableKeys: ["agent"],
      pageSize: 10,
      emptyLabel: "No agent activity yet"
    });
  }

  // ---- Data / Upload ----
  function pageData(state) {
    return `
      ${configBannerIfNeeded()}
      <div class="row cols-2">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Live connection</div><div class="panel-sub">Google Sheet via Apps Script</div></div></div>
          <div class="data-meta-row">
            <div class="data-meta-chip"><b>${state.source || "Not connected"}</b><span>Source</span></div>
            <div class="data-meta-chip"><b>${state.lastUpdated ? state.lastUpdated.toLocaleString() : "—"}</b><span>Last updated</span></div>
            <div class="data-meta-chip"><b>${fmtInt(state.sales.length)}</b><span>Sales rows</span></div>
            <div class="data-meta-chip"><b>${fmtInt(state.calls.length)}</b><span>Call rows</span></div>
          </div>
          ${state.error ? `<div class="config-banner" style="margin-top:14px;">${ICON.alert}<div>${state.error}</div></div>` : ""}
          <button class="btn-primary" id="data-refresh-btn">Refresh now</button>
        </div>
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Upload a spreadsheet</div><div class="panel-sub">.xlsx with a Sales tab and a Calls tab</div></div></div>
          <div class="upload-zone" id="upload-zone">
            ${ICON.upload}
            <b>Drop your .xlsx file here</b>
            <span>or click to browse</span>
            <input type="file" id="upload-input" accept=".xlsx,.xls" class="hidden">
          </div>
          <div class="upload-tabset"><span>Tab: ${CFG.SHEET_TABS.sales}</span><span>Tab: ${CFG.SHEET_TABS.calls}</span></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Expected columns</div></div>
        <table class="schema-table">
          <thead><tr><th>Sheet</th><th>Field</th><th>Header aliases recognized</th></tr></thead>
          <tbody>
            ${Object.entries(CFG.COLUMNS.sales).map(([field, aliases]) => `<tr><td><span class="badge sale">Sales</span></td><td>${field}</td><td>${aliases.map((a) => `<code>${a}</code>`).join(" ")}</td></tr>`).join("")}
            ${Object.entries(CFG.COLUMNS.calls).map(([field, aliases]) => `<tr><td><span class="badge upgrade">Calls</span></td><td>${field}</td><td>${aliases.map((a) => `<code>${a}</code>`).join(" ")}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function wireData(state) {
    document.getElementById("data-refresh-btn").addEventListener("click", doRefresh);
    window.DashboardUpload.wireUploadZone(document.getElementById("upload-zone"), document.getElementById("upload-input"));
  }

  // ------------------------------------------------------------ boot
  function boot() {
    renderShell();
    setPage("overview");
    updateStatusUI(window.DashboardData.getState());
    window.DashboardData.subscribe((state) => {
      updateStatusUI(state);
      renderPage();
      document.getElementById("loading-overlay").classList.add("hidden");
    });
    window.DashboardData.init();
    setTimeout(() => document.getElementById("loading-overlay").classList.add("hidden"), 2500);
  }

  window.Dashboard = { toast };
  document.addEventListener("DOMContentLoaded", boot);
})();
