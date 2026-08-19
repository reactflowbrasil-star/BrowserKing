'use strict';

const fs = require('fs');
const path = require('path');

const BOT_TOKEN = String(process.env.BROWSERKING_TELEGRAM_BOT_TOKEN || '').trim();
const RELAY_URL = String(process.env.BROWSERKING_RELAY_URL || 'https://hatclaw.com/extencao').replace(/\/+$/, '');
const RELAY_TOKEN = String(process.env.BROWSERKING_RELAY_TOKEN || '').trim();
const TELEGRAM_FILE_ROOT = `${String(process.env.BROWSERKING_TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '')}/file/bot${BOT_TOKEN}`;
const ALLOWED_CHATS = new Set(
  String(process.env.BROWSERKING_TELEGRAM_ALLOWED_CHATS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
);
const STATE_PATH = path.join(__dirname, '.browserking-telegram-state.json');
const TELEGRAM_API_ROOT = String(process.env.BROWSERKING_TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
const TELEGRAM_API = `${TELEGRAM_API_ROOT}/bot${BOT_TOKEN}`;
const SNAPSHOT_SETTLE_MS = Math.max(1500, Number(process.env.BROWSERKING_TELEGRAM_SETTLE_MS || 4000));
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

if (!BOT_TOKEN) throw new Error('BROWSERKING_TELEGRAM_BOT_TOKEN is required');
if (!RELAY_TOKEN) throw new Error('BROWSERKING_RELAY_TOKEN is required');

function loadState() {
  try {
    return { updateOffset: 0, eventCursor: 0, chats: [], activeChatId: null, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) };
  } catch (_) {
    return { updateOffset: 0, eventCursor: 0, chats: [], activeChatId: null };
  }
}

let state = loadState();
let stopped = false;
let pendingSnapshot = null;
let snapshotTimer = null;

function saveState() {
  const temporary = `${STATE_PATH}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, STATE_PATH);
}

async function jsonRequest(url, options = {}, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.description || payload.error || `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function telegram(method, body) {
  return jsonRequest(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function relay(route, options = {}) {
  return jsonRequest(`${RELAY_URL}/${route}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${RELAY_TOKEN}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  }, 30000);
}

async function telegramMultipart(method, formData) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.description || payload.error || `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function isAllowed(chatId) {
  return ALLOWED_CHATS.size === 0 || ALLOWED_CHATS.has(String(chatId));
}

function registerChat(chatId) {
  const value = String(chatId);
  if (!state.chats.includes(value)) {
    state.chats.push(value);
    saveState();
  }
}

async function sendText(chatId, text) {
  const value = String(text || '').trim() || '(resposta vazia)';
  const chunks = value.match(/[\s\S]{1,3900}/g) || [value];
  for (const chunk of chunks) {
    await telegram('sendMessage', {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true
    });
  }
}

function captionForTelegram(text) {
  const value = String(text || '').trim();
  return value ? value.slice(0, 1024) : '';
}

function fileExtensionFromMimeType(mimeType) {
  const type = String(mimeType || '').toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  if (type.includes('pdf')) return 'pdf';
  if (type.includes('text/plain')) return 'txt';
  if (type.includes('text/html') || type.includes('html')) return 'html';
  if (type.includes('json')) return 'json';
  if (type.includes('csv')) return 'csv';
  if (type.includes('zip')) return 'zip';
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('officedocument.wordprocessing')) return 'docx';
  if (type.includes('officedocument.spreadsheet')) return 'xlsx';
  if (type.includes('officedocument.presentation')) return 'pptx';
  return 'bin';
}

function normalizeTelegramImages(event) {
  if (Array.isArray(event?.images) && event.images.length > 0) {
    return event.images;
  }

  if (event?.base64Data || event?.url) {
    return [event];
  }

  return [];
}

async function downloadUrlAttachment(url, maxBytes = MAX_FILE_BYTES) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar anexo (${response.status}).`);
  }

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim() || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new Error(`Anexo acima do limite de ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`);
  }

  const cleanUrl = String(url).split('?')[0];
  const fileName = path.basename(cleanUrl) || `browserking.${fileExtensionFromMimeType(contentType)}`;

  return {
    fileName,
    mimeType: contentType,
    base64Data: buffer.toString('base64'),
    bytes: buffer.length
  };
}

async function uploadAttachment(chatId, attachment, caption = '', { asPhoto = false } = {}) {
  const mimeType = String(attachment?.mimeType || 'image/jpeg').trim() || 'image/jpeg';
  const base64Data = String(attachment?.base64Data || '').trim();
  if (!base64Data) {
    throw new Error('Anexo vazio.');
  }

  const buffer = Buffer.from(base64Data, 'base64');
  if (!buffer.length) {
    throw new Error('Anexo inválido.');
  }

  const isImage = mimeType.startsWith('image/');
  const fileName = String(attachment?.fileName || '').trim() || `browserking.${fileExtensionFromMimeType(mimeType)}`;
  const uploadAsPhoto = asPhoto && isImage && buffer.length <= 9 * 1024 * 1024;
  const method = uploadAsPhoto ? 'sendPhoto' : 'sendDocument';

  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) {
    form.append('caption', captionForTelegram(caption));
  }

  const blob = new Blob([buffer], { type: mimeType });
  form.append(uploadAsPhoto ? 'photo' : 'document', blob, fileName);
  await telegramMultipart(method, form);
}

async function sendAttachment(chatId, attachment, caption = '', { asPhoto = false } = {}) {
  const base64Data = String(attachment?.base64Data || '').trim();

  if (!base64Data && attachment?.url) {
    try {
      const downloaded = await downloadUrlAttachment(attachment.url);
      await uploadAttachment(chatId, {
        ...attachment,
        fileName: String(attachment.fileName || '').trim() || downloaded.fileName,
        mimeType: String(attachment.mimeType || '').trim() || downloaded.mimeType,
        base64Data: downloaded.base64Data,
        bytes: downloaded.bytes
      }, caption, { asPhoto });
      return;
    } catch (error) {
      console.warn(`[Telegram] Não foi possível baixar anexo da URL (${error.message}); reenviando o link.`);
      const method = asPhoto ? 'sendPhoto' : 'sendDocument';
      const payload = {
        chat_id: chatId,
        caption: captionForTelegram(caption)
      };
      payload[method === 'sendPhoto' ? 'photo' : 'document'] = attachment.url;
      await telegram(method, payload);
      return;
    }
  }

  await uploadAttachment(chatId, attachment, caption, { asPhoto });
}

async function sendImage(chatId, image, caption = '', preferPhoto = true) {
  await sendAttachment(chatId, {
    type: 'image',
    fileName: image?.fileName,
    mimeType: image?.mimeType,
    base64Data: image?.base64Data,
    url: image?.url,
    bytes: image?.bytes
  }, caption, { asPhoto: preferPhoto });
}

async function sendFile(chatId, file, caption = '') {
  await sendAttachment(chatId, {
    type: 'file',
    fileName: file?.fileName,
    mimeType: file?.mimeType,
    base64Data: file?.base64Data,
    url: file?.url,
    bytes: file?.bytes
  }, caption, { asPhoto: false });
}

async function downloadTelegramFile(fileId) {
  const file = await telegram('getFile', { file_id: fileId });
  const filePath = String(file?.result?.file_path || '').trim();
  if (!filePath) throw new Error('Imagem indisponível no Telegram.');

  const response = await fetch(`${TELEGRAM_FILE_ROOT}/${filePath}`);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`Imagem acima do limite de ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB.`);
  }

  const mimeType = filePath.toLowerCase().endsWith('.png')
    ? 'image/png'
    : filePath.toLowerCase().endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';

  return {
    fileName: path.basename(filePath),
    mimeType,
    base64Data: buffer.toString('base64'),
    bytes: buffer.length
  };
}

function pickTelegramImage(message) {
  if (Array.isArray(message?.photo) && message.photo.length > 0) {
    return message.photo[message.photo.length - 1];
  }

  if (message?.document?.mime_type?.startsWith('image/') && message.document.file_id) {
    return message.document;
  }

  return null;
}

async function buildImageAttachments(message) {
  const source = pickTelegramImage(message);
  if (!source?.file_id) return [];
  const attachment = await downloadTelegramFile(source.file_id);
  return [{
    type: 'image',
    fileName: source.file_name || attachment.fileName,
    mimeType: source.mime_type || attachment.mimeType,
    base64Data: attachment.base64Data,
    bytes: attachment.bytes
  }];
}

async function replyToActiveChat(text) {
  const chatId = state.activeChatId;
  if (!chatId || !isAllowed(chatId)) return;
  try { await sendText(chatId, text); }
  catch (error) { console.error(`[Telegram] Falha ao responder ${chatId}: ${error.message}`); }
}

async function sendImageToActiveChat(event) {
  const chatId = state.activeChatId;
  if (!chatId || !isAllowed(chatId)) return;

  const images = normalizeTelegramImages(event);
  if (images.length === 0) return;

  const caption = captionForTelegram(event?.caption || event?.text || 'Imagem gerada pelo HatClaw.');
  let first = true;
  for (const image of images) {
    await sendImage(chatId, image, first ? caption : '', true);
    first = false;
  }
}

function normalizeTelegramFiles(event) {
  if (Array.isArray(event?.files) && event.files.length > 0) {
    return event.files;
  }

  if (event?.base64Data || event?.url) {
    return [event];
  }

  return [];
}

async function sendFileToActiveChat(event) {
  const chatId = state.activeChatId;
  if (!chatId || !isAllowed(chatId)) return;

  const files = normalizeTelegramFiles(event);
  if (files.length === 0) return;

  const caption = captionForTelegram(event?.caption || event?.text || 'Arquivo gerado pelo HatClaw.');
  let first = true;
  for (const file of files) {
    await sendFile(chatId, file, first ? caption : '');
    first = false;
  }
}

async function handleMessage(message) {
  const chatId = message?.chat?.id;
  const text = String(message?.text || '').trim();
  const caption = String(message?.caption || '').trim();
  const hasImage = Boolean(pickTelegramImage(message));
  if (!chatId || (!text && !hasImage && !caption)) return;
  if (!isAllowed(chatId)) {
    console.warn(`[Telegram] Chat não autorizado: ${chatId}`);
    await sendText(chatId, `Acesso não autorizado. Chat ID: ${chatId}`);
    return;
  }

  registerChat(chatId);
  const command = text.split(/\s+/, 1)[0].toLowerCase().replace(/@[^\s]+$/, '');
  if (command === '/start' || command === '/help') {
    await sendText(chatId, [
      'HatClaw conectado.',
      '',
      'Envie qualquer mensagem para executar uma tarefa no navegador.',
      '/status — verificar conexão com a extensão',
      '/help — mostrar esta ajuda'
    ].join('\n'));
    return;
  }
  if (command === '/status') {
    const status = await relay('android/status');
    await sendText(chatId, status.extensionOnline ? 'HatClaw online.' : 'HatClaw offline. Abra/recarregue a extensão.');
    return;
  }
  if (text.startsWith('/')) {
    await sendText(chatId, 'Comando desconhecido. Use /help.');
    return;
  }

  if (hasImage) {
    const attachments = await buildImageAttachments(message);
    const commandText = caption || 'Analise a imagem enviada pelo Telegram.';
    const result = await relay('android/command', {
      method: 'POST',
      body: JSON.stringify({ text: commandText, attachments })
    });
    state.activeChatId = String(chatId);
    saveState();
    await sendText(chatId, `Imagem recebida (#${result.commandId}).`);
    return;
  }

  const result = await relay('android/command', {
    method: 'POST',
    body: JSON.stringify({ text })
  });
  state.activeChatId = String(chatId);
  saveState();
  await sendText(chatId, `Tarefa recebida (#${result.commandId}).`);
}

async function pollTelegram() {
  while (!stopped) {
    try {
      const response = await telegram('getUpdates', {
        offset: state.updateOffset,
        timeout: 50,
        allowed_updates: ['message']
      });
      for (const update of response.result || []) {
        state.updateOffset = Math.max(state.updateOffset, Number(update.update_id) + 1);
        saveState();
        try { await handleMessage(update.message); }
        catch (error) {
          console.error(`[Telegram] Mensagem falhou: ${error.message}`);
          if (update.message?.chat?.id) await sendText(update.message.chat.id, `Erro: ${error.message}`).catch(() => {});
        }
      }
    } catch (error) {
      if (!stopped) {
        const message = String(error?.message || error);
        if (message.toLowerCase().includes('aborted')) {
          console.warn('[Telegram] Polling expirou, reconectando.');
        } else {
          console.error(`[Telegram] Polling falhou: ${message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
}

function queueSnapshot(event) {
  const text = String(event?.text || '').trim();
  if (!text || text === pendingSnapshot?.text) return;
  pendingSnapshot = { text, receivedAt: Date.now() };
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(async () => {
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;
    if (snapshot) await replyToActiveChat(snapshot.text);
  }, SNAPSHOT_SETTLE_MS);
}

async function pollRelayEvents() {
  try {
    const status = await relay('android/status');
    state.eventCursor = Number(status.eventCursor || state.eventCursor || 0);
    saveState();
  } catch (error) {
    console.error(`[Relay] Status inicial falhou: ${error.message}`);
  }

  while (!stopped) {
    try {
      const response = await relay(`android/events?since=${state.eventCursor}`);
      for (const event of response.items || []) {
        state.eventCursor = Math.max(state.eventCursor, Number(event.id || 0));
        if (event.type === 'snapshot') queueSnapshot(event);
        if (event.type === 'error' && event.message) await replyToActiveChat(`Erro do HatClaw: ${event.message}`);
        if (event.type === 'image') await sendImageToActiveChat(event);
        if (event.type === 'file') await sendFileToActiveChat(event);
      }
      saveState();
    } catch (error) {
      if (!stopped) {
        console.error(`[Relay] Polling falhou: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
}

async function configureBot() {
  await telegram('deleteWebhook', { drop_pending_updates: false });
  await telegram('setMyCommands', { commands: [
    { command: 'status', description: 'Verificar conexão com o HatClaw' },
    { command: 'help', description: 'Mostrar ajuda' }
  ] });
  const identity = await telegram('getMe', {});
  console.log(`\nHatClaw Telegram: @${identity.result.username}`);
  console.log(`Relay: ${RELAY_URL}`);
  console.log(ALLOWED_CHATS.size ? `Chats permitidos: ${[...ALLOWED_CHATS].join(', ')}` : 'Chats permitidos: qualquer chat que iniciar conversa');
  console.log('Mantenha esta janela aberta.\n');
}

function shutdown() {
  stopped = true;
  clearTimeout(snapshotTimer);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

(async () => {
  await configureBot();
  await Promise.all([pollTelegram(), pollRelayEvents()]);
})().catch(error => {
  console.error(`Falha ao iniciar bot: ${error.message}`);
  process.exitCode = 1;
});
