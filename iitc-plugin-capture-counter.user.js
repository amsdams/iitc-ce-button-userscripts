// ==UserScript==
// @name         IITC Plugin: Capture Counter
// @namespace    https://iitc.app/plugins/capture-counter
// @version      1.6.0
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
    const SEEN_GUIDS_CAP = 20000   // applied both in-memory and on persist

    let captures     = {}
    let seenGuids    = new Set()
    let totalCount   = 0           // running total — avoids full traversal on every refresh (#13)

    // Rebuild running total from loaded data (called once after loadData)
    function rebuildTotal () {
      totalCount = Object.values(captures).reduce((s, v) => s + v.count, 0)
    }

    // ── Persistence ────────────────────────────────────────────────────────────
    // Debounced save — coalesces rapid writes from batch scroll (#10)
    let saveTimer = null
    function saveData () {
      if (saveTimer) return
      saveTimer = setTimeout(function () {
        saveTimer = null
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(captures))
          // Cap in-memory Set before persisting (#14)
          if (seenGuids.size > SEEN_GUIDS_CAP) {
            seenGuids = new Set(Array.from(seenGuids).slice(-SEEN_GUIDS_CAP))
          }
          localStorage.setItem(SEEN_GUIDS_KEY, JSON.stringify(Array.from(seenGuids)))
        } catch (e) {}
      }, 500)
    }

    function loadData () {
      try { const r = localStorage.getItem(STORAGE_KEY);    if (r) captures  = JSON.parse(r) } catch (e) { captures = {} }
      try { const r = localStorage.getItem(SEEN_GUIDS_KEY); if (r) seenGuids = new Set(JSON.parse(r)) } catch (e) { seenGuids = new Set() }
      rebuildTotal()
    }

    // ── CSS ────────────────────────────────────────────────────────────────────
    function addCSS () {
      const style = document.createElement('style')
      // All rules scoped under #capture-counter-dialog or prefixed cc- to avoid
      // collisions with other IITC plugins (#15). Agent colour classes renamed to
      // .cc-enl / .cc-res / .cc-mac.
      style.textContent = `
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

        /* summary / team-filter bar */
        #cc-summary { display: flex; gap: 4px; margin-bottom: 6px; }
        #cc-summary .cc-sum-box {
          flex: 1; padding: 3px 4px; border-radius: 3px; text-align: center;
          font-weight: bold; font-size: 13px; line-height: 1.3;
          cursor: pointer; user-select: none; transition: opacity .15s;
        }
        #cc-summary .cc-sum-box.cc-dim { opacity: .35; }
        #cc-summary .cc-sum-enl { background: #0d2b0d; color: #03dc03; border: 1px solid #1a5c1a; }
        #cc-summary .cc-sum-res { background: #0a1a2b; color: #00c5ff; border: 1px solid #0a3d5c; }
        #cc-summary .cc-sum-mac { background: #2b1a0a; color: #f5a623; border: 1px solid #5c3a0a; }
        #cc-summary .cc-sum-label { font-size: 9px; font-weight: normal; opacity: .65; display: block; }

        /* search bar */
        #cc-search-wrap { margin-bottom: 5px; position: relative; }
        #cc-search {
          width: 100%; box-sizing: border-box;
          background: #111; border: 1px solid #444; border-radius: 3px;
          color: #ddd; font-size: 12px; padding: 3px 22px 3px 6px; outline: none;
        }
        #cc-search:focus { border-color: #666; }
        #cc-search-clear {
          position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
          cursor: pointer; color: #555; font-size: 13px; line-height: 1; display: none;
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
        #capture-counter-table th.cc-sortable { cursor: pointer; }
        #capture-counter-table th.cc-sortable:hover { color: #fff; }
        #capture-counter-table th.cc-sort-active { color: #fff; }
        #capture-counter-table td {
          padding: 3px 4px; border-bottom: 1px solid #2a2a2a;
          overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
        }
        #capture-counter-table tr:hover td { background: #252525; }
        #capture-counter-table tr.cc-selected td { background: #1c2b1c; }
        #capture-counter-table tr.cc-no-results td {
          color: #555; text-align: center; font-style: italic; padding: 10px 4px;
        }

        @keyframes cc-flash { 0% { background: #2a3a1a; } 100% { background: transparent; } }
        #capture-counter-table tr.cc-new td { animation: cc-flash 1.4s ease-out forwards; }

        #capture-counter-table col.col-rank  { width: 22px; }
        #capture-counter-table col.col-agent { width: auto; }
        #capture-counter-table col.col-count { width: 36px; }
        #capture-counter-table .cc-rank  { color: #666; text-align: center; font-size: 10px; }
        #capture-counter-table .cc-count-cell { text-align: right; font-weight: bold; color: #fff; }

        /* scoped agent-name and faction colours (#15) */
        #capture-counter-dialog .cc-agent-name {
          cursor: pointer; text-decoration: underline dotted;
          display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        #capture-counter-dialog .cc-agent-name:hover { opacity: .8; }
        #capture-counter-dialog .cc-enl { color: #03dc03; }
        #capture-counter-dialog .cc-res { color: #00c5ff; }
        #capture-counter-dialog .cc-mac { color: #f5a623; }

        .cc-scroll-wrap { max-height: 280px; overflow-y: auto; overflow-x: hidden; }

        #capture-counter-status { font-size: 10px; color: #666; margin-top: 4px; text-align: right; }

        /* detail panel */
        #cc-agent-detail {
          margin-top: 6px; padding: 5px 7px; background: #1a1a1a;
          border: 1px solid #3a3a3a; border-radius: 3px;
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
        #cc-agent-detail .cc-detail-portal a { color: #f5a623; text-decoration: none; cursor: pointer; }
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

    // Fix #12: escape double-quotes for use inside HTML attribute values
    function escapeHtml (s) {
      return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
    }

    function teamClass (team) {
      return team === 'ENLIGHTENED' ? 'ENL'
          : team === 'RESISTANCE' ? 'RES'
              : team === 'MACHINA'    ? 'MAC'
                  : ''
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
        const guid    = escapeHtml(portalGuid || '')
        const visited = visitedPortals.has(portalGuid || portalName) ? ' cc-portal-visited' : ''
        return `<a href="#" class="cc-portal-link${visited}"` +
            ` data-lat="${lat}" data-lng="${lng}"` +
            ` data-guid="${guid}" data-name="${escapeHtml(portalName)}"` +
            ` title="Pan map to ${escapeHtml(portalName)}">${escapeHtml(portalName)} ↗</a>`
      }
      return escapeHtml(portalName)
    }

    // ── Dialog state ───────────────────────────────────────────────────────────
    let dialogRef      = null
    let selectedAgent  = null
    let sortMode       = 'count'
    let filterQuery    = ''                        // always stored lowercase (#2)
    let teamFilters    = new Set(['ENL', 'RES', 'MAC'])
    let flashAgents    = new Set()
    let flashTimer     = null                      // debounce flash clear (#7)
    let visitedPortals = new Set()
    let pollerRef      = null                      // active portal-load poller (#9)

    // ── Build UI ───────────────────────────────────────────────────────────────
    function buildSummary () {
      const t = { ENL: 0, RES: 0, MAC: 0 }
      Object.values(captures).forEach(function (info) {
        const tc = teamClass(info.team)
        if (tc) t[tc] += info.count
      })
      const parts = []
      ;['ENL', 'RES', 'MAC'].forEach(function (tc) {
        if (t[tc] <= 0) return
        const color = tc === 'ENL' ? 'enl' : tc === 'RES' ? 'res' : 'mac'
        const dim   = teamFilters.has(tc) ? '' : ' cc-dim'
        const label = tc === 'ENL' ? 'Enlightened' : tc === 'RES' ? 'Resistance' : 'Machina'
        parts.push(
            `<div class="cc-sum-box cc-sum-${color}${dim}" data-team="${tc}">` +
            `${t[tc]}<span class="cc-sum-label">${label}</span></div>`
        )
      })
      if (parts.length === 0) return ''
      return `<div id="cc-summary">${parts.join('')}</div>`
    }

    function buildSearchBar () {
      return `<div id="cc-search-wrap">` +
          `<input id="cc-search" type="text" placeholder="Search agents…"` +
          ` value="${escapeHtml(filterQuery)}" autocomplete="off" spellcheck="false">` +
          `<span id="cc-search-clear" class="${filterQuery ? 'visible' : ''}" title="Clear search">✕</span>` +
          `</div>`
    }

    function buildTable () {
      // Build entries, computing teamClass once per entry (#11)
      let entries = Object.entries(captures).map(function ([name, info]) {
        return { name, tc: teamClass(info.team), count: info.count, lastTs: info.lastTs || 0 }
      })

      // Team filter — unknown-team agents shown only when all filters active (#3)
      const allActive = teamFilters.size === 3
      entries = entries.filter(function (e) {
        return e.tc ? teamFilters.has(e.tc) : allActive
      })

      // Search filter — filterQuery already lowercase (#2)
      if (filterQuery) {
        entries = entries.filter(e => e.name.toLowerCase().includes(filterQuery))
      }

      // Sort
      if (sortMode === 'activity') {
        entries.sort((a, b) => b.lastTs - a.lastTs)
      } else {
        entries.sort((a, b) => b.count - a.count || b.lastTs - a.lastTs)
      }

      const countActive = sortMode === 'count'    ? ' cc-sort-active' : ''
      const actActive   = sortMode === 'activity' ? ' cc-sort-active' : ''
      const countArrow  = sortMode === 'count'    ? ' ▼' : ''
      const actArrow    = sortMode === 'activity' ? ' ▼' : ''

      let tbody
      if (entries.length === 0) {
        const msg = filterQuery ? 'No matching agents' : 'No captures yet'
        tbody = `<tr class="cc-no-results"><td colspan="3">${msg}</td></tr>`
      } else {
        tbody = entries.map(function (e, i) {
          let cls = ''
          if (selectedAgent === e.name) cls += ' cc-selected'
          if (flashAgents.has(e.name))  cls += ' cc-new'
          return `<tr class="${cls.trim()}" data-agent="${escapeHtml(e.name)}">` +
              `<td class="cc-rank">${i + 1}</td>` +
              `<td><span class="cc-agent-name cc-${e.tc.toLowerCase()}" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span></td>` +
              `<td class="cc-count-cell">${e.count}</td>` +
              `</tr>`
        }).join('')
      }

      return `<div class="cc-scroll-wrap"><table id="capture-counter-table">` +
          `<colgroup><col class="col-rank"><col class="col-agent"><col class="col-count"></colgroup>` +
          `<thead><tr>` +
          `<th class="cc-rank">#</th>` +
          `<th class="cc-sortable${actActive}" data-sort="activity" title="Sort by latest activity">Agent${actArrow}</th>` +
          `<th class="cc-count-cell cc-sortable${countActive}" data-sort="count" title="Sort by capture count">↓${countArrow}</th>` +
          `</tr></thead>` +
          `<tbody>${tbody}</tbody>` +
          `</table></div>`
    }

    function buildDetailPanel (agentName) {
      const info = agentName ? captures[agentName] : null
      if (!info) return '<div id="cc-agent-detail"></div>'

      const tc        = teamClass(info.team)
      const firstLink = portalLinkHtml(info.firstPortal, info.firstPortalGuid, info.firstPortalLatLng)
      const lastLink  = portalLinkHtml(info.lastPortal,  info.lastPortalGuid,  info.lastPortalLatLng)
      const showLast  = info.count > 1 && (info.lastTs !== info.firstTs || info.lastPortal !== info.firstPortal)

      return `<div id="cc-agent-detail" class="visible">` +
          `<span class="cc-close" id="cc-detail-close" title="Close">✕</span>` +
          `<div class="cc-detail-name cc-${tc.toLowerCase()}">${escapeHtml(agentName)}` +
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
    }

    // ── Open / refresh dialog ──────────────────────────────────────────────────
    function openDialog () {
      if (dialogRef) { refreshDialog(); return }

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
          `</div>`

      dialogRef = window.dialog({
        title: '📡 Capture Counter',
        html,
        id: 'capture-counter',
        closeCallback: function () {
          // Cancel any pending portal poller when dialog closes (#9)
          if (pollerRef) { clearInterval(pollerRef); pollerRef = null }
          dialogRef = null
        }
      })

      bindDialogEvents()
    }

    function bindDialogEvents () {
      const dialog = document.getElementById('capture-counter-dialog')
      if (!dialog) return

      // Live search — only rebuilds table, not whole dialog
      dialog.addEventListener('input', function (e) {
        if (e.target.id !== 'cc-search') return
        filterQuery = e.target.value.toLowerCase()   // store lowercase once (#2)
        const clearBtn = document.getElementById('cc-search-clear')
        if (clearBtn) clearBtn.classList.toggle('visible', filterQuery.length > 0)
        const tw = document.getElementById('cc-table-wrap')
        if (tw) tw.innerHTML = buildTable()
      })

      dialog.addEventListener('click', function (e) {
        // search clear
        if (e.target.id === 'cc-search-clear') {
          filterQuery = ''
          const inp = document.getElementById('cc-search')
          if (inp) inp.value = ''
          e.target.classList.remove('visible')
          const tw = document.getElementById('cc-table-wrap')
          if (tw) tw.innerHTML = buildTable()
          return
        }

        // team filter toggle
        const sumBox = e.target.closest('.cc-sum-box[data-team]')
        if (sumBox) {
          const team = sumBox.getAttribute('data-team')
          if (teamFilters.has(team)) {
            if (teamFilters.size > 1) teamFilters.delete(team)
          } else {
            teamFilters.add(team)
          }
          const sw = document.getElementById('cc-summary-wrap')
          if (sw) sw.innerHTML = buildSummary()
          const tw = document.getElementById('cc-table-wrap')
          if (tw) tw.innerHTML = buildTable()
          return
        }

        // sort header
        const sortTh = e.target.closest('th[data-sort]')
        if (sortTh) {
          const mode = sortTh.getAttribute('data-sort')
          if (mode && mode !== sortMode) { sortMode = mode; refreshDialog() }
          return
        }

        // reset
        if (e.target.id === 'cc-btn-reset') {
          if (confirm('Reset all capture data?')) {
            captures = {}; seenGuids = new Set(); totalCount = 0
            selectedAgent = null; filterQuery = ''
            teamFilters = new Set(['ENL', 'RES', 'MAC'])
            saveData(); refreshDialog()
          }
          return
        }

        // close detail
        if (e.target.id === 'cc-detail-close') {
          selectedAgent = null; refreshDialog(); return
        }

        // agent name → show detail
        const agentEl = e.target.closest('.cc-agent-name')
        if (agentEl) {
          const row = agentEl.closest('tr[data-agent]')
          if (!row) return
          const name = row.getAttribute('data-agent')
          selectedAgent = (selectedAgent === name) ? null : name
          refreshDialog(); return
        }

        // portal link → pan + highlight
        const pl = e.target.closest('.cc-portal-link')
        if (pl) {
          e.preventDefault()
          const lat  = parseFloat(pl.dataset.lat)
          const lng  = parseFloat(pl.dataset.lng)
          const guid = pl.dataset.guid
          const name = pl.dataset.name || ''

          if (!isNaN(lat) && !isNaN(lng)) {
            window.map.setView([lat, lng], Math.max(window.map.getZoom(), 15))

            // Cancel any existing poller before starting a new one (#9)
            if (pollerRef) { clearInterval(pollerRef); pollerRef = null }

            if (guid && window.portals && window.portals[guid]) {
              window.selectPortal(guid)
            } else if (guid) {
              let attempts = 0
              pollerRef = setInterval(function () {
                // Abort if dialog has been closed (#9)
                if (!dialogRef) { clearInterval(pollerRef); pollerRef = null; return }
                attempts++
                if (window.portals && window.portals[guid]) {
                  window.selectPortal(guid)
                  clearInterval(pollerRef); pollerRef = null
                } else if (attempts >= 10) {
                  clearInterval(pollerRef); pollerRef = null
                }
              }, 500)
            }

            visitedPortals.add(guid || name)
            const dw = document.getElementById('cc-detail-wrap')
            if (dw) dw.innerHTML = buildDetailPanel(selectedAgent)
          }
        }
      })
    }

    function refreshDialog () {
      // Debounce flash clear — cancel previous timer so bursts don't cut each
      // other's animation short (#7)
      if (flashTimer) { clearTimeout(flashTimer); flashTimer = null }

      const sw = document.getElementById('cc-summary-wrap')
      if (sw) sw.innerHTML = buildSummary()

      // Only build search bar HTML on first render; afterwards the live <input>
      // already exists and we must not replace it (would lose focus / cursor pos)
      const so = document.getElementById('cc-search-outer')
      if (so && !document.getElementById('cc-search')) so.innerHTML = buildSearchBar()

      const tw = document.getElementById('cc-table-wrap')
      if (tw) tw.innerHTML = buildTable()

      const dw = document.getElementById('cc-detail-wrap')
      if (dw) dw.innerHTML = buildDetailPanel(selectedAgent)

      const countEl = document.querySelector('#capture-counter-dialog .cc-count')
      if (countEl) countEl.textContent = `${Object.keys(captures).length} agents · ${totalCount} caps`

      const statusEl = document.getElementById('capture-counter-status')
      if (statusEl) statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString()

      if (flashAgents.size > 0) {
        flashTimer = setTimeout(function () {
          flashAgents.clear()
          flashTimer = null
        }, 1500)
      }
    }

    // ── Plexts parsing ─────────────────────────────────────────────────────────
    /**
     * Capture SYSTEM_BROADCAST markup:
     *   ["PLAYER", { plain, team }]
     *   ["TEXT",   { plain: " captured " }]
     *   ["PORTAL", { plain, guid, latE6, lngE6 }]
     */
    const CAPTURE_REGEX = /\bcaptured\b/i

    function processPlexts (data) {
      const result = data && data.result
      if (!Array.isArray(result)) return

      let changed = false

      result.forEach(function (entry) {
        if (!Array.isArray(entry) || entry.length < 3) return

        const guid = entry[0]

        // ── Deduplication ──────────────────────────────────────────────────────
        // Mark seen IMMEDIATELY after the array-shape check, before any further
        // validation, to close the TOCTOU window within the same batch (#1).
        // We use a tentative approach: add to seenGuids now, remove if invalid.
        if (guid) {
          if (seenGuids.has(guid)) return
          seenGuids.add(guid)   // claim slot — will be left claimed even if entry
        }                       // turns out invalid (avoids double-processing)

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

        // Portal info
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
            count: 0,
            team,
            firstPortal: null, firstPortalGuid: null, firstPortalLatLng: null, firstTs: null,
            lastPortal:  null, lastPortalGuid:  null, lastPortalLatLng:  null, lastTs:  null
          }
        }

        const cur = captures[agentName]
        cur.count++
        totalCount++   // maintain running total (#13)

        // Only update team if we got a real value — protects against malformed
        // plexts overwriting a known faction with 'unknown' (#8)
        if (team !== 'unknown') cur.team = team

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

        // Cap in-memory seenGuids set (#14)
        if (seenGuids.size > SEEN_GUIDS_CAP) {
          seenGuids = new Set(Array.from(seenGuids).slice(-SEEN_GUIDS_CAP))
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
        label: '📡 Captures',
        title: 'Show portal capture leaderboard',
        action: openDialog
      })
      console.log('[Capture Counter] Plugin v1.6 loaded.')
    }

    if (window.iitcLoaded) setup()
    else window.addHook('iitcLoaded', setup)
  }

  const plugin_info = {}
  if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    plugin_info.script = {
      version: GM_info.script.version,
      name:    GM_info.script.name,
      description: GM_info.script.description
    }
  }

  wrapper(plugin_info)
})()