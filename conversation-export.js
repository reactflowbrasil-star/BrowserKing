(function () {
  'use strict';

  const BUTTON_ID = 'hatclaw-conversation-export';

  function textOf(node) {
    return String(node?.innerText || node?.textContent || '').replace(/\s+$/g, '').trim();
  }

  function collectConversation() {
    const selectors = [
      '[data-message-role]', '[data-testid*="message"]', '[data-testid*="conversation"] [class*="message"]',
      'main [class*="message"]', '[role="article"]'
    ];
    const nodes = [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))];
    const messages = nodes.map((node) => {
      const text = textOf(node);
      const role = node.getAttribute('data-message-role') || (/user|human|you/i.test(node.getAttribute('aria-label') || '') ? 'user' : 'assistant');
      return text ? { role, text } : null;
    }).filter(Boolean);
    if (messages.length) return messages.filter((item, index) => index === 0 || item.text !== messages[index - 1].text);
    const root = document.querySelector('main') || document.querySelector('#root');
    const fallback = textOf(root).replace(/Digite \/ para comandos[\s\S]*$/i, '').trim();
    return fallback ? [{ role: 'conversation', text: fallback }] : [];
  }

  function formatConversation(messages, format) {
    const title = `HatClaw — Histórico da conversa\nExportado em ${new Date().toLocaleString('pt-BR')}\n\n`;
    if (format === 'md') return title + messages.map((item) => `## ${item.role === 'user' ? 'Usuário' : item.role === 'assistant' ? 'HatClaw' : 'Conversa'}\n\n${item.text}`).join('\n\n---\n\n');
    return title + messages.map((item) => `[${item.role === 'user' ? 'Usuário' : item.role === 'assistant' ? 'HatClaw' : 'Conversa'}]\n${item.text}`).join('\n\n' + '='.repeat(64) + '\n\n');
  }

  function download(format) {
    const content = formatConversation(collectConversation(), format);
    const blob = new Blob([content], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `hatclaw-conversa-${new Date().toISOString().slice(0, 10)}.${format === 'md' ? 'md' : 'txt'}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showMenu(button) {
    document.getElementById(`${BUTTON_ID}-menu`)?.remove();
    const menu = document.createElement('div');
    menu.id = `${BUTTON_ID}-menu`;
    menu.className = 'hatclaw-export-menu';
    [['txt', 'Exportar como TXT'], ['md', 'Exportar como Markdown']].forEach(([format, label]) => {
      const option = document.createElement('button');
      option.type = 'button'; option.textContent = label;
      option.addEventListener('click', () => { download(format); menu.remove(); });
      menu.appendChild(option);
    });
    button.parentElement.appendChild(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
  }

  function mount() {
    if (document.getElementById(BUTTON_ID)) return;
    const input = document.querySelector('textarea, [contenteditable="true"]');
    if (!input) return;
    const composer = input.closest('form') || input.parentElement?.parentElement || input.parentElement;
    if (!composer) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID; button.type = 'button'; button.title = 'Exportar histórico da conversa'; button.setAttribute('aria-label', button.title); button.textContent = '⇩';
    button.addEventListener('click', (event) => { event.stopPropagation(); showMenu(button); });
    composer.appendChild(button);
  }

  const style = document.createElement('style');
  style.textContent = `#${BUTTON_ID}{width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:#b7b7b7;font-size:22px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}#${BUTTON_ID}:hover{background:#3b3b3b;color:#c8ff3d}.hatclaw-export-menu{position:absolute;right:0;bottom:38px;z-index:9999;min-width:190px;padding:6px;background:#30302e;border:1px solid #555;border-radius:10px;box-shadow:0 8px 24px #0008}.hatclaw-export-menu button{display:block;width:100%;padding:9px 10px;border:0;background:transparent;color:#eee;text-align:left;border-radius:6px;cursor:pointer}.hatclaw-export-menu button:hover{background:#454540}`;
  document.documentElement.appendChild(style);
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
