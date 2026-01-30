'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  createSession,
  getMessages,
  sendVoice,
  type ChatMessage,
} from '@/lib/api-client';

interface VoiceChatProps {
  apiKey: string;
  onLogout: () => void;
}

export default function VoiceChat({ apiKey, onLogout }: VoiceChatProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<'idle' | 'recording' | 'sending' | 'playing'>('idle');
  const [error, setError] = useState('');
  const [recording, setRecording] = useState<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const id = await createSession(apiKey);
      setSessionId(id);
      return id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      return null;
    }
  }, [apiKey]);

  const loadMessages = useCallback(async () => {
    if (!sessionId) return;
    try {
      const list = await getMessages(apiKey, sessionId);
      setMessages(list);
    } catch {
      // Non-fatal
    }
  }, [apiKey, sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (sessionId) loadMessages();
  }, [sessionId, loadMessages]);

  async function sendAudio(blob: Blob) {
    if (!sessionId) {
      const id = await loadSession();
      if (!id) return;
      setSessionId(id);
    }
    const sid = sessionId || (await loadSession()) || '';
    if (!sid) return;

    setStatus('sending');
    setError('');
    try {
      const { audio, transcript, sessionId: newId } = await sendVoice(apiKey, blob, sid);
      setSessionId(newId);
      setMessages((prev) => [...prev, { role: 'user', content: transcript }]);

      const url = URL.createObjectURL(audio);
      const audioEl = new Audio(url);
      audioRef.current = audioEl;
      setStatus('playing');
      audioEl.onended = () => {
        URL.revokeObjectURL(url);
        setStatus('idle');
        loadMessages();
      };
      audioEl.onerror = () => {
        URL.revokeObjectURL(url);
        setStatus('idle');
        loadMessages();
      };
      await audioEl.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
      setStatus('idle');
    } finally {
      setStatus((s) => (s === 'sending' ? 'idle' : s));
    }
  }

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        if (blob.size > 0) sendAudio(blob);
      };
      recorder.start();
      setRecording(recorder);
      setStatus('recording');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }

  function stopRecording() {
    if (recording && recording.state !== 'inactive') {
      recording.stop();
      setRecording(null);
    }
    setStatus('idle');
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    sendAudio(file);
    e.target.value = '';
  }

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>Voice Agent</h1>
        <button type="button" className="btn btn-ghost" onClick={onLogout}>
          Logout
        </button>
      </header>

      {error && (
        <div className="chat-error">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-retry"
            onClick={() => {
              setError('');
              loadSession();
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="messages">
        {messages.length === 0 && status === 'idle' && (
          <div className="messages-empty">
            Say something or upload an audio file to start.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`message message-${m.role}`}>
            <span className="message-role">{m.role === 'user' ? 'You' : 'Agent'}</span>
            <p className="message-content">{m.content}</p>
          </div>
        ))}
        {status === 'sending' && (
          <div className="message message-assistant">
            <span className="message-role">Agent</span>
            <p className="message-content">Thinking… (transcribing, then generating reply — may take 30–60 seconds)</p>
          </div>
        )}
        {status === 'playing' && (
          <div className="message message-assistant">
            <span className="message-role">Agent</span>
            <p className="message-content">🔊 Playing response…</p>
          </div>
        )}
      </div>

      <div className="chat-actions">
        {status !== 'recording' ? (
          <button
            type="button"
            className="btn btn-mic"
            onClick={startRecording}
            disabled={status === 'sending' || status === 'playing'}
            title="Hold to record"
          >
            🎤 Record
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-mic recording"
            onClick={stopRecording}
          >
            ⏹ Stop
          </button>
        )}
        <label className="btn btn-upload">
          📁 Upload
          <input
            type="file"
            accept="audio/*"
            onChange={handleFile}
            disabled={status === 'sending' || status === 'playing' || status === 'recording'}
          />
        </label>
      </div>

      <div className="chat-status">
        {status === 'recording' && 'Recording…'}
        {status === 'sending' && 'Sending…'}
        {status === 'playing' && 'Playing…'}
        {status === 'idle' && sessionId && 'Ready'}
      </div>
    </div>
  );
}
