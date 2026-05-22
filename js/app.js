(function () {
  const STORAGE_KEYS = {
    progress: "progress",
    settings: "settings",
    theme: "theme",
    language: "language",
    overlayPosition: "overlay-position"
  };

  const I18N = {
    en: {
      brandSubtitle: "Leveling route and game sync",
      overlay: "Overlay",
      sync: "Sync",
      guideProgress: "Guide progress",
      currentPage: "Current page",
      autoAdvance: "Auto advance",
      on: "On",
      off: "Off",
      guideOptions: "Guide options",
      showOptionals: "Show optional steps",
      acts: "Acts",
      heroTitle: "Leveling guide",
      currentGuidePage: "Current guide page",
      syncZone: "Sync zone",
      currentArea: "Current area",
      targetArea: "Target area",
      back: "Back",
      next: "Next",
      reset: "Reset",
      syncCurrent: "Sync current",
      syncOff: "Game sync is off.",
      noAreaDetected: "No area detected.",
      noTargetArea: "No target area",
      unknown: "unknown",
      none: "none",
      detected: "Detected",
      unmapped: "Could not map",
      login: "Client is at the login screen.",
      noForwardStep: "No forward guide step found for",
      noRewind: "is current or behind progress; not rewinding.",
      anchoredAt: "Anchored at",
      continuing: "continuing from this step.",
      waitingFor: "guide is still waiting for",
      guideWord: "guide",
      page: "page",
      areaLevel: "area level",
      currentAreaIs: "Current area is"
    },
    vi: {
      brandSubtitle: "Route leveling va dong bo game",
      overlay: "Overlay",
      sync: "Dong bo",
      guideProgress: "Tien do guide",
      currentPage: "Page hien tai",
      autoAdvance: "Tu chuyen buoc",
      on: "Bat",
      off: "Tat",
      guideOptions: "Tuy chon guide",
      showOptionals: "Hien buoc tuy chon",
      acts: "Act",
      heroTitle: "Guide leveling",
      currentGuidePage: "Page guide hien tai",
      syncZone: "Dong bo zone",
      currentArea: "Area hien tai",
      targetArea: "Area muc tieu",
      back: "Lui",
      next: "Tiep",
      reset: "Reset",
      syncCurrent: "Dong bo hien tai",
      syncOff: "Dong bo game dang tat.",
      noAreaDetected: "Chua phat hien area.",
      noTargetArea: "Khong co target area",
      unknown: "chua ro",
      none: "khong co",
      detected: "Da phat hien",
      unmapped: "Chua map duoc",
      login: "Client dang o man hinh login.",
      noForwardStep: "Khong tim thay step tiep theo cho",
      noRewind: "dang o step hien tai hoac phia sau progress; khong nhay lui.",
      anchoredAt: "Da neo tai",
      continuing: "tiep tuc tu step nay.",
      waitingFor: "guide van dang cho",
      guideWord: "guide",
      page: "page",
      areaLevel: "area level",
      currentAreaIs: "Area hien tai la"
    }
  };

  const state = {
    engine: null,
    page: null,
    reader: null,
    language: "en",
    syncEnabled: false,
    log: {
      areaId: "",
      areaName: "",
      areaLevel: "",
      seed: "",
      status: "warn",
      statusText: ""
    },
    lastManualAt: 0,
    anchorTimer: null,
    anchoredProgress: null,
    pipWindow: null,
    drag: null
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindEls();
    initTheme();
    state.language = normalizeLanguage(TrackerStorage.read(STORAGE_KEYS.language, "en"));
    state.log.statusText = t("syncOff");

    const savedSettings = TrackerStorage.read(STORAGE_KEYS.settings, {
      optionals: false,
      autoAdvance: false
    });

    state.engine = GuideEngine.createGuideEngine({
      guideByAct: window.EXILE_UI_DATA.guide,
      areasByAct: window.EXILE_UI_DATA.areas,
      settings: {
        leagueStart: false,
        optionals: Boolean(savedSettings.optionals)
      },
      progress: TrackerStorage.read(STORAGE_KEYS.progress, 0)
    });

    state.syncEnabled = savedSettings.autoAdvance === true;
    els.showOptionals.checked = state.engine.settings.optionals;

    state.reader = ClientLogReader.createClientLogReader({
      onEvent: onLogEvent,
      onStatus: setLogStatus
    });

    bindEvents();
    applyLanguage();
    render();
    renderSyncButton();
    if (state.syncEnabled) enableSync();
  }

  function bindEls() {
    [
      "pageLines", "pageMeta", "targetArea", "currentArea", "logStatusDot", "logStatusText",
      "autoAdvance", "autoAdvanceState", "showOptionals", "prevPage", "nextPage", "syncArea",
      "resetGuide", "openOverlay", "themeToggle", "overlayPanel", "overlayRoot", "progressBar",
      "progressText", "actPills", "guidePosition", "currentAreaMirror", "syncAreaFooter",
      "langEn", "langVi"
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    els.autoAdvance.addEventListener("click", toggleSync);
    els.prevPage.addEventListener("click", () => manualMove("previous"));
    els.nextPage.addEventListener("click", () => manualMove("next"));
    els.syncArea.addEventListener("click", syncToCurrentArea);
    els.syncAreaFooter.addEventListener("click", syncToCurrentArea);
    els.resetGuide.addEventListener("click", () => {
      GuideEngine.reset(state.engine);
      persistProgress();
      render();
    });
    els.openOverlay.addEventListener("click", openOverlayWindow);
    els.themeToggle.addEventListener("click", toggleTheme);
    els.showOptionals.addEventListener("change", () => {
      state.engine.settings.optionals = els.showOptionals.checked;
      persistSettings();
      render();
    });
    document.querySelectorAll("[data-lang]").forEach((button) => {
      button.addEventListener("click", () => {
        state.language = normalizeLanguage(button.dataset.lang);
        TrackerStorage.write(STORAGE_KEYS.language, state.language);
        applyLanguage();
        render();
        renderSyncButton();
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") manualMove("next");
      if (event.key === "ArrowLeft") manualMove("previous");
      if (event.key === "Escape") closeOverlayPanel();
    });
  }

  async function toggleSync() {
    if (state.syncEnabled) {
      disableSync();
      return;
    }
    state.syncEnabled = true;
    persistSettings();
    renderSyncButton();
    await enableSync();
  }

  async function enableSync() {
    const started = await state.reader.start();
    if (!started) {
      state.syncEnabled = false;
      persistSettings();
      renderSyncButton();
    }
  }

  function disableSync() {
    state.syncEnabled = false;
    clearManualAnchor();
    state.reader.stop();
    state.log.status = "warn";
    state.log.statusText = t("syncOff");
    persistSettings();
    renderSyncButton();
    renderLog();
  }

  function renderSyncButton() {
    els.autoAdvance.classList.toggle("active", state.syncEnabled);
    els.autoAdvance.setAttribute("aria-pressed", String(state.syncEnabled));
    els.autoAdvanceState.textContent = state.syncEnabled ? t("on") : t("off");
  }

  function manualMove(direction) {
    state.lastManualAt = Date.now();
    if (direction === "next") GuideEngine.next(state.engine);
    else GuideEngine.previous(state.engine);
    persistProgress();
    render();
    armManualAnchor();
  }

  function syncToCurrentArea() {
    const progressBefore = state.engine.progress;
    const synced = GuideEngine.syncToArea(state.engine, state.log.areaId, { skipPreviouslyTargeted: true });
    if (synced && state.engine.progress > progressBefore) {
      state.lastManualAt = Date.now() - 30000;
      persistProgress();
      render();
    } else if (synced) {
      state.engine.progress = progressBefore;
      setLogStatus("warn", `Zone ${state.log.areaId} ${t("noRewind")}`);
    } else if (state.log.areaId) {
      setLogStatus("warn", `${t("noForwardStep")} ${state.log.areaId}.`);
    }
  }

  function onLogEvent(event) {
    if (!state.syncEnabled) return;
    if (event.type === "login") {
      state.log.areaId = "login";
      state.log.areaName = "Login";
      state.log.areaLevel = "";
      state.log.seed = "";
      setLogStatus("warn", t("login"));
      renderLog();
      return;
    }

    if (event.areaId) {
      const areaId = GuideEngine.normalizeAreaId(event.areaId);
      const area = state.engine.areaIndex.byId.get(areaId);
      state.log.areaId = areaId;
      state.log.areaName = area?.label || state.log.areaId;
      state.log.areaLevel = event.areaLevel || "";
      state.log.seed = event.seed || "";
    } else if (event.areaName) {
      const area = state.engine.areaIndex.byName.get(GuideEngine.normalizeAreaName(event.areaName));
      state.log.areaId = area?.id || "";
      state.log.areaName = area?.label || event.areaName;
      state.log.areaLevel = "";
      state.log.seed = "";
    }

    setLogStatus(
      state.log.areaId ? "live" : "warn",
      state.log.areaId ? `${t("detected")} ${state.log.areaName}.` : `${t("unmapped")} ${state.log.areaName}.`
    );
    renderLog();

    const specialArea = /labyrinth_|sanctum_|g3_10/i.test(state.log.areaId || "");
    if (specialArea) {
      closeOverlayPanel();
      return;
    }

    if (!tryAdvanceFromCurrentArea()) render();
  }

  function armManualAnchor() {
    clearManualAnchor();
    const page = GuideEngine.currentPage(state.engine);
    if (!state.syncEnabled || !state.log.areaId || state.log.areaId !== page.targetArea) return;

    state.anchoredProgress = state.engine.progress;
    setLogStatus("live", `${t("anchoredAt")} ${state.log.areaName}; ${t("continuing")}`);
    state.anchorTimer = setTimeout(() => {
      if (state.engine.progress !== state.anchoredProgress) return;
      tryAdvanceFromCurrentArea();
    }, 2000);
  }

  function clearManualAnchor() {
    if (state.anchorTimer) clearTimeout(state.anchorTimer);
    state.anchorTimer = null;
    state.anchoredProgress = null;
  }

  function tryAdvanceFromCurrentArea() {
    const page = GuideEngine.currentPage(state.engine);
    const canAutoAdvance = state.syncEnabled
      && state.log.areaId
      && state.log.areaId === page.targetArea
      && Date.now() >= state.lastManualAt + 2000;

    if (canAutoAdvance) {
      clearManualAnchor();
      GuideEngine.next(state.engine);
      persistProgress();
      render();
      return true;
    }

    if (state.syncEnabled && state.log.areaId && state.log.areaId !== page.targetArea) {
      const target = page.targetAreaInfo?.label || page.targetArea || t("none");
      setLogStatus("live", `${t("currentAreaIs")} ${state.log.areaName}; ${t("waitingFor")} ${target}.`);
    }
    return false;
  }

  function render() {
    state.page = GuideEngine.currentPage(state.engine);
    renderMainPage();
    renderProgress();
    renderLog();
    renderOverlay();
  }

  function renderMainPage() {
    const page = state.page;
    els.pageMeta.textContent = `Act ${page.act} · ${t("page")} ${page.index + 1}/${page.total}`;
    els.guidePosition.textContent = `${page.index + 1}`;
    els.targetArea.textContent = page.targetAreaInfo
      ? `${page.targetAreaInfo.label} (${page.targetArea})`
      : page.targetArea || t("noTargetArea");

    els.pageLines.innerHTML = page.lines.map((line) => `
      <li>${GuideEngine.renderLine(line, state.engine.areaIndex, state.language)}</li>
    `).join("");

    renderActPills();
  }

  function renderActPills() {
    const activeAct = state.page.act;
    const acts = [...new Set(state.engine.pages.map((page) => page.act))];
    els.actPills.innerHTML = acts.map((act) => {
      const first = state.engine.pages.findIndex((page, index) => page.act === act && GuideEngine.currentPage({ ...state.engine, progress: index }).act === act);
      return `<button type="button" class="${act === activeAct ? "active" : ""}" data-act-jump="${first}">Act ${act}</button>`;
    }).join("");

    els.actPills.querySelectorAll("[data-act-jump]").forEach((button) => {
      button.addEventListener("click", () => {
        state.engine.progress = Number(button.dataset.actJump);
        state.lastManualAt = Date.now();
        persistProgress();
        render();
      });
    });
  }

  function renderProgress() {
    const percent = Math.round(((state.page.index + 1) / state.page.total) * 100);
    els.progressBar.style.width = `${percent}%`;
    els.progressText.textContent = `${percent}% ${t("guideWord")} · ${state.page.index + 1}/${state.page.total}`;
  }

  function renderLog() {
    els.currentArea.textContent = state.log.areaId
      ? `${state.log.areaName} (${state.log.areaId})${state.log.areaLevel ? ` · ${t("areaLevel")} ${state.log.areaLevel}` : ""}`
      : t("noAreaDetected");
    els.currentAreaMirror.textContent = els.currentArea.textContent;
    els.logStatusDot.className = `status-dot ${state.log.status}`;
    els.logStatusText.textContent = localizeStatus(state.log.statusText || t("syncOff"));
  }

  function setLogStatus(status, text) {
    state.log.status = status;
    state.log.statusText = text || t("syncOff");
    renderLog();
  }

  function renderOverlay() {
    if (els.overlayPanel.classList.contains("open")) renderOverlayInto(document, els.overlayRoot, "page");
    if (state.pipWindow && !state.pipWindow.closed) {
      state.pipWindow.document.documentElement.classList.toggle("dark", document.documentElement.classList.contains("dark"));
      state.pipWindow.document.documentElement.lang = state.language;
      const root = state.pipWindow.document.getElementById("pipRoot");
      if (root) renderOverlayInto(state.pipWindow.document, root, "pip");
    }
  }

  function renderOverlayInto(doc, root, mode) {
    const page = state.page;
    root.innerHTML = `
      <div class="overlay-shell">
        <header class="overlay-header" data-drag>
          <div>
            <strong>POE2 Leveltracker</strong>
            <span>Act ${page.act} · ${t("page")} ${page.index + 1}/${page.total}</span>
          </div>
          <div class="overlay-actions">
            <button type="button" data-popout ${mode === "pip" ? "hidden" : ""}>▣</button>
            <button type="button" data-close>×</button>
          </div>
        </header>
        <section class="overlay-target">
          <span>${escapeHtml(t("currentArea"))}</span>
          <strong>${escapeHtml(state.log.areaName || t("unknown"))}</strong>
          <span>${escapeHtml(t("targetArea"))}</span>
          <strong>${escapeHtml(page.targetAreaInfo?.label || page.targetArea || t("none"))}</strong>
        </section>
        <ol class="overlay-lines">
          ${page.lines.map((line) => `<li>${GuideEngine.renderLine(line, state.engine.areaIndex, state.language)}</li>`).join("")}
        </ol>
        <footer class="overlay-footer">
          <button type="button" data-prev>‹</button>
          <button type="button" data-sync>${escapeHtml(t("syncZone"))}</button>
          <button type="button" data-next>›</button>
        </footer>
      </div>
    `;
    bindOverlayRoot(root, mode);
  }

  function bindOverlayRoot(root, mode) {
    if (root.dataset.bound) return;
    root.dataset.bound = "true";
    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-close]")) closeOverlay();
      else if (event.target.closest("[data-popout]")) openOverlayWindow();
      else if (event.target.closest("[data-prev]")) manualMove("previous");
      else if (event.target.closest("[data-next]")) manualMove("next");
      else if (event.target.closest("[data-sync]")) syncToCurrentArea();
    });

    if (mode === "page") {
      root.addEventListener("pointerdown", (event) => {
        if (event.target.closest("[data-drag]")) startDrag(event);
      });
    }
  }

  function openOverlayPanel() {
    els.overlayPanel.classList.add("open");
    renderOverlay();
    requestAnimationFrame(applyOverlayPosition);
  }

  function closeOverlayPanel() {
    els.overlayPanel.classList.remove("open");
  }

  async function openOverlayWindow() {
    if (window.documentPictureInPicture?.requestWindow) {
      try {
        if (state.pipWindow && !state.pipWindow.closed) {
          state.pipWindow.focus();
          return;
        }
        state.pipWindow = await window.documentPictureInPicture.requestWindow({ width: 420, height: 520 });
        const doc = state.pipWindow.document;
        doc.head.innerHTML = `${getPipHeadHtml()}<style>${getPageCss()}</style>`;
        doc.documentElement.classList.toggle("dark", document.documentElement.classList.contains("dark"));
        doc.documentElement.lang = state.language;
        doc.body.innerHTML = `<div id="pipRoot" class="pip-root"></div>`;
        state.pipWindow.addEventListener("pagehide", () => { state.pipWindow = null; });
        closeOverlayPanel();
        renderOverlay();
        return;
      } catch {
        openOverlayPanel();
        return;
      }
    }
    openOverlayPanel();
  }

  function closeOverlay() {
    closeOverlayPanel();
    if (state.pipWindow && !state.pipWindow.closed) state.pipWindow.close();
    state.pipWindow = null;
  }

  function startDrag(event) {
    if (event.button !== 0 || event.target.closest("button")) return;
    const rect = els.overlayPanel.getBoundingClientRect();
    state.drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    event.preventDefault();
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", stopDrag, { once: true });
  }

  function moveDrag(event) {
    if (!state.drag) return;
    const left = Math.min(Math.max(8, event.clientX - state.drag.x), innerWidth - els.overlayPanel.offsetWidth - 8);
    const top = Math.min(Math.max(8, event.clientY - state.drag.y), innerHeight - els.overlayPanel.offsetHeight - 8);
    els.overlayPanel.style.left = `${left}px`;
    els.overlayPanel.style.top = `${top}px`;
    els.overlayPanel.style.right = "auto";
    els.overlayPanel.style.bottom = "auto";
  }

  function stopDrag() {
    if (!state.drag) return;
    const rect = els.overlayPanel.getBoundingClientRect();
    TrackerStorage.write(STORAGE_KEYS.overlayPosition, { left: rect.left, top: rect.top });
    state.drag = null;
    window.removeEventListener("pointermove", moveDrag);
  }

  function applyOverlayPosition() {
    const position = TrackerStorage.read(STORAGE_KEYS.overlayPosition, null);
    if (!position) return;
    els.overlayPanel.style.left = `${Math.min(Math.max(8, position.left), innerWidth - els.overlayPanel.offsetWidth - 8)}px`;
    els.overlayPanel.style.top = `${Math.min(Math.max(8, position.top), innerHeight - els.overlayPanel.offsetHeight - 8)}px`;
    els.overlayPanel.style.right = "auto";
    els.overlayPanel.style.bottom = "auto";
  }

  function persistProgress() {
    TrackerStorage.write(STORAGE_KEYS.progress, state.engine.progress);
  }

  function persistSettings() {
    state.engine.settings.leagueStart = false;
    state.engine.settings.optionals = els.showOptionals.checked;
    TrackerStorage.write(STORAGE_KEYS.settings, {
      optionals: els.showOptionals.checked,
      autoAdvance: state.syncEnabled
    });
  }

  function applyLanguage() {
    document.documentElement.lang = state.language;
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const value = t(node.dataset.i18n);
      if (value) node.textContent = value;
    });
    els.langEn.classList.toggle("active", state.language === "en");
    els.langVi.classList.toggle("active", state.language === "vi");
    els.themeToggle.setAttribute("aria-label", state.language === "vi" ? "Doi giao dien" : "Toggle theme");
    if (!state.syncEnabled && !state.log.areaId) state.log.statusText = t("syncOff");
  }

  function initTheme() {
    const saved = TrackerStorage.read(STORAGE_KEYS.theme, null);
    const dark = saved == null ? matchMedia("(prefers-color-scheme: dark)").matches : saved === "dark";
    document.documentElement.classList.toggle("dark", dark);
  }

  function toggleTheme() {
    document.documentElement.classList.toggle("dark");
    TrackerStorage.write(STORAGE_KEYS.theme, document.documentElement.classList.contains("dark") ? "dark" : "light");
    renderOverlay();
  }

  function getPageCss() {
    return Array.from(document.styleSheets).map((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    }).join("\n");
  }

  function getPipHeadHtml() {
    const baseHref = escapeHtml(document.baseURI || location.href);
    const stylesheetLinks = Array.from(document.querySelectorAll('link[rel~="stylesheet"]'))
      .map((link) => {
        const href = link.href || link.getAttribute("href");
        if (!href) return "";
        return `<link rel="stylesheet" href="${escapeHtml(href)}">`;
      })
      .join("");
    return `<title>POE2 Leveltracker</title><base href="${baseHref}">${stylesheetLinks}`;
  }

  function localizeStatus(text) {
    if (state.language !== "vi") return text;
    const map = {
      "Game sync is off.": "Dong bo game dang tat.",
      "Game sync is on.": "Dong bo game dang bat.",
      "Game log not found. Start Path of Exile 2 once, then enable sync again.": "Khong tim thay game log. Hay mo Path of Exile 2 mot lan, sau do bat dong bo lai.",
      "Local service is not running. Start the tracker with start.bat.": "Local service chua chay. Hay mo tracker bang start.bat.",
      "Local service connection lost. Restart the tracker.": "Mat ket noi local service. Hay khoi dong lai tracker."
    };
    return map[text] || text;
  }

  function t(key) {
    return I18N[state.language]?.[key] || I18N.en[key] || key;
  }

  function normalizeLanguage(value) {
    return value === "vi" ? "vi" : "en";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }
})();
