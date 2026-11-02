'use client';
import { useState } from 'react';

export default function LoginForm({ appName, configured }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not sign in.');
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <img src="/icon.svg" alt="" width="56" height="56" className="login-logo" />
        <h1>{appName}</h1>
        <p className="muted">Enter your password to continue.</p>
        {!configured && (
          <p className="login-warn">No password has been set up yet. Add <code>APP_PASSWORD</code> in your Vercel project’s environment variables and redeploy.</p>
        )}
        <input type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password" aria-label="Password" disabled={!configured} />
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary block" disabled={busy || !password || !configured}>{busy ? 'Signing in…' : 'Continue'}</button>
      </form>
    </main>
  );
}
