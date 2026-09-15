import React, { useState, useEffect } from 'react';

export default function ModelsView({ onCopy }) {
  const [models, setModels] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        setModels(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = models.filter(m => {
    const isClaude = m.category === 'claude' || m.category === 'kladue';
    const cat = isClaude ? 'claude' : m.category;
    if (filter !== 'all' && cat !== filter) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      m.name?.toLowerCase().includes(term) ||
      m.id?.toLowerCase().includes(term) ||
      m.description?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="models-view">
      <div className="section-header">
        <h2>Models Catalog</h2>
        <p>Pre-configured Antigravity model endpoints ready for Cursor Composer and Chat.</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Filter models by name or code..."
          className="form-control"
          style={{ maxWidth: '300px' }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          {['all', 'gemini', 'claude', 'gpt'].map(f => (
            <button
              key={f}
              className={`btn ${filter === f ? 'btn-primary' : 'btn-outline'}`}
              style={{ textTransform: 'capitalize', padding: '5px 12px' }}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All Models' : f === 'claude' ? 'Claude' : f === 'gemini' ? 'Gemini' : 'GPT'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
          Loading models...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
          No models matched your criteria.
        </div>
      ) : (
        <div className="models-grid">
          {filtered.map(m => {
            const isClaude = m.category === 'claude' || m.category === 'kladue';
            const tagClass = isClaude ? 'badge-warning' : m.category === 'gpt' ? 'badge-success' : 'badge-blue';
            const tagLabel = isClaude ? 'Claude' : m.category === 'gpt' ? 'GPT' : 'Gemini';

            return (
              <div key={m.id} className="model-card">
                <div>
                  <div className="model-header">
                    <span className={`badge ${tagClass}`}>{tagLabel}</span>
                  </div>
                  <div className="model-title">{m.name}</div>
                  <div className="model-desc">{m.description}</div>
                </div>
                <div className="model-footer">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.id}</span>
                  <button className="btn-copy" onClick={() => onCopy(m.id, `Copied ${m.id}`)}>
                    Copy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
