/* =========================================================================
   CONFIG — the only block you should need to edit
   ========================================================================= */
const CONFIG = {
  // Paste your deployed Apps Script Web App URL here (see Code.gs header comment).
  API_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE',

  // Exact column names from your Google Sheet (already matched to your file).
  // If you rename a column in Sheets, update the matching value below.
  FIELDS: {
    sales: {
      date: 'Date',
      agent: 'Agent Name',
      callCenter: 'gRPCampaign Number',
      customer: 'Customer Name',
      provider: 'Provider',
      services: 'Services',
      rgus: "RGU's",
    },
    calls: {
      date: 'Date',
      agent: 'Agent Name',
      callCenter: 'Call Center Name',
      result: 'Call Result',
      waitTime: 'Wait Time',
      talkTime: 'Talk Time',
      holdTime: 'Hold Time',
      wrapTime: 'Wrap Up Time',
    }
  },

  // A call center / campaign counts as "fiber" if its name contains this
  // (case-insensitive). Change this if your naming convention differs.
  FIBER_KEYWORD: 'fiber',
  // A call counts as "answered" if Call Result contains this (case-insensitive).
  ANSWERED_KEYWORD: 'answer',

  CHART_COLORS: {
    yellow: '#FFB300', yellowDeep: '#FF8A00', green: '#1AA772',
    red: '#E5484D', blue: '#3B6FE0', purple: '#7B5CFA', ink: '#1B1B1D', grid: '#ECE7D8'
  }
};

/* =========================================================================
   STATE
   ========================================================================= */
let rawSales = [];
let rawCalls = [];
let charts = {};
let trendPeriod = 'daily';
let agentSort = { key: 'calls', dir: 'desc' };
let salesSort = { key: 'date', dir: 'desc' };
let prevKpis = {};
let lastLoadedAt = null;
let autoRefreshTimer = null;
let activePreset = 'all';

/* =========================================================================
   HELPERS
   ========================================================================= */
