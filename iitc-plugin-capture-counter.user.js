// ==UserScript==
// @name         IITC Plugin: Capture Counter
// @namespace    https://iitc.app/plugins/capture-counter
// @version      1.0.0
// @description  Tracks portal captures from comms (getPlexts) and shows a leaderboard table sorted by capture count.
// @author       IITC Community
// @match        https://intel.ingress.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* global L, map */

;(function () {
  'use strict'

  // ── Plugin bootstrap ────────────────────────────────────────────────────────
  function wrapper (plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function () {}

    // ── State ──────────────────────────────────────────────────────────────────
    const STORAGE_KEY = 'iitc-capture-counter'

    /** @type {{ [agentName: string]: { count: number, team: string } }} */
    let captures = {}

    // Persist to localStorage so data survives page reloads
    function saveData () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(captures))
      } catch (e) { /* quota exceeded – ignore */ }
    }

    function loadData () {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) captures = JSON.parse(raw)
      } catch (e) {
        captures = {}
      }
    }

    // ── CSS ────────────────────────────────────────────────────────────────────
    function addCSS () {
      const style = document.createElement('style')
      style.textContent = `
        #capture-counter-dialog {
          min-width: 320px;
        }
        #capture-counter-dialog .cc-toolbar {
          display: flex;
          gap: 6px;
          margin-bottom: 8px;
          align-items: center;
        }
        #capture-counter-dialog .cc-toolbar button {
          padding: 3px 10px;
          font-size: 12px;
          cursor: pointer;
        }
        #capture-counter-dialog .cc-count {
          font-size: 12px;
          color: #aaa;
          margin-left: auto;
        }
        #capture-counter-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        #capture-counter-table th {
          text-align: left;
          border-bottom: 1px solid #555;
          padding: 4px 6px;
          color: #ddd;
          position: sticky;
          top: 0;
          background: #1b1b1b;
        }
        #capture-counter-table td {
          padding: 4px 6px;
          border-bottom: 1px solid #333;
        }
        #capture-counter-table tr:hover td {
          background: #2a2a2a;
        }
        #capture-counter-table .rank {
          color: #888;
          width: 30px;
        }
        #capture-counter-table .agent-ENL {
          color: #03dc03;
        }
        #capture-counter-table .agent-RES {
          color: #00c5ff;
        }
        #capture-counter-table .agent-MAC {
          color: #f5a623;
        }
        #capture-counter-table .count {
          text-align: right;
          font-weight: bold;
          color: #fff;
          width: 50px;
        }
        .cc-scroll-wrap {
          max-height: 400px;
          overflow-y: auto;
        }
        #capture-counter-status {
          font-size: 11px;
          color: #888;
          margin-top: 6px;
          text-align: right;
        }
      `
      document.head.appendChild(style)
    }

    // ── Dialog UI ──────────────────────────────────────────────────────────────
    let dialogRef = null

    function buildTable () {
      const entries = Object.entries(captures)
        .map(([name, info]) => ({ name, count: info.count, team: info.team || 'unknown' }))
        .sort((a, b) => b.count - a.count)

      if (entries.length === 0) {
        return '<p style="color:#888;text-align:center;padding:20px 0">No captures recorded yet.<br>Captures appear when comms messages load.</p>'
      }

      const rows = entries.map((e, i) => {
        const teamClass = e.team === 'ENLIGHTENED' ? 'ENL'
          : e.team === 'RESISTANCE' ? 'RES'
          : e.team === 'MACHINA' ? 'MAC'
          : ''
        return `<tr>
          <td class="rank">${i + 1}</td>
          <td class="agent-${teamClass}">${escapeHtml(e.name)}</td>
          <td class="count">${e.count}</td>
        </tr>`
      }).join('')

      return `
        <div class="cc-scroll-wrap">
          <table id="capture-counter-table">
            <thead>
              <tr>
                <th class="rank">#</th>
                <th>Agent</th>
                <th class="count">Captures</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `
    }

    function escapeHtml (s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }

    function totalCaptures () {
      return Object.values(captures).reduce((s, v) => s + v.count, 0)
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
            <span class="cc-count">${agentCount} agents · ${totalCaptures()} captures</span>
          </div>
          <div id="cc-table-wrap">${buildTable()}</div>
          <div id="capture-counter-status">Listening for comms…</div>
        </div>
      `

      dialogRef = window.dialog({
        title: '📡 Capture Counter',
        html,
        id: 'capture-counter',
        closeCallback: function () { dialogRef = null }
      })

      document.getElementById('cc-btn-reset').addEventListener('click', function () {
        if (confirm('Reset all capture data?')) {
          captures = {}
          saveData()
          refreshDialog()
        }
      })
    }

    function refreshDialog () {
      const wrap = document.getElementById('cc-table-wrap')
      if (!wrap) return
      wrap.innerHTML = buildTable()

      const agentCount = Object.keys(captures).length
      const countEl = document.querySelector('#capture-counter-dialog .cc-count')
      if (countEl) countEl.textContent = `${agentCount} agents · ${totalCaptures()} captures`

      const statusEl = document.getElementById('capture-counter-status')
      if (statusEl) {
        statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString()
      }
    }

    // ── Plexts parsing ─────────────────────────────────────────────────────────
    /**
     * IITC fires window.addHook('publicChatDataAvailable', ...) and
     * window.addHook('factionChatDataAvailable', ...) after each getPlexts call.
     * Each hook receives { raw, result } where result is an array of plext entries.
     *
     * A plext entry looks like:
     * [ guid, timestampMs, {
     *     plext: {
     *       plextType: "SYSTEM_BROADCAST" | "PLAYER_GENERATED" | ...,
     *       markup: [ [type, {plain, team, ...}], ... ],
     *       categories: 1 (= ACTIVITY) | 2 (= ALERT) | 4 (= PUBLIC CHAT) | ...
     *     }
     *   }
     * ]
     *
     * Capture messages look like:
     *   markup: [["PLAYER",{plain:"AgentName",team:"ENLIGHTENED"}],
     *            ["TEXT",{plain:" captured "}],
     *            ["PORTAL",{plain:"Portal Name",...}]]
     *
     * We detect them by checking for TEXT segment containing " captured ".
     */

    const CAPTURE_REGEX = /\bcaptured\b/i

    function processPlexts (data) {
      const result = data && (data.result || data.raw)
      if (!Array.isArray(result)) return

      let changed = false

      result.forEach(function (entry) {
        // entry: [guid, ts, obj]
        if (!Array.isArray(entry) || entry.length < 3) return
        const obj = entry[2]
        if (!obj || !obj.plext) return

        const plext = obj.plext
        const markup = plext.markup
        if (!Array.isArray(markup)) return

        // Only look at ACTIVITY category (categories bitmask & 1)
        // categories may be absent on older versions – still try
        // plextType SYSTEM_BROADCAST covers captures
        if (plext.plextType && plext.plextType !== 'SYSTEM_BROADCAST') return

        // Find a TEXT segment with "captured"
        const hasCapture = markup.some(function (seg) {
          return seg[0] === 'TEXT' && seg[1] && CAPTURE_REGEX.test(seg[1].plain)
        })
        if (!hasCapture) return

        // Find the PLAYER segment (first one = actor)
        const playerSeg = markup.find(function (seg) { return seg[0] === 'PLAYER' })
        if (!playerSeg || !playerSeg[1]) return

        const agentName = playerSeg[1].plain
        const team = playerSeg[1].team || 'unknown'

        if (!agentName) return

        if (!captures[agentName]) {
          captures[agentName] = { count: 0, team }
        }
        captures[agentName].count++
        captures[agentName].team = team  // keep team up-to-date
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

      // Hook into comms data events
      window.addHook('publicChatDataAvailable', processPlexts)
      window.addHook('factionChatDataAvailable', processPlexts)

      // Add toolbar button
      window.IITC.toolbox.addButton({
        label: '📡 Captures',
        title: 'Show portal capture leaderboard',
        action: openDialog
      })

      console.log('[Capture Counter] Plugin loaded.')
    }

    // ── Register plugin ────────────────────────────────────────────────────────
    const setup_info = { script: plugin_info }

    if (window.iitcLoaded) {
      setup()
    } else {
      window.addHook('iitcLoaded', setup)
    }
  }

  // ── Userscript metadata shim (standard IITC pattern) ──────────────────────
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
