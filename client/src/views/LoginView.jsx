import React, { useState } from 'react';
import { ShieldCheck, Key, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

export default function LoginView({ onNavigateToDashboard, showToast }) {
  const [accessKey, setAccessKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertInfo, setAlertInfo] = useState(null);

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

  const handleApiKeyLogin = (e) => {
    e.preventDefault();
    setAlertInfo(null);

    if (!accessKey.trim()) {
      setAlertInfo({ type: 'error', text: 'Please enter an API Key or Admin Passcode.' });
      return;
    }

    setIsSubmitting(true);
    try {
      localStorage.setItem('antigravity_api_key', accessKey.trim());
      setAlertInfo({ type: 'success', text: 'Sign in successful. Redirecting...' });
      if (showToast) showToast('Signed in successfully');

      setTimeout(() => {
        if (onNavigateToDashboard) {
          onNavigateToDashboard();
        }
      }, 600);
    } catch (err) {
      setAlertInfo({ type: 'error', text: 'Could not store session.' });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper" style={{ maxWidth: '420px', margin: '30px auto 0' }}>
      <div className="card">
        {/* Header Section */}
        <div className="section-header" style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div 
            className="brand-icon" 
            style={{ margin: '0 auto 14px', width: '42px', height: '42px', borderRadius: 'var(--radius-md)' }}
          >
            <ShieldCheck size={22} />
          </div>
          <h2>Sign In to Bridge</h2>
          <p>Access your Antigravity proxy dashboard, Google accounts, and API keys</p>
        </div>

        {/* Alert Notification */}
        {alertInfo && (
          <div 
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '18px',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: alertInfo.type === 'error' ? 'var(--danger-subtle)' : 'var(--success-subtle)',
              border: `1px solid ${alertInfo.type === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`,
              color: alertInfo.type === 'error' ? 'var(--danger)' : 'var(--success)'
            }}
          >
            {alertInfo.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{alertInfo.text}</span>
          </div>
        )}

        {/* Google OAuth Login Button */}
        <button
          type="button"
          className="btn btn-outline"
          onClick={handleGoogleLogin}
          disabled={isConnectingGoogle}
          style={{
            width: '100%',
            padding: '10px 14px',
            fontSize: '0.85rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            marginBottom: '18px'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.41-1.57-5.13-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z"/>
            <path fill="#FBBC05" d="M3.87 10.78c-.19-.58-.3-1.2-.3-1.78s.11-1.2.3-1.78L.97 4.96C.35 6.19 0 7.56 0 9s.35 2.81.97 4.04l2.9-2.26z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0 5.48 0 2.45 2.02.97 4.96l2.9 2.26C4.59 5.05 6.62 3.58 9 3.58z"/>
          </svg>
          <span>{isConnectingGoogle ? 'Connecting to Google...' : 'Continue with Google Account'}</span>
        </button>

        {/* Hairline Divider */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '18px 0',
            color: 'var(--text-muted)',
            fontSize: '0.72rem',
            letterSpacing: '0.04em',
            textTransform: 'uppercase'
          }}
        >
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
          <span style={{ padding: '0 10px' }}>or sign in with key</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
        </div>

        {/* Passcode / API Key Form */}
        <form onSubmit={handleApiKeyLogin}>
          <div className="form-group">
            <label className="form-label">API Key or Passcode</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                placeholder="Enter API key or passcode"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                style={{ paddingRight: '36px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '8px',
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
              marginBottom: '18px',
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
              onClick={() => setAlertInfo({ type: 'info', text: 'Enter an API key from the API Keys tab or connect via Google.' })}
              style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.78rem' }}
            >
              Need help?
            </button>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
            style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }}
          >
            <span>Sign In to Dashboard</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Footer Link */}
        <div 
          style={{
            marginTop: '22px',
            paddingTop: '14px',
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
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <ArrowLeft size={14} />
            <span>Back to Dashboard</span>
          </button>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
            <span className="status-dot connected" />
            <span>Bridge Online</span>
          </div>
        </div>
      </div>
    </div>
  );
}
