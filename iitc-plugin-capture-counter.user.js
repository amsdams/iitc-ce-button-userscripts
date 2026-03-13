// ==UserScript==
// @name         IITC Plugin: Capture Counter
// @namespace    https://iitc.app/plugins/capture-counter
// @version      1.5.0
// @description  Tracks portal captures. Deduplicates by GUID. Summary bar, search/filter, team toggles, sortable table, first/last portal links.
// @author       IITC Community
// @match        https://intel.ingress.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

;(function () {
  'use strict'

  function wrapper (plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function () {}

    // ── State ──────────────────────────────────────────────────────────────────
    const STORAGE_KEY    = 'iitc-capture-counter'
    const SEEN_GUIDS_KEY = 'iitc-capture-counter-guids'

    let captures  = {}
    let seenGuids = new Set()

    function saveData () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(captures))
        const arr = Array.from(seenGuids)
        localStorage.setItem(SEEN_GUIDS_KEY, JSON.stringify(arr.slice(-20000)))
      } catch (e) {}
    }

    function loadData () {
      try { const r = localStorage.getItem(STORAGE_KEY);    if (r) captures  = JSON.parse(r) } catch (e) { captures = {} }
      try { const r = localStorage.getItem(SEEN_GUIDS_KEY); if (r) seenGuids = new Set(JSON.parse(r)) } catch (e) { seenGuids = new Set() }
    }

    // ── CSS ────────────────────────────────────────────────────────────────────
    function addCSS () {
      const style = document.createElement('style')
      style.textContent = `
        /* dialog */
        #capture-counter-dialog { width: 260px; }
        .ui-dialog:has(#capture-counter-dialog) { width: 300px !important; min-width: 300px !important; }

        /* toolbar */
        #capture-counter-dialog .cc-toolbar {
          display: flex; gap: 5px; margin-bottom: 6px; align-items: center;
        }
        #capture-counter-dialog .cc-toolbar button {
          padding: 2px 8px; font-size: 11px; cursor: pointer;
        }
        #capture-counter-dialog .cc-count {
          font-size: 11px; color: #aaa; margin-left: auto; white-space: nowrap;
        }

        /* summary bar — clickable team toggles */
        #cc-summary { display: flex; gap: 4px; margin-bottom: 6px; }
        .cc-sum-box {
          flex: 1; padding: 3px 4px; border-radius: 3px; text-align: center;
          font-weight: bold; font-size: 13px; line-height: 1.3;
          cursor: pointer; user-select: none; transition: opacity .15s;
        }
        .cc-sum-box.cc-dim { opacity: .35; }
        .cc-sum-enl { background: #0d2b0d; color: #03dc03; border: 1px solid #1a5c1a; }
        .cc-sum-res { background: #0a1a2b; color: #00c5ff; border: 1px solid #0a3d5c; }
        .cc-sum-mac { background: #2b1a0a; color: #f5a623; border: 1px solid #5c3a0a; }
        .cc-sum-label { font-size: 9px; font-weight: normal; opacity: .65; display: block; }

        /* search bar */
        #cc-search-wrap { margin-bottom: 5px; position: relative; }
        #cc-search {
          width: 100%; box-sizing: border-box;
          background: #111; border: 1px solid #444; border-radius: 3px;
          color: #ddd; font-size: 12px; padding: 3px 22px 3px 6px;
          outline: none;
        }
        #cc-search:focus { border-color: #666; }
        #cc-search-clear {
          position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
          cursor: pointer; color: #555; font-size: 13px; line-height: 1;
          display: none;
        }
        #cc-search-clear.visible { display: block; }
        #cc-search-clear:hover { color: #aaa; }

        /* table */
        #capture-counter-table {
          width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed;
        }
        #capture-counter-table th {
          text-align: left; border-bottom: 1px solid #555; padding: 3px 4px;
          color: #bbb; position: sticky; top: 0; background: #1b1b1b;
          font-size: 11px; user-select: none;
        }
        #capture-counter-table th.sortable { cursor: pointer; }
        #capture-counter-table th.sortable:hover { color: #fff; }
        #capture-counter-table th.sort-active { color: #fff; }
        #capture-counter-table td {
          padding: 3px 4px; border-bottom: 1px solid #2a2a2a;
          overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
        }
        #capture-counter-table tr:hover td { background: #252525; }
        #capture-counter-table tr.cc-selected td { background: #1c2b1c; }
        #capture-counter-table .cc-no-results td {
          color: #555; text-align: center; font-style: italic; padding: 10px 4px;
        }

        @keyframes cc-flash { 0% { background: #2a3a1a; } 100% { background: transparent; } }
        #capture-counter-table tr.cc-new td { animation: cc-flash 1.4s ease-out forwards; }

        #capture-counter-table col.col-rank  { width: 22px; }
        #capture-counter-table col.col-agent { width: auto; }
        #capture-counter-table col.col-count { width: 36px; }
        #capture-counter-table .rank  { color: #666; text-align: center; font-size: 10px; }
        #capture-counter-table .count { text-align: right; font-weight: bold; color: #fff; }

        .agent-name {
          cursor: pointer; text-decoration: underline dotted;
          display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .agent-name:hover { opacity: .8; }
        .agent-ENL { color: #03dc03; }
        .agent-RES { color: #00c5ff; }
        .agent-MAC { color: #f5a623; }

        .cc-scroll-wrap { max-height: 280px; overflow-y: auto; overflow-x: hidden; }

        #capture-counter-status { font-size: 10px; color: #666; margin-top: 4px; text-align: right; }

        /* detail panel */
        #cc-agent-detail {
          margin-top: 6px; padding: 5px 7px;
          background: #1a1a1a; border: 1px solid #3a3a3a; border-radius: 3px;
          font-size: 11px; line-height: 1.5; display: none;
        }
        #cc-agent-detail.visible { display: block; }
        #cc-agent-detail .cc-detail-name { font-weight: bold; font-size: 12px; margin-bottom: 2px; }
        #cc-agent-detail .cc-detail-label {
          color: #666; font-size: 10px; text-transform: uppercase;
          letter-spacing: .05em; margin-top: 3px;
        }
        #cc-agent-detail .cc-detail-portal {
          color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        #cc-agent-detail .cc-detail-portal a {
          color: #f5a623; text-decoration: none; cursor: pointer;
        }
        #cc-agent-detail .cc-detail-portal a:hover { text-decoration: underline; }
        #cc-agent-detail .cc-detail-portal a.cc-portal-visited { color: #c47a10; }
        #cc-agent-detail .cc-detail-time { color: #555; font-size: 10px; }
        #cc-agent-detail .cc-close {
          float: right; cursor: pointer; color: #555; font-size: 13px; line-height: 1; margin-left: 4px;
        }
        #cc-agent-detail .cc-close:hover { color: #aaa; }
      `
      document.head.appendChild(style)
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    function escapeHtml (s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    }
    function totalCaptures () {
      return Object.values(captures).reduce((s, v) => s + v.count, 0)
    }
    function teamClass (team) {
      return team === 'ENLIGHTENED' ? 'ENL' : team === 'RESISTANCE' ? 'RES' : team === 'MACHINA' ? 'MAC' : ''
    }
    function fmtTime (ts) {
      if (!ts) return ''
      const d = new Date(ts)
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
          ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }

    function portalLinkHtml (portalName, portalGuid, portalLatLng) {
      if (!portalName) return '<span style="color:#444">—</span>'
      if (portalLatLng && portalLatLng.lat != null) {
        const { lat, lng } = portalLatLng
        const guid = escapeHtml(portalGuid || '')
        const visited = visitedPortals.has(portalGuid || portalName) ? ' cc-portal-visited' : ''
        return `<a href="#" class="cc-portal-link${visited}"
          data-lat="${lat}" data-lng="${lng}" data-guid="${guid}" data-name="${escapeHtml(portalName)}"
          title="Pan map to ${escapeHtml(portalName)}">${escapeHtml(portalName)} ↗</a>`
      }
      return escapeHtml(portalName)
    }

    // ── Dialog state ───────────────────────────────────────────────────────────
    let dialogRef      = null
    let selectedAgent  = null
    let sortMode       = 'count'           // 'count' | 'activity'
    let filterQuery    = ''                // search bar text (lowercase)
    let teamFilters    = new Set(['ENL', 'RES', 'MAC'])  // active factions
    let flashAgents    = new Set()
    let visitedPortals = new Set()         // portals panned to this session

    // ── Build UI ───────────────────────────────────────────────────────────────
    function buildSummary () {
      const t = { ENL: 0, RES: 0, MAC: 0 }
      Object.values(captures).forEach(function (info) {
        const tc = teamClass(info.team); if (tc) t[tc] += info.count
      })
      const parts = []
      if (t.ENL > 0) {
        const dim = teamFilters.has('ENL') ? '' : ' cc-dim'
        parts.push(`<div class="cc-sum-box cc-sum-enl${dim}" data-team="ENL">${t.ENL}<span class="cc-sum-label">Enlightened</span></div>`)
      }
      if (t.RES > 0) {
        const dim = teamFilters.has('RES') ? '' : ' cc-dim'
        parts.push(`<div class="cc-sum-box cc-sum-res${dim}" data-team="RES">${t.RES}<span class="cc-sum-label">Resistance</span></div>`)
      }
      if (t.MAC > 0) {
        const dim = teamFilters.has('MAC') ? '' : ' cc-dim'
        parts.push(`<div class="cc-sum-box cc-sum-mac${dim}" data-team="MAC">${t.MAC}<span class="cc-sum-label">Machina</span></div>`)
      }
      if (parts.length === 0) return ''
      return `<div id="cc-summary">${parts.join('')}</div>`
    }

    function buildSearchBar () {
      const clearVis = filterQuery ? ' visible' : ''
      return `
        <div id="cc-search-wrap">
          <input id="cc-search" type="text" placeholder="Search agents…"
            value="${escapeHtml(filterQuery)}" autocomplete="off" spellcheck="false">
          <span id="cc-search-clear" class="${clearVis}" title="Clear search">✕</span>
        </div>`
    }

    function buildTable () {
      let entries = Object.entries(captures)
          .map(([name, info]) => ({ name, ...info }))

      // team filter
      entries = entries.filter(e => teamFilters.has(teamClass(e.team)) || teamClass(e.team) === '')

      // search filter
      if (filterQuery) {
        const q = filterQuery.toLowerCase()
        entries = entries.filter(e => e.name.toLowerCase().includes(q))
      }

      // sort
      if (sortMode === 'activity') {
        entries.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
      } else {
        entries.sort((a, b) => b.count - a.count || (b.lastTs || 0) - (a.lastTs || 0))
      }

      const countActive = sortMode === 'count'    ? ' sort-active' : ''
      const actActive   = sortMode === 'activity' ? ' sort-active' : ''
      const countArrow  = sortMode === 'count'    ? ' ▼' : ''
      const actArrow    = sortMode === 'activity' ? ' ▼' : ''

      let tbody
      if (entries.length === 0) {
        tbody = `<tr class="cc-no-results"><td colspan="3">${filterQuery ? 'No matching agents' : 'No captures yet'}</td></tr>`
      } else {
        tbody = entries.map((e, i) => {
          const tc = teamClass(e.team)
          let cls = ''
          if (selectedAgent === e.name) cls += ' cc-selected'
          if (flashAgents.has(e.name))  cls += ' cc-new'
          return `<tr class="${cls.trim()}" data-agent="${escapeHtml(e.name)}">
            <td class="rank">${i + 1}</td>
            <td><span class="agent-name agent-${tc}" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span></td>
            <td class="count">${e.count}</td>
          </tr>`
        }).join('')
      }

      return `
        <div class="cc-scroll-wrap">
          <table id="capture-counter-table">
            <colgroup>
              <col class="col-rank"><col class="col-agent"><col class="col-count">
            </colgroup>
            <thead><tr>
              <th class="rank">#</th>
              <th class="sortable${actActive}" data-sort="activity" title="Sort by latest activity">Agent${actArrow}</th>
              <th class="count sortable${countActive}" data-sort="count" title="Sort by capture count">↓${countArrow}</th>
            </tr></thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>`
    }

    function buildDetailPanel (agentName) {
      const info = agentName ? captures[agentName] : null
      if (!info) return '<div id="cc-agent-detail"></div>'

      const tc        = teamClass(info.team)
      const firstLink = portalLinkHtml(info.firstPortal, info.firstPortalGuid, info.firstPortalLatLng)
      const lastLink  = portalLinkHtml(info.lastPortal,  info.lastPortalGuid,  info.lastPortalLatLng)
      const showLast  = info.count > 1 && (info.lastTs !== info.firstTs || info.lastPortal !== info.firstPortal)

      return `
        <div id="cc-agent-detail" class="visible">
          <span class="cc-close" id="cc-detail-close" title="Close">✕</span>
          <div class="cc-detail-name agent-${tc}">${escapeHtml(agentName)}
            <span style="color:#555;font-weight:normal;font-size:10px">(${info.count} cap${info.count !== 1 ? 's' : ''})</span>
          </div>
          <div class="cc-detail-label">First capture</div>
          <div class="cc-detail-portal">${firstLink}</div>
          <div class="cc-detail-time">${fmtTime(info.firstTs)}</div>
          ${showLast ? `
          <div class="cc-detail-label">Last capture</div>
          <div class="cc-detail-portal">${lastLink}</div>
          <div class="cc-detail-time">${fmtTime(info.lastTs)}</div>` : ''}
        </div>`
    }

    // ── Open / refresh dialog ──────────────────────────────────────────────────
    function openDialog () {
      if (dialogRef) { refreshDialog(); return }

      const html = `
        <div id="capture-counter-dialog">
          <div class="cc-toolbar">
            <button id="cc-btn-reset">Reset</button>
            <span class="cc-count">${Object.keys(captures).length} agents · ${totalCaptures()} caps</span>
          </div>
          <div id="cc-summary-wrap">${buildSummary()}</div>
          <div id="cc-search-outer">${buildSearchBar()}</div>
          <div id="cc-table-wrap">${buildTable()}</div>
          <div id="cc-detail-wrap">${buildDetailPanel(selectedAgent)}</div>
          <div id="capture-counter-status">Listening for comms…</div>
        </div>`

      dialogRef = window.dialog({
        title: '📡 Capture Counter',
        html,
        id: 'capture-counter',
        closeCallback: function () { dialogRef = null }
      })

      bindDialogEvents()
    }

    function bindDialogEvents () {
      const dialog = document.getElementById('capture-counter-dialog')
      if (!dialog) return

      // ── search input (live filter, no full re-render) ──
      dialog.addEventListener('input', function (e) {
        if (e.target.id !== 'cc-search') return
        filterQuery = e.target.value.toLowerCase()
        const clearBtn = document.getElementById('cc-search-clear')
        if (clearBtn) clearBtn.classList.toggle('visible', filterQuery.length > 0)
        const tw = document.getElementById('cc-table-wrap')
        if (tw) tw.innerHTML = buildTable()
      })

      dialog.addEventListener('click', function (e) {
        // ── search clear ──
        if (e.target.id === 'cc-search-clear') {
          filterQuery = ''
          const inp = document.getElementById('cc-search')
          if (inp) inp.value = ''
          e.target.classList.remove('visible')
          const tw = document.getElementById('cc-table-wrap')
          if (tw) tw.innerHTML = buildTable()
          return
        }

        // ── team filter toggle (summary box) ──
        const sumBox = e.target.closest('.cc-sum-box[data-team]')
        if (sumBox) {
          const team = sumBox.getAttribute('data-team')
          if (teamFilters.has(team)) {
            // Don't allow deselecting all teams
            if (teamFilters.size > 1) teamFilters.delete(team)
          } else {
            teamFilters.add(team)
          }
          // rebuild summary (toggle dim) + table
          const sw = document.getElementById('cc-summary-wrap')
          if (sw) sw.innerHTML = buildSummary()
          const tw = document.getElementById('cc-table-wrap')
          if (tw) tw.innerHTML = buildTable()
          return
        }

        // ── sort header ──
        const sortTh = e.target.closest('th[data-sort]')
        if (sortTh) {
          const mode = sortTh.getAttribute('data-sort')
          if (mode && mode !== sortMode) { sortMode = mode; refreshDialog() }
          return
        }

        // ── reset ──
        if (e.target.id === 'cc-btn-reset') {
          if (confirm('Reset all capture data?')) {
            captures = {}; seenGuids = new Set()
            selectedAgent = null; filterQuery = ''; teamFilters = new Set(['ENL','RES','MAC'])
            saveData(); refreshDialog()
          }
          return
        }

        // ── close detail ──
        if (e.target.id === 'cc-detail-close') {
          selectedAgent = null; refreshDialog(); return
        }

        // ── agent name ──
        const agentEl = e.target.closest('.agent-name')
        if (agentEl) {
          const row = agentEl.closest('tr[data-agent]')
          if (!row) return
          const name = row.getAttribute('data-agent')
          selectedAgent = (selectedAgent === name) ? null : name
          refreshDialog(); return
        }

        // ── portal link → pan + highlight ──
        const pl = e.target.closest('.cc-portal-link')
        if (pl) {
          e.preventDefault()
          const lat  = parseFloat(pl.dataset.lat)
          const lng  = parseFloat(pl.dataset.lng)
          const guid = pl.dataset.guid
          const name = pl.dataset.name || ''

          if (!isNaN(lat) && !isNaN(lng)) {
            // Pan map
            window.map.setView([lat, lng], Math.max(window.map.getZoom(), 15))

            // Try to select the portal so it highlights on the map
            if (guid && window.portals && window.portals[guid]) {
              // selectPortal triggers the map highlight + sidebar
              window.selectPortal(guid)
            } else if (guid) {
              // Portal not loaded yet — wait for it to appear after the map moves
              const maxWait = 10
              let attempts = 0
              const poller = setInterval(function () {
                attempts++
                if (window.portals && window.portals[guid]) {
                  window.selectPortal(guid)
                  clearInterval(poller)
                } else if (attempts >= maxWait) {
                  clearInterval(poller)
                }
              }, 500)
            }

            // Mark as visited so link gets dimmed
            visitedPortals.add(guid || name)
            // Re-render detail panel only (cheaper than full refresh)
            const dw = document.getElementById('cc-detail-wrap')
            if (dw) dw.innerHTML = buildDetailPanel(selectedAgent)
          }
        }
      })
    }

    function refreshDialog () {
      const hadFlash = flashAgents.size > 0

      const sw = document.getElementById('cc-summary-wrap')
      if (sw) sw.innerHTML = buildSummary()

      // Preserve search input value (user may be typing)
      const searchInp = document.getElementById('cc-search')
      const so = document.getElementById('cc-search-outer')
      if (so && !searchInp) so.innerHTML = buildSearchBar()  // first render only

      const tw = document.getElementById('cc-table-wrap')
      if (tw) tw.innerHTML = buildTable()

      const dw = document.getElementById('cc-detail-wrap')
      if (dw) dw.innerHTML = buildDetailPanel(selectedAgent)

      const countEl = document.querySelector('#capture-counter-dialog .cc-count')
      if (countEl) countEl.textContent = `${Object.keys(captures).length} agents · ${totalCaptures()} caps`

      const statusEl = document.getElementById('capture-counter-status')
      if (statusEl) statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString()

      if (hadFlash) setTimeout(function () { flashAgents.clear() }, 1500)
    }

    // ── Plexts parsing ─────────────────────────────────────────────────────────
    const CAPTURE_REGEX = /\bcaptured\b/i

    function processPlexts (data) {
      const result = data && data.result
      if (!Array.isArray(result)) return

      let changed = false

      result.forEach(function (entry) {
        if (!Array.isArray(entry) || entry.length < 3) return

        const guid = entry[0]
        if (guid && seenGuids.has(guid)) return   // deduplicate

        const obj = entry[2]
        if (!obj || !obj.plext) return
        const plext  = obj.plext
        const markup = plext.markup
        if (!Array.isArray(markup)) return
        if (plext.plextType && plext.plextType !== 'SYSTEM_BROADCAST') return

        const hasCapture = markup.some(s => s[0] === 'TEXT' && s[1] && CAPTURE_REGEX.test(s[1].plain))
        if (!hasCapture) return

        const playerSeg = markup.find(s => s[0] === 'PLAYER')
        if (!playerSeg || !playerSeg[1]) return
        const portalSeg = markup.find(s => s[0] === 'PORTAL')

        const agentName = playerSeg[1].plain
        const team      = playerSeg[1].team || 'unknown'
        if (!agentName) return

        if (guid) seenGuids.add(guid)

        let portalName = null, portalGuid = null, portalLatLng = null
        if (portalSeg && portalSeg[1]) {
          const p = portalSeg[1]
          portalName = p.plain || p.name || null
          portalGuid = p.guid  || null
          if (p.latE6 != null && p.lngE6 != null)
            portalLatLng = { lat: p.latE6 / 1e6, lng: p.lngE6 / 1e6 }
        }

        const ts = entry[1] || Date.now()

        if (!captures[agentName]) {
          captures[agentName] = {
            count: 0, team,
            firstPortal: null, firstPortalGuid: null, firstPortalLatLng: null, firstTs: null,
            lastPortal:  null, lastPortalGuid:  null, lastPortalLatLng:  null, lastTs:  null
          }
        }

        const cur = captures[agentName]
        cur.count++
        cur.team = team

        if (portalName) {
          if (cur.firstTs === null || ts <= cur.firstTs) {
            cur.firstPortal = portalName; cur.firstPortalGuid = portalGuid
            cur.firstPortalLatLng = portalLatLng; cur.firstTs = ts
          }
          if (cur.lastTs === null || ts >= cur.lastTs) {
            cur.lastPortal = portalName; cur.lastPortalGuid = portalGuid
            cur.lastPortalLatLng = portalLatLng; cur.lastTs = ts
          }
        }

        flashAgents.add(agentName)
        changed = true
      })

      if (changed) { saveData(); refreshDialog() }
    }

    // ── IITC setup ─────────────────────────────────────────────────────────────
    function setup () {
      loadData(); addCSS()
      window.addHook('publicChatDataAvailable',  processPlexts)
      window.addHook('factionChatDataAvailable', processPlexts)
      window.IITC.toolbox.addButton({
        label: '📡 Captures', title: 'Show portal capture leaderboard', action: openDialog
      })
      console.log('[Capture Counter] Plugin v1.5 loaded.')
    }

    if (window.iitcLoaded) setup()
    else window.addHook('iitcLoaded', setup)
  }

  const plugin_info = {}
  if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    plugin_info.script = {
      version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description
    }
  }

  wrapper(plugin_info)
})()
