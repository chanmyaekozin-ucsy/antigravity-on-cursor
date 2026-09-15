import React from 'react';

export default function Toast({ toast }) {
  if (!toast) return null;

  return (
    <div className="toast-container">
      <div
        className="toast"
        style={toast.isError ? { backgroundColor: 'var(--danger)' } : {}}
      >
        <span>{toast.isError ? '✕' : '✓'}</span>
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
