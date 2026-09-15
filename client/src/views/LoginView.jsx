import React, { useState } from 'react';
import { 
  Shield, 
  ShieldCheck, 
  Key, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  RefreshCw, 
  Cpu, 
  Server, 
  Sparkles, 
  Copy, 
  Check, 
  Lock,
  Activity,
  ExternalLink
} from 'lucide-react';

export default function LoginView({ onNavigateToDashboard, showToast }) {
  const [accessKey, setAccessKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertInfo, setAlertInfo] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const endpointSnippet = `// Cursor IDE OpenAI API Endpoint Setup
Base URL: http://localhost:8045/v1
API Key:  sk-antigravity-bridge
Model:    dominate-gemini-3.8-flash-high`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(endpointSnippet);
    setCopiedCode(true);
    if (showToast) showToast('Endpoint snippet copied to clipboard!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleGoogleLogin = async () => {
    setIsConnectingGoogle(true);
    setAlertInfo(null);
    try {
      const res = await fetch('/api/accounts/login/url');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to generate login URL');
      }
    } catch (err) {
      const msg = err.message || 'Failed to start Google OAuth flow';
      setAlertInfo({ type: 'error', text: msg });
      if (showToast) showToast(msg, true);
      setIsConnectingGoogle(false);
    }
  };

  const handleApiKeyLogin = async (e) => {
    e.preventDefault();
    setAlertInfo(null);

    const key = accessKey.trim();
    if (!key) {
      setAlertInfo({ type: 'error', text: 'Please enter an API Key or Admin Passcode.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/accounts', {
        headers: {
          'x-dashboard-key': key
        }
      });

      if (res.status === 401) {
        setAlertInfo({ type: 'error', text: 'Invalid password or credentials. Please check DASHBOARD_PASSWORD in .env.local.' });
        setIsSubmitting(false);
        return;
      }

      localStorage.setItem('antigravity_api_key', key);
      setAlertInfo({ type: 'success', text: 'Sign in successful! Redirecting to Dashboard...' });
      if (showToast) showToast('Signed in successfully');

      setTimeout(() => {
        if (onNavigateToDashboard) {
          onNavigateToDashboard();
        }
      }, 600);
    } catch (err) {
      setAlertInfo({ type: 'error', text: err.message || 'Could not verify login credentials with server.' });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="landing-container" style={{ maxWidth: '1140px', margin: '0 auto', padding: '10px 0 40px' }}>
      
      {/* HERO SECTION HEADER */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div 
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '20px',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            color: 'var(--accent-primary)',
            fontSize: '0.8rem',
            fontWeight: '600',
            marginBottom: '16px',
            letterSpacing: '0.02em'
          }}
        >
          <Sparkles size={14} />
          <span>Antigravity IDE Proxy Bridge for Cursor</span>
        </div>

        <h1 
          style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            letterSpacing: '-0.03em',
            color: '#ffffff',
            marginBottom: '14px',
            lineHeight: 1.25
          }}
        >
          Power Your Cursor IDE with{' '}
          <span 
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
          >
            Antigravity Cascade & Gemini
          </span>
        </h1>

        <p 
          style={{
            maxWidth: '680px',
            margin: '0 auto 24px',
            fontSize: '1rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.6
          }}
        >
          Seamlessly route Cursor requests to Google Antigravity backend with multi-account auto-rotation, 
          zero-downtime failover, and zero third-party service dependencies.
        </p>

        {/* FEATURE BADGES BAR */}
        <div 
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '10px',
            fontSize: '0.78rem',
            color: 'var(--text-muted)'
          }}
        >
          <span style={badgeStyle}><CheckCircle2 size={13} color="#10b981" /> Google OAuth Multi-Account</span>
          <span style={badgeStyle}><CheckCircle2 size={13} color="#10b981" /> Auto-Switch on Rate Limit</span>
          <span style={badgeStyle}><CheckCircle2 size={13} color="#10b981" /> OpenAI API Compliant</span>
          <span style={badgeStyle}><CheckCircle2 size={13} color="#10b981" /> Localhost Port 8045</span>
        </div>
      </div>

      {/* MAIN 2-COLUMN GRID */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '28px',
          alignItems: 'start'
        }}
      >
        {/* LEFT COLUMN: HERO SHOWCASE & FEATURES */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* STATS HIGHLIGHT CARDS */}
          <div 
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px'
            }}
          >
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-cyan)' }}>100%</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Local Privacy</div>
            </div>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-purple)' }}>Auto</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Failover Rotation</div>
            </div>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--success)' }}>0ms</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Token Overhead</div>
            </div>
          </div>

          {/* FEATURE SHOWCASE CARDS */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} color="var(--accent-primary)" />
              <span>Core Architecture Capabilities</span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={iconBoxStyle}>
                  <RefreshCw size={18} color="var(--accent-cyan)" />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '3px' }}>
                    Multi-Account Auto Rotation
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    When an account hits rate limits, the bridge instantly fails over to the next available account without dropping your request.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={iconBoxStyle}>
                  <Cpu size={18} color="var(--accent-purple)" />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '3px' }}>
                    Official Gemini & Claude Models
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    Access <code style={codeTagStyle}>dominate-gemini-3.8-flash-high</code> and Claude models powered directly by Google Antigravity IDE.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={iconBoxStyle}>
                  <ShieldCheck size={18} color="var(--success)" />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '3px' }}>
                    Direct OAuth Security
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    Tokens are stored strictly on your local device under <code style={codeTagStyle}>~/.gemini/accounts/</code> with zero external telemetry.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CODE ENDPOINT PREVIEW WIDGET */}
          <div className="card" style={{ padding: '20px', backgroundColor: '#0d121d' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                <Server size={15} color="var(--accent-primary)" />
                <span>Quick Cursor Setup</span>
              </div>
              <button 
                onClick={handleCopyCode}
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '0.75rem', gap: '6px', color: 'var(--text-muted)' }}
              >
                {copiedCode ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                <span>{copiedCode ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre 
              style={{
                margin: 0,
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: '#070a10',
                border: '1px solid var(--border-subtle)',
                color: '#a5b4fc',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                lineHeight: 1.5,
                overflowX: 'auto'
              }}
            >
              {endpointSnippet}
            </pre>
          </div>
        </div>

        {/* RIGHT COLUMN: AUTHENTICATION CARD */}
        <div>
          <div className="card" style={{ padding: '28px', border: '1px solid var(--border-highlight)' }}>
            
            {/* CARD HEADER */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div 
                className="brand-icon" 
                style={{
                  margin: '0 auto 14px',
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  color: 'var(--accent-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ShieldCheck size={24} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Sign In to Bridge
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Access your Antigravity dashboard, manage accounts, and monitor API keys
              </p>
            </div>

            {/* ALERT NOTIFICATION BANNERS */}
            {alertInfo && (
              <div 
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '20px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  backgroundColor: alertInfo.type === 'error' ? 'var(--danger-subtle)' : 'var(--success-subtle)',
                  border: `1px solid ${alertInfo.type === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`,
                  color: alertInfo.type === 'error' ? 'var(--danger)' : 'var(--success)'
                }}
              >
                {alertInfo.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                <span>{alertInfo.text}</span>
              </div>
            )}

            {/* GOOGLE OAUTH LOGIN BUTTON */}
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleGoogleLogin}
              disabled={isConnectingGoogle}
              style={{
                width: '100%',
                padding: '11px 16px',
                fontSize: '0.88rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                marginBottom: '20px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderColor: 'var(--border)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.41-1.57-5.13-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z"/>
                <path fill="#FBBC05" d="M3.87 10.78c-.19-.58-.3-1.2-.3-1.78s.11-1.2.3-1.78L.97 4.96C.35 6.19 0 7.56 0 9s.35 2.81.97 4.04l2.9-2.26z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0 5.48 0 2.45 2.02.97 4.96l2.9 2.26C4.59 5.05 6.62 3.58 9 3.58z"/>
              </svg>
              <span>{isConnectingGoogle ? 'Connecting to Google...' : 'Continue with Google Account'}</span>
            </button>

            {/* HAIRLINE DIVIDER */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                margin: '20px 0',
                color: 'var(--text-muted)',
                fontSize: '0.72rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase'
              }}
            >
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
              <span style={{ padding: '0 12px' }}>or sign in with key</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
            </div>

            {/* PASSCODE / API KEY FORM */}
            <form onSubmit={handleApiKeyLogin}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '500' }}>
                  API Key or Admin Passcode
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-control"
                    placeholder="Enter API key or passcode"
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    style={{ paddingRight: '40px', fontSize: '0.85rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                    title={showPassword ? 'Hide' : 'Show'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '20px',
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)'
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  <span>Remember session</span>
                </label>
                <button
                  type="button"
                  onClick={() => setAlertInfo({ type: 'info', text: 'Sign in with Google or generate an API key in the Dashboard.' })}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer' }}
                >
                  Need help?
                </button>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                style={{ width: '100%', padding: '11px', fontSize: '0.88rem', fontWeight: 600 }}
              >
                <span>Sign In to Dashboard</span>
                <ArrowRight size={16} />
              </button>
            </form>

            {/* DASHBOARD DIRECT LINK FOOTER */}
            <div 
              style={{
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.78rem'
              }}
            >
              <button
                type="button"
                onClick={onNavigateToDashboard}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-blue)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: '500'
                }}
              >
                <span>Go to Live Dashboard</span>
                <ArrowRight size={14} />
              </button>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                <span className="status-dot connected" />
                <span>Port 8045 Active</span>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* FOOTER METRICS BAR */}
      <div 
        style={{
          marginTop: '40px',
          padding: '16px 20px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          fontSize: '0.78rem',
          color: 'var(--text-muted)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={14} color="var(--success)" />
            <span>Bridge Status: <strong style={{ color: 'var(--success)' }}>Ready</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={14} color="var(--accent-purple)" />
            <span>Auth: <strong>Google OAuth 2.0</strong></span>
          </div>
        </div>
        <div>
          <span>Antigravity Proxy Bridge v2.0 • Localhost HTTP Server</span>
        </div>
      </div>

    </div>
  );
}

// AUXILIARY STYLES
const badgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '6px',
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  fontSize: '0.75rem'
};

const iconBoxStyle = {
  width: '36px',
  height: '36px',
  borderRadius: '8px',
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0
};

const codeTagStyle = {
  padding: '2px 6px',
  borderRadius: '4px',
  backgroundColor: 'rgba(99, 102, 241, 0.1)',
  color: '#a5b4fc',
  fontSize: '0.75rem',
  fontFamily: 'monospace'
};
