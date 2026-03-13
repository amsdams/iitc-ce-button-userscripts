// ==UserScript==
// @name         IITC Plugin: Capture Counter
// @namespace    https://iitc.app/plugins/capture-counter
// @version      1.3.0
// @description  Tracks portal captures from comms. Shows ENL/RES summary, sortable leaderboard, and per-agent first/last portal detail.
// @author       IITC Community
// @match        https://intel.ingress.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* global L, map */

;(function () {
  'use strict'

  function wrapper (plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function () {}

    // ── State ──────────────────────────────────────────────────────────────────
    const STORAGE_KEY = 'iitc-capture-counter'

    /**
     * captures[agentName] = {
     *   count: number,
     *   team: string,
     *   firstPortal: string|null,
     *   firstPortalGuid: string|null,
     *   firstPortalLatLng: {lat,lng}|null,
     *   firstTs: number|null,
     *   lastPortal: string|null,
     *   lastPortalGuid: string|null,
     *   lastPortalLatLng: {lat,lng}|null,
     *   lastTs: number|null
     * }
     */
    let captures = {}

    function saveData () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(captures)) } catch (e) {}
    }

    function loadData () {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) captures = JSON.parse(raw)
      } catch (e) { captures = {} }
    }

    // ── CSS ────────────────────────────────────────────────────────────────────
    function addCSS () {
      const style = document.createElement('style')
      style.textContent = `
        /* ── dialog sizing ── */
        #capture-counter-dialog {
          width: 260px;
        }
        .ui-dialog:has(#capture-counter-dialog) {
          width: 300px !important;
          min-width: 300px !important;
        }

        /* ── toolbar ── */
        #capture-counter-dialog .cc-toolbar {
          display: flex;
          gap: 6px;
          margin-bottom: 6px;
          align-items: center;
        }
        #capture-counter-dialog .cc-toolbar button {
          padding: 2px 8px;
          font-size: 11px;
          cursor: pointer;
        }
        #capture-counter-dialog .cc-count {
          font-size: 11px;
          color: #aaa;
          margin-left: auto;
          white-space: nowrap;
        }

        /* ── summary bar ── */
        #cc-summary {
          display: flex;
          gap: 4px;
          margin-bottom: 6px;
          font-size: 11px;
        }
        #cc-summary .cc-sum-box {
          flex: 1;
          padding: 3px 5px;
          border-radius: 3px;
          text-align: center;
          font-weight: bold;
          line-height: 1.4;
        }
        #cc-summary .cc-sum-enl { background: #0d2b0d; color: #03dc03; border: 1px solid #1a5c1a; }
        #cc-summary .cc-sum-res { background: #0a1a2b; color: #00c5ff; border: 1px solid #0a3d5c; }
        #cc-summary .cc-sum-mac { background: #2b1a0a; color: #f5a623; border: 1px solid #5c3a0a; }
        #cc-summary .cc-sum-label { font-size: 9px; font-weight: normal; opacity: 0.7; display: block; }

        /* ── table ── */
        #capture-counter-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          table-layout: fixed;
        }
        #capture-counter-table th {
          text-align: left;
          border-bottom: 1px solid #555;
          padding: 3px 4px;
          color: #ddd;
          position: sticky;
          top: 0;
          background: #1b1b1b;
          font-size: 11px;
          user-select: none;
        }
        #capture-counter-table th.sortable {
          cursor: pointer;
        }
        #capture-counter-table th.sortable:hover { color: #fff; }
        #capture-counter-table th.sort-active { color: #fff; }
        #capture-counter-table td {
          padding: 3px 4px;
          border-bottom: 1px solid #2a2a2a;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        #capture-counter-table tr:hover td { background: #252525; }
        #capture-counter-table tr.cc-selected td { background: #1e2a1e; }

        /* column widths */
        #capture-counter-table col.col-rank   { width: 22px; }
        #capture-counter-table col.col-agent  { width: auto; }
        #capture-counter-table col.col-count  { width: 36px; }

        #capture-counter-table .rank { color: #666; text-align: center; font-size: 10px; }
        #capture-counter-table .count { text-align: right; font-weight: bold; color: #fff; }

        /* agent name – clickable */
        #capture-counter-table .agent-name {
          cursor: pointer;
          text-decoration: underline dotted;
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        #capture-counter-table .agent-name:hover { opacity: 0.8; }

        .agent-ENL { color: #03dc03; }
        .agent-RES { color: #00c5ff; }
        .agent-MAC { color: #f5a623; }

        /* ── scroll wrap ── */
        .cc-scroll-wrap {
          max-height: 300px;
          overflow-y: auto;
          overflow-x: hidden;
        }

        /* ── status bar ── */
        #capture-counter-status {
          font-size: 10px;
          color: #666;
          margin-top: 4px;
          text-align: right;
        }

        /* ── agent detail panel ── */
        #cc-agent-detail {
          margin-top: 6px;
          padding: 5px 7px;
          background: #1a1a1a;
          border: 1px solid #3a3a3a;
          border-radius: 3px;
          font-size: 11px;
          line-height: 1.5;
          display: none;
        }
        #cc-agent-detail.visible { display: block; }
        #cc-agent-detail .cc-detail-name {
          font-weight: bold;
          font-size: 12px;
          margin-bottom: 2px;
        }
        #cc-agent-detail .cc-detail-label {
          color: #777;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        #cc-agent-detail .cc-detail-portal {
          color: #ccc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        #cc-agent-detail .cc-detail-portal a {
          color: #f5a623;
          text-decoration: none;
          cursor: pointer;
        }
        #cc-agent-detail .cc-detail-portal a:hover { text-decoration: underline; }
        #cc-agent-detail .cc-detail-time { color: #666; font-size: 10px; }
        #cc-agent-detail .cc-close {
          float: right;
          cursor: pointer;
          color: #666;
          font-size: 13px;
          line-height: 1;
          margin-left: 4px;
        }
        #cc-agent-detail .cc-close:hover { color: #aaa; }
      `
      document.head.appendChild(style)
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    function escapeHtml (s) {
      return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
    }

    function totalCaptures () {
      return Object.values(captures).reduce((s, v) => s + v.count, 0)
    }

    function teamClass (team) {
      return team === 'ENLIGHTENED' ? 'ENL'
          : team === 'RESISTANCE' ? 'RES'
              : team === 'MACHINA' ? 'MAC'
                  : ''
    }

    function fmtTime (ts) {
      if (!ts) return ''
      const d = new Date(ts)
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
          ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }

    // ── Dialog UI ──────────────────────────────────────────────────────────────
    let dialogRef = null
    let selectedAgent = null
    let sortMode = 'count' // 'count' | 'activity'

    function teamCaptures () {
      const t = { ENL: 0, RES: 0, MAC: 0 }
      Object.values(captures).forEach(function (info) {
        const tc = teamClass(info.team)
        if (tc && t[tc] !== undefined) t[tc] += info.count
      })
      return t
    }

    function buildSummary () {
      const t = teamCaptures()
      const parts = []
      if (t.ENL > 0) parts.push(`<div class="cc-sum-box cc-sum-enl">${t.ENL}<span class="cc-sum-label">Enlightened</span></div>`)
      if (t.RES > 0) parts.push(`<div class="cc-sum-box cc-sum-res">${t.RES}<span class="cc-sum-label">Resistance</span></div>`)
      if (t.MAC > 0) parts.push(`<div class="cc-sum-box cc-sum-mac">${t.MAC}<span class="cc-sum-label">Machina</span></div>`)
      if (parts.length === 0) return ''
      return `<div id="cc-summary">${parts.join('')}</div>`
    }

    function buildTable () {
      const entries = Object.entries(captures)
          .map(([name, info]) => ({ name, ...info }))

      if (entries.length === 0) {
        return '<p style="color:#888;text-align:center;padding:16px 0;font-size:12px">No captures recorded yet.<br>Loads when comms update.</p>'
      }

      if (sortMode === 'activity') {
        entries.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
      } else {
        entries.sort((a, b) => b.count - a.count || (b.lastTs || 0) - (a.lastTs || 0))
      }

      const countArrow  = sortMode === 'count'    ? ' ▼' : ''
      const actArrow    = sortMode === 'activity' ? ' ▼' : ''
      const countActive = sortMode === 'count'    ? ' sort-active' : ''
      const actActive   = sortMode === 'activity' ? ' sort-active' : ''

      const rows = entries.map((e, i) => {
        const tc = teamClass(e.team)
        const isSelected = selectedAgent === e.name
        return `<tr class="${isSelected ? 'cc-selected' : ''}" data-agent="${escapeHtml(e.name)}">
          <td class="rank">${i + 1}</td>
          <td><span class="agent-name agent-${tc}" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span></td>
          <td class="count">${e.count}</td>
        </tr>`
      }).join('')

      return `
        <div class="cc-scroll-wrap">
          <table id="capture-counter-table">
            <colgroup>
              <col class="col-rank">
              <col class="col-agent">
              <col class="col-count">
            </colgroup>
            <thead>
              <tr>
                <th class="rank">#</th>
                <th class="sortable${actActive}" data-sort="activity" title="Sort by latest activity">Agent${actArrow}</th>
                <th class="count sortable${countActive}" data-sort="count" title="Sort by capture count">↓${countArrow}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `
    }

    function portalLinkHtml (portalName, portalGuid, portalLatLng) {
      if (!portalName) return '<span style="color:#555">—</span>'
      if (portalLatLng && portalLatLng.lat != null) {
        const { lat, lng } = portalLatLng
        const guid = portalGuid || ''
        return `<a href="#" class="cc-portal-link"
            data-lat="${lat}" data-lng="${lng}" data-guid="${escapeHtml(guid)}"
            title="Pan map to portal">${escapeHtml(portalName)} ↗</a>`
      }
      return escapeHtml(portalName)
    }

    function buildDetailPanel (agentName) {
      const info = captures[agentName]
      if (!info) return '<div id="cc-agent-detail"></div>'

      const tc = teamClass(info.team)

      const firstLink = portalLinkHtml(info.firstPortal, info.firstPortalGuid, info.firstPortalLatLng)
      const lastLink  = portalLinkHtml(info.lastPortal,  info.lastPortalGuid,  info.lastPortalLatLng)

      // Only show "last" row when it differs from first (i.e. more than 1 capture)
      const showLast = info.count > 1 && info.lastPortal !== info.firstPortal

      return `
        <div id="cc-agent-detail" class="visible">
          <span class="cc-close" id="cc-detail-close" title="Close">✕</span>
          <div class="cc-detail-name agent-${tc}">${escapeHtml(agentName)}</div>
          <div class="cc-detail-label">First capture</div>
          <div class="cc-detail-portal">${firstLink}</div>
          <div class="cc-detail-time">${fmtTime(info.firstTs)}</div>
          ${showLast ? `
          <div class="cc-detail-label" style="margin-top:4px">Last capture</div>
          <div class="cc-detail-portal">${lastLink}</div>
          <div class="cc-detail-time">${fmtTime(info.lastTs)}</div>
          ` : ''}
        </div>
      `
    }

    function openDialog () {
      if (dialogRef) {
        refreshDialog()
        return
      }

      const agentCount = Object.keys(captures).length
      const html = `
        <div id="capture-counter-dialog">
          <div class="cc-toolbar">
            <button id="cc-btn-reset">Reset</button>
            <span class="cc-count">${agentCount} agents · ${totalCaptures()} caps</span>
          </div>
          <div id="cc-summary-wrap">${buildSummary()}</div>
          <div id="cc-table-wrap">${buildTable()}</div>
          <div id="cc-detail-wrap">${buildDetailPanel(selectedAgent)}</div>
          <div id="capture-counter-status">Listening for comms…</div>
        </div>
      `

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

      dialog.addEventListener('click', function (e) {
        // Sort header click
        const sortTh = e.target.closest('th[data-sort]')
        if (sortTh) {
          const mode = sortTh.getAttribute('data-sort')
          if (mode && mode !== sortMode) {
            sortMode = mode
            refreshDialog()
          }
          return
        }

        // Reset button
        if (e.target.id === 'cc-btn-reset') {
          if (confirm('Reset all capture data?')) {
            captures = {}
            selectedAgent = null
            saveData()
            refreshDialog()
          }
          return
        }

        // Close detail panel
        if (e.target.id === 'cc-detail-close') {
          selectedAgent = null
          refreshDialog()
          return
        }

        // Agent name click
        const agentEl = e.target.closest('.agent-name')
        if (agentEl) {
          const row = agentEl.closest('tr[data-agent]')
          if (!row) return
          const name = row.getAttribute('data-agent')
          selectedAgent = (selectedAgent === name) ? null : name
          refreshDialog()
          return
        }

        // Portal link click → pan map
        const portalLink = e.target.closest('.cc-portal-link')
        if (portalLink) {
          e.preventDefault()
          const lat = parseFloat(portalLink.dataset.lat)
          const lng = parseFloat(portalLink.dataset.lng)
          const guid = portalLink.dataset.guid
          if (!isNaN(lat) && !isNaN(lng)) {
            window.map.setView([lat, lng], Math.max(window.map.getZoom(), 15))
            if (guid && window.portals && window.portals[guid]) {
              window.renderPortalDetails(window.portals[guid])
            }
          }
        }
      })
    }

    function refreshDialog () {
      const summaryWrap = document.getElementById('cc-summary-wrap')
      if (summaryWrap) summaryWrap.innerHTML = buildSummary()

      const tableWrap = document.getElementById('cc-table-wrap')
      if (!tableWrap) return
      tableWrap.innerHTML = buildTable()

      const detailWrap = document.getElementById('cc-detail-wrap')
      if (detailWrap) {
        detailWrap.innerHTML = buildDetailPanel(selectedAgent)
      }

      const agentCount = Object.keys(captures).length
      const countEl = document.querySelector('#capture-counter-dialog .cc-count')
      if (countEl) countEl.textContent = `${agentCount} agents · ${totalCaptures()} caps`

      const statusEl = document.getElementById('capture-counter-status')
      if (statusEl) statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString()
    }

    // ── Plexts parsing ─────────────────────────────────────────────────────────
    /**
     * Capture messages look like:
     *   markup: [
     *     ["PLAYER", { plain: "AgentName", team: "ENLIGHTENED" }],
     *     ["TEXT",   { plain: " captured " }],
     *     ["PORTAL", { plain: "Portal Name", guid: "...", latE6: ..., lngE6: ... }]
     *   ]
     */
    const CAPTURE_REGEX = /\bcaptured\b/i

    function processPlexts (data) {
      const result = data && (data.result || data.raw)
      if (!Array.isArray(result)) return

      let changed = false

      result.forEach(function (entry) {
        if (!Array.isArray(entry) || entry.length < 3) return
        const obj = entry[2]
        if (!obj || !obj.plext) return

        const plext = obj.plext
        const markup = plext.markup
        if (!Array.isArray(markup)) return

        if (plext.plextType && plext.plextType !== 'SYSTEM_BROADCAST') return

        const hasCapture = markup.some(function (seg) {
          return seg[0] === 'TEXT' && seg[1] && CAPTURE_REGEX.test(seg[1].plain)
        })
        if (!hasCapture) return

        const playerSeg = markup.find(function (seg) { return seg[0] === 'PLAYER' })
        if (!playerSeg || !playerSeg[1]) return

        const portalSeg = markup.find(function (seg) { return seg[0] === 'PORTAL' })

        const agentName = playerSeg[1].plain
        const team = playerSeg[1].team || 'unknown'
        if (!agentName) return

        // Extract portal info
        let lastPortal = null, lastPortalGuid = null, lastPortalLatLng = null
        if (portalSeg && portalSeg[1]) {
          const p = portalSeg[1]
          lastPortal = p.plain || p.name || null
          lastPortalGuid = p.guid || null
          if (p.latE6 != null && p.lngE6 != null) {
            lastPortalLatLng = { lat: p.latE6 / 1e6, lng: p.lngE6 / 1e6 }
          }
        }

        const ts = entry[1] || Date.now()

        if (!captures[agentName]) {
          captures[agentName] = {
            count: 0, team,
            firstPortal: null, firstPortalGuid: null, firstPortalLatLng: null, firstTs: null,
            lastPortal: null,  lastPortalGuid: null,  lastPortalLatLng: null,  lastTs: null
          }
        }
        captures[agentName].count++
        captures[agentName].team = team
        if (lastPortal) {
          const cur = captures[agentName]
          // Earliest timestamp wins "first"
          if (!cur.firstTs || ts <= cur.firstTs) {
            cur.firstPortal = lastPortal
            cur.firstPortalGuid = lastPortalGuid
            cur.firstPortalLatLng = lastPortalLatLng
            cur.firstTs = ts
          }
          // Latest timestamp wins "last"
          if (!cur.lastTs || ts >= cur.lastTs) {
            cur.lastPortal = lastPortal
            cur.lastPortalGuid = lastPortalGuid
            cur.lastPortalLatLng = lastPortalLatLng
            cur.lastTs = ts
          }
        }
        changed = true
      })

      if (changed) {
        saveData()
        refreshDialog()
      }
    }

    // ── IITC hook setup ────────────────────────────────────────────────────────
    function setup () {
      loadData()
      addCSS()

      window.addHook('publicChatDataAvailable', processPlexts)
      window.addHook('factionChatDataAvailable', processPlexts)

      window.IITC.toolbox.addButton({
        label: '📡 Captures',
        title: 'Show portal capture leaderboard',
        action: openDialog
      })

      console.log('[Capture Counter] Plugin v1.3 loaded.')
    }

    if (window.iitcLoaded) {
      setup()
    } else {
      window.addHook('iitcLoaded', setup)
    }
  }

  const plugin_info = {}
  if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    plugin_info.script = {
      version: GM_info.script.version,
      name: GM_info.script.name,
      description: GM_info.script.description
    }
  }

  wrapper(plugin_info)
})()