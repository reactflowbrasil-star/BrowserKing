/** HatClaw document attachments for the composer menu. */
(function () {
  'use strict';

  const ITEM_ID = 'hc-add-document';
  const INPUT_ID = 'hc-document-input';
  const ACCEPT = '.pdf,.txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.hpp,.cs,.go,.rs,.php,.rb,.sh,.ps1,.sql,.yaml,.yml,.toml,.ini,.env,.log,.rtf';
  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const MAX_EXTRACTED_CHARS = 120000;
  const FILE_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg>`;

  function toast(message) {
    document.getElementById('hc-file-toast')?.remove();
    const node = document.createElement('div');
    node.id = 'hc-file-toast';
    node.textContent = message;
    node.style.cssText = 'position:fixed;left:50%;bottom:112px;transform:translateX(-50%);z-index:100000;max-width:calc(100vw - 32px);padding:9px 12px;border:1px solid rgba(255,255,255,.12);border-radius:9px;color:#f5f5f5;background:rgba(18,18,18,.96);box-shadow:0 8px 24px rgba(0,0,0,.35);font:12px/1.35 inherit;text-align:center';
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function findEditor() {
    const fields = [...document.querySelectorAll('textarea,[contenteditable="true"][role="textbox"],[contenteditable="true"],input[type="text"]')];
    return fields.find((field) => {
      const rect = field.getBoundingClientRect();
      return rect.width > 120 && rect.height > 20 && rect.bottom > innerHeight * .55;
    }) || null;
  }

  function getValue(field) {
    return field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement ? field.value : field.innerText || field.textContent || '';
  }

  function setValue(field, value) {
    if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
      const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.focus();
      field.setSelectionRange(value.length, value.length);
      return;
    }
    field.focus();
    field.textContent = value;
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    const range = document.createRange();
    range.selectNodeContents(field);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function decodePdfLiteral(value) {
    return value
      .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
      .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
      .replace(/\\b/g, '\b').replace(/\\f/g, '\f')
      .replace(/\\([()\\])/g, '$1');
  }

  function decodePdfHex(hex) {
    const clean = hex.replace(/\s+/g, '');
    const bytes = new Uint8Array(Math.ceil(clean.length / 2));
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2).padEnd(2, '0'), 16);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      let text = '';
      for (let i = 2; i + 1 < bytes.length; i += 2) text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      return text;
    }
    return new TextDecoder('windows-1252').decode(bytes);
  }

  function extractPdfOperators(source) {
    const chunks = [];
    const blocks = source.match(/BT[\s\S]*?ET/g) || [source];
    for (const block of blocks) {
      const tokens = /\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/g;
      let match;
      while ((match = tokens.exec(block))) {
        const text = match[1] !== undefined ? decodePdfLiteral(match[1]) : decodePdfHex(match[2]);
        if (/[\p{L}\p{N}]/u.test(text)) chunks.push(text);
      }
      if (chunks.length) chunks.push('\n');
    }
    return chunks.join(' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  }

  async function inflatePdfStream(bytes) {
    if (typeof DecompressionStream !== 'function') return '';
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      return new TextDecoder('latin1').decode(await new Response(stream).arrayBuffer());
    } catch { return ''; }
  }

  async function extractPdf(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const source = new TextDecoder('latin1').decode(bytes);
    const sources = [source];
    const streamPattern = /stream\r?\n/g;
    let match;
    while ((match = streamPattern.exec(source))) {
      const end = source.indexOf('endstream', match.index);
      if (end < 0) break;
      const dictionary = source.slice(Math.max(0, match.index - 500), match.index);
      if (/FlateDecode/.test(dictionary)) {
        let start = match.index + match[0].length;
        let finish = end;
        if (bytes[finish - 1] === 10) finish--;
        if (bytes[finish - 1] === 13) finish--;
        const inflated = await inflatePdfStream(bytes.slice(start, finish));
        if (inflated) sources.push(inflated);
      }
      streamPattern.lastIndex = end + 9;
    }
    const text = sources.map(extractPdfOperators).filter(Boolean).join('\n').trim();
    if (!text) throw new Error('PDF sem texto extraível; documentos digitalizados precisam de OCR.');
    return text;
  }

  async function extractText(file) {
    if (file.size > MAX_FILE_SIZE) throw new Error('Arquivo acima do limite de 15 MB.');
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (file.type === 'application/pdf' || extension === 'pdf') return extractPdf(file);
    let text = await file.text();
    if (extension === 'rtf') text = text.replace(/\\'[0-9a-f]{2}/gi, ' ').replace(/\\[a-z]+-?\d* ?/gi, ' ').replace(/[{}]/g, ' ');
    if (!text.trim()) throw new Error('O arquivo não contém texto legível.');
    return text;
  }

  async function attachFiles(files) {
    const editor = findEditor();
    if (!editor) return toast('Campo da solicitação não encontrado.');
    const blocks = [];
    const errors = [];
    for (const file of files) {
      try {
        let text = await extractText(file);
        const truncated = text.length > MAX_EXTRACTED_CHARS;
        text = text.slice(0, MAX_EXTRACTED_CHARS);
        blocks.push(`[ARQUIVO ANEXADO: ${file.name} | ${file.type || 'texto'}${truncated ? ' | conteúdo truncado' : ''}]\n${text}\n[FIM DO ARQUIVO: ${file.name}]`);
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`);
      }
    }
    if (blocks.length) {
      const current = getValue(editor).trimEnd();
      setValue(editor, `${current}${current ? '\n\n' : ''}${blocks.join('\n\n')}`);
      toast(`${blocks.length} arquivo(s) anexado(s) à solicitação.`);
    }
    if (errors.length) toast(errors.join(' • '));
  }

  function ensureInput() {
    let input = document.getElementById(INPUT_ID);
    if (input) return input;
    input = document.createElement('input');
    input.id = INPUT_ID;
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPT;
    input.hidden = true;
    input.addEventListener('change', async () => {
      const files = [...input.files];
      input.value = '';
      if (files.length) await attachFiles(files);
    });
    document.body.appendChild(input);
    return input;
  }

  function injectMenuItem() {
    if (document.getElementById(ITEM_ID)) return;
    const items = [...document.querySelectorAll('button,[role="menuitem"],[role="button"]')];
    const imageItem = items.find((item) => /adicionar uma imagem|add an image/i.test(item.textContent || ''));
    if (!imageItem || !imageItem.parentElement) return;
    const item = imageItem.cloneNode(false);
    item.id = ITEM_ID;
    item.removeAttribute('disabled');
    item.setAttribute('aria-label', 'Adicionar PDF ou arquivo de texto');
    item.innerHTML = `${FILE_ICON}<span>Adicionar arquivo ou PDF</span>`;
    item.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      ensureInput().click();
    });
    imageItem.insertAdjacentElement('afterend', item);
  }

  ensureInput();
  new MutationObserver(injectMenuItem).observe(document.documentElement, { childList: true, subtree: true });
  injectMenuItem();
})();
