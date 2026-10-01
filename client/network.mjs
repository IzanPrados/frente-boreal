const RESUME_KEY = 'fb-resume';
const RECONNECT_MS = 90_000;
const ACK_MS = 2500;

export class Connection {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.seq = 0;
    this.intentional = false;
    this.attempt = 0;
    this.token = null;
    this.code = null;
    this.pending = new Map();
    this.retryTimer = null;
    this.openTimer = null;
    this.ackTimer = null;
  }

  connect(endpoint, initial) {
    this.intentional = false;
    this.initial = initial;
    const url = new URL(endpoint || location.origin, location.href);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) throw new Error('Dirección de servidor no válida.');
    if (location.protocol === 'https:' && ['http:', 'ws:'].includes(url.protocol)) throw new Error('El servidor debe usar HTTPS para conectar desde esta página.');
    url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    url.search = '';
    url.hash = '';
    this.url = url.href;
    this.open();
  }

  persist() {
    if (!this.token) return;
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({
        url: this.url, code: this.code, token: this.token, seq: this.seq,
        pending: [...this.pending.values()].map(({ message }) => message),
      }));
    } catch { /* Storage can be unavailable in private browsing. */ }
  }

  clearTimers() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.openTimer);
    clearInterval(this.ackTimer);
  }

  open() {
    this.clearTimers();
    this.onStatus(this.attempt ? 'Reconectando…' : 'Conectando…');
    const socket = this.socket = new WebSocket(this.url);
    const resuming = !!this.token;
    this.awaitingWelcome = true;
    const current = () => socket === this.socket && !this.intentional;
    // An open socket alone does not mean that a room was recovered.
    this.openTimer = setTimeout(() => { if (current() && this.awaitingWelcome) socket.close(4000, 'Sin respuesta de sala'); }, 15_000);
    socket.onopen = () => {
      if (!current()) return;
      this.onStatus(resuming ? 'Recuperando sala…' : 'Conectado');
      socket.send(JSON.stringify(resuming ? { type: 'resume', code: this.code, token: this.token } : this.initial));
    };
    socket.onmessage = event => {
      if (!current()) return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === 'welcome') {
        clearTimeout(this.openTimer);
        this.awaitingWelcome = false;
        this.token = data.token;
        this.code = data.code;
        this.playerId = data.playerId;
        this.attempt = 0;
        this.disconnectAt = null;
        this.onStatus('Conectado');
        this.persist();
        // Reuse seq: a lost confirmation cannot duplicate a deployment.
        for (const pending of this.pending.values()) this.transmit(pending, true);
        this.ackTimer = setInterval(() => {
          if (!current() || this.awaitingWelcome) return;
          for (const pending of this.pending.values()) {
            if (Date.now() - pending.sentAt < ACK_MS) continue;
            if (pending.attempts >= 3) { socket.close(4000, 'Confirmaciones pendientes'); return; }
            this.transmit(pending);
          }
        }, 500);
      } else if (data.type === 'ack') {
        this.pending.delete(data.seq);
        this.persist();
      } else if (data.type === 'error' && this.awaitingWelcome) {
        clearTimeout(this.openTimer);
        if (resuming) { this.finish(data.message || 'La sesión ya no se puede recuperar.'); return; }
        this.intentional = true;
        socket.close();
      } else if (data.type === 'ended') {
        this.finish(data.message);
        return;
      }
      this.onMessage(data);
    };
    socket.onerror = () => { if (current()) this.onStatus('Servidor no disponible'); };
    socket.onclose = () => {
      if (!current()) return;
      clearTimeout(this.openTimer);
      clearInterval(this.ackTimer);
      if (!this.token) {
        this.onStatus('Sin servidor');
        this.onMessage({ type: 'error', message: 'No se ha podido conectar. El modo individual sí está disponible. Para compartir partida configura un servidor publicado; puede tardar un minuto en despertar.' });
        return;
      }
      this.disconnectAt ??= Date.now();
      if (Date.now() - this.disconnectAt >= RECONNECT_MS) { this.finish('No se pudo recuperar la conexión en 90 segundos.'); return; }
      this.onStatus('Reconectando…');
      this.retryTimer = setTimeout(() => { this.attempt++; this.open(); }, Math.min(8000, 1000 * 2 ** this.attempt));
    };
  }

  send(message) {
    if (this.intentional || this.awaitingWelcome || this.socket?.readyState !== WebSocket.OPEN) {
      this.onMessage({ type: 'error', message: 'Espera a recuperar la conexión; la orden no se ha enviado.' });
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  transmit(pending, reset = false) {
    if (reset) pending.attempts = 0;
    if (this.socket?.readyState !== WebSocket.OPEN || this.awaitingWelcome) return;
    pending.sentAt = Date.now();
    pending.attempts++;
    this.socket.send(JSON.stringify(pending.message));
  }

  command(command) {
    if (this.intentional || this.awaitingWelcome || this.socket?.readyState !== WebSocket.OPEN) {
      this.onMessage({ type: 'error', message: 'Espera a recuperar la conexión; la orden no se ha enviado.' });
      return false;
    }
    if (this.pending.size >= 64) {
      this.onMessage({ type: 'error', message: 'Hay órdenes pendientes de confirmación. Espera un momento.' });
      return false;
    }
    const message = { type: 'command', command, seq: ++this.seq };
    const pending = { message, sentAt: 0, attempts: 0 };
    this.pending.set(message.seq, pending);
    this.persist();
    this.transmit(pending);
    return true;
  }

  clearSession() {
    this.token = null;
    this.code = null;
    this.pending.clear();
    try { sessionStorage.removeItem(RESUME_KEY); } catch { /* optional storage */ }
  }

  finish(message) {
    this.intentional = true;
    this.clearTimers();
    this.clearSession();
    this.socket?.close();
    this.onStatus('Sesión terminada');
    this.onMessage({ type: 'ended', message: message || 'La sesión ha terminado.' });
  }

  leave() {
    // Ignore the leave response from a connection that the UI replaced.
    this.intentional = true;
    this.clearTimers();
    if (this.socket?.readyState === WebSocket.OPEN && !this.awaitingWelcome) this.socket.send(JSON.stringify({ type: 'leave' }));
    this.socket?.close();
    this.clearSession();
  }

  resumeSaved() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(RESUME_KEY));
      if (typeof saved?.token !== 'string' || typeof saved?.code !== 'string' || typeof saved?.url !== 'string') return false;
      this.token = saved.token;
      this.code = saved.code;
      this.seq = Number.isSafeInteger(saved.seq) && saved.seq >= 0 ? saved.seq : 0;
      for (const message of (Array.isArray(saved.pending) ? saved.pending : []).slice(0, 64)) {
        if (message?.type === 'command' && Number.isSafeInteger(message.seq) && message.seq >= 0 && message.command && typeof message.command === 'object') {
          this.pending.set(message.seq, { message, sentAt: 0, attempts: 0 });
          this.seq = Math.max(this.seq, message.seq);
        }
      }
      this.connect(saved.url, null);
      return true;
    } catch { this.clearSession(); return false; }
  }
}
