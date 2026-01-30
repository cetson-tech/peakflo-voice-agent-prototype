'use client';

import { useState } from 'react';

type Mode = 'login' | 'register';

interface AuthFormProps {
  onSuccess: (apiKey: string) => void;
}

export default function AuthForm({ onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyNew, setApiKeyNew] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { register } = await import('@/lib/api-client');
      const { apiKey } = await register(email);
      setApiKeyNew(apiKey);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { login } = await import('@/lib/api-client');
      await login(apiKeyInput.trim());
      onSuccess(apiKeyInput.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function handleUseNewKey() {
    if (apiKeyNew) {
      onSuccess(apiKeyNew);
      setApiKeyNew('');
    }
  }

  if (apiKeyNew) {
    return (
      <div className="auth-card">
        <h2>API key created</h2>
        <p className="auth-hint">Copy and save this key. It won’t be shown again.</p>
        <div className="api-key-box">
          <code>{apiKeyNew}</code>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleUseNewKey}>
          I’ve saved it, go to chat
        </button>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div className="auth-tabs">
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => { setMode('login'); setError(''); }}
        >
          Login
        </button>
        <button
          type="button"
          className={mode === 'register' ? 'active' : ''}
          onClick={() => { setMode('register'); setError(''); }}
        >
          Register
        </button>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {mode === 'login' ? (
        <form onSubmit={handleLogin}>
          <label>
            API key
            <input
              type="password"
              placeholder="sk_..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Checking…' : 'Login'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister}>
          <label>
            Email
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating…' : 'Register'}
          </button>
        </form>
      )}
    </div>
  );
}
