(function () {
  try {
    chrome.runtime.sendMessage({ type: 'HATCLAW_HEARTBEAT' }).catch(() => {});
  } catch (_) {}
})();
