(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  if (params.get('autoRemote') !== '1') return;

  const benignMessageErrors = [
    'Could not establish connection. Receiving end does not exist.',
    'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received'
  ];

  function isBenignMessageError(reason) {
    const message = typeof reason === 'string' ? reason : reason?.message;
    return benignMessageErrors.some(candidate => message?.includes(candidate));
  }

  // MV3 workers can stop between a sendMessage call and an optional reply.
  window.addEventListener('unhandledrejection', event => {
    if (isBenignMessageError(event.reason)) event.preventDefault();
  }, true);

  // The automatic local relay does not use Anthropic's pairing bridge. Avoid
  // opening it with the local/bypassed credentials used by this panel.
  const NativeWebSocket = window.WebSocket;
  class DisabledPairingSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    CONNECTING = 0;
    OPEN = 1;
    CLOSING = 2;
    CLOSED = 3;
    readyState = 0;
    bufferedAmount = 0;
    extensions = '';
    protocol = '';
    binaryType = 'blob';

    constructor(url) {
      super();
      this.url = String(url);
    }

    close() { this.readyState = 3; }
    send() { throw new DOMException('Pairing bridge is disabled in autoRemote mode', 'InvalidStateError'); }
  }

  function HatClawWebSocket(url, protocols) {
    if (String(url).startsWith('wss://bridge.claudeusercontent.com/chrome/')) {
      return new DisabledPairingSocket(url);
    }
    return protocols === undefined
      ? new NativeWebSocket(url)
      : new NativeWebSocket(url, protocols);
  }

  HatClawWebSocket.prototype = NativeWebSocket.prototype;
  Object.defineProperties(HatClawWebSocket, {
    CONNECTING: { value: NativeWebSocket.CONNECTING },
    OPEN: { value: NativeWebSocket.OPEN },
    CLOSING: { value: NativeWebSocket.CLOSING },
    CLOSED: { value: NativeWebSocket.CLOSED }
  });
  window.WebSocket = HatClawWebSocket;
})();