function isoDatePart(v){
  // Our backend serializes dates as "yyyy-MM-ddTHH:mm:ss" strings (local
  // sheet timezone, no UTC shifting). Slicing avoids re-parsing headaches.
  if (v === null || v === undefined) return null;
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
function isoTimePart(v){
  if (v === null || v === undefined) return null;
  const s = String(v);
  const m = s.match(/T(\d{2}):(\d{2}):(\d{2})/);
  return m ? ((+m[1])*3600 + (+m[2])*60 + (+m[3])) : null;
}
function dateKey(v, period){
  const p = isoDatePart(v);
  if (!p) return null;
  if (period === 'monthly') return `${p.y}-${String(p.m).padStart(2,'0')}`;
  if (period === 'weekly'){
    const d = new Date(Date.UTC(p.y, p.m-1, p.d));
    const day = (d.getUTCDay() + 6) % 7; // Monday=0
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0,10);
  }
  return `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;
}
function dateSortValue(v){
  const p = isoDatePart(v);
  if (!p) return -Infinity;
  return p.y*10000 + p.m*100 + p.d;
}
function labelForKey(key, period){
  if (period === 'monthly'){
    const [y,m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m-1, 1)).toLocaleDateString('en-US',{month:'short', year:'2-digit', timeZone:'UTC'});
  }
  const [y,m,d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m-1, d));
  return dt.toLocaleDateString('en-US', { month:'short', day:'numeric', timeZone:'UTC' });
}
function fmtSeconds(sec){
  if (sec === null || sec === undefined || isNaN(sec)) return '—';
  const m = Math.floor(sec/60), s = Math.round(sec%60);
  return `${m}:${String(s).padStart(2,'0')}`;
}
function isFiberName(name){ return String(name||'').toLowerCase().includes(CONFIG.FIBER_KEYWORD); }
function isAnsweredResult(result){ return String(result||'').toLowerCase().includes(CONFIG.ANSWERED_KEYWORD); }
function pct(n, d){ return d > 0 ? (n/d*100) : 0; }
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function animateNumber(el, from, to, formatFn, duration = 550){
  const start = performance.now();
  const diff = to - from;
  if (Math.abs(diff) < 0.001){ el.textContent = formatFn(to); return; }
  function tick(now){
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const val = from + diff * eased;
    el.textContent = formatFn(val);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatFn(to);
  }
  requestAnimationFrame(tick);
}
function toCSV(rows, columns){
  // columns: [{key, header}]
  const esc = v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [columns.map(c => esc(c.header)).join(',')];
  rows.forEach(r => lines.push(columns.map(c => esc(r[c.key])).join(',')));
  return lines.join('\r\n');
}
function downloadCSV(filename, csvText){
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function updateLastUpdatedText(){
  const el = document.getElementById('last-updated-text');
  if (!el || !lastLoadedAt) return;
  const secs = Math.round((Date.now() - lastLoadedAt) / 1000);
  let txt;
  if (secs < 5) txt = 'Updated just now';
  else if (secs < 60) txt = `Updated ${secs}s ago`;
  else if (secs < 3600) txt = `Updated ${Math.round(secs/60)}m ago`;
  else txt = `Updated ${Math.round(secs/3600)}h ago`;
  el.textContent = txt;
}
setInterval(updateLastUpdatedText, 15000);

/* =========================================================================
   FETCH
   ========================================================================= */
async function loadData(){
  const overlay = document.getElementById('loading-overlay');
  const errorBanner = document.getElementById('error-banner');
  overlay.style.display = 'flex';
  errorBanner.classList.remove('show');

  if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('PASTE_YOUR') === 0){
    showError('Set CONFIG.API_URL at the top of this file to your deployed Apps Script Web App URL.');
    overlay.style.display = 'none';
    return;
  }

  try{
    const res = await fetch(CONFIG.API_URL, { method: 'GET' });
    if (!res.ok) throw new Error('Request failed with status ' + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.message || 'Backend reported an error.');

    rawSales = json.salesRows || [];
    rawCalls = json.callsRows || [];
    validateConfiguredFields(json.salesHeaders || [], json.callsHeaders || []);

    document.getElementById('data-meta').textContent =
      `Simply Connect · ${rawSales.length.toLocaleString()} sales · ${rawCalls.length.toLocaleString()} calls · updated ${new Date().toLocaleTimeString()}`;

    lastLoadedAt = Date.now();
    updateLastUpdatedText();
    populateFilters();
    applyFilters();
  } catch(err){
    console.error(err);
    showError('Couldn\u2019t load data: ' + err.message);
  } finally {
    overlay.style.display = 'none';
  }
}

function showError(message){
  const banner = document.getElementById('error-banner');
  document.getElementById('error-text').textContent = message;
  banner.classList.add('show');
}

/* =========================================================================
   FILTERS
   ========================================================================= */
function populateFilters(){
  const F = CONFIG.FIELDS;
  const agents = new Set();
  const centers = new Set();
  rawSales.forEach(r => { if (r[F.sales.agent]) agents.add(r[F.sales.agent]); if (r[F.sales.callCenter]) centers.add(r[F.sales.callCenter]); });
  rawCalls.forEach(r => { if (r[F.calls.agent]) agents.add(r[F.calls.agent]); if (r[F.calls.callCenter]) centers.add(r[F.calls.callCenter]); });

  fillSelect('f-agent', Array.from(agents).sort(), 'All agents');
  fillSelect('f-center', Array.from(centers).sort(), 'All call centers');
}
function fillSelect(id, values, allLabel){
  const el = document.getElementById(id);
  const current = el.value;
  el.innerHTML = `<option value="">${allLabel}</option>` + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (values.includes(current)) el.value = current;
}
function getFilters(){
  return {
    start: document.getElementById('f-start').value || null,
    end: document.getElementById('f-end').value || null,
    agent: document.getElementById('f-agent').value || null,
    center: document.getElementById('f-center').value || null,
  };
}
function inRange(v, start, end){
  const p = isoDatePart(v);
  if (!p) return false;
  const num = p.y*10000 + p.m*100 + p.d;
  if (start){ const [sy,sm,sd] = start.split('-').map(Number); if (num < sy*10000+sm*100+sd) return false; }
  if (end){ const [ey,em,ed] = end.split('-').map(Number); if (num > ey*10000+em*100+ed) return false; }
  return true;
}
function applyFilters(){
  const f = getFilters();
  const F = CONFIG.FIELDS;

  const filteredSales = rawSales.filter(r =>
    inRange(r[F.sales.date], f.start, f.end) &&
    (!f.agent || r[F.sales.agent] === f.agent) &&
    (!f.center || r[F.sales.callCenter] === f.center)
  );
  const filteredCalls = rawCalls.filter(r =>
    inRange(r[F.calls.date], f.start, f.end) &&
    (!f.agent || r[F.calls.agent] === f.agent) &&
    (!f.center || r[F.calls.callCenter] === f.center)
  );

  renderAll(filteredSales, filteredCalls);
}

/* =========================================================================
   KPI COMPUTATION
   ========================================================================= */
function computeKPIs(sales, calls){
  const F = CONFIG.FIELDS;
  const totalSales = sales.length;
  const totalCalls = calls.length;
  const answered = calls.filter(c => isAnsweredResult(c[F.calls.result])).length;
  const missed = totalCalls - answered;
  const conversion = pct(totalSales, answered);

  const fiberOpportunities = calls.filter(c => isFiberName(c[F.calls.callCenter])).length;
  const fiberQ = calls.filter(c => isFiberName(c[F.calls.callCenter]) && isAnsweredResult(c[F.calls.result])).length;
  const fiberQSales = sales.filter(s => isFiberName(s[F.sales.callCenter])).length;

  const agentSet = new Set();
  sales.forEach(s => { if (s[F.sales.agent]) agentSet.add(s[F.sales.agent]); });
  calls.forEach(c => { if (c[F.calls.agent]) agentSet.add(c[F.calls.agent]); });
  const activeAgents = agentSet.size;

  let talkTotal = 0, talkCount = 0, waitTotal = 0, waitCount = 0;
  calls.forEach(c => {
    const t = isoTimePart(c[F.calls.talkTime]);
    if (t !== null){ talkTotal += t; talkCount++; }
    const w = isoTimePart(c[F.calls.waitTime]);
    if (w !== null){ waitTotal += w; waitCount++; }
  });
  const avgTalkTime = talkCount ? talkTotal / talkCount : null;
  const avgWaitTime = waitCount ? waitTotal / waitCount : null;

  const totalRGUs = sales.reduce((sum, s) => {
    const n = Number(s[F.sales.rgus]);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  return {
    totalSales, totalCalls, answered, missed, conversion,
    fiberOpportunities, fiberQ, fiberQSales,
    activeAgents, avgTalkTime, avgWaitTime, totalRGUs,
  };
}

/* =========================================================================
   KPI TREND (sparkline + up/down delta on each card)
   Buckets the currently-filtered rows by day, then compares the first half
   of the range to the second half to get a lightweight trend direction —
   no extra fetches, works with any active filter combination (or none).
   ========================================================================= */
function buildKPIDailySeries(sales, calls){
  const F = CONFIG.FIELDS;
  const buckets = new Map();
  function ensure(key){
    if (!buckets.has(key)) buckets.set(key, {
      salesCount:0, callsCount:0, answeredCount:0, fiberOppCount:0, fiberQCount:0,
      fiberSalesCount:0, rguSum:0, talkTotal:0, talkCount:0, waitTotal:0, waitCount:0, agents:new Set(),
    });
    return buckets.get(key);
  }
  calls.forEach(c => {
    const k = dateKey(c[F.calls.date], 'daily');
    if (!k) return;
    const b = ensure(k);
    b.callsCount++;
    if (isAnsweredResult(c[F.calls.result])) b.answeredCount++;
    if (isFiberName(c[F.calls.callCenter])){
      b.fiberOppCount++;
      if (isAnsweredResult(c[F.calls.result])) b.fiberQCount++;
    }
    const t = isoTimePart(c[F.calls.talkTime]); if (t !== null){ b.talkTotal += t; b.talkCount++; }
    const w = isoTimePart(c[F.calls.waitTime]); if (w !== null){ b.waitTotal += w; b.waitCount++; }
    if (c[F.calls.agent]) b.agents.add(c[F.calls.agent]);
  });
  sales.forEach(s => {
    const k = dateKey(s[F.sales.date], 'daily');
    if (!k) return;
    const b = ensure(k);
    b.salesCount++;
    if (isFiberName(s[F.sales.callCenter])) b.fiberSalesCount++;
    const n = Number(s[F.sales.rgus]); if (!isNaN(n)) b.rguSum += n;
    if (s[F.sales.agent]) b.agents.add(s[F.sales.agent]);
  });

  const days = Array.from(buckets.keys()).sort();
  const perKey = {
    totalSales: [], totalCalls: [], answered: [], missed: [], conversion: [],
    activeAgents: [], avgTalkTime: [], avgWaitTime: [], totalRGUs: [],
    fiberOpportunities: [], fiberQ: [], fiberQSales: [],
  };
  days.forEach(k => {
    const b = buckets.get(k);
    perKey.totalSales.push(b.salesCount);
    perKey.totalCalls.push(b.callsCount);
    perKey.answered.push(b.answeredCount);
    perKey.missed.push(b.callsCount - b.answeredCount);
    perKey.conversion.push(b.answeredCount ? (b.salesCount / b.answeredCount) * 100 : 0);
    perKey.activeAgents.push(b.agents.size);
    perKey.avgTalkTime.push(b.talkCount ? b.talkTotal / b.talkCount : 0);
    perKey.avgWaitTime.push(b.waitCount ? b.waitTotal / b.waitCount : 0);
    perKey.totalRGUs.push(b.rguSum);
    perKey.fiberOpportunities.push(b.fiberOppCount);
    perKey.fiberQ.push(b.fiberQCount);
    perKey.fiberQSales.push(b.fiberSalesCount);
  });
  return perKey;
}
function computeTrend(points){
  if (!points || points.length < 2) return { points: points || [], deltaPct: null };
  const mid = Math.ceil(points.length / 2);
  const firstHalf = points.slice(0, mid);
  const secondHalf = points.slice(mid);
  const avg = arr => arr.reduce((s,v) => s+v, 0) / arr.length;
  const a1 = avg(firstHalf), a2 = avg(secondHalf);
  let deltaPct;
  if (a1 === 0 && a2 === 0) deltaPct = 0;
  else if (a1 === 0) deltaPct = null; // went from nothing to something — show as "new" rather than a % 
  else deltaPct = ((a2 - a1) / a1) * 100;
  return { points, deltaPct };
}
function sparklinePath(points, w = 68, h = 22, pad = 3){
  if (!points || points.length < 2) return '';
  const shown = points.slice(-14); // keep the sparkline legible
  const min = Math.min(...shown), max = Math.max(...shown);
  const range = (max - min) || 1;
  const stepX = (w - pad*2) / (shown.length - 1);
  return shown.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad*2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

/* =========================================================================
   RENDER: KPI CARDS
   ========================================================================= */
const KPI_DEFS = [
  { key:'totalSales', label:'Total Sales', tone:'yellow', icon:'sales', sub:'Records in Sales Data', tip:'Count of rows in Sales Data matching your current filters.', target:'panel-sales-table', higherIsBetter:true },
  { key:'totalCalls', label:'Total Calls', tone:'blue', icon:'calls', sub:'Records in Calls Data', tip:'Count of rows in Calls Data matching your current filters.', target:'panel-trend', higherIsBetter:null },
  { key:'conversion', label:'Conversion %', tone:'green', icon:'convert', sub:'Sales ÷ answered calls', fmt:v=>v.toFixed(1)+'%', tip:'Total Sales divided by Answered Calls, ×100.', target:'panel-agent-table', higherIsBetter:true },
  { key:'answered', label:'Answered Calls', tone:'green', icon:'check', sub:'Call Result = Answered', tip:'Calls whose Call Result contains "answer" (case-insensitive).', target:'panel-answered', higherIsBetter:true },
  { key:'missed', label:'Missed Calls', tone:'red', icon:'missed', sub:'Not marked Answered', tip:'Total Calls minus Answered Calls.', target:'panel-answered', higherIsBetter:false },
  { key:'activeAgents', label:'Active Agents', tone:'blue', icon:'agents', sub:'Distinct agents in view', tip:'Number of distinct agents appearing in Sales Data or Calls Data for the current filters.', target:'panel-agent-table', higherIsBetter:null },
  { key:'avgTalkTime', label:'Avg Talk Time', tone:'green', icon:'clock', sub:'Mean per call (mm:ss)', fmt:v=>fmtSeconds(v), tip:'Average Talk Time across all filtered calls.', target:'panel-agent-table', higherIsBetter:null },
  { key:'avgWaitTime', label:'Avg Wait Time', tone:'red', icon:'clock', sub:'Mean per call (mm:ss)', fmt:v=>fmtSeconds(v), tip:'Average Wait Time across all filtered calls.', target:'panel-trend', higherIsBetter:false },
  { key:'totalRGUs', label:'Total RGUs Sold', tone:'purple', icon:'rgu', sub:'Units across all sales', tip:"Sum of the RGU's column across filtered Sales Data rows.", target:'panel-provider', higherIsBetter:true },
  { key:'fiberOpportunities', label:'Fiber Opportunities', tone:'purple', icon:'fiber', sub:'Calls into a fiber queue', tip:'Calls whose Call Center Name contains "fiber".', target:'panel-fiber', higherIsBetter:true },
  { key:'fiberQ', label:'Fiber Q', tone:'purple', icon:'queue', sub:'Fiber calls answered', tip:'Of the Fiber Opportunities, the ones where Call Result = Answered.', target:'panel-fiber', higherIsBetter:true },
  { key:'fiberQSales', label:'Fiber Q Sales', tone:'yellow', icon:'fiberSale', sub:'Sales from fiber campaigns', tip:'Sales whose gRPCampaign Number contains "fiber".', target:'panel-provider', higherIsBetter:true },
];
const ICONS = {
  sales: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  calls: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 3a2 2 0 0 1-.5 2.1L8 10.1a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2-.5c1 .3 2 .5 3 .7a2 2 0 0 1 1.7 2z"/>',
  convert: '<path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 23-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  check: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m22 4-10 10.1-3-3"/>',
  missed: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  fiber: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  queue: '<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="12" height="4" rx="1"/>',
  fiberSale: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="M12 12v9"/>',
  agents: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  rgu: '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
};
function renderKPICards(kpis, sales, calls){
  const grid = document.getElementById('kpi-grid');
  const isFirstRender = grid.childElementCount === 0;
  const dailySeries = buildKPIDailySeries(sales, calls);

  grid.innerHTML = KPI_DEFS.map((def, i) => {
    const trend = computeTrend(dailySeries[def.key]);
    const path = sparklinePath(trend.points);
    let deltaHTML = '<span class="delta neutral">–</span>';
    if (trend.deltaPct === null && trend.points.length >= 2){
      deltaHTML = `<span class="delta good">New</span>`;
    } else if (trend.deltaPct !== null){
      const isFlat = Math.abs(trend.deltaPct) < 0.05;
      const isUp = trend.deltaPct > 0;
      let cls = 'neutral';
      if (!isFlat && def.higherIsBetter !== null){
        cls = (isUp === def.higherIsBetter) ? 'good' : 'bad';
      }
      const arrow = isFlat ? '' : (isUp ? '▲ ' : '▼ ');
      deltaHTML = `<span class="delta ${cls}">${arrow}${Math.abs(trend.deltaPct).toFixed(1)}%</span>`;
    }
    const sparkSvg = path
      ? `<svg class="spark" viewBox="0 0 68 22" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg class="spark" viewBox="0 0 68 22"></svg>`;

    return `
      <div class="kpi-card tone-${def.tone}" data-idx="${i}" data-target="${def.target}" tabindex="0" role="button" aria-label="${escapeHtml(def.label)}: jump to related chart">
        <div class="top-row">
          <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[def.icon]}</svg></div>
        </div>
        <div class="label-row">
          <div class="label">${def.label}</div>
          <span class="info-dot" tabindex="0">i<span class="tip">${escapeHtml(def.tip)}</span></span>
        </div>
        <div class="num" data-num-key="${def.key}">0</div>
        <div class="sub">${def.sub}</div>
        <div class="kpi-trend">${sparkSvg}${deltaHTML}</div>
      </div>`;
  }).join('');

  // animate each number from its previous value to the new one
  KPI_DEFS.forEach(def => {
    const el = grid.querySelector(`[data-num-key="${def.key}"]`);
    const to = kpis[def.key];
    const formatFn = def.fmt ? def.fmt : (v => Math.round(v).toLocaleString());
    if (to === null || to === undefined){ el.textContent = formatFn(to); return; }
    const from = isFirstRender ? 0 : (prevKpis[def.key] ?? 0);
    animateNumber(el, from, to, formatFn);
  });
  prevKpis = { ...kpis };

  // don't let a click/tap on the (i) tooltip trigger the card's jump action
  grid.querySelectorAll('.info-dot').forEach(dot => {
    dot.addEventListener('click', e => e.stopPropagation());
  });

  // click / keyboard-activate a card to jump to its related panel
  grid.querySelectorAll('.kpi-card').forEach(card => {
    const jump = () => {
      const target = document.getElementById(card.dataset.target);
      if (!target) return;
      target.scrollIntoView({ behavior:'smooth', block:'center' });
      target.classList.remove('jump-highlight'); void target.offsetWidth; // restart animation
      target.classList.add('jump-highlight');
    };
    card.addEventListener('click', jump);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); jump(); } });
  });
}

/* =========================================================================
   RENDER: TREND CHART
   ========================================================================= */
function buildTrendSeries(sales, calls, period){
  const F = CONFIG.FIELDS;
  const buckets = new Map();
  function bump(map, key, field){ if (!map.has(key)) map.set(key, {calls:0, answered:0, sales:0}); map.get(key)[field]++; }

  calls.forEach(c => {
    const k = dateKey(c[F.calls.date], period);
    if (!k) return;
    if (!buckets.has(k)) buckets.set(k, {calls:0, answered:0, sales:0});
    buckets.get(k).calls++;
    if (isAnsweredResult(c[F.calls.result])) buckets.get(k).answered++;
  });
  sales.forEach(s => {
    const k = dateKey(s[F.sales.date], period);
    if (!k) return;
    if (!buckets.has(k)) buckets.set(k, {calls:0, answered:0, sales:0});
    buckets.get(k).sales++;
  });

  const keys = Array.from(buckets.keys()).sort();
  return {
    labels: keys.map(k => labelForKey(k, period)),
    calls: keys.map(k => buckets.get(k).calls),
    answered: keys.map(k => buckets.get(k).answered),
    sales: keys.map(k => buckets.get(k).sales),
  };
}
function setChartEmpty(id, isEmpty){
  const el = document.getElementById(id);
  if (el) el.hidden = !isEmpty;
}
function renderTrendChart(sales, calls){
  const series = buildTrendSeries(sales, calls, trendPeriod);
  const ctx = document.getElementById('trend-chart').getContext('2d');
  const C = CONFIG.CHART_COLORS;

  if (charts.trend) charts.trend.destroy();

  const totalCalls = series.calls.reduce((a,b)=>a+b,0);
  const totalAnswered = series.answered.reduce((a,b)=>a+b,0);
  const totalSalesN = series.sales.reduce((a,b)=>a+b,0);
  document.getElementById('stat-trend').innerHTML = series.labels.length
    ? `<b>${totalCalls.toLocaleString()}</b> calls<span class="stat-sep">·</span><b>${totalAnswered.toLocaleString()}</b> answered<span class="stat-sep">·</span><b>${totalSalesN.toLocaleString()}</b> sales across <b>${series.labels.length}</b> ${trendPeriod === 'daily' ? 'days' : trendPeriod === 'weekly' ? 'weeks' : 'months'}`
    : 'No data for the current filters';

  if (series.labels.length === 0){
    charts.trend = null;
    setChartEmpty('empty-trend', true);
    return;
  }
  setChartEmpty('empty-trend', false);

  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        { label:'Total calls', data: series.calls, borderColor: C.blue, backgroundColor: C.blue+'22', tension:.35, fill:true, pointRadius:0, borderWidth:2 },
        { label:'Answered calls', data: series.answered, borderColor: C.green, backgroundColor: 'transparent', tension:.35, fill:false, pointRadius:0, borderWidth:2, borderDash:[4,3] },
        { label:'Sales', data: series.sales, borderColor: C.yellowDeep, backgroundColor: C.yellowDeep+'22', tension:.35, fill:true, pointRadius:0, borderWidth:2, yAxisID:'y1' },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      animation:{ duration:600, easing:'easeOutCubic' },
      interaction:{ mode:'index', intersect:false },
      plugins:{ legend:{ position:'top', labels:{ boxWidth:10, boxHeight:10, usePointStyle:true, font:{family:'Inter', size:11.5} } } },
      scales:{
        x:{ grid:{ display:false }, ticks:{ font:{family:'Inter', size:11} } },
        y:{ position:'left', grid:{ color: C.grid }, ticks:{ font:{family:'Inter', size:11} }, title:{display:true, text:'Calls', font:{family:'Inter', size:11}} },
        y1:{ position:'right', grid:{ display:false }, ticks:{ font:{family:'Inter', size:11} }, title:{display:true, text:'Sales', font:{family:'Inter', size:11}} },
      }
    }
  });
}

/* =========================================================================
   RENDER: ANSWERED / MISSED DONUT
   ========================================================================= */
function renderAnsweredChart(kpis){
  const ctx = document.getElementById('answered-chart').getContext('2d');
  const C = CONFIG.CHART_COLORS;
  if (charts.answered) charts.answered.destroy();

  const total = kpis.answered + kpis.missed;
  document.getElementById('stat-answered').innerHTML = total
    ? `<b>${pct(kpis.answered,total).toFixed(1)}%</b> answer rate across <b>${total.toLocaleString()}</b> calls`
    : 'No calls for the current filters';
  setChartEmpty('empty-answered', total === 0);

  charts.answered = new Chart(ctx, {
    type:'doughnut',
    data:{
      labels:['Answered','Missed'],
      datasets:[{ data: total ? [kpis.answered, kpis.missed] : [1,0], backgroundColor:[C.green, C.red], borderWidth:0, hoverOffset:4 }]
    },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', animation:{ duration:600, easing:'easeOutCubic' }, plugins:{ legend:{ display:false } } }
  });

  document.getElementById('answered-legend').innerHTML = `
    <span><span class="dot" style="background:${C.green}"></span>Answered — ${kpis.answered.toLocaleString()} (${pct(kpis.answered,total).toFixed(1)}%)</span>
    <span><span class="dot" style="background:${C.red}"></span>Missed — ${kpis.missed.toLocaleString()} (${pct(kpis.missed,total).toFixed(1)}%)</span>
  `;
}

/* =========================================================================
   RENDER: AGENT PERFORMANCE (table + bar chart)
   ========================================================================= */
function buildAgentStats(sales, calls){
  const F = CONFIG.FIELDS;
  const map = new Map();
  function ensure(name){
    if (!map.has(name)) map.set(name, { agent:name, calls:0, answered:0, missed:0, sales:0, talkTotal:0, talkCount:0 });
    return map.get(name);
  }
  calls.forEach(c => {
    const name = c[F.calls.agent];
    if (!name) return;
    const rec = ensure(name);
    rec.calls++;
    if (isAnsweredResult(c[F.calls.result])) rec.answered++; else rec.missed++;
    const t = isoTimePart(c[F.calls.talkTime]);
    if (t !== null){ rec.talkTotal += t; rec.talkCount++; }
  });
  sales.forEach(s => {
    const name = s[F.sales.agent];
    if (!name) return;
    ensure(name).sales++;
  });
  return Array.from(map.values()).map(r => ({
    ...r,
    avgTalk: r.talkCount ? r.talkTotal / r.talkCount : null,
    conversion: pct(r.sales, r.answered),
  }));
}
function convPillClass(v){ if (v >= 15) return 'good'; if (v >= 5) return 'mid'; return 'low'; }
function renderAgentTable(sales, calls){
  const stats = buildAgentStats(sales, calls);
  const term = document.getElementById('agent-search').value.trim().toLowerCase();
  let rows = stats.filter(r => !term || r.agent.toLowerCase().includes(term));

  rows.sort((a,b) => {
    const dir = agentSort.dir === 'asc' ? 1 : -1;
    const av = agentSort.key === 'agent' ? a.agent.toLowerCase() : a[agentSort.key];
    const bv = agentSort.key === 'agent' ? b.agent.toLowerCase() : b[agentSort.key];
    if (av < bv) return -1*dir; if (av > bv) return 1*dir; return 0;
  });

  const tbody = document.getElementById('agent-table-body');
  const empty = document.getElementById('agent-table-empty');
  if (rows.length === 0){ tbody.innerHTML=''; empty.style.display='block'; }
  else{
    empty.style.display='none';
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.agent)}</td>
        <td>${r.calls.toLocaleString()}</td>
        <td>${r.answered.toLocaleString()}</td>
        <td>${r.missed.toLocaleString()}</td>
        <td>${fmtSeconds(r.avgTalk)}</td>
        <td>${r.sales.toLocaleString()}</td>
        <td><span class="pill ${convPillClass(r.conversion)}">${r.conversion.toFixed(1)}%</span></td>
      </tr>`).join('');
  }

  renderAgentChart(stats);
}
function renderAgentChart(stats){
  const ctx = document.getElementById('agent-chart').getContext('2d');
  const C = CONFIG.CHART_COLORS;
  if (charts.agent) charts.agent.destroy();

  const top = [...stats].sort((a,b)=>b.sales-a.sales).slice(0,8);
  const statEl = document.getElementById('stat-agent-chart');
  if (top.length === 0 || top[0].sales === 0){
    statEl.textContent = 'No sales for the current filters';
    setChartEmpty('empty-agent-chart', true);
    charts.agent = null;
    return;
  }
  statEl.innerHTML = `Top: <b>${escapeHtml(top[0].agent)}</b> with <b>${top[0].sales.toLocaleString()}</b> sales<span class="stat-sep">·</span>showing top <b>${top.length}</b> of <b>${stats.length}</b> agents`;
  setChartEmpty('empty-agent-chart', false);

  charts.agent = new Chart(ctx, {
    type:'bar',
    data:{ labels: top.map(r=>r.agent), datasets:[{ label:'Sales', data: top.map(r=>r.sales), backgroundColor: C.yellowDeep, borderRadius:6, maxBarThickness:26 }] },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      animation:{ duration:600, easing:'easeOutCubic' },
      plugins:{ legend:{ display:false } },
      scales:{ x:{ grid:{ color:C.grid }, ticks:{font:{family:'Inter',size:11}} }, y:{ grid:{ display:false }, ticks:{font:{family:'Inter',size:11}} } }
    }
  });
}

