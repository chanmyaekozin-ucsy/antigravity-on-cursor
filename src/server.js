import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleModels, handleChatCompletions } from './openaiAdapter.js';
import { antigravity } from './antigravityClient.js';
import { accountManager } from './accountManager.js';
import { oauthManager } from './oauthManager.js';
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
    // Resolve which account to fetch quota for:
    // 1. Explicit ?accountId= query param (for per-account polling)
    // 2. The currently active account set by the user
    // 3. Falls back to 'default' inside getQuota() if neither is set
    const accountId = req.query.accountId || accountManager.config.activeAccountId || null;
    const quota = await antigravity.getQuota(accountId);
    res.json(quota || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    const accountId = req.query.accountId || accountManager.config.activeAccountId || null;
    const models = await antigravity.getModels(accountId);
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
    const created = accountManager.addGoogleAccount({
      name,
      email,
      token: typeof tokenJson === 'string' ? JSON.parse(tokenJson) : tokenJson
    });
    res.json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  try {
    const deleted = accountManager.deleteAccount(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Account not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/accounts/active', (req, res) => {
  const { accountId } = req.body;
  if (!accountId) return res.status(400).json({ error: 'Missing accountId' });
  try {
    accountManager.setActiveAccount(accountId);
    res.json({ success: true, activeAccountId: accountId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/accounts/settings', (req, res) => {
  res.json({
    autoSwitchOnLimit: accountManager.config.autoSwitchOnLimit !== false,
    activeAccountId: accountManager.config.activeAccountId || 'default'
  });
});

app.post('/api/accounts/settings', (req, res) => {
  const { autoSwitchOnLimit } = req.body;
  if (autoSwitchOnLimit !== undefined) {
    accountManager.config.autoSwitchOnLimit = Boolean(autoSwitchOnLimit);
    accountManager._saveConfig();
  }
  res.json({
    success: true,
    autoSwitchOnLimit: accountManager.config.autoSwitchOnLimit
  });
});

app.post('/api/accounts/refresh/:id', async (req, res) => {
  try {
    const result = await accountManager.getValidAccessToken(req.params.id);
    res.json({ success: true, accountId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google OAuth Authorization Initiation
app.get('/api/accounts/login/url', (req, res) => {
  try {
    const auth = oauthManager.getAuthUrl(PORT);
    res.json({ url: auth.url, state: auth.state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google OAuth Redirect Callback Handler
app.get('/oauth-callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head><title>OAuth Error</title>
      <style>body{font-family:sans-serif;background:#0b0f19;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
      .card{background:#1e293b;padding:32px;border-radius:12px;text-align:center;max-width:400px;border:1px solid #ef4444;}</style></head>
      <body><div class="card"><h2>Authentication Failed</h2><p>${error_description || error}</p><button onclick="window.close()">Close</button></div></body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const redirectUri = `http://localhost:${PORT}/oauth-callback`;
    const tokens = await oauthManager.exchangeCode(code, redirectUri);
    const userInfo = await oauthManager.fetchUserInfo(tokens.access_token);

    const account = accountManager.addGoogleAccount({
      name: userInfo?.name,
      email: userInfo?.email,
      picture: userInfo?.picture,
      token: tokens
    });

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Google Account Connected - Antigravity</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: rgba(30, 41, 59, 0.85); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px; text-align: center; max-width: 440px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
          .icon { width: 64px; height: 64px; border-radius: 50%; background: #10b981; color: white; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px; font-weight: bold; }
          h1 { font-size: 22px; margin: 0 0 10px; font-weight: 600; }
          p { font-size: 14px; color: #94a3b8; line-height: 1.5; margin: 0 0 24px; }
          .email { color: #38bdf8; font-weight: 600; }
          .btn { background: #3b82f6; color: white; border: none; border-radius: 8px; padding: 10px 24px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
          .btn:hover { background: #2563eb; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <h1>Google Account Connected</h1>
          <p>Successfully authenticated as <span class="email">${userInfo?.email || 'Google User'}</span>.<br>You can safely close this window.</p>
          <button class="btn" onclick="window.close()">Close Window</button>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_ACCOUNT_ADDED', email: '${userInfo?.email || ''}', accountId: '${account.id}' }, '*');
            setTimeout(() => window.close(), 1800);
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Connection Error</title>
      <style>body{font-family:sans-serif;background:#0b0f19;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
      .card{background:#1e293b;padding:32px;border-radius:12px;text-align:center;max-width:400px;border:1px solid #ef4444;}</style></head>
      <body><div class="card"><h2>Authentication Error</h2><p>${err.message}</p><button onclick="window.close()">Close</button></div></body>
      </html>
    `);
  }
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
