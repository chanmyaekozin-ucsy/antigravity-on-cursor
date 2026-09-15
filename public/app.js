// Antigravity on Cursor Dashboard Logic

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initCopyButtons();
  initModals();
  initProxy();
  initTunnelPanel();
  
  // Initial data loading
  fetchStatus();
  fetchModels();
  fetchQuota();
  fetchKeys();
  fetchAccounts();
  fetchProxy();

  // Poll status and quota periodically
  setInterval(fetchStatus, 8000);
  setInterval(fetchQuota, 30000);
});

/* ==========================================
   Cloudflare Tunnel Panel
========================================== */
function initTunnelPanel() {
  // Wire up tunnel copy button
  document.getElementById('btn-copy-tunnel-url')?.addEventListener('click', () => {
    const url = document.getElementById('tunnel-public-url')?.textContent;
    if (url && url.startsWith('https://')) {
      navigator.clipboard.writeText(url).then(() => showToast('Tunnel URL copied!'));
    }
  });

  // Start polling tunnel status
  pollTunnel();
}

let _tunnelReady = false;

async function pollTunnel() {
  try {
    const res = await fetch('/api/tunnel');
    const data = await res.json();
    updateTunnelUI(data);
    if (!data.active) {
      // Keep polling until ready
      setTimeout(pollTunnel, 3000);
    } else {
      // Poll slower once live (detect restarts)
      setTimeout(pollTunnel, 15000);
    }
  } catch {
    setTimeout(pollTunnel, 5000);
  }
}

function updateTunnelUI(data) {
  const badge   = document.getElementById('tunnel-status-badge');
  const waiting = document.getElementById('tunnel-waiting');
  const ready   = document.getElementById('tunnel-ready');
  const errEl   = document.getElementById('tunnel-error');
  const urlEl   = document.getElementById('tunnel-public-url');
  const step1   = document.getElementById('code-base-url');
  const banner  = document.getElementById('tunnel-banner');

  if (data.active && data.cursorBaseUrl) {
    // READY
    if (badge)   { badge.textContent = 'Live ✓'; badge.className = 'tunnel-status-badge tunnel-badge-live'; }
    if (waiting) waiting.style.display = 'none';
    if (errEl)   errEl.style.display = 'none';
    if (ready)   ready.style.display = 'block';
    if (urlEl)   urlEl.textContent = data.cursorBaseUrl;
    if (step1)   step1.textContent = data.cursorBaseUrl;
    if (banner)  banner.classList.add('tunnel-banner-live');
    _tunnelReady = true;
  } else if (!data.active && _tunnelReady) {
    // Was live, now offline (restart scenario)
    if (badge)   { badge.textContent = 'Reconnecting…'; badge.className = 'tunnel-status-badge tunnel-badge-warn'; }
    if (waiting) waiting.style.display = 'flex';
    if (ready)   ready.style.display = 'none';
    if (errEl)   errEl.style.display = 'none';
    if (banner)  banner.classList.remove('tunnel-banner-live');
    _tunnelReady = false;
  } else if (!data.active) {
    // Still starting up
    if (badge) { badge.textContent = 'Starting…'; badge.className = 'tunnel-status-badge'; }
  }
}

/* ==========================================
   Tab Navigation
========================================== */
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');

      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const targetEl = document.getElementById(`tab-${targetId}`);
      if (targetEl) targetEl.classList.add('active');

      // Refresh data on tab click
      if (targetId === 'quota') fetchQuota();
      if (targetId === 'keys') fetchKeys();
      if (targetId === 'accounts') fetchAccounts();
    });
  });
}