/* =========================================================================
   RENDER: FIBER DONUT + PROVIDER BAR
   ========================================================================= */
function renderFiberChart(calls){
  const F = CONFIG.FIELDS;
  const ctx = document.getElementById('fiber-chart').getContext('2d');
  const C = CONFIG.CHART_COLORS;
  if (charts.fiber) charts.fiber.destroy();

  const fiber = calls.filter(c => isFiberName(c[F.calls.callCenter])).length;
  const nonFiber = calls.length - fiber;
  const statEl = document.getElementById('stat-fiber');
  if (calls.length === 0){
    statEl.textContent = 'No calls for the current filters';
    setChartEmpty('empty-fiber', true);
    charts.fiber = null;
    return;
  }
  statEl.innerHTML = `<b>${fiber.toLocaleString()}</b> fiber calls (<b>${pct(fiber,calls.length).toFixed(1)}%</b>) of <b>${calls.length.toLocaleString()}</b> total`;
  setChartEmpty('empty-fiber', false);

  charts.fiber = new Chart(ctx, {
    type:'doughnut',
    data:{ labels:['Fiber queue','Non-fiber'], datasets:[{ data: [fiber, nonFiber], backgroundColor:[C.purple, C.grid], borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', animation:{ duration:600, easing:'easeOutCubic' }, plugins:{ legend:{ position:'bottom', labels:{boxWidth:10,boxHeight:10,usePointStyle:true,font:{family:'Inter',size:11}} } } }
  });
}
function renderProviderChart(sales){
  const F = CONFIG.FIELDS;
  const ctx = document.getElementById('provider-chart').getContext('2d');
  const C = CONFIG.CHART_COLORS;
  if (charts.provider) charts.provider.destroy();

  const counts = new Map();
  sales.forEach(s => { const p = s[F.sales.provider] || 'Unknown'; counts.set(p, (counts.get(p)||0)+1); });
  const entries = Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const statEl = document.getElementById('stat-provider');
  if (entries.length === 0){
    statEl.textContent = 'No sales for the current filters';
    setChartEmpty('empty-provider', true);
    charts.provider = null;
    return;
  }
  statEl.innerHTML = `Top: <b>${escapeHtml(entries[0][0])}</b> with <b>${entries[0][1].toLocaleString()}</b> sales<span class="stat-sep">·</span>showing top <b>${entries.length}</b> providers`;
  setChartEmpty('empty-provider', false);

  const palette = [C.yellowDeep, C.blue, C.green, C.purple, C.red, '#B08900'];
  charts.provider = new Chart(ctx, {
    type:'doughnut',
    data:{ labels: entries.map(e=>e[0]), datasets:[{ data: entries.map(e=>e[1]), backgroundColor: palette, borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'55%', animation:{ duration:600, easing:'easeOutCubic' }, plugins:{ legend:{ position:'bottom', labels:{boxWidth:10,boxHeight:10,usePointStyle:true,font:{family:'Inter',size:10.5}} } } }
  });
}

/* =========================================================================
   RENDER: RECENT SALES TABLE
   ========================================================================= */
function renderSalesTable(sales){
  const F = CONFIG.FIELDS;
  const term = document.getElementById('sales-search').value.trim().toLowerCase();

  let rows = sales.filter(r => {
    if (!term) return true;
    return [r[F.sales.agent], r[F.sales.customer], r[F.sales.provider], r[F.sales.callCenter]]
      .some(v => String(v||'').toLowerCase().includes(term));
  });

  rows = [...rows].sort((a,b) => {
    const dir = salesSort.dir === 'asc' ? 1 : -1;
    if (salesSort.key === 'date') return (dateSortValue(a[F.sales.date]) - dateSortValue(b[F.sales.date])) * dir;
    const av = String(a[F.sales[salesSort.key]] ?? '').toLowerCase();
    const bv = String(b[F.sales[salesSort.key]] ?? '').toLowerCase();
    if (av < bv) return -1*dir; if (av > bv) return 1*dir; return 0;
  }).slice(0, 200); // cap rendered rows for performance; search/filter to narrow further

  const tbody = document.getElementById('sales-table-body');
  const empty = document.getElementById('sales-table-empty');
  if (rows.length === 0){ tbody.innerHTML=''; empty.style.display='block'; }
  else{
    empty.style.display='none';
    tbody.innerHTML = rows.map(r => {
      const p = isoDatePart(r[F.sales.date]);
      const dateStr = p ? `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}` : '—';
      return `
      <tr>
        <td>${dateStr}</td>
        <td>${escapeHtml(r[F.sales.agent])}</td>
        <td>${escapeHtml(r[F.sales.customer])}</td>
        <td>${escapeHtml(r[F.sales.provider])}</td>
        <td>${escapeHtml(r[F.sales.services])}</td>
        <td>${escapeHtml(r[F.sales.callCenter])}</td>
      </tr>`;
    }).join('');
  }
}

/* =========================================================================
   RENDER ALL
   ========================================================================= */
function safeRun(fn, label){
  try { fn(); }
  catch (err) { console.error(`[dashboard] ${label} failed:`, err); }
}
function renderAll(sales, calls){
  const kpis = computeKPIs(sales, calls);
  safeRun(() => renderKPICards(kpis, sales, calls), 'renderKPICards');
  safeRun(() => renderTrendChart(sales, calls), 'renderTrendChart');
  safeRun(() => renderAnsweredChart(kpis), 'renderAnsweredChart');
  safeRun(() => renderAgentTable(sales, calls), 'renderAgentTable');
  safeRun(() => renderFiberChart(calls), 'renderFiberChart');
  safeRun(() => renderProviderChart(sales), 'renderProviderChart');
  safeRun(() => renderSalesTable(sales), 'renderSalesTable');

  // stash last filtered sets so search boxes can re-render without refiltering everything
  window.__lastSales = sales;
  window.__lastCalls = calls;
}

/* =========================================================================
   EVENTS
   ========================================================================= */
document.getElementById('f-start').addEventListener('change', applyFilters);
document.getElementById('f-end').addEventListener('change', applyFilters);
document.getElementById('f-agent').addEventListener('change', applyFilters);
document.getElementById('f-center').addEventListener('change', applyFilters);
document.getElementById('reset-btn').addEventListener('click', () => {
  document.getElementById('f-start').value = '';
  document.getElementById('f-end').value = '';
  document.getElementById('f-agent').value = '';
  document.getElementById('f-center').value = '';
  applyFilters();
});
/* ---- mobile sidebar drawer ---- */
const sidebarEl = document.getElementById('sidebar');
const backdropEl = document.getElementById('sidebar-backdrop');
function closeSidebar(){ sidebarEl.classList.remove('open'); backdropEl.classList.remove('show'); }
function openSidebar(){ sidebarEl.classList.add('open'); backdropEl.classList.add('show'); }
document.getElementById('hamburger-btn').addEventListener('click', () => {
  sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar();
});
backdropEl.addEventListener('click', closeSidebar);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
sidebarEl.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', closeSidebar));

function validateConfiguredFields(salesHeaders, callsHeaders){
  const F = CONFIG.FIELDS;
  const missing = [];
  Object.entries(F.sales).forEach(([k,v]) => { if (!salesHeaders.includes(v)) missing.push(`Sales Data: "${v}" (${k})`); });
  Object.entries(F.calls).forEach(([k,v]) => { if (!callsHeaders.includes(v)) missing.push(`Calls Data: "${v}" (${k})`); });
  const banner = document.getElementById('warning-banner');
  if (missing.length){
    console.warn('[dashboard] Configured column names not found in the sheet:', missing);
    if (banner){
      document.getElementById('warning-text').textContent =
        `${missing.length} configured column name${missing.length>1?'s':''} not found in your sheet — check CONFIG.FIELDS in script.js: ${missing.join('; ')}`;
      banner.classList.add('show');
    }
  } else if (banner){
    banner.classList.remove('show');
  }
}

document.getElementById('refresh-btn').addEventListener('click', loadData);
document.getElementById('retry-btn').addEventListener('click', loadData);

/* ---- date range presets ---- */
function toDateInputValue(d){ return d.toISOString().slice(0,10); }
document.getElementById('date-presets').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-preset]');
  if (!btn) return;
  document.querySelectorAll('#date-presets button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activePreset = btn.dataset.preset;

  const now = new Date();
  const startEl = document.getElementById('f-start');
  const endEl = document.getElementById('f-end');

  if (activePreset === 'all'){ startEl.value = ''; endEl.value = ''; }
  else if (activePreset === 'today'){ const s = toDateInputValue(now); startEl.value = s; endEl.value = s; }
  else if (activePreset === 'yesterday'){ const y = new Date(now); y.setDate(y.getDate()-1); const s = toDateInputValue(y); startEl.value = s; endEl.value = s; }
  else if (activePreset === '7d'){ const s = new Date(now); s.setDate(s.getDate()-6); startEl.value = toDateInputValue(s); endEl.value = toDateInputValue(now); }
  else if (activePreset === '30d'){ const s = new Date(now); s.setDate(s.getDate()-29); startEl.value = toDateInputValue(s); endEl.value = toDateInputValue(now); }
  else if (activePreset === 'month'){ const s = new Date(now.getFullYear(), now.getMonth(), 1); startEl.value = toDateInputValue(s); endEl.value = toDateInputValue(now); }

  applyFilters();
});
// manually editing the date fields drops back to "custom" (no active preset pill)
['f-start','f-end'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    document.querySelectorAll('#date-presets button').forEach(b => b.classList.remove('active'));
  });
});

