import React, { useState, useEffect } from 'react';

export default function AccountsView({ showToast }) {
  const [accounts, setAccounts] = useState([]);
  const [autoSwitch, setAutoSwitch] = useState(true);
  const [loading, setLoading] = useState(true);

  // Modal for adding account
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addMode, setAddMode] = useState('oauth'); // 'oauth' or 'token'
  const [pastedName, setPastedName] = useState('');
  const [pastedEmail, setPastedEmail] = useState('');
  const [pastedToken, setPastedToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAccounts = () => {
    fetch('/api/accounts')
      .then(res => res.json())
      .then(data => {
        setAccounts(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchAccounts();
    fetch('/api/accounts/settings')
      .then(res => res.json())
      .then(data => {
        if (data && data.autoSwitchOnLimit !== undefined) {
          setAutoSwitch(data.autoSwitchOnLimit);
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleAutoSwitch = async (val) => {
    setAutoSwitch(val);
    try {
      await fetch('/api/accounts/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSwitchOnLimit: val })
      });
      showToast(`Auto-switch ${val ? 'enabled' : 'disabled'}`);
    } catch {
      showToast('Failed to update settings', true);
    }
  };

  const handleSetActive = async (id) => {
    try {
      const res = await fetch('/api/accounts/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id })
      });
      if (!res.ok) throw new Error('Failed to set active account');
      showToast('Active account updated');
      fetchAccounts();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const handleRemoveAccount = async (id, name, isPrimary) => {
    const confirmMsg = isPrimary
      ? 'Are you sure you want to clear credentials for the primary account? You will need to re-authenticate.'
      : `Are you sure you want to remove account "${name}"? Its credentials and isolated data will be deleted.`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove account');
      showToast(isPrimary ? 'Primary credentials cleared' : 'Account removed successfully');
      fetchAccounts();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const handleStartOAuth = async () => {
    try {
      const res = await fetch('/api/accounts/login/url');
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Failed to get login URL');

      const width = 500;
      const height = 650;
      const left = (window.innerWidth - width) / 2 + window.screenX;
      const top = (window.innerHeight - height) / 2 + window.screenY;
      const popup = window.open(
        data.url,
        'Google Login',
        `width=${width},height=${height},left=${left},top=${top},menubar=no,status=no`
      );

      const interval = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(interval);
          setIsAddOpen(false);
          fetchAccounts();
          showToast('Account connected!');
        }
      }, 1000);
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const handleManualAdd = async (e) => {
    e.preventDefault();
    if (!pastedToken.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pastedName.trim() || undefined,
          email: pastedEmail.trim() || undefined,
          tokenJson: pastedToken.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add account');
      setIsAddOpen(false);
      setPastedName('');
      setPastedEmail('');
      setPastedToken('');
      fetchAccounts();
      showToast('Google account added');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="accounts-view">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>Google Accounts &amp; Auto-Switching</h2>
          <p>Connect multiple accounts to expand quota ceilings and enable zero-downtime rate limit rotation.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}>
          + Add Google Account
        </button>
      </div>

      {/* Auto-switch Setting Card */}
      <div className="card" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: '600', fontSize: '0.92rem', marginBottom: '2px' }}>Auto-Switch on Rate Limits</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Transparently retry requests on the next healthy account whenever Google AI returns 429 quota or capacity limits.
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px', fontSize: '0.82rem', fontWeight: '500' }}>
          <input
            type="checkbox"
            checked={autoSwitch}
            onChange={e => handleToggleAutoSwitch(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
          />
          <span>{autoSwitch ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
          Loading accounts...
        </div>
      ) : accounts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '36px' }}>
          <div style={{ fontWeight: '600', marginBottom: '6px' }}>No Connected Accounts</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
            Add at least one Google account to begin making requests.
          </p>
          <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}>
            Add Account
          </button>
        </div>
      ) : (
        <div className="accounts-grid">
          {accounts.map(acc => {
            const isRateLimited = acc.isRateLimited;
            const statusBadge = isRateLimited
              ? { text: 'Rate Limited', class: 'badge-warning' }
              : acc.status === 'Connected'
              ? { text: 'Connected', class: 'badge-success' }
              : acc.status === 'Missing Token'
              ? { text: 'Missing Token', class: 'badge-danger' }
              : { text: acc.status || 'Active', class: 'badge' };

            const canRemove = !acc.isDefault;
            const canClear = acc.isDefault && (acc.email || (acc.status && acc.status !== 'Missing Token'));

            return (
              <div key={acc.id} className={`account-card ${acc.isActive ? 'active' : ''}`}>
                <div>
                  <div className="account-card-top">
                    <span className={`badge ${acc.isActive ? 'badge-blue' : ''}`}>
                      {acc.isActive ? '● Active in Cursor' : 'Inactive'}
                    </span>
                    <span className={`badge ${statusBadge.class}`}>{statusBadge.text}</span>
                  </div>
                  <div style={{ fontWeight: '600', fontSize: '0.92rem', marginBottom: '2px' }}>{acc.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    {acc.email || (acc.isDefault ? 'Primary Antigravity Profile' : 'Secondary Account')}
                  </div>
                </div>

                <div className="account-card-bottom">
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                    {acc.expiry ? `Expires: ${new Date(acc.expiry).toLocaleDateString()}` : acc.isDefault ? 'Managed Locally' : 'Active Token'}
                  </span>
                  <div className="account-actions">
                    {!acc.isActive ? (
                      <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => handleSetActive(acc.id)}>
                        Set Active
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--accent-blue)', padding: '0 4px' }}>
                        Selected
                      </span>
                    )}

                    {canRemove && (
                      <button
                        className="btn btn-danger-outline"
                        style={{ padding: '4px 8px', fontSize: '0.76rem' }}
                        title="Remove this account"
                        onClick={() => handleRemoveAccount(acc.id, acc.name, false)}
                      >
                        Remove
                      </button>
                    )}

                    {canClear && (
                      <button
                        className="btn btn-danger-outline"
                        style={{ padding: '4px 8px', fontSize: '0.76rem' }}
                        title="Clear primary account credentials"
                        onClick={() => handleRemoveAccount(acc.id, acc.name, true)}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Add Account */}
      {isAddOpen && (
        <div className="modal-overlay" onClick={() => setIsAddOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Connect Google Account</h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}
                onClick={() => setIsAddOpen(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
              <button
                type="button"
                style={{
                  flex: 1,
                  padding: '10px',
                  background: 'none',
                  border: 'none',
                  borderBottom: addMode === 'oauth' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  fontWeight: addMode === 'oauth' ? '600' : '400',
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
                onClick={() => setAddMode('oauth')}
              >
                Sign in with Google
              </button>
              <button
                type="button"
                style={{
                  flex: 1,
                  padding: '10px',
                  background: 'none',
                  border: 'none',
                  borderBottom: addMode === 'token' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  fontWeight: addMode === 'token' ? '600' : '400',
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
                onClick={() => setAddMode('token')}
              >
                Manual Token Paste
              </button>
            </div>

            <div className="modal-body">
              {addMode === 'oauth' ? (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '18px' }}>
                    Open a secure Google OAuth popup to authorize this bridge directly.
                  </p>
                  <button className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '0.88rem' }} onClick={handleStartOAuth}>
                    Sign in with Google Account
                  </button>
                </div>
              ) : (
                <form onSubmit={handleManualAdd}>
                  <div className="form-group">
                    <label className="form-label">Profile Label (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Work Google Account"
                      className="form-control"
                      value={pastedName}
                      onChange={e => setPastedName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email (Optional)</label>
                    <input
                      type="email"
                      placeholder="user@gmail.com"
                      className="form-control"
                      value={pastedEmail}
                      onChange={e => setPastedEmail(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Token JSON or ya29 Access Token</label>
                    <textarea
                      required
                      rows={4}
                      placeholder='{"access_token": "ya29...", "refresh_token": "..."}'
                      className="form-control"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
                      value={pastedToken}
                      onChange={e => setPastedToken(e.target.value)}
                    />
                  </div>
                  <div className="modal-footer" style={{ margin: '20px -20px -20px', borderRadius: '0 0 var(--radius-md) var(--radius-md)' }}>
                    <button type="button" className="btn btn-outline" onClick={() => setIsAddOpen(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? 'Adding...' : 'Add Account'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
