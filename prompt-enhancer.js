/**
 * HatClaw Prompt Enhancer
 * Improves the current request using the active provider and recent chat context.
 */
(function () {
  'use strict';

  const BUTTON_ID = 'hc-prompt-enhancer';
  const STYLE_ID = 'hc-prompt-enhancer-styles';
  let busy = false;

  const WAND_ICON = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 4 5 5L8 21l-5-5L15 4Z"/><path d="m6 14 4 4"/><path d="M19 2v3M17.5 3.5h3M5 2v3M3.5 3.5h3M21 15v3M19.5 16.5h3"/></svg>`;

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 5;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 8px;
        color: hsl(var(--text-200, 0 0% 62%));
        background: transparent;
        cursor: pointer;
        transition: color .15s, background .15s, border-color .15s, transform .15s;
      }
      #${BUTTON_ID}:hover {
        color: #b7ff2a;
        background: rgba(183,255,42,.08);
        border-color: rgba(183,255,42,.3);
      }
      #${BUTTON_ID}.loading { color: #b7ff2a; cursor: wait; }
      #${BUTTON_ID}.loading svg { animation: hc-wand-spin .8s linear infinite; }
      #${BUTTON_ID}:disabled { opacity: .75; }
      @keyframes hc-wand-spin { to { transform: rotate(360deg); } }
      .hc-enhancer-field { position: relative !important; }
      .hc-enhancer-field textarea { padding-right: 46px !important; }
      #hc-enhancer-toast {
        position: fixed;
        left: 50%;
        bottom: 112px;
        z-index: 100000;
        transform: translateX(-50%);
        max-width: calc(100vw - 32px);
        padding: 9px 12px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 9px;
        color: #f5f5f5;
        background: rgba(18,18,18,.96);
        box-shadow: 0 8px 24px rgba(0,0,0,.35);
        font: 12px/1.35 inherit;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    document.getElementById('hc-enhancer-toast')?.remove();
    const element = document.createElement('div');
    element.id = 'hc-enhancer-toast';
    element.textContent = message;
    document.body.appendChild(element);
    setTimeout(() => element.remove(), 3800);
  }

  function setTextareaValue(textarea, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
    textarea.focus();
    textarea.setSelectionRange(value.length, value.length);
  }

  function collectContext(textarea) {
    const candidates = [...document.querySelectorAll('[data-testid*="message"], article, [class*="message"], [class*="Message"]')];
    const seen = new Set();
    const excerpts = [];
    for (const node of candidates.slice(-12)) {
      if (node.contains(textarea)) continue;
      const text = (node.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length < 8 || text.length > 2000 || seen.has(text)) continue;
      seen.add(text);
      excerpts.push(text.slice(0, 900));
    }
    return excerpts.slice(-6).join('\n---\n').slice(-4500);
  }

  function cleanResponse(text) {
    return String(text || '')
      .replace(/^```(?:text|markdown)?\s*/i, '')
      .replace(/\s*```$/, '')
      .replace(/^(?:texto aperfeiçoado|solicitação aperfeiçoada|prompt melhorado)\s*:\s*/i, '')
      .trim();
  }

  async function requestImprovement(original, context) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'hatclaw-prompt-enhancer',
          max_tokens: 1400,
          stream: false,
          system: 'Você é um editor de solicitações. Reescreva a solicitação do usuário de forma completa, clara, específica e executável, preservando rigorosamente a intenção, o idioma, nomes, caminhos, restrições e fatos. Use o contexto apenas para eliminar ambiguidades. Não execute a tarefa, não responda à solicitação, não invente requisitos e não acrescente comentários. Retorne exclusivamente a solicitação aperfeiçoada.',
          messages: [{
            role: 'user',
            content: `CONTEXTO RECENTE (pode estar vazio):\n${context || '(sem contexto anterior)'}\n\nSOLICITAÇÃO A APERFEIÇOAR:\n${original}`,
          }],
        }),
      });
      if (!response.ok) throw new Error(`Provider ${response.status}`);
      const data = await response.json();
      const text = data?.content?.filter((part) => part?.type === 'text').map((part) => part.text).join('\n');
      const improved = cleanResponse(text);
      if (!improved || improved.length < 3) throw new Error('Resposta vazia');
      return improved;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function enhance(textarea, button) {
    if (busy) return;
    const original = textarea.value.trim();
    if (!original) return toast('Escreva uma solicitação antes de aperfeiçoar.');

    busy = true;
    button.disabled = true;
    button.classList.add('loading');
    button.title = 'Aperfeiçoando texto…';
    try {
      const improved = await requestImprovement(original, collectContext(textarea));
      setTextareaValue(textarea, improved);
      toast('Solicitação aperfeiçoada com o contexto da conversa.');
    } catch (error) {
      console.warn('[HatClaw Prompt Enhancer]', error);
      toast('Não foi possível aperfeiçoar agora. O texto original foi preservado.');
    } finally {
      busy = false;
      button.disabled = false;
      button.classList.remove('loading');
      button.title = 'Aperfeiçoar solicitação com IA';
    }
  }

  function findField(textarea) {
    let field = textarea.parentElement;
    while (field && field !== document.body) {
      const rect = field.getBoundingClientRect();
      if (rect.width >= textarea.getBoundingClientRect().width && rect.height >= textarea.offsetHeight && rect.height < 220) return field;
      field = field.parentElement;
    }
    return textarea.parentElement;
  }

  function inject() {
    if (document.getElementById(BUTTON_ID)) return true;
    const textarea = document.querySelector('textarea');
    if (!textarea) return false;
    const field = findField(textarea);
    if (!field) return false;
    addStyles();
    field.classList.add('hc-enhancer-field');
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.title = 'Aperfeiçoar solicitação com IA';
    button.setAttribute('aria-label', 'Aperfeiçoar e melhorar o texto');
    button.innerHTML = WAND_ICON;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      enhance(textarea, button);
    });
    field.appendChild(button);
    return true;
  }

  const timer = setInterval(() => inject() && clearInterval(timer), 400);
  const observer = new MutationObserver(() => {
    if (!document.getElementById(BUTTON_ID)) inject();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
