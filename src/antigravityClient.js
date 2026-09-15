import { execSync, spawn } from 'child_process';
import net from 'net';
import { accountManager } from './accountManager.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import {
  CascadeSessionStore,
  buildNativeTurn,
  detectMode,
  extractToolCalls,
  toolPayloadStartIndex,
  conversationFingerprint,
  scrubAssistantText,
  setActiveMessages,
  synthesizeDeleteToolCall,
  synthesizeRepoInspectToolCall,
  synthesizeReadmeWriteToolCall
} from './nativeAgent.js';

// Model dictionary mapping friendly IDs and labels to internal Antigravity model identifiers
export const MODEL_MAP = {
  // Gemini Models
  'gemini-3.8-flash-high': {
    id: 'gemini-3.8-flash-high',
    name: 'Gemini 3.8 Flash (High)',
    model: 'MODEL_PLACEHOLDER_M318',
    category: 'gemini',
    description: 'Ultra-fast flagship with high reasoning effort'
  },
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6 (Thinking)',
    model: 'MODEL_PLACEHOLDER_M35',
    category: 'claude',
    description: 'Anthropic Claude Sonnet 4.6 with native extended thinking'
  },
  'dominate-gemini-3.8-flash-high': {
    id: 'gemini-3.8-flash-high',
    name: 'Gemini 3.8 Flash (High)',
    model: 'MODEL_PLACEHOLDER_M318',
    category: 'gemini',
    description: 'Ultra-fast flagship with high reasoning effort'
  },
  'gemini-3.8-flash-medium': {
    id: 'gemini-3.8-flash-medium',
    name: 'Gemini 3.8 Flash (Medium)',
    model: 'MODEL_PLACEHOLDER_M319',
    category: 'gemini',
    description: 'Fast flagship with medium reasoning effort'
  },
  'gemini-3.8-flash-low': {
    id: 'gemini-3.8-flash-low',
    name: 'Gemini 3.8 Flash (Low)',
    model: 'MODEL_PLACEHOLDER_M320',
    category: 'gemini',
    description: 'Fast flagship with low reasoning effort'
  },
  'gemini-3.7-flash-high': {
    id: 'gemini-3.7-flash-high',
    name: 'Gemini 3.7 Flash (High)',
    model: 'MODEL_PLACEHOLDER_M318', // Routed to high-capacity Gemini 3.8 engine to resolve 503/EOF drops
    category: 'gemini',
    description: 'Fast and versatile with high reasoning'
  },
  'gemini-3.7-flash-medium': {
    id: 'gemini-3.7-flash-medium',
    name: 'Gemini 3.7 Flash (Medium)',
    model: 'MODEL_PLACEHOLDER_M319',
    category: 'gemini',
    description: 'Balanced speed and intelligence'
  },
  'gemini-pro-agent': {
    id: 'gemini-pro-agent',
    name: 'Gemini 3.1 Pro (High)',
    model: 'MODEL_PLACEHOLDER_M16',
    category: 'gemini',
    description: 'Deep reasoning, complex coding, high capacity'
  },
  'gemini-3.1-pro-low': {
    id: 'gemini-3.1-pro-low',
    name: 'Gemini 3.1 Pro (Low)',
    model: 'MODEL_PLACEHOLDER_M36',
    category: 'gemini',
    description: 'Pro model with low latency'
  },
  'gemini-3.6-flash-high': {
    id: 'gemini-3.6-flash-high',
    name: 'Gemini 3.6 Flash (High)',
    model: 'MODEL_PLACEHOLDER_M71',
    category: 'gemini',
    description: 'Fast flash model with high reasoning'
  },

  // Claude Models
  'dominate-klaude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6 (Thinking)',
    model: 'MODEL_PLACEHOLDER_M35',
    category: 'claude',
    description: 'Anthropic Claude Sonnet 4.6 with native extended thinking'
  },
  'claude-3-7-sonnet': {
    id: 'claude-3-7-sonnet',
    name: 'Claude Sonnet 4.6 (Thinking) [Alias]',
    model: 'MODEL_PLACEHOLDER_M35',
    category: 'claude',
    description: 'Alias for Claude Sonnet 4.6'
  },
  'claude-opus-4-6-thinking': {
    id: 'claude-opus-4-6-thinking',
    name: 'Claude Opus 4.6 (Thinking)',
    model: 'MODEL_PLACEHOLDER_M26',
    category: 'claude',
    description: 'Anthropic Claude Opus 4.6 with maximum reasoning depth'
  },

  // GPT Models
  'gpt-oss-120b-medium': {
    id: 'gpt-oss-120b-medium',
    name: 'GPT-OSS 120B (Medium)',
    model: 'MODEL_OPENAI_GPT_OSS_120B_MEDIUM',
    category: 'gpt',
    description: 'Open-weight high-scale LLM'
  }
};

