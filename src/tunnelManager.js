import { spawn } from 'child_process';
import { EventEmitter } from 'events';

/**
 * TunnelManager — uses `ssh -R 80:localhost:PORT serveo.net` to create a
 * free, zero-install public HTTPS tunnel. Works through restrictive NATs/firewalls
 * that block Cloudflare and ngrok.
 *
 * Emits:
 *   'url'   (tunnelUrl: string)  — public URL is ready
 *   'error' (err: Error)         — tunnel failed to start
 *   'exit'  (code: number|null)  — tunnel process exited
 */
class TunnelManager extends EventEmitter {
  constructor() {
    super();
    this.url = null;
    this.proc = null;
    this.started = false;
    this.retries = 0;
    this.maxRetries = 5;
  }

  /** Start the tunnel pointing at localPort. Idempotent — safe to call multiple times. */
  start(localPort) {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this._spawn(localPort);
  }

  _spawn(localPort) {
    console.log(`[Tunnel] Starting Serveo SSH tunnel → http://localhost:${localPort} …`);

    this.proc = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ExitOnForwardFailure=yes',
      '-R', `80:localhost:${localPort}`,
      'serveo.net'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const tryExtract = (chunk) => {
      const text = chunk.toString();
      // Serveo prints: "Forwarding HTTP traffic from https://xxxx.serveousercontent.com"
      const match = text.match(/https:\/\/[a-z0-9\-]+\.serveousercontent\.com/);
      if (match && !this.url) {
        this.url = match[0];
        console.log(`[Tunnel] ✅ Public URL ready: ${this.url}`);
        console.log(`[Tunnel] 🎯 Use in Cursor: ${this.url}/v1`);
        this.emit('url', this.url);
      }
    };

    this.proc.stdout.on('data', tryExtract);
    this.proc.stderr.on('data', tryExtract);

    this.proc.on('error', (err) => {
      console.error('[Tunnel] Failed to start SSH tunnel:', err.message);
      this.emit('error', err);
    });

    this.proc.on('exit', (code) => {
      console.warn(`[Tunnel] SSH tunnel exited with code ${code}`);
      this.url = null;
      this.emit('exit', code);

      // Auto-retry only if not intentionally stopped
      if (!this.stopped && this.retries < this.maxRetries) {
        this.retries++;
        const delay = Math.min(3000 * this.retries, 15000);
        console.log(`[Tunnel] Retrying in ${delay / 1000}s… (attempt ${this.retries}/${this.maxRetries})`);
        setTimeout(() => {
          if (!this.stopped) this._spawn(localPort);
        }, delay);
      } else if (!this.stopped) {
        console.error('[Tunnel] Max retries reached. Tunnel is offline.');
      }
    });
  }

  /** Gracefully stop the tunnel. */
  stop() {
    this.stopped = true;
    if (this.proc) {
      try { this.proc.kill('SIGKILL'); } catch {}
      this.proc = null;
    }
    this.started = false;
    this.url = null;
    this.retries = 0;
  }

  /** Returns the current tunnel status object for the API. */
  getStatus() {
    return {
      active: !!this.url,
      url: this.url,
      cursorBaseUrl: this.url ? `${this.url}/v1` : null,
      retries: this.retries,
      provider: 'serveo'
    };
  }
}

export const tunnelManager = new TunnelManager();
