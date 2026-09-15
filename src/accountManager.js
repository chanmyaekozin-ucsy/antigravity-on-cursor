import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { oauthManager } from './oauthManager.js';

const CONFIG_PATH = path.join(os.homedir(), '.gemini', 'antigravity-cursor-config.json');
const DEFAULT_TOKEN_PATH = path.join(os.homedir(), '.gemini', 'jetski-standalone-oauth-token');
const ACCOUNTS_BASE_DIR = path.join(os.homedir(), '.gemini', 'accounts');

class AccountManager {
  constructor() {
    this.rateLimits = new Map(); // accountId -> expiresAt timestamp
    this.config = this._loadConfig();
    this.resolvePrimaryProfile().catch(() => {});
  }

  _loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const loaded = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        if (!loaded.accounts) loaded.accounts = [];
        if (!loaded.apiKeys) loaded.apiKeys = [];
        if (!loaded.activeAccountId) loaded.activeAccountId = 'default';
        if (loaded.autoSwitchOnLimit === undefined) loaded.autoSwitchOnLimit = true;

        // Purge legacy default key if present
        if (loaded.apiKeys && Array.isArray(loaded.apiKeys)) {
          const hadDefault = loaded.apiKeys.some(k => k.id === 'default' || k.key === 'sk-antigravity-default');
          if (hadDefault) {
            loaded.apiKeys = loaded.apiKeys.filter(k => k.id !== 'default' && k.key !== 'sk-antigravity-default');
            this._saveRaw(loaded);
          }
        }
        return loaded;
      }
    } catch {
      // Fallback
    }

    return {
      accounts: [],
      apiKeys: [],
      activeAccountId: 'default',
      autoSwitchOnLimit: true
    };
  }

  _saveRaw(data) {
    try {
      const dir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AccountManager] Failed to save config:', err.message);
    }
  }

  _saveConfig() {
    this._saveRaw(this.config);
  }

  /**
   * Extract active Google OAuth token and profile directly from Antigravity IDE global state
   */
  _getIdeActiveToken() {
    if (process.platform !== 'darwin') return null;
    const dbPath = path.join(os.homedir(), 'Library/Application Support/Antigravity IDE/User/globalStorage/state.vscdb');
    if (!fs.existsSync(dbPath)) return null;
    try {
      const raw = execSync(`/usr/bin/sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.oauthToken'"`, { encoding: 'utf-8' }).trim();
      if (!raw) return null;
      const text = Buffer.from(raw, 'base64').toString('latin1');
      const matches = text.match(/[A-Za-z0-9+/=]{40,}/g) || [];
      let at = null, rt = null;
      for (const chunk of matches) {
        try {
          const dec = Buffer.from(chunk, 'base64').toString('latin1');
          const mAt = dec.match(/ya29\.[A-Za-z0-9_-]+/);
          const mRt = dec.match(/1\/\/[A-Za-z0-9_-]+/);
          if (mAt) at = mAt[0];
          if (mRt) rt = mRt[0];
          if (at && rt) break;
        } catch {}
      }

      let pic = null;
      try {
        const pUrl = execSync(`/usr/bin/sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key = 'antigravity.profileUrl'"`, { encoding: 'utf-8' }).trim();
        if (pUrl && pUrl.startsWith('http')) pic = pUrl;
      } catch {}

      return { at, rt, pic };
    } catch {
      return null;
    }
  }

  async resolvePrimaryProfile() {
    try {
      // 1. Prioritize active Antigravity IDE account from state.vscdb
      const ideAuth = this._getIdeActiveToken();
      if (ideAuth && (ideAuth.at || ideAuth.rt)) {
        let at = ideAuth.at;
        if (ideAuth.rt) {
          try {
            const refreshed = await oauthManager.refreshAccessToken(ideAuth.rt);
            at = refreshed.access_token;
          } catch {}
        }
        if (at) {
          const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${at}` }
          });
          if (resp.ok) {
            const info = await resp.json();
            const prevEmail = this.config.primaryEmail;
            this.config.primaryEmail = info.email || null;
            this.config.primaryName = info.name || null;
            this.config.primaryPicture = info.picture || ideAuth.pic || null;
            this._saveConfig();
            console.log(`[AccountManager] Resolved primary profile (Antigravity IDE): ${this.config.primaryName} (${this.config.primaryEmail})`);

            // If the old primary email was different (e.g. frwai807@gmail.com) and has a valid token in DEFAULT_TOKEN_PATH,
            // preserve it in this.config.accounts so the user retains access to both!
            if (prevEmail && prevEmail !== this.config.primaryEmail && fs.existsSync(DEFAULT_TOKEN_PATH)) {
              try {
                const legacyRaw = JSON.parse(fs.readFileSync(DEFAULT_TOKEN_PATH, 'utf-8'));
                const alreadyHas = (this.config.accounts || []).some(a => a.email === prevEmail);
                if (!alreadyHas && legacyRaw.token) {
                  this.addGoogleAccount({
                    name: this.config.primaryName !== 'wai fr' ? 'wai fr' : prevEmail.split('@')[0],
                    email: prevEmail,
                    token: legacyRaw
                  });
                  console.log(`[AccountManager] Preserved legacy account '${prevEmail}' in secondary accounts list.`);
                }
              } catch {}
            }
            return;
          }
        }
      }

      // 2. Fallback to DEFAULT_TOKEN_PATH
      if (!fs.existsSync(DEFAULT_TOKEN_PATH)) return;
      const raw = JSON.parse(fs.readFileSync(DEFAULT_TOKEN_PATH, 'utf-8'));
      let at = raw.token?.access_token;
      if (raw.token?.refresh_token) {
        try {
          const refreshed = await oauthManager.refreshAccessToken(raw.token.refresh_token);
          at = refreshed.access_token;
        } catch {}
      }
      if (!at) return;
      const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${at}` }
      });
      if (resp.ok) {
        const info = await resp.json();
        this.config.primaryEmail = info.email || null;
        this.config.primaryName = info.name || null;
        this.config.primaryPicture = info.picture || null;
        this._saveConfig();
        console.log(`[AccountManager] Resolved primary profile: ${this.config.primaryName} (${this.config.primaryEmail})`);
      }
    } catch (err) {
      console.warn('[AccountManager] Primary profile resolution warning:', err.message);
    }
  }

  /**
   * Get all accounts with live status, token validity, and rate limit flags
   */
  getAccounts() {
    let nativeTokenInfo = null;
    const ideAuth = this._getIdeActiveToken();
    if (ideAuth && (ideAuth.at || ideAuth.rt)) {
      nativeTokenInfo = {
        hasToken: true,
        authMethod: 'consumer',
        expiry: null,
        isExpired: false
      };
    } else {
      try {
        if (fs.existsSync(DEFAULT_TOKEN_PATH)) {
          const raw = JSON.parse(fs.readFileSync(DEFAULT_TOKEN_PATH, 'utf-8'));
          const isExp = raw.token?.expiry ? new Date(raw.token.expiry).getTime() < Date.now() : false;
          nativeTokenInfo = {
            hasToken: true,
            authMethod: raw.auth_method || 'consumer',
            expiry: raw.token?.expiry || null,
            isExpired: isExp
          };
        }
      } catch {
        // ignore
      }
    }

    const defaultRateLimit = this.getRateLimitInfo('default');
    const defaultAccount = {
      id: 'default',
      name: this.config.primaryName ? `${this.config.primaryName} (Primary)` : 'Primary Google Account (Antigravity IDE)',
      email: this.config.primaryEmail || null,
      picture: this.config.primaryPicture || null,
      isDefault: true,
      isActive: this.config.activeAccountId === 'default',
      authMethod: nativeTokenInfo?.authMethod || 'consumer',
      expiry: nativeTokenInfo?.expiry || null,
      status: !nativeTokenInfo?.hasToken ? 'Missing Token' : defaultRateLimit.isRateLimited ? 'Rate Limited' : nativeTokenInfo.isExpired ? 'Needs Refresh' : 'Connected',
      isRateLimited: defaultRateLimit.isRateLimited,
      rateLimitedRemainingSec: defaultRateLimit.remainingSec,
      cooldownRemaining: defaultRateLimit.remainingSeconds
    };

    const secondaryAccounts = (this.config.accounts || []).map(acc => {
      const token = acc.token?.token || acc.token;
      const isExp = token?.expiry ? new Date(token.expiry).getTime() < Date.now() : false;
      const rlimit = this.getRateLimitInfo(acc.id);
      return {
        id: acc.id,
        name: acc.name || 'Google Account',
        email: acc.email || null,
        picture: acc.picture || null,
        isDefault: false,
        isActive: this.config.activeAccountId === acc.id,
        status: !token ? 'No Token' : rlimit.isLimited ? 'Rate Limited' : isExp ? 'Needs Refresh' : 'Connected',
        isRateLimited: rlimit.isLimited,
        cooldownRemaining: rlimit.remainingSeconds,
        expiry: token?.expiry || null,
        createdAt: acc.createdAt
      };
    });

    return [defaultAccount, ...secondaryAccounts];
  }

  getAccount(accountId) {
    if (accountId === 'default') {
      return {
        id: 'default',
        name: 'Primary Google Account (Antigravity IDE)',
        isDefault: true
      };
    }
    return (this.config.accounts || []).find(a => a.id === accountId) || null;
  }

  /**
   * Add a secondary Google account via token paste (supports token object or JSON string)
   */
  addAccount({ name, email, tokenJson }) {
    let parsed;
    try {
      parsed = typeof tokenJson === 'string' ? JSON.parse(tokenJson) : tokenJson;
    } catch {
      if (typeof tokenJson === 'string' && tokenJson.trim().startsWith('ya29.')) {
        parsed = {
          token: {
            access_token: tokenJson.trim(),
            token_type: 'Bearer'
          },
          auth_method: 'consumer'
        };
      } else {
        throw new Error('Invalid JSON token format');
      }
    }

    return this.addGoogleAccount({
      name,
      email,
      token: parsed
    });
  }

  /**
   * Save a newly authenticated Google Account (from OAuth or manual token)
   */
  addGoogleAccount({ name, email, picture, token }) {
    const id = 'acc_' + crypto.randomBytes(4).toString('hex');
    const tokenObj = token.token ? token : { token, auth_method: 'consumer' };

    const newAccount = {
      id,
      name: name || email?.split('@')[0] || `Google Account (${id})`,
      email: email || null,
      picture: picture || null,
      token: tokenObj,
      createdAt: new Date().toISOString()
    };

    this.config.accounts.push(newAccount);

    // If on Linux or no active account set yet, make this the active account
    if (!this.config.activeAccountId || this.config.activeAccountId === 'default') {
      this.config.activeAccountId = id;
      if (email) this.config.primaryEmail = email;
      if (name) this.config.primaryName = name;
    }

    // Setup dedicated directory for this account
    this._writeAccountTokenDir(id, tokenObj);

    this._saveConfig();
    console.log(`[AccountManager] Added Google Account: ${newAccount.name} (${newAccount.email || id})`);
    return newAccount;
  }

  /**
   * Write jetski-standalone-oauth-token inside ~/.gemini/accounts/<id>/.gemini/
   */
  _writeAccountTokenDir(accountId, tokenObj) {
    try {
      const accDir = path.join(ACCOUNTS_BASE_DIR, accountId, '.gemini');
      fs.mkdirSync(accDir, { recursive: true });
      fs.writeFileSync(
        path.join(accDir, 'jetski-standalone-oauth-token'),
        JSON.stringify(tokenObj, null, 2),
        'utf-8'
      );
      // On Linux/Docker, if primary default token is missing, also write to DEFAULT_TOKEN_PATH
      if (!fs.existsSync(DEFAULT_TOKEN_PATH)) {
        const defaultDir = path.dirname(DEFAULT_TOKEN_PATH);
        if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
        fs.writeFileSync(DEFAULT_TOKEN_PATH, JSON.stringify(tokenObj, null, 2), 'utf-8');
      }
    } catch (err) {
      console.error(`[AccountManager] Failed to write account directory for ${accountId}:`, err.message);
    }
  }


  /**
   * Delete a secondary account and its isolated folder
   */
  deleteAccount(accountId) {
    if (accountId === 'default') {
      let changed = false;
      if (fs.existsSync(DEFAULT_TOKEN_PATH)) {
        try {
          fs.unlinkSync(DEFAULT_TOKEN_PATH);
          changed = true;
        } catch {}
      }
      if (this.config.primaryEmail || this.config.primaryName) {
        this.config.primaryEmail = null;
        this.config.primaryName = null;
        this.config.primaryPicture = null;
        changed = true;
      }
      if (changed) {
        this._saveConfig();
        console.log('[AccountManager] Cleared primary account credentials');
        return true;
      }
      return false;
    }

    const initialLen = this.config.accounts.length;
    this.config.accounts = this.config.accounts.filter(a => a.id !== accountId);

    if (this.config.accounts.length === initialLen) {
      return false; // Not found
    }

    // If active account was deleted, revert to default
    if (this.config.activeAccountId === accountId) {
      this.config.activeAccountId = 'default';
    }

    // Clean up directory
    try {
      const accDir = path.join(ACCOUNTS_BASE_DIR, accountId);
      if (fs.existsSync(accDir)) {
        fs.rmSync(accDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[AccountManager] Error removing directory for ${accountId}:`, err.message);
    }

    // Terminate any stale process for this specific account
    try {
      execSync(`pkill -f "gemini_dir=.*accounts/${accountId}"`, { stdio: 'ignore' });
    } catch {}

    this._saveConfig();
    console.log(`[AccountManager] Deleted account ${accountId}`);
    return true;
  }

  /**
   * Set active account ID
   */
  setActiveAccount(accountId) {
    if (accountId !== 'default') {
      const exists = (this.config.accounts || []).some(a => a.id === accountId);
      if (!exists) throw new Error(`Account '${accountId}' not found`);
    }

    this.config.activeAccountId = accountId;
    this._saveConfig();
    console.log(`[AccountManager] Active account set to: ${accountId}`);

    // Sync active account's token into macOS Keychain so language servers match
    this.syncActiveAccountToKeychain().catch(() => {});

    return true;
  }

  /**
   * Sync the active account's OAuth token to macOS Keychain (service 'gemini', account 'antigravity').
   * This ensures newly spawned language servers run under the active account credentials.
   */
  async syncActiveAccountToKeychain() {
    if (process.platform !== 'darwin') return;
    try {
      const activeId = this.config.activeAccountId || 'default';
      let tokenObj = null;

      if (activeId === 'default') {
        const ideAuth = this._getIdeActiveToken();
        if (ideAuth && (ideAuth.at || ideAuth.rt)) {
          let at = ideAuth.at;
          if (ideAuth.rt) {
            try {
              const refreshed = await oauthManager.refreshAccessToken(ideAuth.rt);
              at = refreshed.access_token;
            } catch {}
          }
          tokenObj = {
            access_token: at,
            refresh_token: ideAuth.rt,
            token_type: 'Bearer',
            expiry: new Date(Date.now() + 3500 * 1000).toISOString()
          };
        } else if (fs.existsSync(DEFAULT_TOKEN_PATH)) {
          const raw = JSON.parse(fs.readFileSync(DEFAULT_TOKEN_PATH, 'utf-8'));
          tokenObj = raw.token;
        }
      } else {
        const acc = (this.config.accounts || []).find(a => a.id === activeId);
        if (acc) {
          const { accessToken } = await this.getValidAccessToken(activeId).catch(() => ({}));
          const baseToken = acc.token?.token || acc.token;
          tokenObj = {
            access_token: accessToken || baseToken?.access_token,
            refresh_token: baseToken?.refresh_token,
            token_type: 'Bearer',
            expiry: baseToken?.expiry || new Date(Date.now() + 3500 * 1000).toISOString()
          };
        }
      }

      if (tokenObj && (tokenObj.access_token || tokenObj.refresh_token)) {
        const payload = JSON.stringify({
          token: {
            access_token: tokenObj.access_token,
            token_type: 'Bearer',
            refresh_token: tokenObj.refresh_token,
            expiry: tokenObj.expiry
          }
        });
        const b64 = Buffer.from(payload).toString('base64');
        const fullVal = `go-keyring-base64:${b64}`;
        execSync(`/usr/bin/security add-generic-password -a antigravity -s gemini -w "${fullVal}" -U`, { stdio: 'ignore' });
        console.log(`[AccountManager] Synced active account '${activeId}' to macOS Keychain`);
      }
    } catch (err) {
      console.warn('[AccountManager] Keychain sync warning:', err.message);
    }
  }

  /**
   * Get valid access token for account, automatically refreshing if expired
   */
  async getValidAccessToken(accountId = 'default') {
    if (accountId === 'default') {
      // 1. Prioritize Antigravity IDE active token from state.vscdb
      const ideAuth = this._getIdeActiveToken();
      if (ideAuth && ideAuth.rt) {
        try {
          const refreshed = await oauthManager.refreshAccessToken(ideAuth.rt);
          return { accessToken: refreshed.access_token, account: { id: 'default', isDefault: true, email: this.config.primaryEmail } };
        } catch (err) {
          if (ideAuth.at) {
            return { accessToken: ideAuth.at, account: { id: 'default', isDefault: true, email: this.config.primaryEmail } };
          }
        }
      }

      // 2. Fallback to DEFAULT_TOKEN_PATH
      if (!fs.existsSync(DEFAULT_TOKEN_PATH)) {
        throw new Error('Primary token file not found');
      }

      const raw = JSON.parse(fs.readFileSync(DEFAULT_TOKEN_PATH, 'utf-8'));
      const token = raw.token;
      const expiry = token?.expiry ? new Date(token.expiry).getTime() : 0;
      const isExpired = expiry && (expiry - Date.now() < 300 * 1000); // 5 min buffer

      if (isExpired && token.refresh_token) {
        console.log('[AccountManager] Primary token is expired or close to expiry. Refreshing with Google OAuth...');
        try {
          const refreshed = await oauthManager.refreshAccessToken(token.refresh_token);
          raw.token.access_token = refreshed.access_token;
          raw.token.expiry = refreshed.expiry;
          if (refreshed.refresh_token) raw.token.refresh_token = refreshed.refresh_token;
          fs.writeFileSync(DEFAULT_TOKEN_PATH, JSON.stringify(raw, null, 2), 'utf-8');
          return { accessToken: refreshed.access_token, account: { id: 'default', isDefault: true } };
        } catch (err) {
          console.warn('[AccountManager] Primary token refresh failed:', err.message);
          return { accessToken: token.access_token, account: { id: 'default', isDefault: true } };
        }
      }

      return { accessToken: token.access_token, account: { id: 'default', isDefault: true } };
    }

    // Secondary Account
    const acc = (this.config.accounts || []).find(a => a.id === accountId);
    if (!acc) throw new Error(`Account '${accountId}' not found`);

    const tokenObj = acc.token?.token || acc.token;
    const expiry = tokenObj?.expiry ? new Date(tokenObj.expiry).getTime() : 0;
    const isExpired = expiry && (expiry - Date.now() < 300 * 1000);

    if (isExpired && tokenObj.refresh_token) {
      console.log(`[AccountManager] Refreshing token for ${acc.name} (${acc.email || acc.id})...`);
      try {
        const refreshed = await oauthManager.refreshAccessToken(tokenObj.refresh_token);
        tokenObj.access_token = refreshed.access_token;
        tokenObj.expiry = refreshed.expiry;
        if (refreshed.refresh_token) tokenObj.refresh_token = refreshed.refresh_token;

        // Persist to config AND write fresh token file to disk so the
        // language server binary can read a valid, non-expired token.
        this._writeAccountTokenDir(acc.id, acc.token);
        this._saveConfig();
        console.log(`[AccountManager] Token refreshed for ${acc.email || acc.id}, new expiry: ${refreshed.expiry}`);
        return { accessToken: refreshed.access_token, account: acc };
      } catch (err) {
        console.error(`[AccountManager] Refresh failed for ${acc.id}:`, err.message);
        // Don't throw — try using the existing token anyway; it may still work
        // if the system clock is wrong or the expiry window has slack.
        return { accessToken: tokenObj.access_token, account: acc };
      }
    }

    return { accessToken: tokenObj.access_token, account: acc };
  }

  /**
   * Rate limit tracking
   */
  markRateLimited(accountId, cooldownSeconds = 600) {
    const until = Date.now() + (cooldownSeconds * 1000);
    this.rateLimits.set(accountId, until);
    console.warn(`[AccountManager] Account '${accountId}' marked as rate-limited for ${cooldownSeconds}s`);
  }

  getRateLimitInfo(accountId) {
    const until = this.rateLimits.get(accountId);
    if (!until || until <= Date.now()) {
      return { isLimited: false, remainingSeconds: 0 };
    }
    return {
      isLimited: true,
      remainingSeconds: Math.ceil((until - Date.now()) / 1000)
    };
  }

  /**
   * Check if account has valid credentials present on disk
   */
  hasValidCredentials(accountId) {
    if (accountId === 'default') {
      if (this._getIdeActiveToken()) return true;
      if (fs.existsSync(DEFAULT_TOKEN_PATH)) {
        try {
          const raw = JSON.parse(fs.readFileSync(DEFAULT_TOKEN_PATH, 'utf-8'));
          return Boolean(raw && (raw.access_token || raw.token?.access_token || raw.token));
        } catch {
          return false;
        }
      }
      return false;
    }
    const acc = (this.config.accounts || []).find(a => a.id === accountId);
    if (!acc || !acc.token) return false;
    const t = acc.token?.token || acc.token;
    return Boolean(t && (t.access_token || t.refresh_token));
  }

  /**
   * Resolve an initial healthy account, gracefully falling back if preferred is missing credentials or rate-limited
   */
  getInitialAccount(preferredId = null) {
    const targetId = preferredId || this.config.activeAccountId || 'default';
    if (this.hasValidCredentials(targetId)) {
      const rlimit = this.getRateLimitInfo(targetId);
      if (!rlimit.isLimited) {
        return targetId;
      }
    }
    const next = this.getNextAvailableAccount(targetId);
    if (next) return next.id;
    return targetId;
  }

  /**
   * Find next available non-rate-limited account with valid credentials for auto-failover
   */
  getNextAvailableAccount(currentAccountId, excludedIds = null) {
    const excluded = excludedIds instanceof Set ? excludedIds : new Set(excludedIds || []);
    const accounts = this.config.accounts || [];
    const allAccountIds = [];

    // Only include default if it actually has valid credentials
    if (this.hasValidCredentials('default')) {
      allAccountIds.push('default');
    }
    for (const a of accounts) {
      if (this.hasValidCredentials(a.id)) {
        allAccountIds.push(a.id);
      }
    }

    const available = allAccountIds.filter(id => {
      if (id === currentAccountId) return false;
      if (excluded.has(id)) return false;
      const rlimit = this.getRateLimitInfo(id);
      return !rlimit.isLimited;
    });

    if (available.length === 0) {
      return null; // All accounts are rate-limited or exhausted
    }

    // Round-robin selection starting immediately after currentAccountId
    const currIdx = allAccountIds.indexOf(currentAccountId);
    if (currIdx !== -1) {
      for (let i = 1; i <= allAccountIds.length; i++) {
        const candidate = allAccountIds[(currIdx + i) % allAccountIds.length];
        if (available.includes(candidate)) {
          return this.getAccount(candidate);
        }
      }
    }

    return this.getAccount(available[0]);
  }

  // API Key Management
  _maskKey(key) {
    if (!key || key.length < 10) return '••••••••••••••••';
    const prefix = key.slice(0, 6);
    const suffix = key.slice(-4);
    return `${prefix}••••••••••••${suffix}`;
  }

  getKeys() {
    return this.config.apiKeys.map(k => ({
      id: k.id,
      name: k.name,
      maskedKey: this._maskKey(k.key),
      accountId: k.accountId || 'auto',
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt || null
    }));
  }

  createKey({ name, accountId }) {
    const randomSuffix = crypto.randomBytes(16).toString('hex');
    const keyString = `sk-ag-${randomSuffix}`;
    const id = 'key_' + crypto.randomBytes(4).toString('hex');

    const keyObj = {
      id,
      name: name || 'Cursor Key ' + (this.config.apiKeys.length + 1),
      key: keyString,
      accountId: accountId || 'auto', // 'auto' means follow active account / auto-switch
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    };

    this.config.apiKeys.push(keyObj);
    this._saveConfig();

    return {
      id: keyObj.id,
      name: keyObj.name,
      secretKey: keyString,
      maskedKey: this._maskKey(keyString),
      accountId: keyObj.accountId,
      createdAt: keyObj.createdAt,
      lastUsedAt: null
    };
  }

  deleteKey(keyId) {
    this.config.apiKeys = this.config.apiKeys.filter(k => k.id !== keyId);
    this._saveConfig();
    return true;
  }

  validateKey(authHeader) {
    if (!authHeader) {
      if (this.config.apiKeys.length === 0) {
        return { valid: true, accountId: this.config.activeAccountId || 'default' };
      }
      return { valid: false };
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token === 'sk-antigravity-default') {
      return { valid: true, accountId: this.config.activeAccountId || 'default' };
    }

    const match = this.config.apiKeys.find(k => k.key === token);
    if (match) {
      match.lastUsedAt = new Date().toISOString();
      this._saveConfig();
      const resolvedAcc = match.accountId === 'auto' ? (this.config.activeAccountId || 'default') : match.accountId;
      return { valid: true, accountId: resolvedAcc };
    }

    return { valid: false };
  }
}

export const accountManager = new AccountManager();
