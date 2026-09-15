import React from 'react';

export default function TabNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'quickstart', label: 'Quickstart' },
    { id: 'models', label: 'Models Catalog' },
    { id: 'quota', label: 'Live Quota' },
    { id: 'keys', label: 'API Keys' },
    { id: 'accounts', label: 'Google Accounts' }
  ];

  return (
    <nav className="tabs-nav">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
