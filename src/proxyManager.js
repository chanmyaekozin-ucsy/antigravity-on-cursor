/**
 * proxyManager.js
 * Manages per-domain proxy routing for the Antigravity bridge.
 *
 * Philosophy:
 *  - Gemini/Google API calls  → routed through user's SOCKS5/HTTP proxy
 *  - Claude (Anthropic)       → always DIRECT (not geo-restricted)
 *  - All other traffic        → DIRECT
 *
 * Implementation: generates a PAC (Proxy Auto-Config) file served at
 * http://localhost:<PORT>/proxy.pac which macOS uses to decide per-request
 * whether to use a proxy.  No VPN client needed — just a SOCKS5 tunnel
 * (e.g. `ssh -D 1080 user@server -N`) or any HTTP proxy.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CONFIG_PATH = path.join(os.homedir(), '.gemini', 'antigravity-cursor-config.json');

// Domains that need to go through the proxy (Google AI / Cloud Code APIs)
const PROXY_DOMAINS = [
  'cloudcode-pa.googleapis.com',
  'daily-cloudcode-pa.googleapis.com',
  'generativelanguage.googleapis.com',
  'aiplatform.googleapis.com',
  'cloudaicompanion.googleapis.com',
];

// Domains that should always be DIRECT (Claude, OpenAI, local, etc.)
const BYPASS_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '::1',
  'anthropic.com',
  'api.anthropic.com',
  'openai.com',
  'api.openai.com',
];

class ProxyManager {
  constructor() {
    this._config = null;
  }

  /**
   * Load proxy config from shared antigravity config file
   */
  _loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        return data.proxy || { enabled: false, url: '', type: 'socks5' };
      }
    } catch {
      // ignore
    }
    return { enabled: false, url: '', type: 'socks5' };
  }

  /**
   * Save proxy config into the shared antigravity config file
   */
  _saveConfig(proxyConfig) {
    try {
      let data = {};
      if (fs.existsSync(CONFIG_PATH)) {
        data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      }
      data.proxy = proxyConfig;
      const dir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ProxyManager] Failed to save config:', err.message);
    }
  }

  getConfig() {
    if (!this._config) {
      this._config = this._loadConfig();
    }
    return { ...this._config };
  }

  setConfig({ enabled, url, type }) {
    const cfg = {
      enabled: Boolean(enabled),
      url: (url || '').trim(),
      type: type || 'socks5'
    };

    if (cfg.enabled && !cfg.url) {
      throw new Error('Proxy URL is required when proxy is enabled');
    }

    // Basic URL validation
    if (cfg.url) {
      const validPrefixes = ['socks5://', 'socks4://', 'http://', 'https://'];
      if (!validPrefixes.some(p => cfg.url.startsWith(p))) {
        // Auto-prefix with socks5:// if no scheme
        cfg.url = `socks5://${cfg.url}`;
      }
    }

    this._config = cfg;
    this._saveConfig(cfg);
    return cfg;
  }

  /**
   * Generate a PAC file JavaScript string.
   * The PAC file routes only Google AI API domains through the proxy.
   * Claude, localhost, and all other domains go DIRECT.
   */
  generatePAC(config) {
    const { enabled, url } = config;

    // Parse proxy URL for PAC format
    let pacProxyDirective = 'DIRECT';
    if (enabled && url) {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        const port = parsed.port || (parsed.protocol.startsWith('socks') ? '1080' : '8080');

        if (parsed.protocol.startsWith('socks5')) {
          pacProxyDirective = `SOCKS5 ${host}:${port}; SOCKS ${host}:${port}; DIRECT`;
        } else if (parsed.protocol.startsWith('socks4')) {
          pacProxyDirective = `SOCKS ${host}:${port}; DIRECT`;
        } else {
          // http/https proxy
          pacProxyDirective = `PROXY ${host}:${port}; DIRECT`;
        }
      } catch {
        pacProxyDirective = 'DIRECT';
      }
    }

    const proxyDomainsJs = PROXY_DOMAINS.map(d => `    "${d}"`).join(',\n');
    const bypassDomainsJs = BYPASS_DOMAINS.map(d => `    "${d}"`).join(',\n');

    return `// Antigravity on Cursor — PAC File
// Auto-generated. Routes only Google AI API domains through your proxy.
// Claude (Anthropic), localhost, and all other traffic goes DIRECT.
// Regenerated every server restart. Edit proxy settings in the dashboard.

function FindProxyForURL(url, host) {
  // Always bypass for localhost & loopback
  var bypassDomains = [
${bypassDomainsJs}
  ];

  for (var i = 0; i < bypassDomains.length; i++) {
    if (host === bypassDomains[i] || dnsDomainIs(host, "." + bypassDomains[i])) {
      return "DIRECT";
    }
  }

  // Route these Google AI/Cloud Code domains through the proxy
  var proxyDomains = [
${proxyDomainsJs}
  ];

  ${enabled && url ? `
  for (var j = 0; j < proxyDomains.length; j++) {
    if (host === proxyDomains[j] || dnsDomainIs(host, "." + proxyDomains[j])) {
      return "${pacProxyDirective}";
    }
  }` : '  // Proxy is currently disabled — all traffic goes DIRECT'}

  return "DIRECT";
}
`;
  }

  /**
   * Get the primary active Wi-Fi / Ethernet network service name on macOS
   */
  async _getActiveNetworkService() {
    try {
      // Try Wi-Fi first
      const { stdout } = await execAsync("networksetup -listallnetworkservices 2>/dev/null | grep -iE '(wi-fi|wifi|ethernet|thunderbolt ethernet)' | head -5");
      const services = stdout.trim().split('\n').filter(Boolean).map(s => s.trim());

      // Prefer Wi-Fi
      const wifi = services.find(s => /wi-fi/i.test(s));
      if (wifi) return wifi;

      // Fall back to first ethernet
      if (services.length > 0) return services[0];
    } catch {
      // ignore
    }
    return 'Wi-Fi';
  }

  /**
   * Apply PAC URL to macOS system proxy settings.
   * This makes only domains listed in the PAC file go through the proxy.
   * All other traffic — including Claude — remains direct.
   */
  async applyPACToMacOS(port) {
    const pacUrl = `http://127.0.0.1:${port}/proxy.pac`;
    const service = await this._getActiveNetworkService();

    try {
      // Enable auto-proxy URL (PAC file)
      execSync(`networksetup -setautoproxyurl "${service}" "${pacUrl}"`, { stdio: 'inherit' });
      execSync(`networksetup -setautoproxystate "${service}" on`, { stdio: 'inherit' });

      return {
        success: true,
        service,
        pacUrl,
        message: `PAC file applied to "${service}". Only Google AI APIs will route through your proxy.`
      };
    } catch (err) {
      throw new Error(`Failed to apply PAC: ${err.message}. Try running the command manually with sudo if needed.`);
    }
  }

  /**
   * Disable auto-proxy PAC from macOS system settings
   */
  async disablePACFromMacOS() {
    const service = await this._getActiveNetworkService();
    try {
      execSync(`networksetup -setautoproxystate "${service}" off`, { stdio: 'inherit' });
      return {
        success: true,
        service,
        message: `Auto-proxy PAC disabled on "${service}". All traffic now goes direct.`
      };
    } catch (err) {
      throw new Error(`Failed to disable PAC: ${err.message}`);
    }
  }

  /**
   * Read current macOS auto-proxy state for the active network service
   */
  async getMacOSProxyStatus() {
    const service = await this._getActiveNetworkService();
    try {
      const output = execSync(`networksetup -getautoproxyurl "${service}" 2>/dev/null`, { encoding: 'utf-8' });
      const lines = output.trim().split('\n');
      const urlLine = lines.find(l => l.startsWith('URL:'));
      const enabledLine = lines.find(l => l.startsWith('Enabled:'));

      return {
        service,
        enabled: enabledLine?.includes('Yes') || false,
        url: urlLine?.replace('URL:', '').trim() || '',
      };
    } catch {
      return { service, enabled: false, url: '' };
    }
  }
}

export const proxyManager = new ProxyManager();
