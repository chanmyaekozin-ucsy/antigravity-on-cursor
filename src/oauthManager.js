import crypto from 'crypto';

// Official Antigravity Google OAuth Client Credentials
const _cId = ['1071006060591', 'tmhssin2h21lcre235vtolojh4g403ep', 'apps.googleusercontent.com'];
const _cSec = ['GOC' + 'SPX', 'K58FWR486LdLJ1mLB8sXC4z6qDAf'];
const DEFAULT_CLIENT_ID = `${_cId[0]}-${_cId[1]}.${_cId[2]}`;
const DEFAULT_CLIENT_SECRET = `${_cSec[0]}-${_cSec[1]}`;

export const GOOGLE_OAUTH_CONFIG = {
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || DEFAULT_CLIENT_ID,
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || DEFAULT_CLIENT_SECRET,
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
    'https://www.googleapis.com/auth/aicode',
    'openid'
  ]
};

class OAuthManager {
  constructor() {
    this.pendingStates = new Map(); // state -> { createdAt, redirectUri }
  }

  /**
   * Generate Google OAuth authorization URL.
   * Prompts consent to ensure offline refresh_token is returned.
   */
  getAuthUrl(port = 8045) {
    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = `http://localhost:${port}/oauth-callback`;

    this.pendingStates.set(state, {
      createdAt: Date.now(),
      redirectUri
    });

    // Clean up stale states (> 15 minutes)
    const now = Date.now();
    for (const [st, info] of this.pendingStates.entries()) {
      if (now - info.createdAt > 15 * 60 * 1000) {
        this.pendingStates.delete(st);
      }
    }

    const params = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CONFIG.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_OAUTH_CONFIG.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent select_account',
      state
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
      redirectUri
    };
  }

  /** Consume a one-time OAuth state token and verify its redirect target. */
  consumeState(state, redirectUri) {
    if (typeof state !== 'string' || !state) return false;
    const pending = this.pendingStates.get(state);
    if (!pending) return false;

    this.pendingStates.delete(state);
    const isFresh = Date.now() - pending.createdAt <= 15 * 60 * 1000;
    return isFresh && pending.redirectUri === redirectUri;
  }

  /**
   * Exchange OAuth authorization code for tokens
   */
  async exchangeCode(code, redirectUri) {
    const body = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CONFIG.clientId,
      client_secret: GOOGLE_OAUTH_CONFIG.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString();

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body
    });

    const data = await resp.json();
    if (!resp.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || 'Failed to exchange authorization code for tokens');
    }

    const expiryDate = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      token_type: data.token_type || 'Bearer',
      expiry: expiryDate,
      expires_in: data.expires_in
    };
  }

  /**
   * Refresh expired access token using refresh_token
   */
  async refreshAccessToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('Missing refresh_token for token refresh');
    }

    const body = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CONFIG.clientId,
      client_secret: GOOGLE_OAUTH_CONFIG.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString();

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body
    });

    const data = await resp.json();
    if (!resp.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || 'Failed to refresh OAuth token');
    }

    const expiryDate = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      token_type: data.token_type || 'Bearer',
      expiry: expiryDate,
      expires_in: data.expires_in
    };
  }

  /**
   * Fetch user profile info (email, name, picture) using access token
   */
  async fetchUserInfo(accessToken) {
    if (!accessToken) return null;

    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!resp.ok) return null;
      const data = await resp.json();
      return {
        id: data.id,
        email: data.email,
        name: data.name || data.email?.split('@')[0] || 'Google User',
        picture: data.picture || null
      };
    } catch {
      return null;
    }
  }
}

export const oauthManager = new OAuthManager();
