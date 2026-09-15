import React from 'react';

export default function TabNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'quickstart', label: 'Quickstart' },
    { id: 'models', label: 'Models Catalog' },
    { id: 'accounts', label: 'Accounts & Quota' },
    { id: 'keys', label: 'API Keys' }
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
