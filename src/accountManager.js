import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const CONFIG_PATH = path.join(os.homedir(), '.gemini', 'antigravity-cursor-config.json');
const DEFAULT_TOKEN_PATH = path.join(os.homedir(), '.gemini', 'jetski-standalone-oauth-token');

class AccountManager {
  constructor() {
    this.config = this._loadConfig();
  }

  _loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const loaded = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        // Purge legacy default key if present
        if (loaded.apiKeys && Array.isArray(loaded.apiKeys)) {
          const hadDefault = loaded.apiKeys.some(k => k.id === 'default' || k.key === 'sk-antigravity-default');
          if (hadDefault) {
            loaded.apiKeys = loaded.apiKeys.filter(k => k.id !== 'default' && k.key !== 'sk-antigravity-default');
            const dir = path.dirname(CONFIG_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(loaded, null, 2), 'utf-8');
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
      activeAccountId: 'default'
    };
  }

  _saveConfig() {
    try {
      const dir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AccountManager] Failed to save config:', err.message);
    }
  }

  /**
   * Get all accounts, including the native Antigravity Google Account
   */
  getAccounts() {
    let nativeTokenInfo = null;
    try {
      if (fs.existsSync(DEFAULT_TOKEN_PATH)) {
        const raw = JSON.parse(fs.readFileSync(DEFAULT_TOKEN_PATH, 'utf-8'));
        nativeTokenInfo = {
          hasToken: true,
          authMethod: raw.auth_method || 'consumer',
          expiry: raw.token?.expiry || null
        };
      }
    } catch {
      // ignore
    }

    const defaultAccount = {
      id: 'default',
      name: 'Primary Google Account (Antigravity IDE)',
      isDefault: true,
      isActive: this.config.activeAccountId === 'default',
      authMethod: nativeTokenInfo?.authMethod || 'consumer',
      expiry: nativeTokenInfo?.expiry || null,
      status: nativeTokenInfo?.hasToken ? 'Connected' : 'Missing Token'
    };

    const secondaryAccounts = (this.config.accounts || []).map(acc => ({
      id: acc.id,
      name: acc.name,
      email: acc.email || null,
      isDefault: false,
      isActive: this.config.activeAccountId === acc.id,
      status: acc.token ? 'Connected' : 'Expired',
      createdAt: acc.createdAt
    }));

    return [defaultAccount, ...secondaryAccounts];
  }

  /**
   * Add a secondary Google account via token paste
   */
  addAccount({ name, email, tokenJson }) {
    let parsedToken;
    try {
      parsedToken = typeof tokenJson === 'string' ? JSON.parse(tokenJson) : tokenJson;
    } catch {
      throw new Error('Invalid JSON token format');
    }

    const id = 'acc_' + crypto.randomBytes(4).toString('hex');
    const newAccount = {
      id,
      name: name || `Google Account (${email || id})`,
      email: email || null,
      token: parsedToken,
      createdAt: new Date().toISOString()
    };

    this.config.accounts.push(newAccount);
    this._saveConfig();
    return newAccount;
  }

  /**
   * Set the active Google Account
   */
  setActiveAccount(accountId) {
    this.config.activeAccountId = accountId;
    this._saveConfig();
    return true;
  }

  /**
   * Helper to mask API keys
   */
  _maskKey(key) {
    if (!key || key.length < 10) return '••••••••••••••••';
    const prefix = key.slice(0, 6);
    const suffix = key.slice(-4);
    return `${prefix}••••••••••••${suffix}`;
  }

  /**
   * List all API keys (masked for security)
   */
  getKeys() {
    return this.config.apiKeys.map(k => ({
      id: k.id,
      name: k.name,
      maskedKey: this._maskKey(k.key),
      accountId: k.accountId,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt || null
    }));
  }

  /**
   * Create a new custom API Key - returns full secretKey ONCE
   */
  createKey({ name, accountId }) {
    const randomSuffix = crypto.randomBytes(16).toString('hex');
    const keyString = `sk-ag-${randomSuffix}`;
    const id = 'key_' + crypto.randomBytes(4).toString('hex');

    const keyObj = {
      id,
      name: name || 'Cursor Key ' + (this.config.apiKeys.length + 1),
      key: keyString,
      accountId: accountId || this.config.activeAccountId || 'default',
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    };

    this.config.apiKeys.push(keyObj);
    this._saveConfig();

    return {
      id: keyObj.id,
      name: keyObj.name,
      secretKey: keyString, // Shown ONLY once to the user upon creation
      maskedKey: this._maskKey(keyString),
      accountId: keyObj.accountId,
      createdAt: keyObj.createdAt,
      lastUsedAt: null
    };
  }

  /**
   * Delete / Revoke an API key
   */
  deleteKey(keyId) {
    this.config.apiKeys = this.config.apiKeys.filter(k => k.id !== keyId);
    this._saveConfig();
    return true;
  }

  /**
   * Validate API key from Cursor request & record lastUsedAt
   */
  validateKey(authHeader) {
    if (!authHeader) {
      if (this.config.apiKeys.length === 0) {
        return { valid: true, accountId: 'default' };
      }
      return { valid: false };
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Allow default key or match against registered keys
    if (token === 'sk-antigravity-default') {
      return { valid: true, accountId: 'default' };
    }

    const match = this.config.apiKeys.find(k => k.key === token);
    if (match) {
      match.lastUsedAt = new Date().toISOString();
      this._saveConfig();
      return { valid: true, accountId: match.accountId };
    }

    return { valid: false };
  }
}

export const accountManager = new AccountManager();
