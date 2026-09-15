import React from 'react';

export default function QuickstartView({ onNavigate, onCopy, tunnelInfo }) {
  const isTunnelActive = tunnelInfo?.active && tunnelInfo?.cursorBaseUrl;
  const baseUrl = isTunnelActive ? tunnelInfo.cursorBaseUrl : `${window.location.origin}/v1`;

  const topModels = [
    { code: 'dominate-gemini-3.8-flash-high', label: 'Gemini 3.8 Flash High' },
    { code: 'dominate-klaude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Thinking)' },
    { code: 'dominate-gemini-pro-agent', label: 'Gemini 3.1 Pro High' }
  ];

  return (
    <div className="quickstart-view">
      <div className="section-header">
        <h2>Configure Cursor in 3 Simple Steps</h2>
        <p>Connect Cursor IDE directly to Google Antigravity models with zero setup.</p>
      </div>

      {/* Conditional Tunnel Status: Completely hidden when DISABLE_TUNNEL=true */}
      {!tunnelInfo?.disabled && tunnelInfo && (
        <div className="card" style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{ fontWeight: '600', fontSize: '0.88rem' }}>Serveo SSH Tunnel</span>
              <span className={`badge ${tunnelInfo.active ? 'badge-success' : 'badge-warning'}`}>
                {tunnelInfo.active ? 'Active' : 'Starting…'}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {tunnelInfo.active
                ? 'Public HTTPS tunnel active (bypasses Cursor\'s private-network restriction).'
                : 'Establishing public tunnel… takes 5–10 seconds.'}
            </div>
          </div>
          {tunnelInfo.active && tunnelInfo.cursorBaseUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', background: 'var(--bg-subtle)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                {tunnelInfo.cursorBaseUrl}
              </code>
              <button
                className="btn-copy"
                onClick={() => onCopy(tunnelInfo.cursorBaseUrl, 'Tunnel Cursor Base URL copied')}
              >
                Copy
              </button>
            </div>
          )}
        </div>
      )}

      <div className="steps-grid">
        {/* Step 1 */}
        <div className="step-card">
          <div className="step-number">1</div>
          <div className="step-content">
            <h3>Set Override OpenAI Base URL</h3>
            <p>
              In Cursor, open <strong>Cursor Settings &gt; Models</strong>, enable <strong>Override OpenAI Base URL</strong>, and paste the URL below:
            </p>
            <div className="code-box">
              <code>{baseUrl}</code>
              <button className="btn-copy" onClick={() => onCopy(baseUrl, 'Base URL copied to clipboard')}>
                Copy
              </button>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="step-card">
          <div className="step-number">2</div>
          <div className="step-content">
            <h3>Configure API Key</h3>
            <p>
              Generate an access key in the <strong>API Keys</strong> tab, or create one immediately.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={() => onNavigate('keys')}>
                Go to API Keys
              </button>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="step-card">
          <div className="step-number">3</div>
          <div className="step-content">
            <h3>Select or Add Models in Cursor</h3>
            <p>
              In Cursor Settings &gt; Models, add any of these model identifiers:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
              {topModels.map(m => (
                <div key={m.code} className="code-box" style={{ padding: '6px 10px' }}>
                  <span>
                    <strong>{m.code}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>— {m.label}</span>
                  </span>
                  <button className="btn-copy" onClick={() => onCopy(m.code, `Copied ${m.code}`)}>
                    Copy
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