export function resolveModelConfig(modelId) {
  if (!modelId) return MODEL_MAP['gemini-3.8-flash-high'] || MODEL_MAP['dominate-gemini-3.8-flash-high'];
  if (MODEL_MAP[modelId]) return MODEL_MAP[modelId];
  const lower = String(modelId).toLowerCase();
  for (const [key, cfg] of Object.entries(MODEL_MAP)) {
    if (key.toLowerCase() === lower || cfg.id?.toLowerCase() === lower || cfg.name?.toLowerCase() === lower) {
      return cfg;
    }
  }
  return MODEL_MAP['gemini-3.8-flash-high'] || MODEL_MAP['dominate-gemini-3.8-flash-high'] || Object.values(MODEL_MAP)[0];
}

class AntigravityClient {
  constructor() {
    this.serverUrl = null;
    this.csrfToken = null;
    this.pid = null;
    this.lastDiscoveryTime = 0;
    this.accountConnections = new Map();
    this._pendingLaunches = new Map(); // deduplicates concurrent server spawns per account
    this.cascadeSessions = new CascadeSessionStore();
  }

  /**
   * Discover running language server or launch one in persistent mode.
   * Prefers daily-cloudcode-pa (workspace Cascade server) over stable cloudcode-pa (geo-restricted).
   */
  async ensureConnected() {
    const now = Date.now();
    if (this.serverUrl && this.csrfToken && (now - this.lastDiscoveryTime < 60000)) {
      return true;
    }

    // Try finding running language server process (macOS or Linux)
    try {
      const binPattern = process.platform === 'darwin' ? 'language_server_macos' : 'language_server_';
      const psOutput = execSync(`ps aux | grep -i '${binPattern}' | grep -v grep`, { encoding: 'utf-8' });
      const lines = psOutput.trim().split('\n').filter(l => Boolean(l) && !l.includes('/accounts/'));

      // Sort: prefer daily-cloudcode-pa (workspace server with Cascade) over stable cloudcode-pa (geo-restricted)
      // Use enable_lsp and higher PID as secondary sort within same tier
      lines.sort((a, b) => {
        const dailyA = a.includes('daily-cloudcode-pa') ? 1 : 0;
        const dailyB = b.includes('daily-cloudcode-pa') ? 1 : 0;
        if (dailyA !== dailyB) return dailyB - dailyA;
        // Among same tier, prefer enable_lsp (workspace-specific server)
        const lspA = a.includes('enable_lsp') ? 1 : 0;
        const lspB = b.includes('enable_lsp') ? 1 : 0;
        if (lspA !== lspB) return lspB - lspA;
        // Fall back to highest PID (most recently started)
        const aPid = parseInt(a.trim().split(/\s+/)[1], 10) || 0;
        const bPid = parseInt(b.trim().split(/\s+/)[1], 10) || 0;
        return bPid - aPid;
      });

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[1];
        
        // Extract csrf_token
        const csrfMatch = line.match(/--csrf_token\s+([a-f0-9-]+)/i);
        if (!csrfMatch) continue;
        const csrf = csrfMatch[1];

        // Find listening ports for this pid
        try {
          const lsofOutput = execSync(`lsof -nP -p ${pid} | grep LISTEN`, { encoding: 'utf-8' });
          const portMatches = [...lsofOutput.matchAll(/TCP\s+(?:127\.0\.0\.1|localhost):(\d+)\s+\(LISTEN\)/g)];

          for (const m of portMatches) {
            const port = parseInt(m[1], 10);
            // Try HTTPS first (stable process uses TLS), then HTTP
            for (const scheme of ['https', 'http']) {
              const testUrl = `${scheme}://127.0.0.1:${port}`;
              const isValid = await this._testEndpoint(testUrl, csrf);
              if (isValid) {
                this.serverUrl = testUrl;
                this.csrfToken = csrf;
                this.pid = pid;
                this.lastDiscoveryTime = now;
                console.log(`[Antigravity] Connected to language server (PID ${pid}) at ${testUrl}`);
                return true;
              }
            }
          }
        } catch {
          // ignore lsof error and try next
        }
      }
    } catch {
      // Process search failed
    }

    // If no running instance was found, check if Antigravity binary exists and launch it
    const binaryPath = this._resolveBinaryPath();
    if (binaryPath) {
      return await this._launchStandalone(binaryPath);
    }

