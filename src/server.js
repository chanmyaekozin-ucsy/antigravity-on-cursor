import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleModels, handleChatCompletions } from './openaiAdapter.js';
import { antigravity } from './antigravityClient.js';
import { accountManager } from './accountManager.js';
import { proxyManager } from './proxyManager.js';
import { tunnelManager } from './tunnelManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8045;

app.use(cors());
app.use(express.json({ limit: '40mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files for Dashboard
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==========================================
// OpenAI-Compatible v1 Endpoints (For Cursor)
// ==========================================
app.get('/v1/models', handleModels);
app.post('/v1/chat/completions', handleChatCompletions);

// ==========================================
// Dashboard REST APIs
// ==========================================

app.get('/api/agent', (req, res) => {
  res.json({
    nativeAgent: true,
    modes: ['agent', 'plan', 'ask'],
    features: {
      toolCalling: true,
      cascadeSessionReuse: true,
      imageReading: true,
      modeDetection: true,
      thinkingStream: true,
      openAiCompatibleTools: true,
      antigravityXmlTools: true
    },
    sessions: antigravity.cascadeSessions?.map?.size ?? null
  });
});

app.get('/api/status', async (req, res) => {
  const isConnected = await antigravity.ensureConnected();
  const tunnel = tunnelManager.getStatus();
  res.json({
    connected: isConnected,
    serverUrl: antigravity.serverUrl,
    pid: antigravity.pid,
    hasCsrfToken: !!antigravity.csrfToken,
    activeAccount: accountManager.config.activeAccountId,
    port: PORT,
    baseUrl: `http://localhost:${PORT}/v1`,
    tunnel
  });
});

// Tunnel status endpoint — polled by the dashboard
app.get('/api/tunnel', (req, res) => {
  res.json(tunnelManager.getStatus());
});

app.get('/api/quota', async (req, res) => {
  try {
    const quota = await antigravity.getQuota();
    res.json(quota || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    const models = await antigravity.getModels();
    res.json(models);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounts', (req, res) => {
  res.json(accountManager.getAccounts());
});

app.post('/api/accounts', (req, res) => {
  try {
    const { name, email, tokenJson } = req.body;
    const created = accountManager.addAccount({ name, email, tokenJson });
    res.json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/accounts/active', (req, res) => {
  const { accountId } = req.body;
  if (!accountId) return res.status(400).json({ error: 'Missing accountId' });
  accountManager.setActiveAccount(accountId);
  res.json({ success: true, activeAccountId: accountId });
});

app.get('/api/keys', (req, res) => {
  res.json(accountManager.getKeys());
});

app.post('/api/keys', (req, res) => {
  const { name, accountId } = req.body;
  const newKey = accountManager.createKey({ name, accountId });
  res.json(newKey);
});

app.delete('/api/keys/:id', (req, res) => {
  try {
    accountManager.deleteKey(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// Proxy / PAC File APIs
// ==========================================

/**
 * Serve a PAC (Proxy Auto-Config) file that routes only Google API domains
 * through the configured proxy — everything else goes DIRECT.
 * Claude models (anthropic.com) will always bypass the proxy.
 */
app.get('/proxy.pac', (req, res) => {
  const cfg = proxyManager.getConfig();
  const pac = proxyManager.generatePAC(cfg);
  res.setHeader('Content-Type', 'application/x-ns-proxy-autoconfig');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(pac);
});

app.get('/api/proxy', (req, res) => {
  res.json(proxyManager.getConfig());
});

app.put('/api/proxy', (req, res) => {
  try {
    const updated = proxyManager.setConfig(req.body);
    // Force reconnect so new proxy takes effect immediately
    antigravity.serverUrl = null;
    antigravity.csrfToken = null;
    antigravity.lastDiscoveryTime = 0;
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/proxy/apply-pac', async (req, res) => {
  try {
    const result = await proxyManager.applyPACToMacOS(PORT);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/proxy/disable-pac', async (req, res) => {
  try {
    const result = await proxyManager.disablePACFromMacOS();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/proxy/status', async (req, res) => {
  try {
    const status = await proxyManager.getMacOSProxyStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, async () => {
  console.log(`
==========================================================
   🚀 Antigravity Cursor Bridge & Dashboard Running!
==========================================================
  • Web Dashboard:    http://localhost:${PORT}
  • Cursor Base URL:  http://localhost:${PORT}/v1
  • Default API Key:  sk-antigravity-default

  ⚡ Starting Serveo SSH Tunnel (bypasses Cursor's private-network block)...
     Your public Cursor Base URL will appear below shortly.

  Models Available in Cursor:
    - dominate-gemini-3.8-flash-high  (Gemini 3.8 Flash High)
    - dominate-gemini-3.8-flash-medium(Gemini 3.8 Flash Medium)
    - dominate-gemini-3.7-flash-high  (Gemini 3.7 Flash High)
    - gemini-pro-agent                (Gemini 3.1 Pro High)
    - dominate-kladue-sonnet-4-6      (Kladue Sonnet 4.6 Thinking)
    - dominate-kladue-opus-4-6        (Kladue Opus 4.6 Thinking)
    - dominate-gpt-oss-120b           (GPT-OSS 120B)
==========================================================
`);

  // Start Cloudflare tunnel — provides public HTTPS URL for Cursor
  tunnelManager.start(PORT);
  tunnelManager.once('url', (publicUrl) => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║  🌐 CURSOR BASE URL (Public — paste into Cursor Settings) ║
║                                                          ║
║  ${(publicUrl + '/v1').padEnd(55)}║
╚══════════════════════════════════════════════════════════╝
`);
  });

  // Initialize Antigravity connection check in background
  antigravity.ensureConnected().then(connected => {
    if (connected) {
      console.log(`[Antigravity] Successfully attached to language server at ${antigravity.serverUrl}`);
    } else {
      console.warn('[Antigravity] Language server not yet detected. Will auto-connect on first request.');
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => { tunnelManager.stop(); server.close(); });
process.on('SIGINT',  () => { tunnelManager.stop(); server.close(); process.exit(0); });
