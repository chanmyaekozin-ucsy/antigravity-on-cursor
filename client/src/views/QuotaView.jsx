import React, { useState, useEffect } from 'react';

export default function QuotaView() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/accounts')
      .then(res => res.json())
      .then(accs => {
        setAccounts(accs || []);
        const active = accs?.find(a => a.isActive)?.id || accs?.[0]?.id || 'default';
        setSelectedAccountId(active);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedAccountId) return;
    setLoading(true);
    fetch(`/api/quota?accountId=${encodeURIComponent(selectedAccountId)}`)
      .then(res => res.json())
      .then(data => {
        setQuota(data);
        setLoading(false);
      })
      .catch(() => {
        setQuota(null);
        setLoading(false);
      });
  }, [selectedAccountId]);

  const modelsQuota = quota?.models || [];

  return (
    <div className="quota-view">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>Live Account Quota</h2>
          <p>Inspect live quota, token limits, and refresh schedules for each Google account.</p>
        </div>
        {accounts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Account:</span>
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: '220px' }}
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.isActive ? '• Active' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
          Loading quota details...
        </div>
      ) : !quota || modelsQuota.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '6px' }}>No Quota Data Available</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
            The selected account may not have valid OAuth tokens or has not executed any requests yet.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
          {modelsQuota.map((mq, idx) => {
            const pct = mq.percentage !== undefined ? Math.min(100, Math.max(0, mq.percentage)) : null;
            return (
              <div key={idx} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{mq.modelName || mq.name || 'AI Model'}</div>
                    <span className="badge badge-success">Active</span>
                  </div>

                  {pct !== null && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        <span>Capacity Used</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: '500' }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? 'var(--danger)' : pct > 60 ? 'var(--warning)' : 'var(--success)' }} />
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {mq.remainingRequests !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Remaining:</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: '600' }}>{mq.remainingRequests}</span>
                      </div>
                    )}
                    {mq.resetTime && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Resets:</span>
                        <span>{new Date(mq.resetTime).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
