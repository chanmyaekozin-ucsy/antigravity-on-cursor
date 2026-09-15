import React, { useState, useEffect } from 'react';

export default function KeysView({ onCopy, showToast }) {
  const [keys, setKeys] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyAccount, setNewKeyAccount] = useState('auto');
  const [creating, setCreating] = useState(false);

  // Key generated reveal modal
  const [generatedKey, setGeneratedKey] = useState(null);

  const fetchKeys = () => {
    fetch('/api/keys')
      .then(res => res.json())
      .then(data => {
        setKeys(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchKeys();
    fetch('/api/accounts')
      .then(res => res.json())
      .then(data => setAccounts(data || []))
      .catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          accountId: newKeyAccount
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create key');

      setIsCreateOpen(false);
      setNewKeyName('');
      setGeneratedKey(data.key);
      fetchKeys();
      showToast('API Key generated successfully');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id, name) => {
    if (!confirm(`Are you sure you want to revoke key "${name}"? Applications using this key will immediately fail.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke key');
      }
      showToast('API Key revoked');
      fetchKeys();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  return (
    <div className="keys-view">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>API Keys Management</h2>
          <p>Generate secret keys to authenticate requests from Cursor IDE or other OpenAI-compatible clients.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
          + Create New Key
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
          Loading keys...
        </div>
      ) : keys.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '36px' }}>
          <div style={{ fontWeight: '600', marginBottom: '6px' }}>No API Keys Created Yet</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Create an API key to securely connect Cursor to your Antigravity models.
          </p>
          <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
            Create First Key
          </button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="classical-table">
            <thead>
              <tr>
                <th>Key Name</th>
                <th>Secret Key</th>
                <th>Account Route</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id}>
                  <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{k.name}</td>
                  <td>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{k.maskedKey}</code>
                  </td>
                  <td>
                    <span className="badge">
                      {k.accountId === 'auto' ? 'Auto-Switching' : (accounts.find(a => a.id === k.accountId)?.name || k.accountId)}
                    </span>
                  </td>
                  <td>{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-danger-outline"
                      style={{ padding: '3px 8px', fontSize: '0.74rem' }}
                      onClick={() => handleRevoke(k.id, k.name)}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Create Key */}
      {isCreateOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleCreate}>
              <div className="modal-header">
                <h3>Create API Key</h3>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}
                  onClick={() => setIsCreateOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Key Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cursor MacBook Pro"
                    className="form-control"
                    value={newKeyName}
                    onChange={e => setNewKeyName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Route to Account</label>
                  <select
                    className="form-control"
                    value={newKeyAccount}
                    onChange={e => setNewKeyAccount(e.target.value)}
                  >
                    <option value="auto">Auto-switch across healthy accounts</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Generating...' : 'Generate Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Key Generated Reveal */}
      {generatedKey && (
        <div className="modal-overlay" onClick={() => setGeneratedKey(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Save Your Secret Key</h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}
                onClick={() => setGeneratedKey(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Please copy your API key now. For your security, you will not be able to view it again.
              </p>
              <div className="code-box" style={{ marginBottom: '14px' }}>
                <code>{generatedKey}</code>
                <button className="btn-copy" onClick={() => onCopy(generatedKey, 'API Key copied!')}>
                  Copy
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setGeneratedKey(null)}>
                I have saved this key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
