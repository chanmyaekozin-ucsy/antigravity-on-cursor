import { execSync, spawn } from 'child_process';
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
  'dominate-kalaude-sonnet-4-6': {
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

class AntigravityClient {
  constructor() {
    this.serverUrl = null;
    this.csrfToken = null;
    this.pid = null;
    this.lastDiscoveryTime = 0;
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

    // Try finding running language_server_macos_arm process
    try {
      const psOutput = execSync("ps aux | grep -i 'language_server_macos_arm' | grep -v grep", { encoding: 'utf-8' });
      const lines = psOutput.trim().split('\n').filter(Boolean);

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

    // If no running instance was found, check if Antigravity IDE binary exists and launch it
    const binaryPath = '/Applications/Antigravity IDE.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_arm';
    if (fs.existsSync(binaryPath)) {
      return await this._launchStandalone(binaryPath);
    }

    return false;
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

  async _launchStandalone(binaryPath) {
    const csrf = crypto.randomUUID();
    const logFd = fs.openSync('/tmp/antigravity-language-server.log', 'a');
    const child = spawn(binaryPath, [
      '--persistent_mode=true',
      `--csrf_token=${csrf}`,
      '--cloud_code_endpoint=https://cloudcode-pa.googleapis.com',
      '--subclient_type=ide',
      '--app_data_dir=antigravity-ide'
    ], {
      detached: true,
      stdio: ['pipe', logFd, logFd]
    });

    // The server aborts at startup unless it receives the binary Metadata
    // protobuf on stdin (the IDE always writes it before ending stdin).
    child.stdin.write(this._encodeMetadataProto({
      ideName: 'antigravity-ide',
      ideVersion: '1.107.0',
      extensionName: 'antigravity-ide',
      extensionVersion: '1.107.0',
      extensionPath: path.dirname(path.dirname(path.dirname(path.dirname(path.dirname(binaryPath))))),
      locale: 'en',
      os: 'darwin',
      hardware: os.arch(),
      sessionId: crypto.randomUUID(),
      deviceFingerprint: this._readInstallationId(),
      apiKey: this._readAccessToken(),
      disableTelemetry: true
    }));
    child.stdin.end();
    child.unref();
    fs.closeSync(logFd);

    // Wait for server to start listening
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 300));
      try {
        const lsofOutput = execSync(`lsof -nP -p ${child.pid} | grep LISTEN`, { encoding: 'utf-8' });
        const portMatches = [...lsofOutput.matchAll(/TCP\s+(?:127\.0\.0\.1|localhost):(\d+)\s+\(LISTEN\)/g)];
        for (const m of portMatches) {
          const port = parseInt(m[1], 10);
          const testUrl = `http://127.0.0.1:${port}`;
          if (await this._testEndpoint(testUrl, csrf)) {
            this.serverUrl = testUrl;
            this.csrfToken = csrf;
            this.pid = child.pid;
            this.lastDiscoveryTime = Date.now();
            return true;
          }
        }
      } catch {
        // Still initializing
      }
    }
    return false;
  }

  /**
   * Fetch live models list
   */
  async getModels() {
    await this.ensureConnected();
    if (!this.serverUrl) throw new Error('Antigravity Language Server not reachable');

    try {
      const resp = await this._fetch(`${this.serverUrl}/exa.language_server_pb.LanguageServerService/GetCascadeModelConfigData`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': this.csrfToken
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
   * Fetch live quota summary
   */
  async getQuota() {
    await this.ensureConnected();
    if (!this.serverUrl) throw new Error('Antigravity Language Server not reachable');

    const resp = await this._fetch(`${this.serverUrl}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-codeium-csrf-token': this.csrfToken
      },
      body: '{}'
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.response || null;
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
    onDelta,
    onDone,
    onError,
    signal
  }) {
    await this.ensureConnected();
    if (!this.serverUrl) throw new Error('Antigravity Language Server not reachable');

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
      'gemini-3.7-flash-high': ['gemini-3.8-flash-high', 'gemini-pro-agent'],
      'gemini-3.7-flash-medium': ['gemini-3.8-flash-medium', 'gemini-3.8-flash-high'],
      'gemini-3.8-flash-high': ['gemini-3.8-flash-medium', 'gemini-pro-agent'],
      'claude-opus-4-6-thinking': ['claude-sonnet-4-6'],
      'claude-sonnet-4-6': ['gemini-3.8-flash-high']
    };

    const modelsToTry = [modelId, ...(FALLBACK_CHAINS[modelId] || ['gemini-3.8-flash-high'])];

    let lastError = null;
    let anyDeltaSent = false;

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModelId = modelsToTry[i];
      const modelConfig = MODEL_MAP[currentModelId] || MODEL_MAP['gemini-3.8-flash-high'];
      const internalModel = modelConfig.model;

      try {
        await this._runCascadeAttempt({
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
        const isNetworkDrop = /EOF|ECONNRESET|ECONNREFUSED|fetch failed|UND_ERR/i.test(err.message);

        // If tokens were already streamed to client, we cannot cleanly switch models
        if (anyDeltaSent) {
          onError(err);
          return;
        }

        // On network drops, force-reconnect so next attempt uses a fresh connection
        if (isNetworkDrop) {
          this.serverUrl = null;
          this.csrfToken = null;
          this.lastDiscoveryTime = 0;
          console.warn(`[Antigravity] Network drop detected (${err.message}). Forcing reconnection...`);
          await new Promise(r => setTimeout(r, 600));
          await this.ensureConnected();
        }

        // If an error occurred before any tokens were sent, failover to the next candidate model
        if (i + 1 < modelsToTry.length) {
          const nextModelId = modelsToTry[i + 1];
          console.warn(`[Antigravity] Model "${currentModelId}" failed (${err.message}). Auto-failing over to "${nextModelId}"...`);
          await new Promise(r => setTimeout(r, 400));
          continue;
        }

        onError(err);
        return;
      }
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
    let currentCascadeId = cascadeId;
    let currentStepOffset = isReused ? initialStepOffset : 0;

    // 1. If starting a new session, call StartCascade
    if (!currentCascadeId) {
      currentCascadeId = crypto.randomUUID();
      currentStepOffset = 0;
      const startResp = await this._fetch(`${this.serverUrl}/exa.language_server_pb.LanguageServerService/StartCascade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': this.csrfToken
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
    let sendResp = await this._fetch(`${this.serverUrl}/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-codeium-csrf-token': this.csrfToken
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

      const startResp = await this._fetch(`${this.serverUrl}/exa.language_server_pb.LanguageServerService/StartCascade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': this.csrfToken
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

      sendResp = await this._fetch(`${this.serverUrl}/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': this.csrfToken
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
    let isFinished = false;
    let finalPlannerToolCalls = null;
    let finalModelUsage = null;
    const maxPolls = 240;
    let pollCount = 0;
    let turnTotalSteps = 0;

    while (!isFinished && pollCount < maxPolls) {
      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      await new Promise(r => setTimeout(r, 350));
      pollCount++;

      const stepsResp = await this._fetch(`${this.serverUrl}/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': this.csrfToken
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
          throw new Error(errDetails);
        }

        if (type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
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
            const hasToolCalls = hasTools && extractToolCalls(fullResponse, step.plannerResponse?.toolCalls, tools, tool_choice);
            if (fullResponse.trim() || (hasToolCalls && hasToolCalls.length > 0)) {
              isFinished = true;
              break;
            }
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
