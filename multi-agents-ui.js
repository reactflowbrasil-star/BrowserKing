(function () {
  'use strict';
  const key = 'hatclaw.multiAgents.tree.v2';
  const positionKey = 'hatclaw.multiAgents.position.v1';
  const seed = [{ id: 'root', title: 'Agente principal', role: 'Coordena a conversa e consolida os resultados.', state: 'active', children: [] }];
  const load = () => { try { return JSON.parse(localStorage.getItem(key)) || seed; } catch (_) { return seed; } };
  const save = tree => localStorage.setItem(key, JSON.stringify(tree));
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const icon = state => state === 'done' ? '✓' : state === 'error' ? '×' : state === 'working' ? '◌' : '▱';
  const find = (tree, id) => { for (const parent of tree) { if (parent.id === id) return parent; const child = (parent.children || []).find(item => item.id === id); if (child) return child; } return null; };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const loadPosition = () => { try { return JSON.parse(localStorage.getItem(positionKey)); } catch (_) { return null; } };
  const savePosition = position => localStorage.setItem(positionKey, JSON.stringify(position));
  function render(tree, expanded) {
    const list = expanded ? tree.map(parent => `<div class="hc-agent-group"><button class="hc-agent-row hc-agent-parent" data-select="${esc(parent.id)}"><span class="hc-agent-chevron">⌄</span><span class="hc-agent-icon">▱</span><span>${esc(parent.title)}</span><time>now</time></button><div class="hc-agent-children">${(parent.children || []).map(child => `<button class="hc-agent-row hc-agent-child" data-select="${esc(child.id)}"><span class="hc-agent-rail"></span><span class="hc-agent-icon hc-${child.state}">${icon(child.state)}</span><span>${esc(child.title)}</span><time>now</time></button>`).join('')}</div></div>`).join('') : '';
    return `<aside class="hc-agents-panel ${expanded ? 'hc-expanded' : 'hc-collapsed'}"><div class="hc-agents-heading"><button class="hc-agent-toggle" aria-label="${expanded ? 'Fechar agentes' : 'Abrir agentes'}" title="${expanded ? 'Fechar agentes' : 'Abrir agentes'}">${expanded ? '×' : '<img class="hc-extension-icon" src="/icon-128.png" alt="" draggable="false">'}</button>${expanded ? '<strong>AGENTS</strong><button class="hc-agent-add" title="Adicionar agente filho">＋</button><button class="hc-agent-more" title="Opções">•••</button>' : '<span class="hc-vertical-label">AGENTS</span>'}</div><div class="hc-agents-list">${list}</div><section class="hc-agent-conversation" aria-live="polite"></section></aside>`;
  }
  function init() {
    // Evita rodar dentro do sidepanel da extensão para não cobrir a interface
    if (window.location.protocol.includes('extension') && window.location.pathname.includes('sidepanel')) return;

    if (document.querySelector('.hc-agents-panel')) return;
    if (!document.querySelector('#root')) return setTimeout(init, 100);
    let expanded = false, selected = localStorage.getItem('hatclaw.activeAgent') || 'root';
    let bubblePosition = loadPosition() || { x: window.innerWidth - 78, y: window.innerHeight - 78 };
    let drag = null, suppressToggle = false;
    const host = document.createElement('div'); host.id = 'hc-agents-host'; document.body.appendChild(host);
    const style = document.createElement('style'); style.id = 'hc-agents-style'; style.textContent = `
      #hc-agents-host {
        position: fixed;
        z-index: 999999;
        font: 14px/1.4 Inter, system-ui, -apple-system, sans-serif;
        color: #eee;
        pointer-events: none;
        width: auto;
        height: auto;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .hc-agents-panel {
        box-sizing: border-box;
        background: rgba(26, 26, 26, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        pointer-events: auto;
        padding: 16px;
        overflow: hidden;
        transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s, opacity 0.3s;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        border-radius: 24px;
        backdrop-filter: blur(12px);
        display: flex;
        flex-direction: column;
      }
      .hc-expanded {
        width: 340px;
        max-height: 520px;
        opacity: 1;
      }
      .hc-collapsed {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        padding: 0;
        background: #111;
        border: 2px solid #d97757;
        box-shadow: 0 0 20px rgba(217, 119, 87, 0.3);
        opacity: 0.8;
        display: grid;
        place-items: center;
      }
      .hc-collapsed:hover {
        transform: scale(1.05);
        opacity: 1;
        box-shadow: 0 0 30px rgba(217, 119, 87, 0.5);
      }
      .hc-agents-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
        color: #888;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .hc-agents-heading strong { color: #d97757; }
      .hc-extension-icon { width: 56px; height: 56px; border-radius: 50%; }
      .hc-agent-row {
        width: 100%;
        height: 38px;
        display: flex;
        align-items: center;
        gap: 10px;
        border: 0;
        background: transparent;
        color: #ccc;
        text-align: left;
        border-radius: 10px;
        padding: 0 12px;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 4px;
      }
      .hc-agent-row:hover { background: rgba(255, 255, 255, 0.05); color: #fff; }
      .hc-agent-selected { background: rgba(217, 119, 87, 0.15); color: #d97757; font-weight: 600; }
      .hc-agent-conversation {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .hc-agent-chat-messages {
        flex: 1;
        overflow-y: auto;
        margin-bottom: 12px;
        font-size: 13px;
        padding-right: 4px;
      }
      .hc-agent-message { margin-bottom: 8px; line-height: 1.5; }
      .hc-agent-message b { color: #d97757; margin-right: 6px; }
      .hc-agent-chat-form { display: flex; gap: 8px; }
      .hc-agent-chat-form input {
        flex: 1;
        background: rgba(0,0,0,0.2);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 8px 12px;
        color: #fff;
        font-size: 13px;
      }
      .hc-agent-chat-form button {
        background: #d97757;
        color: #fff;
        border: 0;
        border-radius: 12px;
        padding: 0 16px;
        font-weight: 700;
        cursor: pointer;
      }
      .hc-collapsed .hc-vertical-label,
      .hc-collapsed .hc-agents-list,
      .hc-collapsed .hc-agent-conversation,
      .hc-collapsed strong,
      .hc-collapsed .hc-agent-add,
      .hc-collapsed .hc-agent-more { display: none; }
    `; document.head.appendChild(style);

    const paintConversation = () => { const box = host.querySelector('.hc-agent-conversation'); if (!box) return; const agent = find(load(), selected) || seed[0]; const historyKey = 'hatclaw.conversation.' + agent.id; let messages = []; try { messages = JSON.parse(localStorage.getItem(historyKey)) || []; } catch (_) {} box.innerHTML = `<div class="hc-agent-chat-title">Conversa com <strong>${esc(agent.title)}</strong><small>${esc(agent.role || 'Sem função definida')}</small></div><div class="hc-agent-chat-messages">${messages.map(m => `<div class="hc-agent-message hc-${m.from === 'Você' ? 'user' : 'agent'}"><b>${esc(m.from)}</b><span>${esc(m.text)}</span></div>`).join('') || '<em>Nenhuma mensagem nesta conversa.</em>'}</div><form class="hc-agent-chat-form"><input name="message" autocomplete="off" placeholder="Falar com ${esc(agent.title)}…"><button>Enviar</button></form>`; };
    const applyPosition = () => {
      const isMobile = window.innerWidth < 600;
      bubblePosition.x = clamp(bubblePosition.x, 8, Math.max(8, window.innerWidth - (expanded ? 330 : 72)));
      bubblePosition.y = clamp(bubblePosition.y, 8, Math.max(8, window.innerHeight - (expanded ? 510 : 72)));

      if (!expanded) {
        host.style.left = `${bubblePosition.x}px`;
        host.style.top = `${bubblePosition.y}px`;
        host.style.bottom = 'auto';
        host.style.right = 'auto';
        return;
      }

      const width = isMobile ? window.innerWidth - 16 : 320;
      const height = Math.min(500, window.innerHeight - 16);

      let left = bubblePosition.x;
      let top = bubblePosition.y;

      // Ensure panel stays on screen when expanded
      if (left + width > window.innerWidth) left = window.innerWidth - width - 8;
      if (top + height > window.innerHeight) top = window.innerHeight - height - 8;

      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
      host.style.bottom = 'auto';
      host.style.right = 'auto';
    };
    const paint = () => { host.innerHTML = render(load(), expanded); host.querySelectorAll('.hc-agent-row').forEach(item => item.classList.toggle('hc-agent-selected', item.dataset.select === selected)); document.documentElement.style.setProperty('--hc-agents-footer-space', expanded ? '220px' : '42px'); paintConversation(); requestAnimationFrame(applyPosition); };
    paint();
    host.addEventListener('pointerdown', event => {
      const toggle = event.target.closest('.hc-agent-toggle');
      if (!toggle || expanded || event.button !== 0) return;
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: bubblePosition.x, originY: bubblePosition.y, moved: false };
      toggle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    host.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      bubblePosition = {
        x: clamp(drag.originX + dx, 8, Math.max(8, window.innerWidth - 66)),
        y: clamp(drag.originY + dy, 8, Math.max(8, window.innerHeight - 66))
      };
      applyPosition();
    });
    const finishDrag = event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.moved) {
        suppressToggle = true;
        setTimeout(() => { suppressToggle = false; }, 0);
        savePosition(bubblePosition);
      }
      drag = null;
    };
    host.addEventListener('pointerup', finishDrag);
    host.addEventListener('pointercancel', finishDrag);
    window.addEventListener('resize', () => { applyPosition(); if (!expanded) savePosition(bubblePosition); });
    host.addEventListener('click', event => {
      if (event.target.closest('.hc-agent-toggle')) { if (suppressToggle) { suppressToggle = false; event.preventDefault(); return; } expanded = !expanded; paint(); return; }
      if (event.target.closest('.hc-agent-more')) { const tree = load(); const agent = find(tree, selected) || tree[0]; const action = prompt(`Opções de agentes:\n1 Excluir “${agent.title}”\n2 Excluir todos os agentes filhos`, ''); if (action === '1' && agent.id !== 'root' && confirm(`Excluir “${agent.title}”?`)) { tree[0].children = (tree[0].children || []).filter(item => item.id !== agent.id); selected = 'root'; save(tree); paint(); } else if (action === '2' && (tree[0].children || []).length && confirm('Excluir todos os agentes filhos? Esta ação não pode ser desfeita.')) { tree[0].children = []; selected = 'root'; save(tree); paint(); } return; }
      const form = event.target.closest('.hc-agent-chat-form'); if (form) { event.preventDefault(); const input = form.elements.message; const text = input.value.trim(); if (!text) return; const agent = find(load(), selected) || seed[0]; const historyKey = 'hatclaw.conversation.' + agent.id; let messages = []; try { messages = JSON.parse(localStorage.getItem(historyKey)) || []; } catch (_) {} messages.push({ from: 'Você', text }); if (agent.id !== 'root') { const rootHistoryKey = 'hatclaw.conversation.root'; let rootMessages = []; try { rootMessages = JSON.parse(localStorage.getItem(rootHistoryKey)) || []; } catch (_) {} rootMessages.push({ from: agent.title, text: `Recebi: ${text}` }); localStorage.setItem(rootHistoryKey, JSON.stringify(rootMessages)); } localStorage.setItem(historyKey, JSON.stringify(messages)); window.dispatchEvent(new CustomEvent('hatclaw:agent-message', { detail: { agentId: agent.id, agentTitle: agent.title, text, conversationKey: historyKey } })); paintConversation(); return; }
      if (event.target.closest('.hc-agent-add')) { const tree = load(); const parent = tree[0]; const title = prompt('Nome do agente filho:', 'Novo agente'); if (!title) return; const role = prompt('Função do agente:', 'Especialista da tarefa.') || ''; parent.children.push({ id: 'agent-' + Date.now(), title: title.trim(), role, state: 'pending' }); save(tree); paint(); return; }
      const row = event.target.closest('[data-select]'); if (!row) return; selected = row.dataset.select; host.querySelectorAll('.hc-agent-row').forEach(item => item.classList.toggle('hc-agent-selected', item.dataset.select === selected));
      const tree = load(); const agent = find(tree, selected);
      // Cada agente possui uma conversa independente. O host do painel (e o
      // relay, quando presente) usa este evento para trocar o histórico ativo.
      localStorage.setItem('hatclaw.activeAgent', selected);
      const conversationKey = 'hatclaw.conversation.' + selected;
      if (!localStorage.getItem(conversationKey)) localStorage.setItem(conversationKey, JSON.stringify([]));
      window.dispatchEvent(new CustomEvent('hatclaw:agent-selected', { detail: { id: agent.id, title: agent.title, role: agent.role || '', conversationKey } }));
      // Ações administrativas ficam no menu contextual, não no clique normal.
      const action = event.type === 'contextmenu' ? prompt(`Ações para “${agent.title}”:\n1 Renomear\n2 Definir função\n3 Excluir`, '') : '';
      if (action === '1') { const name = prompt('Novo nome:', agent.title); if (name) agent.title = name.trim(); }
      else if (action === '2') { const role = prompt('Função do agente:', agent.role || ''); if (role !== null) agent.role = role.trim(); }
      else if (action === '3' && agent.id !== 'root' && confirm(`Excluir “${agent.title}”?`)) tree[0].children = (tree[0].children || []).filter(item => item.id !== agent.id);
      save(tree); paint();
    });
    host.addEventListener('contextmenu', event => {
      const row = event.target.closest('[data-select]');
      if (!row) return;
      event.preventDefault();
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }
  init();
}());
