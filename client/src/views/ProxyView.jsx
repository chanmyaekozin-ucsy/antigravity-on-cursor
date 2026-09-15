import React, { useState, useEffect } from 'react';

export default function ProxyView({ showToast }) {
  const [proxy, setProxy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const fetchProxy = () => {
    fetch('/api/proxy')
      .then(res => res.json())
      .then(data => {
        setProxy(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchProxy();
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/proxy/test', { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        showToast(`Proxy online (${data.latencyMs}ms)`);
      } else {
        showToast(data.error || 'Proxy connection test failed', true);
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message });
      showToast(err.message, true);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="proxy-view">
      <div className="section-header">
        <h2>Network &amp; Upstream Proxy</h2>
        <p>Route only Google AI APIs through your proxy. Claude, Anthropic, and other traffic always stays direct.</p>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ fontWeight: '600', fontSize: '0.92rem', marginBottom: '8px' }}>Selective Route Architecture</div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Only Google endpoints (<code style={{ fontFamily: 'var(--font-mono)' }}>*.googleapis.com</code>) route through your configured proxy. All Anthropic Claude requests, local traffic, and telemetry bypass the proxy directly to prevent latency degradation.
        </p>

        <div className="table-wrapper">
          <table className="classical-table">
            <thead>
              <tr>
                <th>Traffic Destination</th>
                <th>Routing Target</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: '500' }}>Google Cloud Code / Gemini APIs</td>
                <td><code>*.googleapis.com</code></td>
                <td>
                  <span className="badge badge-blue">Proxied via Tunnel / PAC</span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: '500' }}>Claude / Anthropic Engine</td>
                <td><code>api.anthropic.com</code></td>
                <td>
                  <span className="badge badge-success">Direct (Zero Latency)</span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: '500' }}>Local Cursor IDE Bridge</td>
                <td><code>localhost / 127.0.0.1</code></td>
                <td>
                  <span className="badge">Direct</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontWeight: '600', fontSize: '0.92rem', marginBottom: '2px' }}>Proxy Connection Status</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {proxy?.enabled ? `Active: ${proxy.host || 'Configured via PAC / System'}` : 'Direct connection (No upstream proxy configured)'}
            </div>
          </div>
          <button className="btn btn-outline" disabled={testing} onClick={handleTest}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {testResult && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              backgroundColor: testResult.success ? 'var(--success-subtle)' : 'var(--danger-subtle)',
              border: `1px solid ${testResult.success ? 'var(--success-border)' : 'var(--danger-border)'}`,
              color: testResult.success ? 'var(--success)' : 'var(--danger)'
            }}
          >
            {testResult.success
              ? `✓ Connection successful! Upstream response in ${testResult.latencyMs}ms.`
              : `✕ Connection error: ${testResult.error || 'Failed to reach Google Cloud Code API'}`}
          </div>
        )}
      </div>
    </div>
  );
}