/* ---- auto-refresh ---- */
document.getElementById('auto-refresh-toggle').addEventListener('change', (e) => {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  if (e.target.checked) autoRefreshTimer = setInterval(loadData, 5 * 60 * 1000);
});

/* ---- CSV export ---- */
document.getElementById('export-agent-btn').addEventListener('click', () => {
  const stats = buildAgentStats(window.__lastSales || [], window.__lastCalls || []);
  const csv = toCSV(stats, [
    { key:'agent', header:'Agent' }, { key:'calls', header:'Calls' }, { key:'answered', header:'Answered' },
    { key:'missed', header:'Missed' }, { key:'avgTalk', header:'Avg Talk Time (sec)' },
    { key:'sales', header:'Sales' }, { key:'conversion', header:'Conversion %' },
  ]);
  downloadCSV('agent-performance.csv', csv);
});
document.getElementById('export-sales-btn').addEventListener('click', () => {
  const F = CONFIG.FIELDS;
  const rows = (window.__lastSales || []).map(r => ({
    date: isoDatePart(r[F.sales.date]) ? `${isoDatePart(r[F.sales.date]).y}-${String(isoDatePart(r[F.sales.date]).m).padStart(2,'0')}-${String(isoDatePart(r[F.sales.date]).d).padStart(2,'0')}` : '',
    agent: r[F.sales.agent], customer: r[F.sales.customer], provider: r[F.sales.provider],
    services: r[F.sales.services], center: r[F.sales.callCenter],
  }));
  const csv = toCSV(rows, [
    { key:'date', header:'Date' }, { key:'agent', header:'Agent' }, { key:'customer', header:'Customer' },
    { key:'provider', header:'Provider' }, { key:'services', header:'Services' }, { key:'center', header:'Call Center / Campaign' },
  ]);
  downloadCSV('recent-sales.csv', csv);
});

