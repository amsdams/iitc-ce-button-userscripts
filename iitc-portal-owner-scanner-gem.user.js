// ==UserScript==
// @name          IITC Plugin: Portal Owner Scanner
// @category      Highlighter
// @version       2.2.0
// @description   Caches portal ownership as you browse the map, then lets you search all seen portals by agent name.
// @author        Claude
// @match         https://intel.ingress.com/*
// @grant         none
// ==/UserScript==

/* global L, map, window */

(function () {
  'use strict';

  if (typeof window.plugin !== 'function') window.plugin = function () {};
  window.plugin.portalOwnerScanner = function () {};
  const self = window.plugin.portalOwnerScanner;

  // ─── Persistent ownership cache ───────────────────────────────────────────
  // Survives panning/zooming. Keyed by portal GUID.
  // { guid: { title, lat, lng, team, level, owner, resonators: [{owner,level},...] } }
  self.cache = {};

  // ─── Scan state ───────────────────────────────────────────────────────────
  self.targetAgent = '';
  self.layer       = null;

  // ─── CSS ─────────────────────────────────────────────────────────────────
  const CSS = `
    #pos-btn {
      position: fixed;
      bottom: 80px;
      left: 10px;
      z-index: 9000;
      background: #1a1a1a;
      color: #03fe03;
      border: 2px solid #03fe03;
      padding: 7px 14px;
      font-family: monospace;
      font-size: 13px;
      cursor: pointer;
      border-radius: 4px;
    }
    #pos-btn:hover { background: #03fe03; color: #000; }

    #pos-panel {
      display: none;
      position: fixed;
      top: 60px;
      right: 10px;
      width: 320px;
      max-height: 80vh;
      z-index: 9001;
      background: #1a1a1a;
      border: 1px solid #03fe03;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      color: #ccc;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0,0,0,0.8);
      overflow: hidden;
    }
    #pos-panel.pos-open { display: flex; }

    #pos-header {
      background: #111;
      color: #03fe03;
      font-weight: bold;
      padding: 8px 10px;
      border-bottom: 1px solid #03fe03;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      letter-spacing: 0.05em;
    }
    #pos-close-btn {
      background: none; border: none; color: #03fe03;
      font-size: 18px; cursor: pointer; line-height: 1; padding: 0 2px;
    }
    #pos-close-btn:hover { color: #fff; }

    #pos-cache-bar {
      background: #111;
      padding: 5px 10px;
      border-bottom: 1px solid #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: #666;
    }
    #pos-cache-count { color: #03fe03; font-weight: bold; }
    #pos-cache-clear {
      background: #2a2a2a; border: 1px solid #444; color: #888;
      font-family: monospace; font-size: 10px; padding: 2px 6px;
      border-radius: 3px; cursor: pointer;
    }
    #pos-cache-clear:hover { background: #400; color: #f88; border-color: #f44; }

    #pos-search-row {
      display: flex; gap: 5px; padding: 8px;
      border-bottom: 1px solid #333;
    }
    #pos-input {
      flex: 1; background: #111; border: 1px solid #444; color: #fff;
      padding: 5px 8px; border-radius: 3px; font-family: monospace; font-size: 12px;
    }
    #pos-input:focus { border-color: #03fe03; outline: none; }
    #pos-go-btn {
      background: #03fe03; color: #000; border: none; padding: 5px 10px;
      border-radius: 3px; font-family: monospace; font-size: 12px;
      font-weight: bold; cursor: pointer;
    }
    #pos-go-btn:hover { background: #00cc00; }
    #pos-clr-btn {
      background: #333; color: #aaa; border: none; padding: 5px 8px;
      border-radius: 3px; font-family: monospace; font-size: 12px; cursor: pointer;
    }
    #pos-clr-btn:hover { background: #555; }

    #pos-opts {
      padding: 6px 8px; border-bottom: 1px solid #333;
      display: flex; flex-direction: column; gap: 5px;
      font-size: 11px; color: #aaa;
    }
    #pos-opts label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
    #pos-opts input[type=checkbox] { accent-color: #03fe03; }
    #pos-opts select {
      background: #111; color: #ccc; border: 1px solid #444;
      font-family: monospace; font-size: 11px; padding: 2px 4px;
      border-radius: 3px; margin-left: auto;
    }

    #pos-status {
      padding: 6px 10px; font-size: 11px; color: #777;
      border-bottom: 1px solid #222; min-height: 22px;
    }
    #pos-status.pos-found  { color: #03fe03; }
    #pos-status.pos-scan   { color: #ffaa00; }
    #pos-status.pos-error  { color: #ff5555; }

    #pos-list { overflow-y: auto; flex: 1; }

    .pos-item {
      padding: 7px 10px; border-bottom: 1px solid #1e1e1e; cursor: pointer;
    }
    .pos-item:hover { background: #252525; }
    .pos-item-name {
      color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .pos-item-meta { color: #666; font-size: 10px; margin-top: 2px; }
    .pos-team-E .pos-item-name { color: #03fe03; }
    .pos-team-R .pos-item-name { color: #4fc3f7; }

    #pos-tip {
      padding: 8px 10px; font-size: 10px; color: #555;
      border-top: 1px solid #1e1e1e; line-height: 1.5;
    }
    #pos-tip b { color: #888; }
  `;

  // ─── Inject CSS ──────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('pos-style')) return;
    const s = document.createElement('style');
    s.id = 'pos-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ─── Build UI ────────────────────────────────────────────────────────────
  function buildUI() {
    if (document.getElementById('pos-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'pos-btn';
    btn.textContent = '👤 Owner Scan';
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'pos-panel';
    panel.innerHTML = `
      <div id="pos-header">
        <span>⬡ PORTAL OWNER SCANNER</span>
        <button id="pos-close-btn">✕</button>
      </div>
      <div id="pos-cache-bar">
        <span>Portals cached: <span id="pos-cache-count">0</span></span>
        <button id="pos-cache-clear">Clear cache</button>
      </div>
      <div id="pos-search-row">
        <input id="pos-input" type="text" placeholder="Agent name…" autocomplete="off" spellcheck="false" />
        <button id="pos-go-btn">SCAN</button>
        <button id="pos-clr-btn">CLR</button>
      </div>
      <div id="pos-opts">
        <label><input type="checkbox" id="pos-exact" /> Exact match only</label>
        <label><input type="checkbox" id="pos-case" /> Case-sensitive</label>
        <label>
          Highlight
          <select id="pos-color">
            <option value="#ffff00">Yellow</option>
            <option value="#ff9900">Orange</option>
            <option value="#ff00ff">Magenta</option>
            <option value="#00ffff">Cyan</option>
            <option value="#ffffff">White</option>
          </select>
        </label>
      </div>
      <div id="pos-status">Pan around the map to collect portal data, then SCAN.</div>
      <div id="pos-list"></div>
      <div id="pos-tip">
        <b>How to collect:</b> Pan &amp; zoom the map — portal ownership is captured automatically as data loads. The cache persists until you clear it or reload the page.
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('pos-close-btn').addEventListener('click', togglePanel);
    document.getElementById('pos-go-btn').addEventListener('click', runScan);
    document.getElementById('pos-clr-btn').addEventListener('click', clearScan);
    document.getElementById('pos-cache-clear').addEventListener('click', clearCache);
    document.getElementById('pos-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') runScan();
    });
  }

  function togglePanel() {
    const panel = document.getElementById('pos-panel');
    if (!panel) return;
    panel.classList.toggle('pos-open');
    if (panel.classList.contains('pos-open')) {
      document.getElementById('pos-input').focus();
    }
  }


  function updateCacheCount() {
    const el = document.getElementById('pos-cache-count');
    if (el) el.textContent = Object.keys(self.cache).length;
  }

  // ─── Scan the cache ───────────────────────────────────────────────────────
  function runScan() {
    const inputEl = document.getElementById('pos-input');
    const input   = inputEl ? inputEl.value.trim() : '';
    if (!input) { setStatus('Please enter an agent name.', 'pos-error'); return; }

    self.targetAgent = input;
    const exact = document.getElementById('pos-exact').checked;
    const cs    = document.getElementById('pos-case').checked;
    const color = document.getElementById('pos-color').value;

    setStatus('Scanning cache…', 'pos-scan');
    clearHighlights();

    const needle = cs ? input : input.toLowerCase();
    const hits   = [];

    for (const guid in self.cache) {
      const entry = self.cache[guid];

      // Check owner field
      const ownerHay = cs ? entry.owner : entry.owner.toLowerCase();
      const ownerHit = exact ? ownerHay === needle : ownerHay.indexOf(needle) !== -1;

      // Also check individual resonators (agent may have resonators but not be owner)
      let resCount = 0;
      entry.resonators.forEach(function (r) {
        const rHay = cs ? r.owner : r.owner.toLowerCase();
        if (exact ? rHay === needle : rHay.indexOf(needle) !== -1) resCount++;
      });

      if (ownerHit || resCount > 0) {
        hits.push({ entry, resCount });
      }
    }

    drawHighlights(hits, color);
    renderList(hits);

    if (hits.length === 0) {
      setStatus('No portals found for "' + input + '" in cache (' + Object.keys(self.cache).length + ' portals cached).', 'pos-error');
    } else {
      setStatus('Found ' + hits.length + ' portal' + (hits.length !== 1 ? 's' : '') + ' for "' + input + '".', 'pos-found');
    }
  }

  // ─── Draw highlights on map ───────────────────────────────────────────────
  function drawHighlights(hits, color) {
    if (!self.layer) {
      self.layer = L.layerGroup();
      self.layer.addTo(window.map);
    }
    hits.forEach(function (h) {
      if (h.entry.lat == null) return;
      try {
        var ll = L.latLng(h.entry.lat, h.entry.lng);
        var c = L.circleMarker(ll, {
          radius: 14, color: color, weight: 3,
          opacity: 0.9, fillColor: color, fillOpacity: 0.15,
          interactive: false
        });
        self.layer.addLayer(c);
      } catch (e) {}
    });
  }

  function clearHighlights() {
    if (self.layer) self.layer.clearLayers();
  }

  // ─── Render results list ──────────────────────────────────────────────────
  function renderList(hits) {
    const list = document.getElementById('pos-list');
    if (!list) return;
    list.innerHTML = '';

    hits.sort(function (a, b) {
      return a.entry.title.localeCompare(b.entry.title);
    }).forEach(function (h) {
      const e    = h.entry;
      const item = document.createElement('div');
      item.className = 'pos-item pos-team-' + (e.team || 'N');
      item.innerHTML =
          '<div class="pos-item-name">' + esc(e.title) + '</div>' +
          '<div class="pos-item-meta">' +
          'L' + (e.level || '?') +
          ' · owner: <b style="color:#ddd">' + esc(e.owner) + '</b>' +
          (h.resCount ? ' · ' + h.resCount + ' resonator' + (h.resCount !== 1 ? 's' : '') : '') +
          '</div>';

      // Click to pan map to portal
      item.addEventListener('click', function () {
        if (e.lat == null) return;
        var ll = L.latLng(e.lat, e.lng);
        window.map.setView(ll, Math.max(window.map.getZoom(), 15));
        // Try to select the portal if it's currently in view
        if (window.portals[e.guid]) {
          window.renderPortalDetails(e.guid);
        }
      });
      list.appendChild(item);
    });
  }

  // ─── Clear just the scan results / highlights (keep cache) ───────────────
  function clearScan() {
    clearHighlights();
    self.targetAgent = '';
    const inputEl = document.getElementById('pos-input');
    if (inputEl) inputEl.value = '';
    const list = document.getElementById('pos-list');
    if (list) list.innerHTML = '';
    setStatus('Pan around the map to collect portal data, then SCAN.', '');
  }

  // ─── Clear the ownership cache entirely ───────────────────────────────────
  function clearCache() {
    self.cache = {};
    clearHighlights();
    self.targetAgent = '';
    const inputEl = document.getElementById('pos-input');
    if (inputEl) inputEl.value = '';
    const list = document.getElementById('pos-list');
    if (list) list.innerHTML = '';
    updateCacheCount();
    setStatus('Cache cleared. Pan the map to re-collect portal data.', '');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function setStatus(msg, cls) {
    const el = document.getElementById('pos-status');
    if (el) { el.textContent = msg; el.className = cls || ''; }
  }

  function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Extract and store one portal into the cache ─────────────────────────
  function cachePortal(portal) {
    if (!portal || !portal.options || !portal.options.data) return;
    const d    = portal.options.data;
    const guid = portal.options.guid || d.guid;
    if (!guid) return;
    if (!d.resonators || !d.resonators.length) return; // no detail yet

    let owner        = d.capturedBy || null;
    const resonators = [];
    const counts     = {};
    d.resonators.forEach(function (r) {
      if (!r || !r.owner) return;
      resonators.push({ owner: r.owner, level: r.level });
      counts[r.owner] = (counts[r.owner] || 0) + 1;
    });
    if (!owner && Object.keys(counts).length) {
      owner = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    }
    if (!owner) return;

    var ll = null;
    try { ll = portal.getLatLng(); } catch (e) {}

    self.cache[guid] = {
      guid,
      title     : d.title || '(unnamed)',
      lat       : ll ? ll.lat : null,
      lng       : ll ? ll.lng : null,
      team      : d.team || 'N',
      level     : d.level || 0,
      owner,
      resonators,
    };
    updateCacheCount();
  }

  // ─── Hook IITC events ─────────────────────────────────────────────────────
  function hookEvents() {
    // portalAdded fires for every portal as tile data loads while panning/zooming.
    // At zoom 15+ the tile data includes resonators and owner info.
    window.addHook('portalAdded', function (data) {
      if (data && data.portal) cachePortal(data.portal);
    });

    // Catch portals already on screen when plugin first loads
    window.addHook('mapDataRefreshEnd', function () {
      var portals = window.portals || {};
      for (var guid in portals) {
        cachePortal(portals[guid]);
      }
    });

    // Also grab data on explicit portal clicks (belt-and-suspenders)
    window.addHook('portalDetailLoaded', function (data) {
      if (!data || !data.guid) return;
      var portal = window.portals && window.portals[data.guid];
      if (portal) cachePortal(portal);
    });
  }

  // ─── Setup ────────────────────────────────────────────────────────────────
  self.setup = function () {
    injectCSS();
    buildUI();
    hookEvents();
    console.log('[IITC] Portal Owner Scanner v2.0 loaded.');
  };

  if (window.iitcLoaded) {
    self.setup();
  } else {
    window.addHook('iitcLoaded', self.setup);
  }

})();