    return false;
  }

  /**
   * Resolve language server binary path depending on OS (Linux Docker vs macOS)
   */
  _resolveBinaryPath() {
    if (process.env.LANGUAGE_SERVER_BINARY && fs.existsSync(process.env.LANGUAGE_SERVER_BINARY)) {
      return process.env.LANGUAGE_SERVER_BINARY;
    }

    if (process.platform === 'linux') {
      const candidates = [
        '/app/bin/language_server_linux_x64',
        '/app/bin/language_server_linux_arm',
        path.join(os.homedir(), '.gemini', 'bin', 'language_server_linux_x64'),
        path.join(os.homedir(), '.gemini', 'bin', 'language_server_linux_arm')
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return p;
      }
    }

    if (process.platform === 'darwin') {
      const candidates = [
        '/Applications/Antigravity IDE.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_arm',
        '/Applications/Antigravity IDE.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_x64',
        path.join(os.homedir(), '.gemini', 'bin', 'language_server_macos_arm')
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return p;
      }
    }

    return null;
  }

  async _testEndpoint(baseUrl, csrfToken) {
    try {
      const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      if (baseUrl.startsWith('https')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      const resp = await fetch(`${baseUrl}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': csrfToken
        },
        body: '{}'
      });
      if (baseUrl.startsWith('https')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
      return resp.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Internal fetch wrapper that disables TLS verification for local HTTPS servers
   */
  async _fetch(url, options = {}) {
    const isLocalHttps = url.startsWith('https://127.0.0.1') || url.startsWith('https://localhost');
    if (isLocalHttps) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      return await fetch(url, options);
    } finally {
      if (isLocalHttps) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    }
  }

  /**
   * Minimal protobuf encoder for the initial Metadata handshake the language
   * server requires on stdin before it will start listening (same message the
   * Antigravity IDE writes: exa.codeium_common_pb.Metadata).
   */
  _encodeMetadataProto(fields) {
    const varint = (n) => {
      const bytes = [];
      let v = n;
      while (v > 127) {
        bytes.push((v & 0x7f) | 0x80);
        v = Math.floor(v / 128);
      }
      bytes.push(v);
      return Buffer.from(bytes);
    };
    const tag = (field, wireType) => varint((field << 3) | wireType);
    const pbString = (field, value) => {
      if (!value) return Buffer.alloc(0);
      const val = Buffer.from(String(value), 'utf-8');
      return Buffer.concat([tag(field, 2), varint(val.length), val]);
    };
    const pbBool = (field, value) =>
      value ? Buffer.concat([tag(field, 0), Buffer.from([1])]) : Buffer.alloc(0);

    const parts = [];
    // Field numbers per exa.codeium_common_pb.Metadata descriptor
    parts.push(pbString(1, fields.ideName));            // ide_name
    parts.push(pbString(2, fields.extensionVersion));   // extension_version
    parts.push(pbString(3, fields.apiKey));             // api_key (OAuth access token)
    parts.push(pbString(4, fields.locale));             // locale
    parts.push(pbString(5, fields.os));                 // os
    parts.push(pbBool(6, fields.disableTelemetry));     // disable_telemetry
    parts.push(pbString(7, fields.ideVersion));         // ide_version
    parts.push(pbString(8, fields.hardware));           // hardware
    parts.push(pbString(10, fields.sessionId));         // session_id
    parts.push(pbString(12, fields.extensionName));     // extension_name
    parts.push(pbString(17, fields.extensionPath));     // extension_path
    parts.push(pbString(24, fields.deviceFingerprint)); // device_fingerprint
    return Buffer.concat(parts.filter(p => p.length));
  }

  _readInstallationId() {
    try {
      const p = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'installation_id');
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8').trim();
    } catch {}
    return crypto.randomUUID();
  }

  _readAccessToken() {
    try {
      const p = path.join(os.homedir(), '.gemini', 'jetski-standalone-oauth-token');
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return raw.token?.access_token || '';
      }
    } catch {}
    return '';
  }


  async _getFreePort() {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const port = srv.address().port;
        srv.close(() => resolve(port));
      });
      srv.on('error', reject);
    });
  }

  /**
   * Launch isolated language server instance for secondary account.
   * Runs in standalone CLI mode pointing directly to ~/.gemini/accounts/<id>/.gemini.
   */
  async _launchAccountServer(accountId, binaryPath) {
    try {
      // Refresh token if needed AND write the refreshed token back to disk.
      await accountManager.getValidAccessToken(accountId);
      const acc = accountManager.getAccount(accountId);
      if (!acc) throw new Error(`Account '${accountId}' not found`);

      const accDir = path.join(os.homedir(), '.gemini', 'accounts', accountId, '.gemini');
      accountManager._writeAccountTokenDir(accountId, acc.token);

      // Terminate any previous stale process for this specific account
      try {
        execSync(`pkill -f "gemini_dir=.*accounts/${accountId}"`, { stdio: 'ignore' });
        await new Promise(r => setTimeout(r, 200));
      } catch {}

      const port = await this._getFreePort();
      const csrf = crypto.randomUUID();
      const logPath = path.join('/tmp', `antigravity-${accountId}.log`);
      const logFd = fs.openSync(logPath, 'a');

      const child = spawn(binaryPath, [
        '--standalone=true',
        '--subclient_type=cli',
        `--gemini_dir=${accDir}`,
        '--cloud_code_endpoint=https://cloudcode-pa.googleapis.com',
        `--csrf_token=${csrf}`,
        `--http_server_port=${port}`
      ], {
        detached: true,
        stdio: ['ignore', logFd, logFd]
      });
      child.unref();
      fs.closeSync(logFd);

      console.log(`[Antigravity] Spawned secondary language server for '${accountId}' (${acc.email || acc.name}) on port ${port}, PID: ${child.pid}`);

      const testUrl = `http://127.0.0.1:${port}`;
      let connected = false;

      // Poll up to 50 times (10 seconds)
      for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 200));
        const isValid = await this._testEndpoint(testUrl, csrf);
        if (isValid) {
          connected = true;
          break;
        }
      }

      if (!connected) {
        console.error(`[Antigravity] Failed to connect secondary server for account '${accountId}' on port ${port}`);
        try { process.kill(child.pid, 'SIGTERM'); } catch {}
        return null;
      }

      const conn = {
        serverUrl: testUrl,
        csrfToken: csrf,
        pid: child.pid,
        proc: child,
        accountId,
        lastUsed: Date.now()
      };
      this.accountConnections.set(accountId, conn);
      console.log(`[Antigravity] Connected to secondary account '${accountId}' (${acc.email || acc.name}) on port ${port}`);
      return conn;
    } catch (err) {
      console.error(`[Antigravity] Error launching secondary server for '${accountId}':`, err.message);
      return null;
    }
  }


  /**
   * Get active connection (URL + CSRF token) for given accountId or active account
   */
  async getConnection(accountId = null) {
    const targetId = accountId || accountManager.config.activeAccountId || 'default';

    if (targetId === 'default') {
      const isConnected = await this.ensureConnected();
      if (!isConnected || !this.serverUrl) {
        throw new Error('Could not connect to Primary Antigravity Language Server');
      }
      return {
        serverUrl: this.serverUrl,
        csrfToken: this.csrfToken,
        pid: this.pid,
        accountId: 'default'
      };
    }

    // Check cached connection for secondary account
    const existing = this.accountConnections.get(targetId);
    if (existing && existing.serverUrl && existing.csrfToken) {
      const isAlive = await this._testEndpoint(existing.serverUrl, existing.csrfToken);
      if (isAlive) {
        existing.lastUsed = Date.now();
        return existing;
      }
      this.accountConnections.delete(targetId);
    }

    // Guard against race condition: if a launch is already in progress for this
    // account, reuse the same Promise instead of spawning a second server process.
    if (this._pendingLaunches.has(targetId)) {
      const conn = await this._pendingLaunches.get(targetId);
      if (!conn) throw new Error(`Failed to initialize language server for account '${targetId}'`);
      return conn;
    }

    const binaryPath = this._resolveBinaryPath();
    if (!binaryPath) {
      throw new Error(`Language server binary not found for platform: ${process.platform} (${process.arch})`);
    }

    const launchPromise = this._launchAccountServer(targetId, binaryPath)
      .finally(() => this._pendingLaunches.delete(targetId));
    this._pendingLaunches.set(targetId, launchPromise);

    const newConn = await launchPromise;
    if (!newConn) {
      throw new Error(`Failed to initialize language server for account '${targetId}'`);
    }

    return newConn;
  }

  async _launchStandalone(binaryPath) {
    const defaultGeminiDir = path.join(os.homedir(), '.gemini');
    try {
      const port = await this._getFreePort();
      const csrf = crypto.randomUUID();
      const logFd = fs.openSync('/tmp/antigravity-language-server.log', 'a');
      const child = spawn(binaryPath, [
        '--standalone=true',
        '--subclient_type=cli',
        `--gemini_dir=${defaultGeminiDir}`,
        '--cloud_code_endpoint=https://cloudcode-pa.googleapis.com',
        `--csrf_token=${csrf}`,
        `--http_server_port=${port}`
      ], {
        detached: true,
        stdio: ['ignore', logFd, logFd]
      });
      child.unref();
      fs.closeSync(logFd);

      const testUrl = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 200));
        if (await this._testEndpoint(testUrl, csrf)) {
          this.serverUrl = testUrl;
          this.csrfToken = csrf;
          this.pid = child.pid;
          this.lastDiscoveryTime = Date.now();
          console.log(`[Antigravity] Standalone primary server started on port ${port} (PID: ${child.pid})`);
          return true;
        }
      }
    } catch (err) {
      console.error('[Antigravity] Error launching standalone primary server:', err.message);
    }
    return false;
  }

  /**
   * Fetch live models list
   */
  async getModels(accountId = null) {
    const conn = await this.getConnection(accountId);
    if (!conn.serverUrl) throw new Error('Antigravity Language Server not reachable');

    try {
      const resp = await this._fetch(`${conn.serverUrl}/exa.language_server_pb.LanguageServerService/GetCascadeModelConfigData`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': conn.csrfToken
        },
        body: '{}'
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      const models = [];
      const remoteConfigs = data.clientModelConfigs || [];

      for (const [friendlyId, info] of Object.entries(MODEL_MAP)) {
        const remote = remoteConfigs.find(r => r.modelOrAlias?.model === info.model);
        models.push({
          id: friendlyId,
          name: info.name,
          category: info.category,
          description: info.description,
          internalModel: info.model,
          isRecommended: remote?.isRecommended || false,
          quotaInfo: remote?.quotaInfo || null
        });
      }

      return models;
    } catch (err) {
      // Fallback to static list if call fails
      return Object.entries(MODEL_MAP).map(([friendlyId, info]) => ({
        id: friendlyId,
        name: info.name,
        category: info.category,
        description: info.description,
        internalModel: info.model,
        isRecommended: true
      }));
    }
  }

  /**
   * Fetch live quota summary for a specific account.
   * Directly queries the Google Cloud Code PA API using the target account's OAuth access token
   * for 100% token isolation, falling back to local Language Server RPC.
   */
  async getQuota(accountId = null) {
    const targetId = accountId || accountManager.config.activeAccountId || 'default';

    // 1. Direct fetch using the target account's isolated OAuth token
    try {
      const tokenInfo = await accountManager.getValidAccessToken(targetId).catch(() => null);
      if (tokenInfo?.accessToken) {
        const resp = await fetch('https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenInfo.accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'antigravity/cli/1.11.0 (aidev_client; os_type=darwin; arch=arm64)'
          },
          body: JSON.stringify({ project: 'aicode-consumers' })
        });
        if (resp.ok) {
          const data = await resp.json();
          const result = data.response || data;
          if (result && result.groups && result.groups.length > 0) {
            return result;
          }
        }
      }
    } catch (err) {
      console.warn(`[Antigravity] Direct CCPA quota fetch failed for '${targetId}', falling back to language server:`, err.message);
    }

    // 2. Fallback to Language Server RPC
    const conn = await this.getConnection(targetId);
    if (!conn.serverUrl) throw new Error('Antigravity Language Server not reachable');

    const resp = await this._fetch(`${conn.serverUrl}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-codeium-csrf-token': conn.csrfToken
      },
      body: '{}'
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.response || data || null;
  }



  /**
   * Execute chat completion via Cascade trajectory with native Cursor agent orchestration,
   * tool-calling extraction, multimodal media support, and automatic capacity failover.
   */
  async generateCompletion({
    modelId,
    messages = [],
    tools = [],
    tool_choice = 'auto',
    conversationId = null,
    headers = {},
    accountId = null,
    onDelta,
    onDone,
    onError,
    signal
  }) {
    // Register active messages for tool sanitization & context deduction
    setActiveMessages(messages);

    // Compute stable conversation fingerprint for Cascade session reuse
    const fingerprint = conversationFingerprint(messages, conversationId);
    let session = this.cascadeSessions.get(fingerprint);
    let cascadeId = session?.cascadeId || null;
    let initialStepOffset = session?.lastStepOffset || 0;
    let isReused = Boolean(cascadeId);

    // Resolve mode and assemble native turn
    const resolvedMode = detectMode({ messages, tools, tool_choice, headers });
    const { hasTools, messageToSend, images } = buildNativeTurn({
      messages,
      tools,
      tool_choice,
      mode: resolvedMode,
      reuseSession: isReused
    });

    // Define fallback chain for models experiencing transient capacity limits
    const FALLBACK_CHAINS = {
      'dominate-gemini-3.8-flash-high': ['gemini-3.8-flash-medium', 'gemini-pro-agent'],
      'gemini-3.8-flash-high': ['gemini-3.8-flash-medium', 'gemini-pro-agent'],
      'gemini-3.7-flash-high': ['gemini-3.8-flash-high', 'gemini-pro-agent'],
      'gemini-3.7-flash-medium': ['gemini-3.8-flash-medium', 'gemini-pro-agent'],
      'claude-opus-4-6-thinking': ['claude-sonnet-4-6', 'gemini-3.8-flash-high'],
      'dominate-klaude-sonnet-4-6': ['claude-sonnet-4-6', 'gemini-3.8-flash-high'],
      'claude-sonnet-4-6': ['gemini-3.8-flash-high', 'gemini-pro-agent'],
      'claude-3-7-sonnet': ['claude-sonnet-4-6', 'gemini-3.8-flash-high']
    };

    const modelsToTry = [modelId, ...(FALLBACK_CHAINS[modelId] || ['gemini-3.8-flash-medium', 'gemini-pro-agent'])];

    let currentAccountId = accountId || accountManager.config.activeAccountId || 'default';
    const accountsTried = new Set();
    let lastError = null;
    let anyDeltaSent = false;

    while (currentAccountId && !accountsTried.has(currentAccountId)) {
      accountsTried.add(currentAccountId);

      let conn = null;
      try {
        conn = await this.getConnection(currentAccountId);
      } catch (connErr) {
        console.warn(`[Antigravity] Could not connect account '${currentAccountId}':`, connErr.message);
        if (accountManager.config.autoSwitchOnLimit) {
          accountManager.markRateLimited(currentAccountId, 120);
          const nextAcc = accountManager.getNextAvailableAccount(currentAccountId);
          if (nextAcc && !accountsTried.has(nextAcc.id)) {
            console.log(`[Antigravity] Failover: switching from ${currentAccountId} to ${nextAcc.id}...`);
            currentAccountId = nextAcc.id;
            continue;
          }
        }
        onError(connErr);
        return;
      }

      let accountHitLimit = false;

      for (let i = 0; i < modelsToTry.length; i++) {
        const currentModelId = modelsToTry[i];
        const modelConfig = resolveModelConfig(currentModelId);
        const internalModel = modelConfig.model;

        try {
          await this._runCascadeAttempt({
            serverUrl: conn.serverUrl,
            csrfToken: conn.csrfToken,
            internalModel,
            cascadeId: isReused ? cascadeId : null,
            fingerprint,
            isReused,
            initialStepOffset,
            messageToSend,
            images,
            tools,
            tool_choice,
            hasTools,
            messages,
            signal,
            onDelta: (delta) => {
              anyDeltaSent = true;
              onDelta(delta);
            },
            onDone
          });
          return; // Success!
        } catch (err) {
          lastError = err;

          // If the request was aborted by client, DO NOT failover
          const isAbort = signal?.aborted || err.name === 'AbortError' || /aborted/i.test(err.message);
          if (isAbort) {
            console.log(`[Antigravity] Request cancelled by client.`);
            this.cascadeSessions.drop(fingerprint);
            onError(err);
            return;
          }

          // If tokens were already streamed to client, we cannot switch accounts or models
          if (anyDeltaSent) {
            onError(err);
            return;
          }

          // Check if error is a rate limit or quota exhaustion
          const isRateLimit = /RESOURCE_EXHAUSTED|quota exceeded|Rate limit|rate_limit|capacity limit|429|exhausted/i.test(err.message);
          if (isRateLimit && accountManager.config.autoSwitchOnLimit) {
            accountHitLimit = true;
            accountManager.markRateLimited(currentAccountId, 600);
            console.warn(`[Antigravity] Account '${currentAccountId}' hit rate/quota limit on model '${currentModelId}'.`);
            break; // Break model loop to auto-switch account!
          }

          // On network drops, force-reconnect
          const isNetworkDrop = /EOF|ECONNRESET|ECONNREFUSED|fetch failed|UND_ERR/i.test(err.message);
          if (isNetworkDrop) {
            this.accountConnections.delete(currentAccountId);
            if (currentAccountId === 'default') {
              this.serverUrl = null;
              this.csrfToken = null;
              this.lastDiscoveryTime = 0;
            }
            console.warn(`[Antigravity] Network drop detected on account '${currentAccountId}'. Reconnecting...`);
            await new Promise(r => setTimeout(r, 600));
            try { conn = await this.getConnection(currentAccountId); } catch {}
          }
        }
      }

      if (accountHitLimit && accountManager.config.autoSwitchOnLimit) {
        const nextAcc = accountManager.getNextAvailableAccount(currentAccountId);
        if (nextAcc && !accountsTried.has(nextAcc.id)) {
          console.log(`[Antigravity] Auto-switching from ${currentAccountId} to ${nextAcc.id} (${nextAcc.email || nextAcc.name})...`);
          currentAccountId = nextAcc.id;
          continue;
        }
      }

      break;
    }

    if (lastError) {
      onError(lastError);
    }
  }

  /**
   * Internal worker for single Cascade execution attempt.
   * Handles session reuse, multimodal items, tool payload delta withholding,
   * tool calling extraction, and automatic recovery.
   */
  async _runCascadeAttempt({
    serverUrl,
    csrfToken,
    internalModel,
    cascadeId,
    fingerprint,
    isReused,
    initialStepOffset = 0,
    messageToSend,
    images = [],
    tools = [],
    tool_choice = 'auto',
    hasTools = false,
    messages = [],
    signal,
    onDelta,
    onDone
  }) {
    const targetUrl = serverUrl || this.serverUrl;
    const targetCsrf = csrfToken || this.csrfToken;
    let currentCascadeId = cascadeId;
    let currentStepOffset = isReused ? initialStepOffset : 0;

    // 1. If starting a new session, call StartCascade
    if (!currentCascadeId) {
      currentCascadeId = crypto.randomUUID();
      currentStepOffset = 0;
      const startResp = await this._fetch(`${targetUrl}/exa.language_server_pb.LanguageServerService/StartCascade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': targetCsrf
        },
        body: JSON.stringify({
          cascadeId: currentCascadeId,
          source: 1, // CASCADE_CLIENT
          trajectoryType: 1
        }),
        signal
      });

      if (!startResp.ok) {
        throw new Error(`StartCascade failed: HTTP ${startResp.status}`);
      }
      this.cascadeSessions.set(fingerprint, currentCascadeId, { lastStepOffset: 0 });
    }

    // 2. Build items payload (text prompt + images if any)
    const items = [{ text: messageToSend }];
    if (Array.isArray(images)) {
      for (const img of images) {
        if (img.base64Data) {
          items.push({
            image: {
              base64Data: img.base64Data,
              mimeType: img.mimeType || 'image/png'
            }
          });
        }
      }
    }

    // 3. Send User Message with plannerConfig model
    let sendResp = await this._fetch(`${targetUrl}/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-codeium-csrf-token': targetCsrf
      },
      body: JSON.stringify({
        cascadeId: currentCascadeId,
        items,
        cascadeConfig: {
          plannerConfig: {
            planModel: internalModel
          }
        }
      }),
      signal
    });

    // If sending to an existing session failed (e.g. server ended or dropped cascade), retry with fresh session
    if (!sendResp.ok && isReused) {
      console.warn(`[Antigravity] Reused cascade session ${currentCascadeId} failed (${sendResp.status}). Starting fresh cascade...`);
      this.cascadeSessions.drop(fingerprint);
      currentCascadeId = crypto.randomUUID();
      currentStepOffset = 0;

      const startResp = await this._fetch(`${targetUrl}/exa.language_server_pb.LanguageServerService/StartCascade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': targetCsrf
        },
        body: JSON.stringify({
          cascadeId: currentCascadeId,
          source: 1,
          trajectoryType: 1
        }),
        signal
      });

      if (!startResp.ok) {
        throw new Error(`StartCascade fresh retry failed: HTTP ${startResp.status}`);
      }
      this.cascadeSessions.set(fingerprint, currentCascadeId, { lastStepOffset: 0 });

      // Re-build full turn since we are starting a fresh session
      const fullTurn = buildNativeTurn({
        messages,
        tools,
        tool_choice,
        mode: detectMode({ messages, tools, tool_choice }),
        reuseSession: false
      });

      const retryItems = [{ text: fullTurn.messageToSend }];
      if (Array.isArray(fullTurn.images)) {
        for (const img of fullTurn.images) {
          if (img.base64Data) {
            retryItems.push({
              image: {
                base64Data: img.base64Data,
                mimeType: img.mimeType || 'image/png'
              }
            });
          }
        }
      }

      sendResp = await this._fetch(`${targetUrl}/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': targetCsrf
        },
        body: JSON.stringify({
          cascadeId: currentCascadeId,
          items: retryItems,
          cascadeConfig: {
            plannerConfig: {
              planModel: internalModel
            }
          }
        }),
        signal
      });
    }

    if (!sendResp.ok) {
      throw new Error(`SendUserCascadeMessage failed: HTTP ${sendResp.status}`);
    }

    // 4. Poll trajectory steps until response is ready
    let accumulatedText = '';
    let streamedCharCount = 0;
    let streamedThinkingCount = 0;
    let isFinished = false;
    let finalPlannerToolCalls = null;
    let finalModelUsage = null;
    const maxPolls = 240;
    let pollCount = 0;
    let turnTotalSteps = 0;
    let pollInterval = 60;

    while (!isFinished && pollCount < maxPolls) {
      if (signal?.aborted) {
        try {
          this._fetch(`${targetUrl}/exa.language_server_pb.LanguageServerService/CancelCascadeInvocation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-codeium-csrf-token': targetCsrf
            },
            body: JSON.stringify({
              cascadeId: currentCascadeId,
              killBackgroundTasks: true
            })
          }).catch(() => {});
        } catch {}
        throw new Error('Request aborted');
      }

      await new Promise(r => setTimeout(r, pollInterval));
      pollCount++;
      if (pollInterval < 250) pollInterval = Math.min(250, Math.floor(pollInterval * 1.35));

      const stepsResp = await this._fetch(`${targetUrl}/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': targetCsrf
        },
        body: JSON.stringify({
          cascadeId: currentCascadeId,
          stepOffset: currentStepOffset
        }),
        signal
      });

      if (!stepsResp.ok) continue;
      const stepsData = await stepsResp.json();
      const steps = stepsData.steps || [];
      turnTotalSteps = steps.length;

      for (const step of steps) {
        const type = step.type;

        if (type === 'CORTEX_STEP_TYPE_ERROR_MESSAGE') {
          const errDetails = step.errorMessage?.error?.userErrorMessage || step.errorMessage?.error?.shortError || 'Agent error';
          if (isReused) {
            this.cascadeSessions.drop(fingerprint);
          }
          throw new Error(errDetails);
        }

        if (type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
          // 1. Stream real-time extended thinking deltas to Cursor
          const thinkingText = step.plannerResponse?.thinking || '';
          if (thinkingText.length > streamedThinkingCount) {
            const thinkingDelta = thinkingText.slice(streamedThinkingCount);
            streamedThinkingCount = thinkingText.length;
            if (thinkingDelta) {
              onDelta({ thinking: thinkingDelta });
            }
          }

          const fullResponse = step.plannerResponse?.modifiedResponse || step.plannerResponse?.response || '';
          if (step.plannerResponse?.toolCalls) {
            finalPlannerToolCalls = step.plannerResponse.toolCalls;
          }
          if (step.metadata?.modelUsage) {
            finalModelUsage = step.metadata.modelUsage;
          }

          accumulatedText = fullResponse;

          // In agent mode with tools, withhold streaming raw tool-call JSON/XML blocks to Cursor chat
          const toolStartIdx = hasTools ? toolPayloadStartIndex(fullResponse) : -1;
          const visibleLimit = toolStartIdx >= 0 ? toolStartIdx : fullResponse.length;

          if (visibleLimit > streamedCharCount) {
            const delta = fullResponse.slice(streamedCharCount, visibleLimit);
            streamedCharCount = visibleLimit;
            if (delta) onDelta(delta);
          }

          if (step.status === 'CORTEX_STEP_STATUS_DONE') {
            isFinished = true;
            break;
          }
        }
      }
    }

    if (!isFinished && !accumulatedText) {
      throw new Error('Timed out waiting for model response');
    }

    // Save updated total step offset for next turn
    this.cascadeSessions.set(fingerprint, currentCascadeId, {
      lastStepOffset: currentStepOffset + turnTotalSteps
    });

    // Extract tool calls if tools are available
    let toolCalls = null;
    if (hasTools) {
      toolCalls = extractToolCalls(
        accumulatedText,
        finalPlannerToolCalls,
        tools,
        tool_choice
      );
      // Fallback intent synthesis if model didn't emit a formal tool call
      if (!toolCalls || toolCalls.length === 0) {
        const delCall = synthesizeDeleteToolCall(tools, messageToSend, messages);
        if (delCall) {
          toolCalls = delCall;
        } else {
          const repoInspect = synthesizeRepoInspectToolCall(tools, messageToSend, messages);
          if (repoInspect) {
            toolCalls = repoInspect;
          } else {
            const readmeWrite = synthesizeReadmeWriteToolCall(tools, messages);
            if (readmeWrite) toolCalls = readmeWrite;
          }
        }
      }
    }

    const cleanText = (toolCalls && toolCalls.length > 0)
      ? scrubAssistantText(accumulatedText)
      : accumulatedText;

    onDone({
      fullText: cleanText,
      usage: finalModelUsage,
      toolCalls: (toolCalls && toolCalls.length > 0) ? toolCalls : null
    });
  }

}

export const antigravity = new AntigravityClient();
