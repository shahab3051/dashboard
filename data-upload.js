/* =========================================================================
   DATA UPLOAD
   Lets someone drop in an .xlsx export with a "Sales" tab and a "Calls" tab
   as a fallback / manual-refresh path when the live Apps Script feed isn't
   set up yet (or as a way to test with a sample file).
   ========================================================================= */

(function () {
  const CFG = window.DASHBOARD_CONFIG;

  function findSheet(workbook, wantedName) {
    const target = wantedName.toLowerCase().trim();
    const match = workbook.SheetNames.find((n) => n.toLowerCase().trim() === target);
    if (match) return workbook.Sheets[match];
    // fallback: partial match (e.g. "Sales Data")
    const partial = workbook.SheetNames.find((n) => n.toLowerCase().includes(target) || target.includes(n.toLowerCase()));
    return partial ? workbook.Sheets[partial] : null;
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });

        const salesSheet = findSheet(workbook, CFG.SHEET_TABS.sales);
        const callsSheet = findSheet(workbook, CFG.SHEET_TABS.calls);

        if (!salesSheet && !callsSheet) {
          window.Dashboard && window.Dashboard.toast(
            `Couldn't find tabs named "${CFG.SHEET_TABS.sales}" or "${CFG.SHEET_TABS.calls}" in that file.`, "error"
          );
          return;
        }

        const salesRows = salesSheet ? XLSX.utils.sheet_to_json(salesSheet, { defval: "" }) : [];
        const callsRows = callsSheet ? XLSX.utils.sheet_to_json(callsSheet, { defval: "" }) : [];

        window.DashboardData.loadFromUpload(salesRows, callsRows, file.name);
        window.Dashboard && window.Dashboard.toast("Dataset loaded from " + file.name, "success");
      } catch (err) {
        console.error(err);
        window.Dashboard && window.Dashboard.toast("Couldn't read that file: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function wireUploadZone(zoneEl, inputEl) {
    if (!zoneEl || !inputEl) return;
    zoneEl.addEventListener("click", () => inputEl.click());
    inputEl.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
    });
    ["dragenter", "dragover"].forEach((evt) => {
      zoneEl.addEventListener(evt, (e) => { e.preventDefault(); zoneEl.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach((evt) => {
      zoneEl.addEventListener(evt, (e) => { e.preventDefault(); zoneEl.classList.remove("drag"); });
    });
    zoneEl.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  }

  window.DashboardUpload = { wireUploadZone, handleFile };
})();
