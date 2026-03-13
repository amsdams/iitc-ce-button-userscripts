// ==UserScript==
// @name          IITC Plugin: Portal Owner Scanner v1.2.0
// @category      Highlighter
// @version       1.2.0
// @description   Scan and highlight portals owned by a specific agent. Filter by agent name and see results in a panel.
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

  // ─── State ─────────────────────────────────────────────────────────────────
  self.targetAgent  = '';
  self.matchedGuids = new Set();
  self.layer        = null;
  self.markers      = [];
  
  // New Automation State
  self.cache        = {}; // guid -> { owner, title, team, latlng, level, time }
  self.isScanning   = false;
  self.fetchQueue   = [];
  self.scanPoints   = [];
  self.currentScanIdx = 0;
  self.fetchTimer   = null;
  self.scanTimer    = null;
  self.fetchDelay   = 3000; // 3 seconds per request (Safe Mode)

  // ─── CSS ───────────────────────────────────────────────────────────────────
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
      width: 310px;
      max-height: 85vh;
      z-index: 9001;
      background: #1a1a1a;
      border: 1px solid #03fe03;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      color: #ccc;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0,0,0,0.7);
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
    }
    #pos-close-btn {
      background: none;
      border: none;
      color: #03fe03;
      font-size: 18px;
      cursor: pointer;
      line-height: 1;
      padding: 0 2px;
    }
    #pos-close-btn:hover { color: #fff; }

    #pos-search-row {
      display: flex;
      gap: 5px;
      padding: 8px;
      border-bottom: 1px solid #333;
    }
    #pos-input {
      flex: 1;
      background: #111;
      border: 1px solid #444;
      color: #fff;
      padding: 5px 8px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 12px;
    }
    #pos-input:focus { border-color: #03fe03; outline: none; }
    #pos-go-btn {
      background: #03fe03;
      color: #000;
      border: none;
      padding: 5px 10px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
    }
    #pos-go-btn:hover { background: #00cc00; }
    #pos-clr-btn {
      background: #333;
      color: #aaa;
      border: none;
      padding: 5px 8px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 12px;
      cursor: pointer;
    }
    #pos-clr-btn:hover { background: #555; }

    #pos-opts {
      padding: 6px 8px;
      border-bottom: 1px solid #333;
      display: flex;
      flex-direction: column;
      gap: 5px;
      font-size: 11px;
      color: #aaa;
    }
    #pos-opts label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
    #pos-opts input[type=checkbox] { accent-color: #03fe03; }
    #pos-opts select {
      background: #111;
      color: #ccc;
      border: 1px solid #444;
      font-family: monospace;
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 3px;
      margin-left: auto;
    }

    #pos-auto-row {
      padding: 8px;
      background: #151515;
      border-bottom: 1px solid #333;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    
    #pos-agent-stats {
      max-height: 120px;
      overflow-y: auto;
      background: #0a0a0a;
      border-bottom: 1px solid #333;
      font-size: 10px;
    }
    #pos-agent-table {
      width: 100%;
      border-collapse: collapse;
    }
    #pos-agent-table th {
      text-align: left;
      padding: 4px 8px;
      color: #03fe03;
      border-bottom: 1px solid #222;
      position: sticky;
      top: 0;
      background: #111;
    }
    #pos-agent-table td {
      padding: 3px 8px;
      border-bottom: 1px solid #111;
      cursor: pointer;
    }
    #pos-agent-table tr:hover { background: #1a1a1a; }
    .pos-stat-count { text-align: right; color: #03fe03; font-weight: bold; }

    #pos-scan-btn {
      background: #8800cc;
      color: #fff;
      border: none;
      padding: 6px;
      border-radius: 3px;
      font-family: monospace;
      font-weight: bold;
      cursor: pointer;
    }
    #pos-scan-btn:hover { background: #aa00ff; }
    #pos-scan-btn.scanning { background: #cc0000; }

    #pos-stats {
      font-size: 10px;
      color: #888;
      display: flex;
      justify-content: space-between;
      padding: 0 2px;
    }

    #pos-status {
      padding: 6px 10px;
      font-size: 11px;
      color: #777;
      border-bottom: 1px solid #222;
    }
    #pos-status.pos-found   { color: #03fe03; }
    #pos-status.pos-scan    { color: #ffaa00; }
    #pos-status.pos-error   { color: #ff5555; }

    #pos-list { overflow-y: auto; flex: 1; }

    .pos-item {
      padding: 7px 10px;
      border-bottom: 1px solid #222;
      cursor: pointer;
    }
    .pos-item:hover { background: #252525; }
    .pos-item-name { color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pos-item-meta { color: #666; font-size: 10px; margin-top: 2px; }
    .pos-team-E .pos-item-name { color: #03fe03; }
    .pos-team-R .pos-item-name { color: #4fc3f7; }

    #pos-footer {
      padding: 5px 10px;
      font-size: 10px;
      color: #444;
      border-top: 1px solid #222;
      text-align: center;
    }
  `;

  // ─── Inject CSS ─────────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('pos-style')) return;
    const s = document.createElement('style');
    s.id = 'pos-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ─── Build UI ───────────────────────────────────────────────────────────────
  function buildUI() {
    if (document.getElementById('pos-btn')) return; // already built

    // Toggle button
    const btn = document.createElement('button');
    btn.id = 'pos-btn';
    btn.textContent = '👤 Owner Scan v1.2.0';
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'pos-panel';
    panel.innerHTML = `
      <div id="pos-header">
        <span>⬡ PORTAL OWNER SCANNER v1.2.0</span>
        <button id="pos-close-btn">✕</button>
      </div>
      <div id="pos-search-row">
        <input id="pos-input" type="text" placeholder="Agent name…" autocomplete="off" spellcheck="false" />
        <button id="pos-go-btn">SCAN</button>
        <button id="pos-clr-btn">CLR</button>
      </div>
      <div id="pos-auto-row">
        <button id="pos-scan-btn">START AREA SCAN (SPIRAL)</button>
        <div id="pos-stats">
          <span id="pos-stat-queue">Queue: 0</span>
          <span id="pos-stat-cache">Cached: 0</span>
        </div>
      </div>
      <div id="pos-agent-stats">
        <table id="pos-agent-table">
          <thead>
            <tr>
              <th style="width:70%">AGENT</th>
              <th style="text-align:right">PORTALS</th>
            </tr>
          </thead>
          <tbody id="pos-agent-tbody">
            <tr><td colspan="2" style="text-align:center; padding:10px; color:#555">Scan area to discover agents...</td></tr>
          </tbody>
        </table>
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
        <label style="margin-top:5px; color:#ff5555; font-size:9px; cursor:pointer;" id="pos-wipe-cache">⚠ WIPE LOCAL CACHE</label>
      </div>
      <div id="pos-status">Enter an agent name and press SCAN.</div>
      <div id="pos-list"></div>
      <div id="pos-footer">Scans portals in view + local cache</div>
    `;
    document.body.appendChild(panel);

    document.getElementById('pos-close-btn').addEventListener('click', togglePanel);
    document.getElementById('pos-go-btn').addEventListener('click', runScan);
    document.getElementById('pos-clr-btn').addEventListener('click', clearAll);
    document.getElementById('pos-scan-btn').addEventListener('click', toggleAreaScan);
    document.getElementById('pos-wipe-cache').addEventListener('click', wipeCache);
    document.getElementById('pos-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') runScan();
    });

    updateStats();
  }

  // ─── Toggle ─────────────────────────────────────────────────────────────────
  function togglePanel() {
    const panel = document.getElementById('pos-panel');
    if (panel) {
      panel.classList.toggle('pos-open');
      if (panel.classList.contains('pos-open')) {
        document.getElementById('pos-input').focus();
      }
    }
  }

  // ─── Cache Management ──────────────────────────────────────────────────────
  function loadCache() {
    try {
      const data = localStorage.getItem('iitc_pos_cache');
      if (data) self.cache = JSON.parse(data);
    } catch (e) { console.error('[POS] Error loading cache', e); self.cache = {}; }
  }

  function saveCache() {
    try {
      localStorage.setItem('iitc_pos_cache', JSON.stringify(self.cache));
      updateStats();
    } catch (e) { console.error('[POS] Error saving cache', e); }
  }

  function wipeCache() {
    if (confirm('Are you sure you want to clear ALL cached portal ownership data?')) {
      self.cache = {};
      saveCache();
      alert('Cache cleared.');
      runScan();
    }
  }

  function updateStats() {
    const q = document.getElementById('pos-stat-queue');
    const c = document.getElementById('pos-stat-cache');
    if (q) q.textContent = 'Queue: ' + self.fetchQueue.length;
    if (c) c.textContent = 'Cached: ' + Object.keys(self.cache).length;
    renderAgentStats();
  }

  function renderAgentStats() {
    const tbody = document.getElementById('pos-agent-tbody');
    if (!tbody) return;

    const counts = {};
    for (const guid in self.cache) {
      const owner = self.cache[guid].owner;
      if (owner) counts[owner] = (counts[owner] || 0) + 1;
    }

    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 50);
    
    if (sorted.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:10px; color:#555">Scan area to discover agents...</td></tr>';
      return;
    }

    tbody.innerHTML = sorted.map(name => `
      <tr onclick="window.plugin.portalOwnerScanner.selectAgent('${esc(name)}')">
        <td>${esc(name)}</td>
        <td class="pos-stat-count">${counts[name]}</td>
      </tr>
    `).join('');
  }

  self.selectAgent = function(name) {
    const input = document.getElementById('pos-input');
    if (input) {
      input.value = name;
      runScan();
    }
  };

  function updatePortalInCache(guid, details) {
    if (!guid || !details || !details.owner) return;
    self.cache[guid] = {
      owner: details.owner,
      title: details.title,
      team:  details.team,
      level: details.level,
      latlng: [details.latE6 / 1e6, details.lngE6 / 1e6],
      time:  Date.now()
    };
    saveCache();
  }

  // ─── Automated Scanning (Spiral) ───────────────────────────────────────────
  function toggleAreaScan() {
    if (self.isScanning) {
      stopScan();
    } else {
      startScan();
    }
  }

  function startScan() {
    if (window.map.getZoom() < 15) {
      alert('Please zoom in to Level 15 or higher for accurate scanning.');
      return;
    }
    self.isScanning = true;
    const btn = document.getElementById('pos-scan-btn');
    if (btn) {
      btn.textContent = 'STOP SCANNING';
      btn.classList.add('scanning');
    }
    
    // Generate spiral points
    const center = window.map.getCenter();
    self.scanPoints = generateSpiralPoints(center, 25); // 25 steps
    self.currentScanIdx = 0;
    
    setStatus('Starting automated area scan...', 'pos-scan');
    runSpiralStep();
    startQueueProcessor();
  }

  function stopScan() {
    self.isScanning = false;
    const btn = document.getElementById('pos-scan-btn');
    if (btn) {
      btn.textContent = 'START AREA SCAN (SPIRAL)';
      btn.classList.remove('scanning');
    }
    clearTimeout(self.scanTimer);
    setStatus('Scan stopped.', '');
  }

  function generateSpiralPoints(center, count) {
    const points = [center];
    const zoom   = window.map.getZoom();
    // Distance between steps based on zoom
    const step = 0.005 / (Math.pow(2, zoom - 15)); 
    
    let x = 0, y = 0, dx = 0, dy = -1;
    for (let i = 0; i < count; i++) {
      if ((-count / 2 < x && x <= count / 2) && (-count / 2 < y && y <= count / 2)) {
        if (i > 0) {
          points.push(L.latLng(center.lat + (y * step), center.lng + (x * step)));
        }
      }
      if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
        [dx, dy] = [-dy, dx];
      }
      x += dx; y += dy;
    }
    return points;
  }

  function runSpiralStep() {
    if (!self.isScanning) return;
    if (self.currentScanIdx >= self.scanPoints.length) {
      stopScan();
      setStatus('Area scan complete!', 'pos-found');
      return;
    }

    const point = self.scanPoints[self.currentScanIdx++];
    window.map.panTo(point);
    
    // Wait for map to settle and load data
    self.scanTimer = setTimeout(function() {
      queueVisiblePortals();
      // Move to next point after a delay (allowing time for details to start fetching)
      self.scanTimer = setTimeout(runSpiralStep, 8000); 
    }, 3000);
  }

  // ─── Detail Fetching Queue ────────────────────────────────────────────────
  function queueVisiblePortals() {
    const portals = window.portals || {};
    let count = 0;
    for (const guid in portals) {
      if (!self.cache[guid]) {
        if (self.fetchQueue.indexOf(guid) === -1) {
          self.fetchQueue.push(guid);
          count++;
        }
      }
    }
    updateStats();
    if (count > 0 && !self.fetchTimer) startQueueProcessor();
  }

  function startQueueProcessor() {
    if (self.fetchTimer) return;
    processQueue();
  }

  function processQueue() {
    if (self.fetchQueue.length === 0) {
      self.fetchTimer = null;
      updateStats();
      return;
    }

    const guid = self.fetchQueue.shift();
    updateStats();

    // Check if still not in cache
    if (self.cache[guid]) {
      processQueue();
      return;
    }

    // Standard IITC portalDetail.get() does NOT return a promise.
    // It initiates a request, and the data is returned via the 'portalDetailLoaded' hook.
    if (window.portalDetail && typeof window.portalDetail.get === 'function') {
      window.portalDetail.get(guid);
    }

    // Move to the next item after the delay. The 'portalDetailLoaded' hook
    // handles the actual data storage when it arrives.
    self.fetchTimer = setTimeout(processQueue, self.fetchDelay);
  }

  // ─── Scan ───────────────────────────────────────────────────────────────────
  function runScan() {
    const inputEl = document.getElementById('pos-input');
    const input   = inputEl ? inputEl.value.trim() : '';
    if (!input) { setStatus('Please enter an agent name.', 'pos-error'); return; }

    self.targetAgent = input;
    const exact = document.getElementById('pos-exact').checked;
    const cs    = document.getElementById('pos-case').checked;
    const color = document.getElementById('pos-color').value;

    setStatus('Scanning current view + cache…', 'pos-scan');
    clearHighlights();
    self.matchedGuids.clear();

    const needle  = cs ? input : input.toLowerCase();
    const hits    = [];
    
    // 1. Scan current map view
    const portals = window.portals || {};
    for (const guid in portals) {
      const p    = portals[guid];
      const data = p.options && p.options.data;
      const owner = resolveOwner(data, guid);
      if (!owner || typeof owner !== 'string') continue;

      const hay = cs ? owner : owner.toLowerCase();
      const ok  = exact ? hay === needle : hay.indexOf(needle) !== -1;
      if (ok) {
        hits.push({ guid, portal: p, data, owner, fromMap: true });
        self.matchedGuids.add(guid);
      }
    }

    // 2. Scan Cache for portals NOT in current view
    for (const guid in self.cache) {
      if (self.matchedGuids.has(guid)) continue;
      
      const entry = self.cache[guid];
      if (!entry || !entry.owner || typeof entry.owner !== 'string') continue;

      const hay = cs ? entry.owner : entry.owner.toLowerCase();
      const ok  = exact ? hay === needle : hay.indexOf(needle) !== -1;
      if (ok) {
        hits.push({ 
          guid, 
          owner: entry.owner, 
          data: { 
            title: entry.title, 
            team: entry.team, 
            level: entry.level,
            latE6: (entry.latlng ? entry.latlng[0] : 0) * 1e6,
            lngE6: (entry.latlng ? entry.latlng[1] : 0) * 1e6
          }, 
          fromCache: true 
        });
        self.matchedGuids.add(guid);
      }
    }

    drawHighlights(hits, color);
    renderList(hits);

    if (hits.length === 0) {
      setStatus('No portals found for "' + input + '".', 'pos-error');
    } else {
      setStatus('Found ' + hits.length + ' portal' + (hits.length !== 1 ? 's' : '') + ' for "' + input + '".', 'pos-found');
    }
  }

  // ─── Resolve portal owner ─────────────────────────────────────────────────
  function resolveOwner(data, guid) {
    // Priority: 1. Summary Data, 2. Cache
    if (data && data.capturedBy) return data.capturedBy;
    if (data && data.resonators && data.resonators.length) {
      const counts = {};
      data.resonators.forEach(function (r) {
        if (r && r.owner) counts[r.owner] = (counts[r.owner] || 0) + 1;
      });
      const keys = Object.keys(counts);
      if (keys.length) {
        keys.sort(function (a, b) { return counts[b] - counts[a]; });
        return keys[0];
      }
    }
    // Check cache
    if (guid && self.cache[guid]) return self.cache[guid].owner;
    return null;
  }

  // ─── Map highlights ───────────────────────────────────────────────────────
  function drawHighlights(hits, color) {
    if (!self.layer) {
      self.layer = L.layerGroup();
      self.layer.addTo(window.map);
    }
    hits.forEach(function (h) {
      try {
        let ll;
        if (h.portal) {
          ll = h.portal.getLatLng();
        } else if (h.fromCache && self.cache[h.guid]) {
          ll = L.latLng(self.cache[h.guid].latlng);
        }
        if (!ll) return;

        var c = L.circleMarker(ll, {
          radius: 14, color: color, weight: 3,
          opacity: 0.9, fillColor: color, fillOpacity: 0.15,
          interactive: false
        });
        self.layer.addLayer(c);
        self.markers.push(c);
      } catch (e) {}
    });
  }

  function clearHighlights() {
    if (self.layer) self.layer.clearLayers();
    self.markers = [];
  }

  // ─── Results list ─────────────────────────────────────────────────────────
  function renderList(hits) {
    const list = document.getElementById('pos-list');
    if (!list) return;
    list.innerHTML = '';

    hits.sort(function (a, b) {
      return (a.data.title || '').localeCompare(b.data.title || '');
    }).forEach(function (h) {
      const team  = h.data.team || 'N';
      const level = h.data.level != null ? 'L' + h.data.level : '';
      const title = h.data.title || '(unnamed)';

      var resCount = 0;
      const cs     = document.getElementById('pos-case').checked;
      const exact  = document.getElementById('pos-exact').checked;
      const needle = cs ? self.targetAgent : self.targetAgent.toLowerCase();
      (h.data.resonators || []).forEach(function (r) {
        if (!r || !r.owner || typeof r.owner !== 'string') return;
        var o = cs ? r.owner : r.owner.toLowerCase();
        if (exact ? o === needle : o.indexOf(needle) !== -1) resCount++;
      });

      const item = document.createElement('div');
      item.className = 'pos-item pos-team-' + team;
      item.innerHTML =
        '<div class="pos-item-name">' + esc(title) + '</div>' +
        '<div class="pos-item-meta">' + level +
          (level ? ' · ' : '') +
          'owner: <b style="color:#ddd">' + esc(h.owner) + '</b>' +
          (resCount ? ' · ' + resCount + ' res.' : '') +
        '</div>';
      item.addEventListener('click', function () {
        try {
          var ll = h.portal.getLatLng();
          window.map.setView(ll, Math.max(window.map.getZoom(), 15));
          if (window.selectPortalByLatLng) window.selectPortalByLatLng(ll.lat, ll.lng);
        } catch (e) {}
      });
      list.appendChild(item);
    });
  }

  // ─── Clear all ────────────────────────────────────────────────────────────
  function clearAll() {
    clearHighlights();
    self.matchedGuids.clear();
    self.targetAgent = '';
    const inputEl = document.getElementById('pos-input');
    if (inputEl) inputEl.value = '';
    const list = document.getElementById('pos-list');
    if (list) list.innerHTML = '';
    setStatus('Enter an agent name and press SCAN.', '');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function setStatus(msg, cls) {
    const el = document.getElementById('pos-status');
    if (el) { el.textContent = msg; el.className = cls || ''; }
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Auto-rescan on map data refresh ─────────────────────────────────────
  function hookEvents() {
    window.addHook('mapDataRefreshEnd', function () {
      if (self.targetAgent) runScan();
      if (self.isScanning) queueVisiblePortals();
    });

    window.addHook('portalDetailLoaded', function (data) {
      if (data && data.guid && data.details) {
        updatePortalInCache(data.guid, data.details);
        // If we are actively searching for an agent, rescan whenever new data comes in
        if (self.targetAgent) runScan(); 
      }
    });
  }

  // ─── Plugin setup ─────────────────────────────────────────────────────────
  self.setup = function () {
    loadCache();
    injectCSS();
    buildUI();
    hookEvents();
    console.log('[IITC] Portal Owner Scanner v1.2.0 (Automated) loaded OK');
  };

  // Register with IITC — works whether iitcLoaded already fired or not
  if (window.iitcLoaded) {
    self.setup();
  } else {
    window.addHook('iitcLoaded', self.setup);
  }

})();