/* ==========================================
   Copy to Clipboard & Toast
========================================== */
function initCopyButtons() {
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-btn');
    if (!copyBtn) return;

    let textToCopy = '';
    const targetId = copyBtn.getAttribute('data-copy-target');
    const directText = copyBtn.getAttribute('data-copy-text');

    if (directText) {
      textToCopy = directText;
    } else if (targetId) {
      const targetEl = document.getElementById(targetId);
      if (targetEl) textToCopy = targetEl.textContent.trim();
    }

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast(`Copied "${textToCopy}" to clipboard!`);
        copyBtn.classList.add('copied');
        const origHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Copied!
        `;
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = origHtml;
        }, 1800);
      });
    }
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

/* ==========================================
   Status Polling
========================================== */
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const pill = document.getElementById('connection-status-pill');
    const label = document.getElementById('connection-status-label');

    if (data.connected) {
      pill.classList.add('connected');
      label.textContent = `Connected (Port ${data.serverUrl ? new URL(data.serverUrl).port : 56711})`;
    } else {
      pill.classList.remove('connected');
      label.textContent = 'Waiting for Antigravity...';
    }

    // Update Auth guard indicator
    const authPill = document.getElementById('auth-status-pill');
    const authLabel = document.getElementById('auth-status-label');
    if (authPill && authLabel) {
      if (data.auth && data.auth.enabled) {
        authPill.style.display = 'inline-flex';
        authLabel.textContent = `Guarded (${data.auth.username})`;
        authPill.title = `Dashboard protected with HTTP Basic Auth. Logged in as ${data.auth.username}.`;
      } else {
        authPill.style.display = 'none';
      }
    }

    // Update base url code box
    const codeBaseUrl = document.getElementById('code-base-url');
    if (codeBaseUrl && data.baseUrl) {
      codeBaseUrl.textContent = data.baseUrl;
    }
  } catch {
    const pill = document.getElementById('connection-status-pill');
    const label = document.getElementById('connection-status-label');
    pill.classList.remove('connected');
    label.textContent = 'Bridge Disconnected';
  }
}

/* ==========================================
   Model Catalog
========================================== */
async function fetchModels() {
  const container = document.getElementById('models-list-container');
  try {
    const res = await fetch('/api/models');
    const models = await res.json();

    if (!models || models.length === 0) {
      container.innerHTML = '<div class="loader-state">No models found</div>';
      return;
    }

    container.innerHTML = models.map(m => {
      const tagClass = m.category === 'claude' ? 'claude' : m.category === 'gpt' ? 'gpt' : 'gemini';
      const tagLabel = m.category === 'claude' ? 'Claude' : m.category === 'gpt' ? 'GPT' : 'Gemini';

      return `
        <div class="model-card">
          <div>
            <div class="model-card-header">
              <span class="model-tag ${tagClass}">${tagLabel}</span>
              ${m.isRecommended ? '<span class="badge" style="background: rgba(16,185,129,0.15); color: #34d399;">Recommended</span>' : ''}
            </div>
            <div class="model-title">${escapeHtml(m.name)}</div>
            <div class="model-desc">${escapeHtml(m.description || '')}</div>
          </div>
          <div class="model-copy-bar">
            <span>${escapeHtml(m.id)}</span>
            <button class="copy-btn" data-copy-text="${escapeHtml(m.id)}" title="Copy model name for Cursor">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="loader-state" style="color: var(--danger);">Failed to load models: ${err.message}</div>`;
  }
}

/* ==========================================
   Live Quota
========================================== */
let currentQuotaAccountId = null;

async function fetchQuota(targetAccountId = null) {
  const wrapper = document.getElementById('quota-groups-wrapper');
  const subtitleEl = document.getElementById('quota-subtitle');
  const badgeEl = document.getElementById('quota-account-badge');
  const selectEl = document.getElementById('quota-account-select');

  // 1. Resolve accounts and which account we are viewing
  let activeId = 'default';
  let allAccounts = [];
  try {
    const [settingsRes, accsRes] = await Promise.all([
      fetch('/api/accounts/settings').catch(() => null),
      fetch('/api/accounts').catch(() => null)
    ]);
    if (settingsRes && settingsRes.ok) {
      const settings = await settingsRes.json();
      activeId = settings.activeAccountId || 'default';
    }
    if (accsRes && accsRes.ok) {
      allAccounts = await accsRes.json();
    }
  } catch {}

  const resolvedId = targetAccountId || currentQuotaAccountId || activeId;
  currentQuotaAccountId = resolvedId;

  // 2. Populate dropdown if present
  if (selectEl && allAccounts.length > 0) {
    selectEl.innerHTML = allAccounts.map(a => {
      const activeTag = a.id === activeId ? ' [Active]' : '';
      const emailTag = a.email ? ` (${a.email})` : '';
      return `<option value="${escapeHtml(a.id)}" ${a.id === resolvedId ? 'selected' : ''}>${escapeHtml(a.name)}${escapeHtml(emailTag)}${activeTag}</option>`;
    }).join('');
    if (!selectEl.dataset.hasListener) {
      selectEl.dataset.hasListener = 'true';
      selectEl.addEventListener('change', (e) => {
        fetchQuota(e.target.value);
      });
    }
  }

  // 3. Update Badge
  const viewingAcc = allAccounts.find(a => a.id === resolvedId);
  if (badgeEl) {
    if (viewingAcc) {
      const isAct = viewingAcc.id === activeId;
      const label = viewingAcc.email
        ? `${escapeHtml(viewingAcc.name)} &lt;${escapeHtml(viewingAcc.email)}&gt;${isAct ? ' (Active)' : ''}`
        : `${escapeHtml(viewingAcc.name)}${isAct ? ' (Active)' : ''}`;
      badgeEl.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        ${label}
      `;
      badgeEl.style.display = 'inline-flex';
    } else {
      badgeEl.style.display = 'none';
    }
  }
  if (subtitleEl) {
    subtitleEl.textContent = 'Real-time quota monitoring from your Google Account backend.';
  }

  // 4. Fetch live quota for the specific account
  try {
    const res = await fetch(`/api/quota?accountId=${encodeURIComponent(resolvedId)}`);
    const quota = await res.json();

    if (!quota || !quota.groups || quota.groups.length === 0) {
      wrapper.innerHTML = '<div class="loader-state">No quota telemetry available for this account</div>';
      return;
    }

    wrapper.innerHTML = quota.groups.map(group => {
      const bucketsHtml = (group.buckets || []).map(b => {
        const percent = Math.round((b.remainingFraction || 0) * 100);
        const resetDate = b.resetTime ? new Date(b.resetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown';

        let color = 'var(--success)';
        if (percent < 20) color = 'var(--danger)';
        else if (percent < 50) color = 'var(--warning)';

        return `
          <div class="quota-bucket-card">
            <div class="bucket-top">
              <span class="bucket-name">${escapeHtml(b.displayName || b.bucketId)}</span>
              <span class="bucket-percent" style="color: ${color};">${percent}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${percent}%; background: ${color};"></div>
            </div>
            <div class="bucket-meta">
              <span>Window: ${escapeHtml(b.window || 'standard')}</span>
              <span>Refreshes at ${resetDate}</span>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="quota-group">
          <div class="quota-group-header">
            <h3>${escapeHtml(group.displayName)}</h3>
            <p>${escapeHtml(group.description || '')}</p>
          </div>
          <div class="quota-buckets-grid">
            ${bucketsHtml}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    wrapper.innerHTML = `<div class="loader-state" style="color: var(--danger);">Failed to fetch quota: ${err.message}</div>`;
  }
}

document.getElementById('btn-refresh-quota')?.addEventListener('click', () => {
  fetchQuota(currentQuotaAccountId);
  showToast('Refreshed quota data');
});

/* ==========================================
   API Keys
========================================== */
function formatLastUsed(dateStr) {
  if (!dateStr) return '<span style="color: var(--text-muted); font-size: 0.8rem;">Never</span>';
  const d = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);

  if (diffSec < 60) return '<span style="color: #15803d; font-weight: 600; font-size: 0.8rem;">● Just now</span>';
  if (diffSec < 3600) return `<span style="color: #15803d; font-size: 0.8rem;">● ${Math.max(1, Math.floor(diffSec / 60))}m ago</span>`;
  if (diffSec < 86400) return `<span style="font-size: 0.8rem; color: var(--text-secondary);">${Math.floor(diffSec / 3600)}h ago</span>`;

  return `<span style="font-size: 0.8rem; color: var(--text-secondary);">${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
}

async function fetchKeys() {
  const tbody = document.getElementById('keys-table-body');
  try {
    const res = await fetch('/api/keys');
    const keys = await res.json();

    if (!keys || keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="loader-state">No API keys generated yet. Click "+ Create New API Key" above.</td></tr>';
      return;
    }

    tbody.innerHTML = keys.map(k => {
      const created = new Date(k.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const displayKey = k.maskedKey || 'sk-••••••••';

      return `
        <tr>
          <td><strong>${escapeHtml(k.name)}</strong></td>
          <td><code class="key-code">${escapeHtml(displayKey)}</code></td>
          <td><span class="badge" style="background: var(--bg-subtle); color: var(--text-secondary); border: 1px solid var(--border-color);">${escapeHtml(k.accountId || 'default')}</span></td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${created}</td>
          <td>${formatLastUsed(k.lastUsedAt)}</td>
          <td>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="badge" style="background: var(--bg-subtle); color: var(--text-muted); border: 1px solid var(--border-color); font-size: 0.72rem; padding: 3px 8px;">Key Saved</span>
              <button class="btn btn-danger-outline btn-delete-key" data-key-id="${escapeHtml(k.id)}" title="Revoke API key">Revoke</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach delete handlers
    document.querySelectorAll('.btn-delete-key').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-key-id');
        if (confirm('Are you sure you want to revoke this API key? Applications using it will be rejected.')) {
          await fetch(`/api/keys/${id}`, { method: 'DELETE' });
          fetchKeys();
          showToast('API Key revoked');
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="loader-state" style="color: var(--danger);">Failed to load keys: ${err.message}</td></tr>`;
  }
}

/* ==========================================
   Google Accounts
========================================== */
async function fetchAccounts() {
  const wrapper = document.getElementById('accounts-list-wrapper');
  try {
    const res = await fetch('/api/accounts');
    const accounts = await res.json();

    wrapper.innerHTML = accounts.map(acc => {
      return `
        <div class="account-card ${acc.isActive ? 'active-account' : ''}">
          <div>
            <div class="account-card-top">
              <span class="badge" style="${acc.isActive ? 'background: rgba(99,102,241,0.2); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.4);' : 'background: rgba(255,255,255,0.05); color: var(--text-dim);'}">
                ${acc.isActive ? '● Active in Cursor' : 'Inactive'}
              </span>
              <span class="badge" style="background: rgba(16,185,129,0.15); color: #34d399;">${escapeHtml(acc.status)}</span>
            </div>
            <div class="account-name">${escapeHtml(acc.name)}</div>
            <div class="account-email">${escapeHtml(acc.email || (acc.isDefault ? 'Primary Antigravity Profile' : 'Secondary Token'))}</div>
          </div>
          <div class="account-card-bottom">
            <span style="font-size: 0.78rem; color: var(--text-dim);">
              ${acc.expiry ? `Expires: ${new Date(acc.expiry).toLocaleDateString()}` : 'Managed by Antigravity'}
            </span>
            ${!acc.isActive ? `<button class="btn btn-outline btn-set-active" data-account-id="${escapeHtml(acc.id)}">Set Active</button>` : '<span style="font-size: 0.8rem; font-weight: 600; color: #a5b4fc;">Selected</span>'}
          </div>
        </div>
      `;
    }).join('');

    // Update account selector in create key modal
    const select = document.getElementById('select-key-account');
    if (select) {
      select.innerHTML = accounts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
    }

    // Attach active switchers
    document.querySelectorAll('.btn-set-active').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-account-id');
        btn.disabled = true;
        btn.textContent = 'Switching...';
        try {
          await fetch('/api/accounts/active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: id })
          });
          currentQuotaAccountId = id;
          await fetchAccounts();
          fetchQuota(id);
          fetchModels();
          showToast('Active account switched');
        } catch (err) {
          showToast(`Error: ${err.message}`, true);
        }
      });
    });
  } catch (err) {
    wrapper.innerHTML = `<div class="loader-state" style="color: var(--danger);">Failed to load accounts: ${err.message}</div>`;
  }
}

/* ==========================================
   Modals
========================================== */
function initModals() {
  // Modal 1: Create Key
  const modalKey = document.getElementById('modal-create-key');
  document.getElementById('btn-open-create-key')?.addEventListener('click', () => modalKey.classList.add('open'));
  document.getElementById('btn-close-modal-key')?.addEventListener('click', () => modalKey.classList.remove('open'));
  document.getElementById('btn-cancel-modal-key')?.addEventListener('click', () => modalKey.classList.remove('open'));

  // Modal 2: Key Generated (Shown ONLY Once)
  const modalGen = document.getElementById('modal-key-generated');
  const displayGenKey = document.getElementById('display-generated-key');
  const btnCopyGenKey = document.getElementById('btn-copy-generated-key');
  const btnCloseGen = document.getElementById('btn-close-modal-generated');
  const btnDoneGen = document.getElementById('btn-done-key-generated');

  function dismissGeneratedKeyModal() {
    if (modalGen) modalGen.classList.remove('open');
    // Security: wipe the secret key from memory and DOM immediately
    if (displayGenKey) displayGenKey.textContent = '••••••••••••••••••••';
    if (btnCopyGenKey) {
      btnCopyGenKey.removeAttribute('data-copy-text');
    }
  }

  btnCloseGen?.addEventListener('click', dismissGeneratedKeyModal);
  btnDoneGen?.addEventListener('click', dismissGeneratedKeyModal);

  document.getElementById('btn-submit-create-key')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('input-key-name');
    const accSelect = document.getElementById('select-key-account');

    const name = nameInput.value.trim();
    const accountId = accSelect.value;

    if (!name) {
      alert('Please enter a name for the key');
      return;
    }

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, accountId })
      });
      const data = await res.json();
      modalKey.classList.remove('open');
      nameInput.value = '';

      if (data.secretKey) {
        if (displayGenKey) displayGenKey.textContent = data.secretKey;
        if (btnCopyGenKey) btnCopyGenKey.setAttribute('data-copy-text', data.secretKey);
        if (modalGen) modalGen.classList.add('open');
      }

      fetchKeys();
      showToast('API Key generated! Save your secret key.');
    } catch (err) {
      alert('Failed to create key: ' + err.message);
    }
  });

  // Auto-switch toggle listener
  document.getElementById('toggle-auto-switch')?.addEventListener('change', async (e) => {
    try {
      await fetch('/api/accounts/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSwitchOnLimit: e.target.checked })
      });
      showToast(e.target.checked ? 'Auto-switching enabled' : 'Auto-switching disabled');
    } catch (err) {
      console.error(err);
    }
  });

  // 1-Click Sign in with Google Button
  document.getElementById('btn-google-oauth-login')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/accounts/login/url');
      const data = await res.json();
      if (!data.url) throw new Error('Failed to get authorization URL');

      const width = 520;
      const height = 680;
      const left = Math.max(0, (window.screen.width - width) / 2);
      const top = Math.max(0, (window.screen.height - height) / 2);

      const authWindow = window.open(
        data.url,
        'google_oauth_popup',
        `width=${width},height=${height},top=${top},left=${left},status=no,menubar=no,toolbar=no`
      );

      // Poll accounts while auth window is open
      const pollTimer = setInterval(() => {
        if (!authWindow || authWindow.closed) {
          clearInterval(pollTimer);
          fetchAccounts();
        }
      }, 1500);

    } catch (err) {
      alert('Error initiating Google Login: ' + err.message);
    }
  });

  // Window message listener for completed OAuth popup
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'GOOGLE_ACCOUNT_ADDED') {
      const modalAcc = document.getElementById('modal-add-account');
      if (modalAcc) modalAcc.classList.remove('open');
      fetchAccounts();
      showToast('Google Account added: ' + (e.data.email || 'Success'));
    }
  });

  // Modal 3: Add Account
  const modalAcc = document.getElementById('modal-add-account');
  document.getElementById('btn-open-add-account')?.addEventListener('click', () => modalAcc.classList.add('open'));
  document.getElementById('btn-close-modal-acc')?.addEventListener('click', () => modalAcc.classList.remove('open'));
  document.getElementById('btn-cancel-modal-acc')?.addEventListener('click', () => modalAcc.classList.remove('open'));

  document.getElementById('btn-submit-add-account')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('input-acc-name');
    const emailInput = document.getElementById('input-acc-email');
    const tokenInput = document.getElementById('input-acc-token');

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const tokenJson = tokenInput.value.trim();

    if (!tokenJson) {
      alert('Please paste the JSON token');
      return;
    }

    try {
      await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, tokenJson })
      });
      modalAcc.classList.remove('open');
      nameInput.value = '';
      emailInput.value = '';
      tokenInput.value = '';
      fetchAccounts();
      showToast('Account added successfully');
    } catch (err) {
      alert('Failed to add account: ' + err.message);
    }
  });

  // Close modals when clicking backdrop
  [modalKey, modalGen, modalAcc].forEach(m => {
    m?.addEventListener('click', (e) => {
      if (e.target === m) {
        if (m === modalGen) {
          dismissGeneratedKeyModal();
        } else {
          m.classList.remove('open');
        }
      }
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ==========================================
   Network & Proxy Tab
========================================== */
async function fetchProxy() {
  try {
    const res = await fetch('/api/proxy');
    const cfg = await res.json();
    applyProxyConfigToUI(cfg);
  } catch {
    // Ignore
  }

  // Also check macOS PAC status
  try {
    const res = await fetch('/api/proxy/status');
    const status = await res.json();
    updatePACStatusUI(status);
  } catch {
    // Ignore
  }
}

function applyProxyConfigToUI(cfg) {
  const toggle = document.getElementById('proxy-enabled-toggle');
  const urlInput = document.getElementById('proxy-url-input');
  if (toggle) toggle.checked = Boolean(cfg.enabled);
  if (urlInput) urlInput.value = cfg.url || '';
}

function updatePACStatusUI(status) {
  const el = document.getElementById('pac-macos-status');
  const text = document.getElementById('pac-status-text');
  if (!el || !text) return;
  if (status.enabled) {
    el.classList.add('active');
    text.textContent = `Active on ${status.service}`;
  } else {
    el.classList.remove('active');
    text.textContent = `Inactive (${status.service})`;
  }
}

function initProxy() {
  // Save proxy settings
  document.getElementById('btn-save-proxy')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-proxy');
    const enabled = document.getElementById('proxy-enabled-toggle')?.checked || false;
    const url = document.getElementById('proxy-url-input')?.value?.trim() || '';

    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const res = await fetch('/api/proxy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, url })
      });
      if (!res.ok) {
        const err = await res.json();
        showToast('Error: ' + (err.error || 'Save failed'), 'error');
      } else {
        showToast('Proxy settings saved!');
        // Refresh PAC status
        await fetchProxy();
      }
    } catch (e) {
      showToast('Network error: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save Proxy Settings';
    }
  });

  // Apply PAC to macOS
  document.getElementById('btn-apply-pac')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-apply-pac');
    btn.disabled = true;
    btn.textContent = 'Applying...';
    try {
      const res = await fetch('/api/proxy/apply-pac', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'PAC applied to macOS!');
        await fetchProxy();
      } else {
        showToast('Error: ' + (data.error || 'Apply failed'), 'error');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Apply PAC to macOS';
    }
  });

  // Remove PAC from macOS
  document.getElementById('btn-disable-pac')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-disable-pac');
    btn.disabled = true;
    btn.textContent = 'Removing...';
    try {
      const res = await fetch('/api/proxy/disable-pac', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'PAC removed from macOS.');
        await fetchProxy();
      } else {
        showToast('Error: ' + (data.error || 'Remove failed'), 'error');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Remove PAC';
    }
  });
}

/* showToast supports optional type: 'error' */
const _origShowToast = window.showToast;
if (!window._proxyToastPatched) {
  window._proxyToastPatched = true;
}

