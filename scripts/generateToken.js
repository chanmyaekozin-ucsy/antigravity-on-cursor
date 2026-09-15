import http from 'http';
import { execSync, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { GOOGLE_OAUTH_CONFIG } from '../src/oauthManager.js';

const CLIENT_ID = GOOGLE_OAUTH_CONFIG.clientId;
const CLIENT_SECRET = GOOGLE_OAUTH_CONFIG.clientSecret;
const PORT = 8045;
const REDIRECT_URI = `http://localhost:${PORT}/oauth-callback`;
const TARGET_EMAIL = process.argv[2]?.trim() || '';
const SCOPES = GOOGLE_OAUTH_CONFIG.scopes;
const state = crypto.randomBytes(24).toString('hex');

const authParams = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPES.join(' '),
  access_type: 'offline',
  prompt: 'consent select_account',
  state,
  ...(TARGET_EMAIL ? { login_hint: TARGET_EMAIL } : {})
});

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`;

console.log('================================================================');
console.log(`🔑 Antigravity Google OAuth Token Generator${TARGET_EMAIL ? ` for: ${TARGET_EMAIL}` : ''}`);
console.log('================================================================\n');
console.log(`1. Waiting for OAuth authorization on port ${PORT}...`);
console.log(`2. If your browser does not open automatically, click this URL:\n\n${authUrl}\n`);

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  if (reqUrl.pathname !== '/oauth-callback') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  const code = reqUrl.searchParams.get('code');
  const error = reqUrl.searchParams.get('error');
  const returnedState = reqUrl.searchParams.get('state');

  if (returnedState !== state || error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>Authorization failed. Close this page and start the flow again.</h2>');
    console.error('❌ Authorization failed: invalid state, provider error, or missing code.');
    server.close();
    return;
  }

  try {
    console.log('🔄 Exchanging authorization code for OAuth tokens...');
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      }).toString()
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
    }

    // Fetch user profile info
    let profile = { email: TARGET_EMAIL || null, name: TARGET_EMAIL ? TARGET_EMAIL.split('@')[0] : 'Google User' };
    try {
      const userResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      if (userResp.ok) {
        profile = await userResp.json();
      }
    } catch {}

    const tokenPayload = {
      token: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || '',
        token_type: tokenData.token_type || 'Bearer',
        expiry: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
        expires_in: tokenData.expires_in || 3600
      },
      auth_method: 'consumer'
    };

    const pasteableJson = JSON.stringify(tokenPayload, null, 2);

    // Save to a predictable private local file.
    const tokenDir = path.join(os.homedir(), '.gemini');
    fs.mkdirSync(tokenDir, { recursive: true });
    const tokenFilePath = path.join(tokenDir, 'antigravity-generated-token.json');
    fs.writeFileSync(tokenFilePath, pasteableJson, 'utf-8');
    fs.chmodSync(tokenFilePath, 0o600);

    // Also auto-add to ~/.gemini/antigravity-cursor-config.json
    const configPath = path.join(os.homedir(), '.gemini', 'antigravity-cursor-config.json');
    try {
      let config = {};
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
      config.accounts = config.accounts || [];
      const accountId = `acc_${Math.random().toString(16).slice(2, 10)}`;
      
      // Check if account with email already exists
      const existingIdx = config.accounts.findIndex(a => a.email === profile.email);
      const newAcc = {
        id: existingIdx >= 0 ? config.accounts[existingIdx].id : accountId,
        name: profile.name || TARGET_EMAIL.split('@')[0],
        email: profile.email || TARGET_EMAIL,
        picture: profile.picture || null,
        token: tokenPayload,
        createdAt: new Date().toISOString()
      };

      if (existingIdx >= 0) {
        config.accounts[existingIdx] = newAcc;
      } else {
        config.accounts.push(newAcc);
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
      fs.chmodSync(configPath, 0o600);
      console.log(`✅ Automatically registered account into ${configPath}`);
    } catch (cfgErr) {
      console.warn('⚠️ Could not update config file:', cfgErr.message);
    }

    // Try copying to pbcopy on macOS
    try {
      execSync('pbcopy', { input: pasteableJson });
      console.log('📋 Token JSON copied directly to your macOS clipboard (pbcopy)!');
    } catch {}

    // Send success HTML
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Token Generated - Antigravity</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 36px; text-align: center; max-width: 480px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
          .badge { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: #10b981; color: white; font-size: 28px; margin-bottom: 16px; }
          h2 { margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #f8fafc; }
          p { margin: 0 0 16px; font-size: 14px; color: #94a3b8; line-height: 1.5; }
          .email { color: #38bdf8; font-weight: 600; }
          .notice { font-size: 12px; color: #a7f3d0; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 8px 12px; margin-bottom: 20px; }
          textarea { width: 100%; height: 110px; background: #0b0f19; border: 1px solid #334155; border-radius: 6px; color: #38bdf8; font-family: monospace; font-size: 11px; padding: 8px; resize: none; margin-bottom: 16px; box-sizing: border-box; }
          button { background: #2563eb; color: white; border: none; border-radius: 6px; padding: 9px 18px; font-size: 13px; font-weight: 500; cursor: pointer; }
          button:hover { background: #1d4ed8; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">✓</div>
          <h2>Token Generated Successfully!</h2>
          <p>Authentication completed. The token was saved to your local <code>.gemini</code> directory.</p>
          <div class="notice">📋 Token has been automatically copied to your clipboard!</div>
        </div>
      </body>
      </html>
    `);

    console.log('\n================================================================');
    console.log(`🎉 SUCCESS! Token generated${profile.email ? ` for: ${profile.email}` : ''}`);
    console.log('================================================================\n');
    console.log(`Token saved with owner-only permissions at ${tokenFilePath}.`);

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 1500);

  } catch (err) {
    console.error('❌ Error handling token callback:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error: ' + err.message);
    setTimeout(() => process.exit(1), 1000);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Local callback server listening on http://localhost:${PORT}/oauth-callback`);
  
  if (process.platform === 'darwin') {
    const opener = spawn('open', [authUrl], { detached: true, stdio: 'ignore' });
    opener.unref();
  }
});
