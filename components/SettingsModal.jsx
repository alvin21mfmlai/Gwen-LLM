'use client';
import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { api } from '@/lib/client/api';

const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n || 0));

export default function SettingsModal({ boot, theme, onTheme, onClose, onSaved, onError }) {
  const [s, setS] = useState(boot.settings);
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState(null);
  const modelName = (id) => boot.models.find((m) => m.id === id)?.label || id;

  useEffect(() => {
    api.get('/api/usage').then(setUsage).catch(() => setUsage({ rows: [] }));
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { settings } = await api.send('/api/settings', 'PUT', s);
      onSaved(settings);
      onClose();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onSubmit={save}>
        <header className="modal-head">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings"><Icon name="x" size={20} /></button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span>What should I call you?</span>
            <input value={s.displayName} onChange={(e) => setS({ ...s, displayName: e.target.value })} placeholder="Your name" maxLength={60} />
          </label>
          <label className="field">
            <span>What should the assistant know about you?</span>
            <textarea rows={3} value={s.aboutMe} onChange={(e) => setS({ ...s, aboutMe: e.target.value })} maxLength={3000}
              placeholder="e.g. I live in Singapore, I'm a teacher, I have a toddler, I'm vegetarian…" />
          </label>
          <label className="field">
            <span>How should it respond?</span>
            <textarea rows={3} value={s.style} onChange={(e) => setS({ ...s, style: e.target.value })} maxLength={3000}
              placeholder="e.g. Keep answers short and friendly. Use British spelling. Explain things simply." />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Default model</span>
              <select value={s.defaultModel || boot.defaultModel || ''} onChange={(e) => setS({ ...s, defaultModel: e.target.value })}>
                {boot.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <div className="field">
              <span>Appearance</span>
              <div className="seg" role="radiogroup" aria-label="Appearance">
                {THEMES.map((t) => (
                  <button type="button" key={t.id} role="radio" aria-checked={theme === t.id} className={theme === t.id ? 'on' : ''} onClick={() => onTheme(t.id)}>{t.label}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="usage">
            <h3>Usage this month</h3>
            {!usage && <p className="muted">Loading…</p>}
            {usage && !usage.rows.length && <p className="muted">Nothing used yet this month.</p>}
            {usage?.rows.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Model</th><th>Requests</th><th>Tokens in</th><th>Tokens out</th><th>Extras</th></tr></thead>
                  <tbody>
                    {usage.rows.map((r) => (
                      <tr key={r.model}>
                        <td>{modelName(r.model)}</td><td>{r.requests}</td><td>{fmt(r.input)}</td><td>{fmt(r.output)}</td>
                        <td>{[r.searches ? `${r.searches} searches` : '', r.images ? `${r.images} images` : ''].filter(Boolean).join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted small">Exact costs and credit balances are in the Anthropic and OpenAI consoles.</p>
          </div>
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn ghost danger-text" onClick={signOut}><Icon name="logout" size={16} /> Sign out</button>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </footer>
      </form>
    </div>
  );
}
