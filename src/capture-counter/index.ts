import header from './header.json';

export {};

// ── IITC / External Globals ──────────────────────────────────────────────────
declare global {
  interface Window {
    plugin: any;
    IITC: any;
    addHook: any;
    iitcLoaded: any;
    map: any;
    $: any;
    portals: any;
    selectPortal: any;
    dialog: any;
    bootPlugins: any[];
  }
}

function wrapper(_plugin_info: any) {
  // ── State ──────────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'iitc-capture-counter';
  const SEEN_GUIDS_KEY = 'iitc-capture-counter-guids';
  const SEEN_GUIDS_CAP = 20000;

  let captures: any = {};
  let seenGuids: Set<string> = new Set();
  let totalCount = 0;

  function rebuildTotal() {
    totalCount = Object.values(captures).reduce<number>((s: any, v: any) => s + v.count, 0) as number;
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  let saveTimer: any = null;
  function saveData() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(captures));
        if (seenGuids.size > SEEN_GUIDS_CAP) {
          seenGuids = new Set(Array.from(seenGuids).slice(-SEEN_GUIDS_CAP));
        }
        localStorage.setItem(SEEN_GUIDS_KEY, JSON.stringify(Array.from(seenGuids)));
      } catch (_e) {}
    }, 500);
  }

  function loadData() {
    try {
      const r = localStorage.getItem(STORAGE_KEY);
      if (r) captures = JSON.parse(r);
    } catch (_e) {
      captures = {};
    }
    try {
      const r = localStorage.getItem(SEEN_GUIDS_KEY);
      if (r) seenGuids = new Set(JSON.parse(r));
    } catch (_e) {
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
  function escapeHtml(s: string) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function teamClass(team: string) {
    return team === 'ENLIGHTENED' ? 'ENL' : team === 'RESISTANCE' ? 'RES' : team === 'MACHINA' ? 'MAC' : '';
  }

  function fmtTime(ts: number | null) {
    if (!ts) return '';
    const d = new Date(ts);
    return (
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
  }

  function portalLinkHtml(portalName: string | null, portalGuid: string | null, portalLatLng: any | null) {
    if (!portalName) return '<span style="color:#444">—</span>';
    if (portalLatLng && portalLatLng.lat != null) {
      const { lat, lng } = portalLatLng;
      const guid = escapeHtml(portalGuid || '');
      const visited = visitedPortals.has(portalGuid || portalName) ? ' cc-portal-visited' : '';
      return (
        `<a href="#" class="cc-portal-link${visited}"` +
        ` data-lat="${lat}" data-lng="${lng}"` +
        ` data-guid="${guid}" data-name="${escapeHtml(portalName)}"` +
        ` title="Pan map to ${escapeHtml(portalName)}">${escapeHtml(portalName)} ↗</a>`
      );
    }
    return escapeHtml(portalName);
  }

  // ── Dialog state ───────────────────────────────────────────────────────────
  let dialogRef: any = null;
  let selectedAgent: string | null = null;
  let sortMode: 'count' | 'activity' = 'count';
  let filterQuery = '';
  let teamFilters: Set<string> = new Set(['ENL', 'RES', 'MAC']);
  let flashAgents: Set<string> = new Set();
  let flashTimer: any = null;
  let visitedPortals: Set<string> = new Set();
  let pollerRef: any = null;

  // ── Build UI ───────────────────────────────────────────────────────────────
  function buildSummary() {
    const t: { [key: string]: number } = { ENL: 0, RES: 0, MAC: 0 };
    Object.values(captures).forEach(function (info: any) {
      const tc = teamClass(info.team);
      if (tc) t[tc] += info.count;
    });
    const parts: string[] = [];
    ['ENL', 'RES', 'MAC'].forEach(function (tc) {
      if (t[tc] <= 0) return;
      const color = tc === 'ENL' ? 'enl' : tc === 'RES' ? 'res' : 'mac';
      const dim = teamFilters.has(tc) ? '' : ' cc-dim';
      const label = tc === 'ENL' ? 'Enlightened' : tc === 'RES' ? 'Resistance' : 'Machina';
      parts.push(
        `<div class="cc-sum-box cc-sum-${color}${dim}" data-team="${tc}">` +
          `${t[tc]}<span class="cc-sum-label">${label}</span></div>`
      );
    });
    if (parts.length === 0) return '';
    return `<div id="cc-summary">${parts.join('')}</div>`;
  }

  function buildSearchBar() {
    return (
      `<div id="cc-search-wrap">` +
      `<input id="cc-search" type="text" placeholder="Search agents…"` +
      ` value="${escapeHtml(filterQuery)}" autocomplete="off" spellcheck="false">` +
      `<span id="cc-search-clear" class="${filterQuery ? 'visible' : ''}" title="Clear search">✕</span>` +
      `</div>`
    );
  }

  function buildTable() {
    let entries = Object.entries(captures).map(function ([name, info]: [string, any]) {
      return { name, tc: teamClass(info.team), count: info.count, lastTs: info.lastTs || 0 };
    });

    const allActive = teamFilters.size === 3;
    entries = entries.filter(function (e) {
      return e.tc ? teamFilters.has(e.tc) : allActive;
    });

    if (filterQuery) {
      entries = entries.filter((e) => e.name.toLowerCase().includes(filterQuery));
    }

    if (sortMode === 'activity') {
      entries.sort((a, b) => b.lastTs - a.lastTs);
    } else {
      entries.sort((a, b) => b.count - a.count || b.lastTs - a.lastTs);
    }

    const countActive = sortMode === 'count' ? ' cc-sort-active' : '';
    const actActive = sortMode === 'activity' ? ' cc-sort-active' : '';
    const countArrow = sortMode === 'count' ? ' ▼' : '';
    const actArrow = sortMode === 'activity' ? ' ▼' : '';

    let tbody;
    if (entries.length === 0) {
      const msg = filterQuery ? 'No matching agents' : 'No captures yet';
      tbody = `<tr class="cc-no-results"><td colspan="3">${msg}</td></tr>`;
    } else {
      tbody = entries
        .map(function (e, i) {
          let cls = '';
          if (selectedAgent === e.name) cls += ' cc-selected';
          if (flashAgents.has(e.name)) cls += ' cc-new';
          return (
            `<tr class="${cls.trim()}" data-agent="${escapeHtml(e.name)}">` +
            `<td class="cc-rank">${i + 1}</td>` +
            `<td><span class="cc-agent-name cc-${e.tc.toLowerCase()}" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span></td>` +
            `<td class="cc-count-cell">${e.count}</td>` +
            `</tr>`
          );
        })
        .join('');
    }

    return (
      `<div class="cc-scroll-wrap"><table id="capture-counter-table">` +
      `<colgroup><col class="col-rank"><col class="col-agent"><col class="col-count"></colgroup>` +
      `<thead><tr>` +
      `<th class="cc-rank">#</th>` +
      `<th class="cc-sortable${actActive}" data-sort="activity" title="Sort by latest activity">Agent${actArrow}</th>` +
      `<th class="cc-count-cell cc-sortable${countActive}" data-sort="count" title="Sort by capture count">↓${countArrow}</th>` +
      `</tr></thead>` +
      `<tbody>${tbody}</tbody>` +
      `</table></div>`
    );
  }

  function buildDetailPanel(agentName: string | null) {
    const info = agentName ? captures[agentName] : null;
    if (!info) return '<div id="cc-agent-detail"></div>';

    const tc = teamClass(info.team);
    const firstLink = portalLinkHtml(info.firstPortal, info.firstPortalGuid, info.firstPortalLatLng);
    const lastLink = portalLinkHtml(info.lastPortal, info.lastPortalGuid, info.lastPortalLatLng);
    const showLast = info.count > 1 && (info.lastTs !== info.firstTs || info.lastPortal !== info.firstPortal);

    return (
      `<div id="cc-agent-detail" class="visible">` +
      `<span class="cc-close" id="cc-detail-close" title="Close">✕</span>` +
      `<div class="cc-detail-name cc-${tc.toLowerCase()}">${escapeHtml(agentName!)}` +
      ` <span style="color:#555;font-weight:normal;font-size:10px">(${info.count} cap${info.count !== 1 ? 's' : ''})</span></div>` +
      `<div class="cc-detail-label">First capture</div>` +
      `<div class="cc-detail-portal">${firstLink}</div>` +
      `<div class="cc-detail-time">${fmtTime(info.firstTs)}</div>` +
      (showLast
        ? `<div class="cc-detail-label">Last capture</div>` +
          `<div class="cc-detail-portal">${lastLink}</div>` +
          `<div class="cc-detail-time">${fmtTime(info.lastTs)}</div>`
        : '') +
      `</div>`
    );
  }

  function openDialog() {
    if (dialogRef) {
      refreshDialog();
      return;
    }

    const version = _plugin_info?.script?.version ? ` v${_plugin_info.script.version}` : '';

    const html =
      `<div id="capture-counter-dialog">` +
      `<div class="cc-toolbar">` +
      `<button id="cc-btn-reset">Reset</button>` +
      `<span class="cc-count">${Object.keys(captures).length} agents · ${totalCount} caps</span>` +
      `</div>` +
      `<div id="cc-summary-wrap">${buildSummary()}</div>` +
      `<div id="cc-search-outer">${buildSearchBar()}</div>` +
      `<div id="cc-table-wrap">${buildTable()}</div>` +
      `<div id="cc-detail-wrap">${buildDetailPanel(selectedAgent)}</div>` +
      `<div id="capture-counter-status">Listening for comms…</div>` +
      `</div>`;

    dialogRef = (window as any).dialog({
      title: `📡 Capture Counter${version}`,
      html,
      id: 'capture-counter',
      closeCallback: function () {
        if (pollerRef) {
          clearInterval(pollerRef);
          pollerRef = null;
        }
        dialogRef = null;
      }
    });

    bindDialogEvents();
  }

  function bindDialogEvents() {
    const dialog = document.getElementById('capture-counter-dialog');
    if (!dialog) return;

    dialog.addEventListener('input', function (e: any) {
      if (e.target.id !== 'cc-search') return;
      filterQuery = e.target.value.toLowerCase();
      const clearBtn = document.getElementById('cc-search-clear');
      if (clearBtn) clearBtn.classList.toggle('visible', filterQuery.length > 0);
      const tw = document.getElementById('cc-table-wrap');
      if (tw) tw.innerHTML = buildTable();
    });

    dialog.addEventListener('click', function (e: any) {
      if (e.target.id === 'cc-search-clear') {
        filterQuery = '';
        const inp = document.getElementById('cc-search') as HTMLInputElement;
        if (inp) inp.value = '';
        e.target.classList.remove('visible');
        const tw = document.getElementById('cc-table-wrap');
        if (tw) tw.innerHTML = buildTable();
        return;
      }

      const sumBox = e.target.closest('.cc-sum-box[data-team]');
      if (sumBox) {
        const team = sumBox.getAttribute('data-team');
        if (teamFilters.has(team)) {
          if (teamFilters.size > 1) teamFilters.delete(team);
        } else {
          teamFilters.add(team);
        }
        const sw = document.getElementById('cc-summary-wrap');
        if (sw) sw.innerHTML = buildSummary();
        const tw = document.getElementById('cc-table-wrap');
        if (tw) tw.innerHTML = buildTable();
        return;
      }

      const sortTh = e.target.closest('th[data-sort]');
      if (sortTh) {
        const mode = sortTh.getAttribute('data-sort') as 'count' | 'activity';
        if (mode && mode !== sortMode) {
          sortMode = mode;
          refreshDialog();
        }
        return;
      }

      if (e.target.id === 'cc-btn-reset') {
        if (confirm('Reset all capture data?')) {
          captures = {};
          seenGuids = new Set();
          totalCount = 0;
          selectedAgent = null;
          filterQuery = '';
          teamFilters = new Set(['ENL', 'RES', 'MAC']);
          saveData();
          refreshDialog();
        }
        return;
      }

      if (e.target.id === 'cc-detail-close') {
        selectedAgent = null;
        refreshDialog();
        return;
      }

      const agentEl = e.target.closest('.cc-agent-name');
      if (agentEl) {
        const row = agentEl.closest('tr[data-agent]');
        if (!row) return;
        const name = row.getAttribute('data-agent');
        selectedAgent = selectedAgent === name ? null : name;
        refreshDialog();
        return;
      }

      const pl = e.target.closest('.cc-portal-link');
      if (pl) {
        e.preventDefault();
        const lat = parseFloat(pl.dataset.lat);
        const lng = parseFloat(pl.dataset.lng);
        const guid = pl.dataset.guid;
        const name = pl.dataset.name || '';

        if (!isNaN(lat) && !isNaN(lng)) {
          (window as any).map.setView([lat, lng], Math.max((window as any).map.getZoom(), 15));
          if (pollerRef) {
            clearInterval(pollerRef);
            pollerRef = null;
          }

          if (guid && (window as any).portals && (window as any).portals[guid]) {
            (window as any).selectPortal(guid);
          } else if (guid) {
            let attempts = 0;
            pollerRef = setInterval(function () {
              if (!dialogRef) {
                clearInterval(pollerRef!);
                pollerRef = null;
                return;
              }
              attempts++;
              if ((window as any).portals && (window as any).portals[guid]) {
                (window as any).selectPortal(guid);
                clearInterval(pollerRef!);
                pollerRef = null;
              } else if (attempts >= 10) {
                clearInterval(pollerRef!);
                pollerRef = null;
              }
            }, 500);
          }

          visitedPortals.add(guid || name);
          const dw = document.getElementById('cc-detail-wrap');
          if (dw) dw.innerHTML = buildDetailPanel(selectedAgent);
        }
      }
    });
  }

  function refreshDialog() {
    if (flashTimer) {
      clearTimeout(flashTimer);
      flashTimer = null;
    }

    const sw = document.getElementById('cc-summary-wrap');
    if (sw) sw.innerHTML = buildSummary();

    const so = document.getElementById('cc-search-outer');
    if (so && !document.getElementById('cc-search')) so.innerHTML = buildSearchBar();

    const tw = document.getElementById('cc-table-wrap');
    if (tw) tw.innerHTML = buildTable();

    const dw = document.getElementById('cc-detail-wrap');
    if (dw) dw.innerHTML = buildDetailPanel(selectedAgent);

    const countEl = document.querySelector('#capture-counter-dialog .cc-count');
    if (countEl) countEl.textContent = `${Object.keys(captures).length} agents · ${totalCount} caps`;

    const statusEl = document.getElementById('capture-counter-status');
    if (statusEl) statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();

    if (flashAgents.size > 0) {
      flashTimer = setTimeout(function () {
        flashAgents.clear();
        flashTimer = null;
      }, 1500);
    }
  }

  const CAPTURE_REGEX = /\bcaptured\b/i;

  function processPlexts(data: any) {
    const result = data && data.result;
    if (!Array.isArray(result)) return;

    let changed = false;

    result.forEach(function (entry) {
      if (!Array.isArray(entry) || entry.length < 3) return;

      const guid = entry[0];
      if (guid) {
        if (seenGuids.has(guid)) return;
        seenGuids.add(guid);
      }

      const obj = entry[2];
      if (!obj || !obj.plext) return;
      const plext = obj.plext;
      const markup = plext.markup;
      if (!Array.isArray(markup)) return;
      if (plext.plextType && plext.plextType !== 'SYSTEM_BROADCAST') return;

      const hasCapture = markup.some((s: any) => s[0] === 'TEXT' && s[1] && CAPTURE_REGEX.test(s[1].plain));
      if (!hasCapture) return;

      const playerSeg = markup.find((s: any) => s[0] === 'PLAYER');
      if (!playerSeg || !playerSeg[1]) return;
      const portalSeg = markup.find((s: any) => s[0] === 'PORTAL');

      const agentName = playerSeg[1].plain;
      const team = playerSeg[1].team || 'unknown';
      if (!agentName) return;

      let portalName = null,
        portalGuid = null,
        portalLatLng = null;
      if (portalSeg && portalSeg[1]) {
        const p = portalSeg[1];
        portalName = p.plain || p.name || null;
        portalGuid = p.guid || null;
        if (p.latE6 != null && p.lngE6 != null) portalLatLng = { lat: p.latE6 / 1e6, lng: p.lngE6 / 1e6 };
      }

      const ts = entry[1] || Date.now();

      if (!captures[agentName]) {
        captures[agentName] = {
          count: 0,
          team,
          firstPortal: null,
          firstPortalGuid: null,
          firstPortalLatLng: null,
          firstTs: null,
          lastPortal: null,
          lastPortalGuid: null,
          lastPortalLatLng: null,
          lastTs: null
        };
      }

      const cur = captures[agentName];
      cur.count++;
      totalCount++;

      if (team !== 'unknown') cur.team = team;

      if (portalName) {
        if (cur.firstTs === null || ts <= cur.firstTs) {
          cur.firstPortal = portalName;
          cur.firstPortalGuid = portalGuid;
          cur.firstPortalLatLng = portalLatLng;
          cur.firstTs = ts;
        }
        if (cur.lastTs === null || ts >= cur.lastTs) {
          cur.lastPortal = portalName;
          cur.lastPortalGuid = portalGuid;
          cur.lastPortalLatLng = portalLatLng;
          cur.lastTs = ts;
        }
      }

      if (seenGuids.size > SEEN_GUIDS_CAP) {
        seenGuids = new Set(Array.from(seenGuids).slice(-SEEN_GUIDS_CAP));
      }

      flashAgents.add(agentName);
      changed = true;
    });

    if (changed) {
      saveData();
      refreshDialog();
    }
  }

  const setup = function() {
    loadData();
    addCSS();
    (window as any).addHook('publicChatDataAvailable', processPlexts);
    (window as any).addHook('factionChatDataAvailable', processPlexts);

    const _window = window as any;
    if (_window.IITC && _window.IITC.toolbox && typeof _window.IITC.toolbox.addButton === 'function') {
      _window.IITC.toolbox.addButton({
        label: '📡 Captures',
        title: 'Show portal capture leaderboard',
        action: openDialog
      });
    } else {
      _window.$('#toolbox').append(
        '<a onclick="window.plugin.captureCounter.openDialog();return false;" title="Show portal capture leaderboard">📡 Captures</a>'
      );
    }
    console.log('[Capture Counter] Plugin loaded.');
  };

  const _window = window as any;
  if (!_window.plugin) _window.plugin = function() {};
  if (!_window.plugin.captureCounter) _window.plugin.captureCounter = {};
  _window.plugin.captureCounter.openDialog = openDialog;

  (setup as any).info = _plugin_info;
  if (!_window.bootPlugins) _window.bootPlugins = [];
  _window.bootPlugins.push(setup);
  if (_window.iitcLoaded && typeof setup === 'function') setup();
}

const info = {
  script: {
    version: header.version,
    name: header.name,
    description: header.description
  }
};

// Use standard IITC injection pattern
const script = document.createElement('script');
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.head || document.body || document.documentElement).appendChild(script);
