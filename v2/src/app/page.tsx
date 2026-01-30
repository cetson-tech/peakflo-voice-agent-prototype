'use client';

import { useState, useEffect } from 'react';
import { getStoredApiKey, setStoredApiKey, clearStoredApiKey } from '@/lib/api-client';
import AuthForm from '@/components/AuthForm';
import VoiceChat from '@/components/VoiceChat';

export default function Home() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setApiKey(getStoredApiKey());
    setMounted(true);
  }, []);

  function handleAuthSuccess(key: string) {
    setStoredApiKey(key);
    setApiKey(key);
  }

  function handleLogout() {
    clearStoredApiKey();
    setApiKey(null);
  }

  if (!mounted) {
    return (
      <main className="app">
        <div className="loading">Loading…</div>
      </main>
    );
  }

  if (!apiKey) {
    return (
      <main className="app auth-page">
        <div className="auth-wrap">
          <h1 className="app-title">Voice Agent</h1>
          <p className="app-subtitle">Sign in or register to chat with the voice agent.</p>
          <AuthForm onSuccess={handleAuthSuccess} />
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <VoiceChat apiKey={apiKey} onLogout={handleLogout} />
    </main>
  );
}
