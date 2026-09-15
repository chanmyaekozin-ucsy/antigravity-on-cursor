import React, { useState, useEffect } from 'react';
import Header from './components/Header.jsx';
import TabNav from './components/TabNav.jsx';
import Toast from './components/Toast.jsx';
import QuickstartView from './views/QuickstartView.jsx';
import ModelsView from './views/ModelsView.jsx';
import KeysView from './views/KeysView.jsx';
import AccountsView from './views/AccountsView.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('quickstart');
  const [status, setStatus] = useState(null);
  const [tunnelInfo, setTunnelInfo] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3200);
  };

  const handleCopy = (text, successMsg = 'Copied to clipboard!') => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => showToast(successMsg))
      .catch(() => showToast('Failed to copy', true));
  };

  const fetchStatus = () => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => setStatus(data))
      .catch(() => setStatus(null));
  };

  const fetchTunnel = () => {
    fetch('/api/tunnel')
      .then(res => res.json())
      .then(data => {
        setTunnelInfo(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    fetchTunnel();
    const interval = setInterval(() => {
      fetchStatus();
      fetchTunnel();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      <Header status={status} />
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="tab-body">
        {activeTab === 'quickstart' && (
          <QuickstartView
            onNavigate={setActiveTab}
            onCopy={handleCopy}
            tunnelInfo={tunnelInfo}
          />
        )}
        {activeTab === 'models' && <ModelsView onCopy={handleCopy} />}
        {activeTab === 'accounts' && <AccountsView showToast={showToast} />}
        {activeTab === 'keys' && <KeysView onCopy={handleCopy} showToast={showToast} />}
      </main>

      <Toast toast={toast} />
    </div>
  );
}
