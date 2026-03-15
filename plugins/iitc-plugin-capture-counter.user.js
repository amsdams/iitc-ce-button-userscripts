// ==UserScript==
// @name        IITC Plugin: Capture Counter v1.6.1
// @description Tracks portal captures. Deduplicates by GUID. Summary bar, search/filter, team toggles, sortable table, first/last portal links.
// @namespace   https://iitc.app/plugins/capture-counter
// @version     1.6.1
// @author      IITC Community
// @match       https://intel.ingress.com/*
// @updateURL   https://github.com/amsdams/iitc-ce-button-userscripts/raw/main/plugins/iitc-plugin-capture-counter.user.js
// @downloadURL https://github.com/amsdams/iitc-ce-button-userscripts/raw/main/plugins/iitc-plugin-capture-counter.user.js
// @grant       none
// ==/UserScript==

(function () {
  'use strict';

  var name = "IITC Plugin: Capture Counter v1.6.1";
  var version = "1.6.1";
  var description = "Tracks portal captures. Deduplicates by GUID. Summary bar, search/filter, team toggles, sortable table, first/last portal links.";
  var header = {
  	name: name,
  	version: version,
  	description: description};

  // ── State ──────────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'iitc-capture-counter';
  const SEEN_GUIDS_KEY = 'iitc-capture-counter-guids';
  const SEEN_GUIDS_CAP = 20000;
  let captures = {};
  let seenGuids = new Set();
  let totalCount = 0;
  function rebuildTotal() {
      totalCount = 0;
      for (const name in captures) {
          totalCount += captures[name].count;
      }
  }
  // ── Persistence ────────────────────────────────────────────────────────────
  let saveTimer = null;
  function saveData() {
      if (saveTimer)
          return;
      saveTimer = setTimeout(() => {
          saveTimer = null;
          try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(captures));
              // Efficiently cap the Set size using an iterator
              if (seenGuids.size > SEEN_GUIDS_CAP) {
                  const keys = seenGuids.keys();
                  for (let i = 0, diff = seenGuids.size - SEEN_GUIDS_CAP; i < diff; i++) {
                      seenGuids.delete(keys.next().value);
                  }
              }
              localStorage.setItem(SEEN_GUIDS_KEY, JSON.stringify([...seenGuids]));
          }
          catch (_e) { }
      }, 1000);
  }
  function loadData() {
      try {
          const r = localStorage.getItem(STORAGE_KEY);
          if (r)
              captures = JSON.parse(r);
          const g = localStorage.getItem(SEEN_GUIDS_KEY);
          if (g)
              seenGuids = new Set(JSON.parse(g));
      }
      catch (_e) {
          captures = {};
          seenGuids = new Set();
      }
      rebuildTotal();
  }
  // ── CSS ────────────────────────────────────────────────────────────────────
  function addCSS() {
      const style = document.createElement('style');
      style.textContent = `
    #capture-counter-dialog { width: 260px; }
    .ui-dialog:has(#capture-counter-dialog) { width: 300px !important; min-width: 300px !important; }
    #capture-counter-dialog .cc-toolbar { display: flex; gap: 5px; margin-bottom: 6px; align-items: center; }
    #capture-counter-dialog .cc-toolbar button { padding: 2px 8px; font-size: 11px; cursor: pointer; }
    #capture-counter-dialog .cc-count { font-size: 11px; color: #aaa; margin-left: auto; white-space: nowrap; }
    #cc-summary { display: flex; gap: 4px; margin-bottom: 6px; }
    #cc-summary .cc-sum-box { flex: 1; padding: 3px 4px; border-radius: 3px; text-align: center; font-weight: bold; font-size: 13px; line-height: 1.3; cursor: pointer; user-select: none; transition: opacity .15s; }
    #cc-summary .cc-sum-box.cc-dim { opacity: .35; }
    #cc-summary .cc-sum-enl { background: #0d2b0d; color: #03dc03; border: 1px solid #1a5c1a; }
    #cc-summary .cc-sum-res { background: #0a1a2b; color: #00c5ff; border: 1px solid #0a3d5c; }
    #cc-summary .cc-sum-mac { background: #2b1a0a; color: #f5a623; border: 1px solid #5c3a0a; }
    #cc-summary .cc-sum-label { font-size: 9px; font-weight: normal; opacity: .65; display: block; }
    #cc-search-wrap { margin-bottom: 5px; position: relative; }
    #cc-search { width: 100%; box-sizing: border-box; background: #111; border: 1px solid #444; border-radius: 3px; color: #ddd; font-size: 12px; padding: 3px 22px 3px 6px; outline: none; }
    #cc-search:focus { border-color: #666; }
    #cc-search-clear { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #555; font-size: 13px; line-height: 1; display: none; }
    #cc-search-clear.visible { display: block; }
    #cc-search-clear:hover { color: #aaa; }
    #capture-counter-table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
    #capture-counter-table th { text-align: left; border-bottom: 1px solid #555; padding: 3px 4px; color: #bbb; position: sticky; top: 0; background: #1b1b1b; font-size: 11px; user-select: none; }
    #capture-counter-table th.cc-sortable { cursor: pointer; }
    #capture-counter-table th.cc-sortable:hover { color: #fff; }
    #capture-counter-table th.cc-sort-active { color: #fff; }
    #capture-counter-table td { padding: 3px 4px; border-bottom: 1px solid #2a2a2a; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    #capture-counter-table tr:hover td { background: #252525; }
    #capture-counter-table tr.cc-selected td { background: #1c2b1c; }
    #capture-counter-table tr.cc-no-results td { color: #555; text-align: center; font-style: italic; padding: 10px 4px; }
    @keyframes cc-flash { 0% { background: #2a3a1a; } 100% { background: transparent; } }
    #capture-counter-table tr.cc-new td { animation: cc-flash 1.4s ease-out forwards; }
    #capture-counter-table col.col-rank  { width: 22px; }
    #capture-counter-table col.col-agent { width: auto; }
    #capture-counter-table col.col-count { width: 36px; }
    #capture-counter-table .cc-rank  { color: #666; text-align: center; font-size: 10px; }
    #capture-counter-table .cc-count-cell { text-align: right; font-weight: bold; color: #fff; }
    #capture-counter-dialog .cc-agent-name { cursor: pointer; text-decoration: underline dotted; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #capture-counter-dialog .cc-agent-name:hover { opacity: .8; }
    #capture-counter-dialog .cc-enl { color: #03dc03; }
    #capture-counter-dialog .cc-res { color: #00c5ff; }
    #capture-counter-dialog .cc-mac { color: #f5a623; }
    .cc-scroll-wrap { max-height: 280px; overflow-y: auto; overflow-x: hidden; }
    #capture-counter-status { font-size: 10px; color: #666; margin-top: 4px; text-align: right; }
    #cc-agent-detail { margin-top: 6px; padding: 5px 7px; background: #1a1a1a; border: 1px solid #3a3a3a; border-radius: 3px; font-size: 11px; line-height: 1.5; display: none; }
    #cc-agent-detail.visible { display: block; }
    #cc-agent-detail .cc-detail-name { font-weight: bold; font-size: 12px; margin-bottom: 2px; }
    #cc-agent-detail .cc-detail-label { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; margin-top: 3px; }
    #cc-agent-detail .cc-detail-portal { color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #cc-agent-detail .cc-detail-portal a { color: #f5a623; text-decoration: none; cursor: pointer; }
    #cc-agent-detail .cc-detail-portal a:hover { text-decoration: underline; }
    #cc-agent-detail .cc-detail-portal a.cc-portal-visited { color: #c47a10; }
    #cc-agent-detail .cc-detail-time { color: #555; font-size: 10px; }
    #cc-agent-detail .cc-close { float: right; cursor: pointer; color: #555; font-size: 13px; line-height: 1; margin-left: 4px; }
    #cc-agent-detail .cc-close:hover { color: #aaa; }
  `;
      (document.head || document.getElementsByTagName('head')[0]).appendChild(style);
  }
  // ── Helpers ────────────────────────────────────────────────────────────────
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const teamClass = (team) => team === 'ENLIGHTENED' ? 'ENL' : team === 'RESISTANCE' ? 'RES' : team === 'MACHINA' ? 'MAC' : '';
  function fmtTime(ts) {
      if (!ts)
          return '';
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
          d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function portalLinkHtml(portalName, portalGuid, portalLatLng) {
      if (!portalName)
          return '<span style="color:#444">—</span>';
      if (portalLatLng && portalLatLng.lat != null) {
          const { lat, lng } = portalLatLng;
          const visited = visitedPortals.has(portalGuid || portalName) ? ' cc-portal-visited' : '';
          return `<a href="#" class="cc-portal-link${visited}" data-lat="${lat}" data-lng="${lng}" data-guid="${escapeHtml(portalGuid || '')}" data-name="${escapeHtml(portalName)}" title="Pan map to ${escapeHtml(portalName)}">${escapeHtml(portalName)} ↗</a>`;
      }
      return escapeHtml(portalName);
  }
  // ── Dialog state ───────────────────────────────────────────────────────────
  let dialogRef = null;
  let selectedAgent = null;
  let sortMode = 'count';
  let filterQuery = '';
  let teamFilters = new Set(['ENL', 'RES', 'MAC']);
  let flashAgents = new Set();
  let flashTimer = null;
  let visitedPortals = new Set();
  let pollerRef = null;
  // ── Build UI ───────────────────────────────────────────────────────────────
  function buildSummary() {
      const t = { ENL: 0, RES: 0, MAC: 0 };
      for (const name in captures) {
          const tc = teamClass(captures[name].team);
          if (tc)
              t[tc] += captures[name].count;
      }
      const parts = ['ENL', 'RES', 'MAC'].filter(tc => t[tc] > 0).map(tc => {
          const label = tc === 'ENL' ? 'Enlightened' : tc === 'RES' ? 'Resistance' : 'Machina';
          return `<div class="cc-sum-box cc-sum-${tc.toLowerCase()}${teamFilters.has(tc) ? '' : ' cc-dim'}" data-team="${tc}">${t[tc]}<span class="cc-sum-label">${label}</span></div>`;
      });
      return parts.length ? `<div id="cc-summary">${parts.join('')}</div>` : '';
  }
  function buildTable() {
      let entries = Object.entries(captures).map(([name, info]) => ({ name, tc: teamClass(info.team), count: info.count, lastTs: info.lastTs || 0 }));
      entries = entries.filter(e => (e.tc ? teamFilters.has(e.tc) : teamFilters.size === 3) && (!filterQuery || e.name.toLowerCase().includes(filterQuery)));
      entries.sort((a, b) => sortMode === 'activity' ? b.lastTs - a.lastTs : (b.count - a.count || b.lastTs - a.lastTs));
      const countArrow = sortMode === 'count' ? ' ▼' : '';
      const actArrow = sortMode === 'activity' ? ' ▼' : '';
      const tbody = entries.length ? entries.map((e, i) => {
          let cls = (selectedAgent === e.name ? ' cc-selected' : '') + (flashAgents.has(e.name) ? ' cc-new' : '');
          return `<tr class="${cls.trim()}" data-agent="${escapeHtml(e.name)}"><td class="cc-rank">${i + 1}</td><td><span class="cc-agent-name cc-${e.tc.toLowerCase()}" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span></td><td class="cc-count-cell">${e.count}</td></tr>`;
      }).join('') : `<tr class="cc-no-results"><td colspan="3">${filterQuery ? 'No matching agents' : 'No captures yet'}</td></tr>`;
      return `<div class="cc-scroll-wrap"><table id="capture-counter-table"><colgroup><col class="col-rank"><col class="col-agent"><col class="col-count"></colgroup><thead><tr><th class="cc-rank">#</th><th class="cc-sortable${sortMode === 'activity' ? ' cc-sort-active' : ''}" data-sort="activity">Agent${actArrow}</th><th class="cc-count-cell cc-sortable${sortMode === 'count' ? ' cc-sort-active' : ''}" data-sort="count">↓${countArrow}</th></tr></thead><tbody>${tbody}</tbody></table></div>`;
  }
  function buildDetailPanel(agentName) {
      const info = agentName ? captures[agentName] : null;
      if (!info)
          return '<div id="cc-agent-detail"></div>';
      const showLast = info.count > 1 && (info.lastTs !== info.firstTs || info.lastPortal !== info.firstPortal);
      return `<div id="cc-agent-detail" class="visible"><span class="cc-close" id="cc-detail-close">✕</span><div class="cc-detail-name cc-${teamClass(info.team).toLowerCase()}">${escapeHtml(agentName)} <span style="color:#555;font-size:10px">(${info.count} cap${info.count !== 1 ? 's' : ''})</span></div><div class="cc-detail-label">First capture</div><div class="cc-detail-portal">${portalLinkHtml(info.firstPortal, info.firstPortalGuid, info.firstPortalLatLng)}</div><div class="cc-detail-time">${fmtTime(info.firstTs)}</div>${showLast ? `<div class="cc-detail-label">Last capture</div><div class="cc-detail-portal">${portalLinkHtml(info.lastPortal, info.lastPortalGuid, info.lastPortalLatLng)}</div><div class="cc-detail-time">${fmtTime(info.lastTs)}</div>` : ''}</div>`;
  }
  function openDialog() {
      if (dialogRef)
          return refreshDialog();
      const html = `<div id="capture-counter-dialog"><div class="cc-toolbar"><button id="cc-btn-reset">Reset</button><span class="cc-count">${Object.keys(captures).length} agents · ${totalCount} caps</span></div><div id="cc-summary-wrap">${buildSummary()}</div><div id="cc-search-outer"><div id="cc-search-wrap"><input id="cc-search" type="text" placeholder="Search agents…" value="${escapeHtml(filterQuery)}"><span id="cc-search-clear" class="${filterQuery ? 'visible' : ''}">✕</span></div></div><div id="cc-table-wrap">${buildTable()}</div><div id="cc-detail-wrap">${buildDetailPanel(selectedAgent)}</div><div id="capture-counter-status">Listening for comms…</div></div>`;
      dialogRef = window.dialog({ title: `📡 Capture Counter v${header.version}`, html, id: 'capture-counter', closeCallback: () => { if (pollerRef)
              clearInterval(pollerRef); pollerRef = null; dialogRef = null; } });
      bindDialogEvents();
  }
  function bindDialogEvents() {
      const d = document.getElementById('capture-counter-dialog');
      if (!d)
          return;
      d.oninput = (e) => {
          if (e.target.id !== 'cc-search')
              return;
          filterQuery = e.target.value.toLowerCase();
          document.getElementById('cc-search-clear')?.classList.toggle('visible', !!filterQuery);
          const tw = document.getElementById('cc-table-wrap');
          if (tw)
              tw.innerHTML = buildTable();
      };
      d.onclick = (e) => {
          const target = e.target;
          if (target.id === 'cc-search-clear') {
              filterQuery = '';
              document.getElementById('cc-search').value = '';
              target.classList.remove('visible');
              const tw = document.getElementById('cc-table-wrap');
              if (tw)
                  tw.innerHTML = buildTable();
          }
          else if (target.closest('.cc-sum-box')) {
              const team = target.closest('.cc-sum-box').dataset.team;
              teamFilters.has(team) ? (teamFilters.size > 1 && teamFilters.delete(team)) : teamFilters.add(team);
              refreshDialog();
          }
          else if (target.closest('th[data-sort]')) {
              sortMode = target.closest('th').dataset.sort;
              refreshDialog();
          }
          else if (target.id === 'cc-btn-reset' && confirm('Reset all data?')) {
              captures = {};
              seenGuids.clear();
              totalCount = 0;
              selectedAgent = null;
              filterQuery = '';
              teamFilters = new Set(['ENL', 'RES', 'MAC']);
              saveData();
              refreshDialog();
          }
          else if (target.id === 'cc-detail-close') {
              selectedAgent = null;
              refreshDialog();
          }
          else if (target.closest('.cc-agent-name')) {
              const name = target.closest('tr').dataset.agent;
              selectedAgent = selectedAgent === name ? null : name;
              refreshDialog();
          }
          else if (target.closest('.cc-portal-link')) {
              e.preventDefault();
              const p = target.closest('.cc-portal-link').dataset;
              const lat = parseFloat(p.lat), lng = parseFloat(p.lng), guid = p.guid;
              if (!isNaN(lat)) {
                  window.map.setView([lat, lng], Math.max(window.map.getZoom(), 15));
                  if (pollerRef)
                      clearInterval(pollerRef);
                  if (guid && window.portals?.[guid])
                      window.selectPortal(guid);
                  else if (guid) {
                      let att = 0;
                      pollerRef = setInterval(() => {
                          if (!dialogRef || ++att > 10 || window.portals?.[guid]) {
                              if (window.portals?.[guid])
                                  window.selectPortal(guid);
                              clearInterval(pollerRef);
                              pollerRef = null;
                          }
                      }, 500);
                  }
                  visitedPortals.add(guid || p.name);
                  const dw = document.getElementById('cc-detail-wrap');
                  if (dw)
                      dw.innerHTML = buildDetailPanel(selectedAgent);
              }
          }
      };
  }
  function refreshDialog() {
      if (flashTimer)
          clearTimeout(flashTimer);
      const sw = document.getElementById('cc-summary-wrap'), tw = document.getElementById('cc-table-wrap'), dw = document.getElementById('cc-detail-wrap');
      if (sw)
          sw.innerHTML = buildSummary();
      if (tw)
          tw.innerHTML = buildTable();
      if (dw)
          dw.innerHTML = buildDetailPanel(selectedAgent);
      const countEl = document.querySelector('#capture-counter-dialog .cc-count');
      if (countEl)
          countEl.textContent = `${Object.keys(captures).length} agents · ${totalCount} caps`;
      const st = document.getElementById('capture-counter-status');
      if (st)
          st.textContent = 'Updated ' + new Date().toLocaleTimeString();
      if (flashAgents.size)
          flashTimer = setTimeout(() => { flashAgents.clear(); flashTimer = null; }, 1500);
  }
  const CAPTURE_REGEX = /\bcaptured\b/i;
  function processPlexts(data) {
      const result = data?.result;
      if (!Array.isArray(result))
          return;
      let changed = false;
      result.forEach((entry) => {
          const guid = entry[0], obj = entry[2];
          if (!guid || seenGuids.has(guid) || !obj?.plext?.markup || (obj.plext.plextType && obj.plext.plextType !== 'SYSTEM_BROADCAST'))
              return;
          const markup = obj.plext.markup;
          if (!markup.some((s) => s[0] === 'TEXT' && CAPTURE_REGEX.test(s[1].plain)))
              return;
          const player = markup.find((s) => s[0] === 'PLAYER')?.[1];
          if (!player?.plain)
              return;
          const portal = markup.find((s) => s[0] === 'PORTAL')?.[1];
          const name = player.plain, ts = entry[1] || Date.now();
          seenGuids.add(guid);
          if (!captures[name])
              captures[name] = { count: 0, team: player.team || 'unknown', firstTs: null, lastTs: null };
          const cur = captures[name];
          cur.count++;
          totalCount++;
          if (player.team)
              cur.team = player.team;
          if (portal?.plain) {
              const latLng = portal.latE6 ? { lat: portal.latE6 / 1e6, lng: portal.lngE6 / 1e6 } : null;
              if (cur.firstTs === null || ts < cur.firstTs) {
                  cur.firstPortal = portal.plain;
                  cur.firstPortalGuid = portal.guid;
                  cur.firstPortalLatLng = latLng;
                  cur.firstTs = ts;
              }
              if (cur.lastTs === null || ts > cur.lastTs) {
                  cur.lastPortal = portal.plain;
                  cur.lastPortalGuid = portal.guid;
                  cur.lastPortalLatLng = latLng;
                  cur.lastTs = ts;
              }
          }
          flashAgents.add(name);
          changed = true;
      });
      if (changed) {
          saveData();
          refreshDialog();
      }
  }
  const setup = () => {
      loadData();
      addCSS();
      window.addHook('publicChatDataAvailable', processPlexts);
      window.addHook('factionChatDataAvailable', processPlexts);
      const w = window;
      if (w.IITC?.toolbox?.addButton)
          w.IITC.toolbox.addButton({ label: '📡 Captures', title: 'Show portal capture leaderboard', action: openDialog });
      else
          w.$('#toolbox').append(`<a onclick="window.plugin.captureCounter.openDialog();return false;" title="Show portal capture leaderboard">📡 Captures</a>`);
      console.log('[Capture Counter] Plugin loaded.');
  };
  // IITC standard plugin registration
  const w = window;
  if (!w.plugin)
      w.plugin = () => { };
  if (!w.plugin.captureCounter)
      w.plugin.captureCounter = {};
  w.plugin.captureCounter.openDialog = openDialog;
  setup.info = { script: { version: header.version, name: header.name, description: header.description } };
  if (!w.bootPlugins)
      w.bootPlugins = [];
  w.bootPlugins.push(setup);
  if (w.iitcLoaded)
      setup();

})();
