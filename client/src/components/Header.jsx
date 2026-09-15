import React from 'react';

export default function Header({ status }) {
  const isConnected = status?.connected;
  const statusLabel = isConnected
    ? 'Bridge Connected'
    : status?.serverUrl
    ? 'Connecting...'
    : 'Bridge Disconnected';

  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <div>
          <div className="brand-title">Antigravity Bridge</div>
          <div className="brand-subtitle">Cursor IDE Model Proxy &amp; Account Orchestrator</div>
        </div>
      </div>

      <div className="header-status-badge">
        <span className={`status-dot ${isConnected ? 'connected' : 'error'}`} />
        <span>{statusLabel}</span>
      </div>
    </header>
  );
}