document.getElementById('trend-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-period]');
  if (!btn) return;
  document.querySelectorAll('#trend-toggle button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  trendPeriod = btn.dataset.period;
  renderTrendChart(window.__lastSales || [], window.__lastCalls || []);
});

function debounce(fn, wait = 180){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
document.getElementById('agent-search').addEventListener('input', debounce(() => {
  renderAgentTable(window.__lastSales || [], window.__lastCalls || []);
}));
document.getElementById('sales-search').addEventListener('input', debounce(() => {
  renderSalesTable(window.__lastSales || []);
}));

document.querySelectorAll('thead th[data-key]').forEach(th => {
  th.addEventListener('click', () => {
    const table = th.closest('table');
    const isAgentTable = table.querySelector('#agent-table-body') || table.contains(document.getElementById('agent-table-body'));
    const sortState = isAgentTable ? agentSort : salesSort;
    const key = th.dataset.key;
    if (sortState.key === key) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    else { sortState.key = key; sortState.dir = 'asc'; }
    if (isAgentTable) renderAgentTable(window.__lastSales || [], window.__lastCalls || []);
    else renderSalesTable(window.__lastSales || []);
  });
});

/* =========================================================================
   GLOBAL ERROR SAFETY NET
   Catches anything unexpected so the page never gets stuck on a blank
   loading screen — surfaces it in the error banner with a Retry button.
   ========================================================================= */
window.addEventListener('error', (e) => {
  console.error('[dashboard] Unhandled error:', e.error || e.message);
  document.getElementById('loading-overlay').style.display = 'none';
  showError('Something went wrong rendering the dashboard. Try Retry, or check the browser console for details.');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[dashboard] Unhandled promise rejection:', e.reason);
  document.getElementById('loading-overlay').style.display = 'none';
  showError('Something went wrong loading data. Try Retry, or check the browser console for details.');
});

/* =========================================================================
   INIT
   ========================================================================= */
loadData();
