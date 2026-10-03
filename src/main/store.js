/**
 * Persistent storage — replaces chrome.storage.sync / chrome.storage.local.
 * Two separate electron-store instances mirror the two chrome.storage areas
 * so the FC_* message handlers can stay a near-verbatim port of background.js.
 */
const Store = require('electron-store');

const sync = new Store({ name: 'fc-sync' });   // auth tokens, profile, settings — mirrors chrome.storage.sync
const local = new Store({ name: 'fc-local' });  // submissions cache, stats — mirrors chrome.storage.local

function areaFor(area) {
  return area === 'local' ? local : sync;
}

function get(area, keys) {
  const store = areaFor(area);
  if (keys == null) return store.store;
  const keyList = Array.isArray(keys) ? keys : [keys];
  const result = {};
  for (const key of keyList) {
    const val = store.get(key);
    if (val !== undefined) result[key] = val;
  }
  return result;
}

function set(area, obj) {
  const store = areaFor(area);
  for (const [key, val] of Object.entries(obj)) {
    store.set(key, val);
  }
}

function remove(area, keys) {
  const store = areaFor(area);
  const keyList = Array.isArray(keys) ? keys : [keys];
  for (const key of keyList) store.delete(key);
}

module.exports = { get, set, remove };
