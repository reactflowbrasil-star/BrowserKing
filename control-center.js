const $ = selector => document.querySelector(selector);
const output = $('#output');

function paramsFor(action) {
  const [x, y] = $('#xy').value.split(',').map(Number);
  if (action.startsWith('mouse.')) return { x, y, button: 'left' };
  if (action === 'keyboard.type') return { text: $('#text').value, sensitive: $('#sensitive').checked };
  if (action.startsWith('file.')) return { path: $('#path').value, content: $('#content').value };
  if (action === 'powershell.run') return { command: $('#command').value, timeoutMs: 30000 };
  return {};
}

document.addEventListener('click', async event => {
  const action = event.target.dataset.action;
  if (!action) return;
  output.textContent = `Executando ${action}...`;
  const response = await chrome.runtime.sendMessage({ target: 'browserking-windows', action, params: paramsFor(action) });
  output.textContent = JSON.stringify(response, null, 2);
});
