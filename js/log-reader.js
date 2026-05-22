(function () {
  function createClientLogReader({ onEvent, onStatus }) {
    const reader = {
      poller: null,
      offset: 0,
      lastAreaId: "",
      onEvent,
      onStatus
    };

    reader.start = async function start() {
      reader.stop();
      try {
        const status = await fetchJson("api/log/status");
        if (!status.available) {
          onStatus?.("warn", "Game log not found. Start Path of Exile 2 once, then enable sync again.");
          return false;
        }
        reader.offset = Number(status.size || 0);
        reader.lastAreaId = "";
        onStatus?.("live", "Game sync is on.");
        reader.poller = setInterval(() => poll(reader), 1000);
        poll(reader);
        return true;
      } catch {
        onStatus?.("error", "Local service is not running. Start the tracker with start.bat.");
        return false;
      }
    };

    reader.stop = function stop() {
      if (reader.poller) clearInterval(reader.poller);
      reader.poller = null;
      onStatus?.("warn", "Game sync is off.");
    };

    return reader;
  }

  async function poll(reader) {
    try {
      const payload = await fetchJson(`api/log/poll?offset=${encodeURIComponent(reader.offset)}`);
      if (!payload.available) {
        reader.stop();
        reader.onStatus?.("warn", "Game log not found. Start Path of Exile 2 once, then enable sync again.");
        return;
      }

      reader.offset = Number(payload.offset || reader.offset);
      const event = parseClientLog(payload.chunk || "");
      if (!event) return;

      if (event.areaId) {
        event.areaId = normalizeAreaId(event.areaId);
        if (event.areaId === "c_g2_9_2_" || event.areaId === "c_g3_16_") {
          event.areaId = event.areaId.slice(0, -1);
        }
        if (event.areaId === reader.lastAreaId && event.type === "area") return;
        reader.lastAreaId = event.areaId;
      }
      reader.onEvent?.(event);
    } catch {
      reader.stop();
      reader.onStatus?.("error", "Local service connection lost. Restart the tracker.");
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function parseClientLog(content) {
    const lines = content.split(/\r?\n/);
    let latest = null;

    for (const line of lines) {
      if (!line) continue;

      const areaMatch = line.match(/Generating level\s+(\d+)\s+area\s+"([^"]+)".*?with seed\s+(\d+)/i);
      if (areaMatch) {
        latest = {
          type: "area",
          raw: line,
          areaLevel: Number(areaMatch[1]),
          areaId: normalizeAreaId(areaMatch[2]),
          seed: areaMatch[3],
          dateTime: line.slice(0, line.indexOf(" ", line.indexOf(" ") + 1))
        };
        continue;
      }

      if ((line.includes(" connected to ") && line.includes(".login.")) || line.includes("*****")) {
        latest = { type: "login", areaId: "login", raw: line };
        continue;
      }

      const enteredMatch = line.match(/You have entered\s+(.+?)\./i);
      if (enteredMatch) {
        latest = {
          type: "area-name",
          raw: line,
          areaName: enteredMatch[1].trim()
        };
      }
    }

    return latest;
  }

  function normalizeAreaId(value) {
    return String(value || "").trim().toLowerCase();
  }

  window.ClientLogReader = { createClientLogReader, parseClientLog };
})();
