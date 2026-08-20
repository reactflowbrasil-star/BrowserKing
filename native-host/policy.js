'use strict';

const ACTIONS = new Set([
  'system.info','screen.capture','mouse.move','mouse.click','keyboard.type','keyboard.hotkey',
  'window.list','window.focus','window.close','file.list','file.read','file.write','file.delete',
  'file.move','directory.create','process.launch','powershell.run','audit.read'
  ,'relay.token'
  ,'codex.status','codex.login','codex.logout','codex.chat'
]);

const CRITICAL = new Set(['window.close','file.write','file.delete','file.move','directory.create','process.launch','powershell.run']);

function classify(action, params = {}) {
  if (!ACTIONS.has(action)) return { allowed: false, reason: 'Unknown action' };
  if (CRITICAL.has(action)) return { allowed: true, confirmation: true, risk: 'critical' };
  if (action === 'keyboard.type' && params.sensitive === true) {
    return { allowed: true, confirmation: true, risk: 'high' };
  }
  return { allowed: true, confirmation: false, risk: 'standard' };
}

module.exports = { ACTIONS, classify };
