(function () {
  const AREA_RE = /areaid([a-z0-9_]+)/ig;

  function createAreaIndex(areasByAct) {
    const byId = new Map();
    const byName = new Map();
    const flat = [];

    areasByAct.forEach((actAreas, actIndex) => {
      actAreas.forEach((area) => {
        const entry = {
          ...area,
          act: actIndex + 1,
          label: titleCase(area.name || area.id)
        };
        flat.push(entry);
        byId.set(area.id, entry);
        byName.set(normalizeAreaName(area.name), entry);
      });
    });

    return { flat, byId, byName };
  }

  function flattenGuide(guideByAct) {
    return guideByAct.flatMap((actPages, actIndex) => actPages.map((page) => ({
      act: actIndex + 1,
      raw: page
    })));
  }

  const GUIDE_TRANSLATIONS = {
    vi: {
      kill: "hạ",
      enter: "vào",
      clear: "hoàn thành",
      find: "tìm",
      activate: "kích hoạt",
      break: "phá",
      loot: "nhặt",
      give: "đưa",
      use: "dùng",
      open: "mở",
      leave: "rời",
      farm: "farm",
      complete: "hoàn thành",
      defeat: "hạ",
      travel: "dịch chuyển",
      insert: "đặt vào",
      start: "khởi động",
      to: "tới",
      in: "trong",
      for: "để lấy",
      from: "từ",
      then: "sau đó",
      out: "ra ngoài",
      near: "gần",
      edge: "rìa",
      optional: "tùy chọn",
      examples: "ví dụ",
      currency: "currency",
      gems: "gem",
      gear: "trang bị",
      include: "hiển thị",
      enable: "bật"
    }
  };

  function createGuideEngine({ guideByAct, areasByAct, settings, progress }) {
    const areaIndex = createAreaIndex(areasByAct);
    const pages = flattenGuide(guideByAct);

    const engine = {
      pages,
      areaIndex,
      progress: clamp(progress || 0, 0, Math.max(0, pages.length - 1)),
      settings: {
        leagueStart: Boolean(settings?.leagueStart),
        optionals: Boolean(settings?.optionals)
      }
    };

    return engine;
  }

  function isPageEnabled(engine, index) {
    const page = engine.pages[index];
    if (!page) return false;
    const condition = page.raw.condition;
    if (!condition) return true;

    const [type, value] = condition;
    if (type === "league-start") return (value === "yes") === engine.settings.leagueStart;
    if (type === "bandit") return true;
    return true;
  }

  function firstEnabledIndex(engine, startIndex) {
    let index = clamp(startIndex, 0, Math.max(0, engine.pages.length - 1));
    while (index < engine.pages.length && !isPageEnabled(engine, index)) index += 1;
    return Math.min(index, engine.pages.length - 1);
  }

  function currentPage(engine) {
    engine.progress = firstEnabledIndex(engine, engine.progress);
    const page = engine.pages[engine.progress];
    const allLines = cleanLines(getPageLines(page));
    const lines = visibleLines(allLines, engine.settings);
    const targetArea = extractTargetArea(lines, engine.settings);
    return {
      index: engine.progress,
      total: engine.pages.length,
      act: page?.act || 1,
      lines,
      hiddenOptionalCount: countHiddenOptionals(allLines, engine.settings),
      targetArea,
      targetAreaInfo: targetArea ? engine.areaIndex.byId.get(targetArea) : null
    };
  }

  function next(engine) {
    if (engine.progress >= engine.pages.length - 1) return currentPage(engine);
    engine.progress = firstEnabledIndex(engine, engine.progress + 1);
    return currentPage(engine);
  }

  function previous(engine) {
    if (engine.progress <= 0) return currentPage(engine);
    let index = engine.progress - 1;
    while (index > 0 && !isPageEnabled(engine, index)) index -= 1;
    engine.progress = index;
    return currentPage(engine);
  }

  function reset(engine) {
    engine.progress = firstEnabledIndex(engine, 0);
    return currentPage(engine);
  }

  function syncToArea(engine, areaId, options = {}) {
    areaId = normalizeAreaId(areaId);
    if (!areaId) return false;
    if (options.skipPreviouslyTargeted && hasTargetBefore(engine, areaId, engine.progress)) return false;
    const start = options.includeCurrent ? engine.progress : engine.progress + 1;
    for (let index = start; index < engine.pages.length; index += 1) {
      if (!isPageEnabled(engine, index)) continue;
      const lines = visibleLines(getPageLines(engine.pages[index]), engine.settings);
      if (extractTargetArea(lines, engine.settings) === areaId) {
        engine.progress = index;
        return currentPage(engine);
      }
    }
    return false;
  }

  function hasTargetBefore(engine, areaId, beforeIndex) {
    for (let index = 0; index <= beforeIndex; index += 1) {
      if (!isPageEnabled(engine, index)) continue;
      const lines = visibleLines(getPageLines(engine.pages[index]), engine.settings);
      if (extractTargetArea(lines, engine.settings) === areaId) return true;
    }
    return false;
  }

  function getPageLines(page) {
    if (!page) return [];
    return page.raw.condition ? page.raw.lines || [] : page.raw || [];
  }

  function cleanLines(lines) {
    return lines.map((line) => String(line).replace(/\s+;;.*$/, "").trim()).filter(Boolean);
  }

  function visibleLines(lines, settings) {
    const cleaned = lines.map((line) => String(line).trim()).filter(Boolean);
    let previousHiddenOptional = false;

    return cleaned
      .filter((line) => {
        const isHint = line.includes("(hint)_");
        const isOptional = line.includes("optional:");
        const isLeague = line.includes("leaguestart:");
        const isTwink = line.includes("twinkrun:");
        const hideForLeagueMode = settings.leagueStart ? isTwink : isLeague;
        const hideForOptionalMode = !settings.optionals && (isOptional || (isHint && previousHiddenOptional));
        const hide = hideForLeagueMode || hideForOptionalMode;

        if (!isHint) previousHiddenOptional = hideForOptionalMode && isOptional;
        return !hide;
      })
      .map((line) => line
        .replace(/\boptional:\s*/gi, "")
        .replace(/\bleaguestart:\s*/gi, "")
        .replace(/\btwinkrun:\s*/gi, "")
        .trim()
      );
  }

  function countHiddenOptionals(lines, settings) {
    if (settings.optionals) return 0;
    let previousHiddenOptional = false;
    let count = 0;

    for (const line of lines) {
      const isHint = line.includes("(hint)_");
      const isOptional = line.includes("optional:");
      const hidden = isOptional || (isHint && previousHiddenOptional);
      if (hidden) count += 1;
      if (!isHint) previousHiddenOptional = isOptional;
    }

    return count;
  }

  function extractTargetArea(lines, settings) {
    let target = "";
    for (const line of lines) {
      if (line.includes("(hint)_")) continue;
      if (settings.leagueStart && line.includes("twink")) continue;
      if (!settings.leagueStart && line.includes("league-start")) continue;
      AREA_RE.lastIndex = 0;
      let match;
      while ((match = AREA_RE.exec(line))) target = match[1];
    }
    return target;
  }

  function renderLine(line, areaIndex, language = "en") {
    const hint = line.includes("(hint)_");
    let html = escapeHtml(line)
      .replace(/\(color:([a-zA-Z0-9]+)\)([^<\s][^<]*)/gi, (_full, color, text) => {
        const cssColor = /^[a-f0-9]{3,8}$/i.test(color) ? `#${color}` : color;
        return `<span class="line-color" style="--line-color:${escapeHtml(cssColor)}">${text}</span>`;
      })
      .replace(/\(img:([^)]+)\)/g, (_full, icon) => renderIcon(icon))
      .replace(/\(quest:([^)]+)\)/g, (_full, quest) => renderQuest(quest))
      .replace(/&lt;([^&]+)&gt;/g, (_full, value) => `<span class="class-token">${escapeHtml(formatLabel(value))}</span>`);

    html = html.replace(/areaid([a-z0-9_]+)/ig, (_full, id) => {
      const area = areaIndex.byId.get(id);
      return `<span class="token area-token" title="${escapeHtml(id)}">${escapeHtml(area?.label || id)}</span>`;
    });

    const rendered = formatGuideText(html, language).replace(/\|\|/g, '<span class="line-split">&rarr;</span>');
    return hint ? `<span class="hint-line">${rendered}</span>` : rendered;
  }

  function renderQuest(quest) {
    const label = formatLabel(quest);
    return `<span class="quest-token" title="${escapeHtml(String(quest || ""))}">${escapeHtml(label)}</span>`;
  }

  function renderIcon(icon) {
    const safeName = String(icon || "").trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeName) return "";
    return `<img class="guide-icon" src="assets/leveling-tracker/${safeName}.png" alt="${escapeHtml(safeName)}" title="${escapeHtml(safeName)}" loading="lazy">`;
  }

  function formatGuideText(html, language = "en") {
    return html
      .split(/(<[^>]+>)/g)
      .map((part) => part.startsWith("<") ? part : formatPlainText(part, language))
      .join("");
  }

  function formatPlainText(text, language = "en") {
    return translatePlainGuideText(text, language)
      .replace(/\(hint\)_+/g, "")
      .replace(/\barena:([a-zA-Z0-9_?-]+)/g, (_full, name) => `<span class="arena-token">${escapeHtml(formatLabel(name))}</span>`)
      .replace(/\b(?!areaid)[a-zA-Z0-9]+_[a-zA-Z0-9_?]+\b/g, (token) => formatLabel(token))
      .replace(/\b(kill|enter|clear|find|activate|break|loot|give|use|open|leave|farm|complete|defeat|travel|insert|start)\b/gi, '<span class="verb-token">$1</span>')
      .replace(/\b(renly|una|beira|zarka|asala|halani|shambrin|oswald|doryani|alva|dannig|tujen|hilda|navali|hooded one|risu)\b/gi, '<span class="npc-token">$1</span>');
  }

  function translatePlainGuideText(text, language) {
    const dictionary = GUIDE_TRANSLATIONS[language];
    if (!dictionary) return text;
    return String(text).replace(/\b[a-zA-Z]+\b/g, (word) => {
      const translated = dictionary[word.toLowerCase()];
      return translated || word;
    });
  }

  function formatLabel(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b([a-z])/g, (char) => char.toUpperCase());
  }

  function normalizeAreaName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/^the\s+/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function normalizeAreaId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function titleCase(value) {
    return String(value || "")
      .split(/\s+/)
      .map((part) => part ? part[0].toUpperCase() + part.slice(1) : "")
      .join(" ");
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

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  window.GuideEngine = {
    createGuideEngine,
    currentPage,
    next,
    previous,
    reset,
    syncToArea,
    renderLine,
    normalizeAreaName,
    normalizeAreaId
  };
})();

