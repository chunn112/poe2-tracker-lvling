(function () {
  const PREFIX = "poe2-exile-ui-leveltracker";

  function key(name) {
    return `${PREFIX}:${name}`;
  }

  function read(name, fallback) {
    try {
      const value = localStorage.getItem(key(name));
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function write(name, value) {
    localStorage.setItem(key(name), JSON.stringify(value));
  }

  function remove(name) {
    localStorage.removeItem(key(name));
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(`${PREFIX}:db`, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("handles");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveHandle(name, handle) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(handle, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadHandle(name) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readonly");
      const request = tx.objectStore("handles").get(name);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  window.TrackerStorage = { read, write, remove, saveHandle, loadHandle };
})();
