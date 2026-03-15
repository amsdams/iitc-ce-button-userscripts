// ==UserScript==
// @name        IITC Plugin: Invite Agent v1.6.3
// @description Pre-populate chat with a custom invitation message when clicking an agent name.
// @namespace   https://iitc.app/plugins/invite-agent
// @version     1.6.3
// @author      IITC Community
// @match       https://intel.ingress.com/*
// @grant       none
// ==/UserScript==

(function () {
  'use strict';

  var name = "IITC Plugin: Invite Agent v1.6.3";
  var version = "1.6.3";
  var description = "Pre-populate chat with a custom invitation message when clicking an agent name.";
  var header = {
  	name: name,
  	version: version,
  	description: description};

  // ── State ──────────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'iitc-invite-agent-msg';
  const DEFAULT_MSG = 'Join our Telegram channel: https://t.me/your_channel';
  let inviteMessage = DEFAULT_MSG;
  function loadData() {
      try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved)
              inviteMessage = saved;
      }
      catch (_e) {
          inviteMessage = DEFAULT_MSG;
      }
  }
  function saveData(msg) {
      inviteMessage = msg;
      try {
          localStorage.setItem(STORAGE_KEY, msg);
      }
      catch (_e) { }
  }
  // ── UI ────────────────────────────────────────────────────────────────────
  function openSettings() {
      const html = `
    <div id="invite-agent-settings">
      <div style="margin-bottom: 10px;">
        <label style="display:block; margin-bottom:5px;">Predefined Message:</label>
        <textarea id="invite-msg-input" style="width:100%; height:80px; box-sizing:border-box; background:#111; color:#ddd; border:1px solid #444; padding:5px; font-family:monospace;">${inviteMessage}</textarea>
      </div>
      <p style="font-size:11px; color:#aaa;">Clicking an agent name will fill the chat with:<br><strong>@AgentName [Message]</strong></p>
      <div style="text-align:right; margin-top:10px;">
        <button id="invite-save-btn" style="padding:4px 12px; cursor:pointer;">Save</button>
      </div>
    </div>
  `;
      const d = window.dialog({
          title: `📩 Invite Agent Setup v${header.version}`,
          html,
          id: 'invite-agent-settings'
      });
      const dialogEl = document.getElementById('invite-agent-settings');
      if (dialogEl) {
          dialogEl.querySelector('#invite-save-btn')?.addEventListener('click', () => {
              const newMsg = dialogEl.querySelector('#invite-msg-input').value;
              saveData(newMsg);
              alert('Message saved!');
              d.close();
          });
      }
  }
  // ── Logic ──────────────────────────────────────────────────────────────────
  function onNicknameClicked(data) {
      const event = data.event;
      const nickname = data.nickname;
      // We only intercept if it's a standard click (no modifiers)
      // or you can make it require a modifier like Ctrl+Click
      if (event && (event.ctrlKey || event.metaKey)) {
          // Standard behavior for Ctrl+Click
          return true;
      }
      // Populate the chat input
      const chatInput = document.getElementById('chatinput')?.querySelector('input');
      if (chatInput) {
          const fullMsg = `@${nickname} ${inviteMessage}`;
          chatInput.value = fullMsg;
          chatInput.focus();
          // Prevent default IITC behavior (which usually just adds the nickname)
          event.preventDefault();
          event.stopPropagation();
          return false;
      }
      return true;
  }
  const setup = () => {
      loadData();
      // Hook into nickname clicks
      window.addHook('nicknameClicked', onNicknameClicked);
      const w = window;
      const label = '📩 Invite Msg';
      if (w.IITC?.toolbox?.addButton) {
          w.IITC.toolbox.addButton({
              label,
              title: 'Setup the predefined invitation message',
              action: openSettings
          });
      }
      else {
          w.$('#toolbox').append(`<a onclick="window.plugin.inviteAgent.openSettings();return false;" title="Setup invitation message">${label}</a>`);
      }
      console.log('[Invite Agent] Plugin loaded.');
  };
  // IITC standard plugin registration
  const w = window;
  if (!w.plugin)
      w.plugin = () => { };
  if (!w.plugin.inviteAgent)
      w.plugin.inviteAgent = {};
  w.plugin.inviteAgent.openSettings = openSettings;
  setup.info = { script: { version: header.version, name: header.name, description: header.description } };
  if (!w.bootPlugins)
      w.bootPlugins = [];
  w.bootPlugins.push(setup);
  if (w.iitcLoaded)
      setup();

})();
