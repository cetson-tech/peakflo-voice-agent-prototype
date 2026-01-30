"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant" | "error" | "system";
  content: string;
  timestamp: Date;
}

interface LogEntry {
  level: string;
  message: string;
  timestamp?: string;
  error?: string;
  [key: string]: unknown;
}

// ─── Silence Detection Config ────────────────────────────

const SILENCE_THRESHOLD = 0.01; // RMS below this = silence
const SILENCE_DURATION_MS = 1500; // 1.5s of silence = end of sentence

// ─── Page ────────────────────────────────────────────────

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSetup, setShowSetup] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connected" | "error"
  >("disconnected");
  const [audioLevel, setAudioLevel] = useState(0);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ─── Helpers ─────────────────────────────────────────

  const addMessage = (role: Message["role"], content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role,
        content,
        timestamp: new Date(),
      },
    ]);
  };

  const addError = (content: string) => addMessage("error", content);

  // ─── Logs ────────────────────────────────────────────

  const fetchLogs = async (type: "combined" | "error" = "combined") => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/v1/logs?type=${type}&lines=100`);
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
    } catch {
      setLogs([{ level: "error", message: "Failed to fetch logs" }]);
    } finally {
      setLogsLoading(false);
    }
  };

  const toggleLogs = () => {
    const next = !showLogs;
    setShowLogs(next);
    if (next) fetchLogs();
  };

  // ─── Auth ────────────────────────────────────────────

  const handleAuth = async () => {
    if (!email || !apiKey) return;
    setAuthLoading(true);
    setAuthMessage("");
    setAuthError(false);
    try {
      // First try to register (will return exists:true if already registered)
      const regRes = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, apiKey }),
      });
      const regData = await regRes.json();

      if (regRes.ok && !regData.exists) {
        // New user registered successfully
        setConnectionStatus("connected");
        addMessage("system", `Welcome! Account created for ${email}`);
        setShowSetup(false);
        return;
      }

      // Existing user — try login
      const loginRes = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, apiKey }),
      });
      const loginData = await loginRes.json();

      if (!loginRes.ok) {
        const errMsg = loginData.message || "Login failed";
        setAuthMessage(errMsg);
        setAuthError(true);
        setConnectionStatus("error");
        addError(`Login failed: ${errMsg}`);
        return;
      }

      setConnectionStatus("connected");
      addMessage("system", `Connected as ${loginData.email}`);
      setShowSetup(false);
    } catch (err) {
      setConnectionStatus("error");
      setAuthError(true);
      setAuthMessage("Network error. Please try again.");
      addError(`Auth failed: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const startSession = async () => {
    if (!apiKey) return;
    try {
      const res = await fetch("/api/v1/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json();
      if (!res.ok) {
        addError(`Session creation failed: ${data.message}`);
        return;
      }
      setSessionId(data.sessionId);
      setMessages([]);
      addMessage("system", "New conversation started.");
      setShowSetup(false);
    } catch (err) {
      addError(`Session failed: ${err instanceof Error ? err.message : "Network error"}`);
    }
  };

  // ─── Silence Detection ──────────────────────────────

  const startSilenceDetection = useCallback(
    (stream: MediaStream) => {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      hasSpokenRef.current = false;

      const dataArray = new Float32Array(analyser.fftSize);

      const checkLevel = () => {
        analyser.getFloatTimeDomainData(dataArray);

        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setAudioLevel(Math.min(rms * 10, 1)); // Normalize for visual

        if (rms > SILENCE_THRESHOLD) {
          // User is speaking
          hasSpokenRef.current = true;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (hasSpokenRef.current && !silenceTimerRef.current) {
          // Silence after speech — start countdown
          silenceTimerRef.current = setTimeout(() => {
            // Auto-stop recording after silence
            stopRecordingInternal();
          }, SILENCE_DURATION_MS);
        }

        animFrameRef.current = requestAnimationFrame(checkLevel);
      };

      checkLevel();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const stopSilenceDetection = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // ─── Voice Recording ────────────────────────────────

  const startRecording = useCallback(async () => {
    if (!apiKey || isProcessing || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        if (audioBlob.size > 0) {
          await sendAudio(audioBlob);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Start silence detection
      startSilenceDetection(stream);
    } catch (err) {
      addError(`Microphone error: ${err instanceof Error ? err.message : "Access denied"}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, isProcessing, isRecording, sessionId, startSilenceDetection]);

  const stopRecordingInternal = useCallback(() => {
    stopSilenceDetection();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, [stopSilenceDetection]);

  const stopRecording = useCallback(() => {
    if (isRecording) {
      stopRecordingInternal();
    }
  }, [isRecording, stopRecordingInternal]);

  // ─── Send Audio ─────────────────────────────────────

  const sendAudio = async (audioBlob: Blob) => {
    if (!apiKey) {
      addError("No API key. Please authenticate first.");
      return;
    }

    setIsProcessing(true);
    const thinkingId = `thinking-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: thinkingId, role: "assistant", content: "__THINKING__", timestamp: new Date() },
    ]);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      if (sessionId) formData.append("sessionId", sessionId);

      const res = await fetch("/api/v1/voice/conversation", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      // Remove thinking indicator
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId));

      if (!res.ok) {
        let errorMsg = "Unknown error";
        try {
          const error = await res.json();
          errorMsg = `${error.error}: ${error.message}`;
        } catch {
          errorMsg = `HTTP ${res.status}: ${res.statusText}`;
        }
        addError(errorMsg);
        return;
      }

      const newSessionId = res.headers.get("X-Session-Id");
      const transcript = res.headers.get("X-Transcript");
      const responseText = res.headers.get("X-Response-Text");

      if (newSessionId && !sessionId) setSessionId(newSessionId);
      if (transcript) addMessage("user", decodeURIComponent(transcript));
      if (responseText) addMessage("assistant", decodeURIComponent(responseText));

      // Play audio
      try {
        const audioBuffer = await res.arrayBuffer();
        const audioContext = new AudioContext();
        const decodedAudio = await audioContext.decodeAudioData(audioBuffer);
        const source = audioContext.createBufferSource();
        source.buffer = decodedAudio;
        source.connect(audioContext.destination);
        source.start(0);
      } catch (audioErr) {
        addError(`Audio playback failed: ${audioErr instanceof Error ? audioErr.message : "Decode error"}`);
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId));
      addError(`Request failed: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Render ──────────────────────────────────────────

  const isReady = apiKey && connectionStatus === "connected";

  return (
    <div style={styles.container}>
      {/* ── Header ── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          <span style={styles.headerTitle}>Peakflo</span>
          <span style={styles.headerSubtitle}>Voice Agent</span>
          {sessionId && (
            <span style={styles.sessionBadge}>{sessionId.slice(0, 8)}</span>
          )}
        </div>
        <div style={styles.headerRight}>
          <button
            onClick={toggleLogs}
            style={{ ...styles.iconBtn, color: showLogs ? "var(--accent)" : "var(--text-tertiary)" }}
            title="Server Logs"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </button>
          <button
            onClick={() => setShowSetup(!showSetup)}
            style={{ ...styles.iconBtn, color: showSetup ? "var(--accent)" : "var(--text-tertiary)" }}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <div
            style={{
              ...styles.statusDot,
              backgroundColor:
                connectionStatus === "connected" ? "var(--success)"
                : connectionStatus === "error" ? "var(--error)"
                : "var(--text-tertiary)",
            }}
          />
        </div>
      </header>

      {/* ── Setup Panel ── */}
      {showSetup && (
        <div style={styles.setupPanel}>
          {!isReady && (
            <div style={styles.setupSection}>
              <label style={styles.label}>Connect</label>
              <p style={styles.setupHint}>
                Enter your email and OpenAI API key to register or log in.
              </p>
              {authMessage && (
                <p style={authError ? styles.setupError : styles.setupHint}>{authMessage}</p>
              )}
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (authError) { setAuthError(false); setAuthMessage(""); setConnectionStatus("disconnected"); } }}
                  onKeyDown={(e) => e.key === "Enter" && document.getElementById("apikey-input")?.focus()}
                  style={styles.input}
                  autoFocus
                />
                <div style={styles.inputRow}>
                  <input
                    id="apikey-input"
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); if (authError) { setAuthError(false); setAuthMessage(""); setConnectionStatus("disconnected"); } }}
                    onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                    style={{ ...styles.input, fontFamily: "var(--font-mono)", fontSize: 13 }}
                  />
                  <button
                    onClick={handleAuth}
                    disabled={!email || !apiKey || authLoading}
                    style={{ ...styles.btn, opacity: email && apiKey && !authLoading ? 1 : 0.4 }}
                  >
                    {authLoading ? "..." : "Connect"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Connected — new conversation button */}
          {isReady && (
            <div style={styles.setupSection}>
              <button onClick={startSession} style={styles.btnOutline}>
                + New Conversation
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Chat Area ── */}
      <div style={styles.chatArea}>
        {messages.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <p style={styles.emptyTitle}>
              {isReady ? "Ready to listen" : "Connect to get started"}
            </p>
            <p style={styles.emptySubtitle}>
              {isReady
                ? "Tap the microphone or hold to talk. Recording stops automatically when you finish speaking."
                : "Enter your email and API key above to get started."}
            </p>
            <p style={styles.poweredBy}>Powered by Peakflo</p>
          </div>
        ) : (
          <div style={styles.messageList}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  ...styles.messageRow,
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  animation: "fadeIn 0.3s ease-out",
                }}
              >
                {msg.role === "assistant" && msg.content !== "__THINKING__" && (
                  <div style={styles.avatar}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "-0.02em" }}>P</span>
                  </div>
                )}

                {msg.content === "__THINKING__" ? (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                    <div style={styles.avatar}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "-0.02em" }}>P</span>
                    </div>
                    <div style={styles.thinkingBubble}>
                      <div style={styles.thinkingDots}>
                        <span style={{ ...styles.dot, animationDelay: "0ms" }} />
                        <span style={{ ...styles.dot, animationDelay: "160ms" }} />
                        <span style={{ ...styles.dot, animationDelay: "320ms" }} />
                      </div>
                    </div>
                  </div>
                ) : msg.role === "error" ? (
                  <div style={styles.errorBubble}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span>{msg.content}</span>
                  </div>
                ) : msg.role === "system" ? (
                  <div style={styles.systemBubble}>{msg.content}</div>
                ) : (
                  <div style={msg.role === "user" ? styles.userBubble : styles.assistantBubble}>
                    {msg.content}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* ── Bottom Controls ── */}
      <div style={styles.bottomBar}>
        <div style={styles.recordWrapper}>
          {/* Audio level visualizer when recording */}
          {isRecording && (
            <div style={styles.levelBar}>
              <div
                style={{
                  ...styles.levelFill,
                  width: `${Math.max(audioLevel * 100, 5)}%`,
                }}
              />
            </div>
          )}

          <div style={styles.controlRow}>
            {/* Main mic button */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!isReady || isProcessing}
              style={{
                ...styles.recordBtn,
                ...(isRecording ? styles.recordBtnActive : {}),
                ...(!isReady || isProcessing ? styles.recordBtnDisabled : {}),
              }}
            >
              {isRecording && <span style={styles.recordRipple} />}
              {isProcessing ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              ) : isRecording ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>

            {/* Stop / Send button — visible while recording */}
            {isRecording && (
              <button
                onClick={stopRecording}
                style={styles.stopBtn}
                title="Stop recording & send (T)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                <span style={{ fontSize: 11, opacity: 0.7 }}>T</span>
              </button>
            )}
          </div>

          <span style={styles.recordLabel}>
            {!isReady
              ? "Connect to start"
              : isRecording
                ? "Listening... tap or press T to send"
                : isProcessing
                  ? "Processing..."
                  : "Tap to speak"}
          </span>
        </div>
      </div>

      {/* ── Keyboard shortcut: T to stop ── */}
      <KeyboardHandler isRecording={isRecording} onStop={stopRecording} />

      {/* ── Logs Panel ── */}
      {showLogs && (
        <div style={styles.logsPanel}>
          <div style={styles.logsPanelHeader}>
            <span style={styles.logsPanelTitle}>Peakflo Server Logs</span>
            <div style={styles.logsActions}>
              <button onClick={() => fetchLogs("error")} style={styles.logsFilterBtn}>Errors</button>
              <button onClick={() => fetchLogs("combined")} style={styles.logsFilterBtn}>All</button>
              <button onClick={() => fetchLogs()} style={styles.logsFilterBtn}>Refresh</button>
              <button onClick={() => setShowLogs(false)} style={styles.iconBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          <div style={styles.logsContent}>
            {logsLoading ? (
              <div style={styles.logsEmpty}>Loading logs...</div>
            ) : logs.length === 0 ? (
              <div style={styles.logsEmpty}>No logs recorded yet</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} style={styles.logLine}>
                  <span
                    style={{
                      ...styles.logLevel,
                      color:
                        log.level === "error" ? "var(--error)"
                        : log.level === "warn" ? "var(--warning)"
                        : "var(--text-tertiary)",
                    }}
                  >
                    {(log.level || "info").toUpperCase().padEnd(5)}
                  </span>
                  <span style={styles.logTime}>
                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ""}
                  </span>
                  <span style={styles.logMsg}>
                    {log.message}
                    {log.error ? ` — ${log.error}` : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={styles.footer}>
        Peakflo Voice Agent
      </div>
    </div>
  );
}

// ─── Keyboard Handler Component ────────────────────────

function KeyboardHandler({
  isRecording,
  onStop,
}: {
  isRecording: boolean;
  onStop: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "t" || e.key === "T") {
        // Don't trigger if typing in an input
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        if (isRecording) {
          e.preventDefault();
          onStop();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording, onStop]);

  return null;
}

// ─── Styles ────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    maxWidth: 720,
    margin: "0 auto",
    position: "relative",
  },

  // Header
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg)",
    zIndex: 10,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  logo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--accent)",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "var(--text-primary)",
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: 400,
    color: "var(--text-tertiary)",
    marginLeft: -4,
  },
  sessionBadge: {
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    color: "var(--text-tertiary)",
    background: "var(--bg-elevated)",
    padding: "2px 8px",
    borderRadius: "var(--radius-full)",
    border: "1px solid var(--border)",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 6,
    borderRadius: "var(--radius-sm)",
    color: "var(--text-tertiary)",
    display: "flex",
    alignItems: "center",
    transition: "color 0.15s",
  },
  statusDot: { width: 8, height: 8, borderRadius: "50%", marginLeft: 4 },

  // Setup Panel
  setupPanel: {
    padding: "20px 20px 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    animation: "slideUp 0.2s ease-out",
  },
  setupSection: { marginBottom: 12 },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 6,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  inputRow: { display: "flex", gap: 8 },
  input: {
    flex: 1,
    padding: "10px 12px",
    fontSize: 14,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    outline: "none",
    transition: "border-color 0.15s",
  },
  btn: {
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 500,
    background: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    transition: "opacity 0.15s",
  },
  btnOutline: {
    width: "100%",
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 500,
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px dashed var(--border-light)",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    transition: "color 0.15s, border-color 0.15s",
  },
  setupHint: {
    fontSize: 13,
    color: "var(--text-tertiary)",
    marginBottom: 10,
    lineHeight: "1.5",
  },
  setupSuccess: {
    fontSize: 13,
    color: "var(--success)",
    marginBottom: 10,
    lineHeight: "1.5",
  },
  setupError: {
    fontSize: 13,
    color: "var(--error)",
    marginBottom: 10,
    lineHeight: "1.5",
    fontWeight: 500,
  },
  apiKeyDisplay: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
  },
  apiKeyCode: {
    flex: 1,
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    color: "var(--text-primary)",
    wordBreak: "break-all" as const,
    userSelect: "all" as const,
  },
  copyBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    color: "var(--text-tertiary)",
    display: "flex",
    flexShrink: 0,
  },
  linkBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    color: "var(--text-tertiary)",
    textDecoration: "underline" as const,
    padding: 0,
  },

  // Chat
  chatArea: { flex: 1, overflow: "auto", padding: "20px" },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 12,
  },
  emptyIcon: { opacity: 0.5, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: 500, color: "var(--text-secondary)" },
  emptySubtitle: {
    fontSize: 13,
    color: "var(--text-tertiary)",
    maxWidth: 280,
    textAlign: "center",
    lineHeight: "1.6",
  },
  poweredBy: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    marginTop: 16,
    opacity: 0.5,
    letterSpacing: "0.03em",
  },
  messageList: { display: "flex", flexDirection: "column", gap: 8 },
  messageRow: { display: "flex", alignItems: "flex-end", gap: 8 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-secondary)",
    flexShrink: 0,
  },
  userBubble: {
    maxWidth: "75%",
    padding: "10px 14px",
    fontSize: 14,
    lineHeight: "1.5",
    borderRadius: "18px 18px 4px 18px",
    background: "var(--accent)",
    color: "var(--bg)",
  },
  assistantBubble: {
    maxWidth: "75%",
    padding: "10px 14px",
    fontSize: 14,
    lineHeight: "1.5",
    borderRadius: "18px 18px 18px 4px",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  },
  errorBubble: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    maxWidth: "85%",
    padding: "10px 14px",
    fontSize: 13,
    lineHeight: "1.5",
    borderRadius: "var(--radius-md)",
    background: "var(--error-bg)",
    color: "var(--error)",
    border: "1px solid var(--error-border)",
    fontFamily: "var(--font-mono)",
  },
  systemBubble: {
    width: "100%",
    textAlign: "center",
    padding: "6px 12px",
    fontSize: 12,
    color: "var(--text-tertiary)",
  },
  thinkingBubble: {
    padding: "14px 20px",
    borderRadius: "18px 18px 18px 4px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
  },
  thinkingDots: { display: "flex", gap: 4 },
  dot: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--text-tertiary)",
    animation: "dotBounce 1.2s ease-in-out infinite",
  },

  // Bottom Bar
  bottomBar: {
    padding: "12px 20px 20px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg)",
    display: "flex",
    justifyContent: "center",
  },
  recordWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  levelBar: {
    width: "60%",
    height: 3,
    borderRadius: 2,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  },
  levelFill: {
    height: "100%",
    borderRadius: 2,
    background: "var(--accent)",
    transition: "width 0.08s ease-out",
  },
  controlRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  recordBtn: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: "2px solid var(--border-light)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative" as const,
    overflow: "hidden",
    transition: "all 0.2s",
  },
  recordBtnActive: {
    background: "var(--error)",
    borderColor: "var(--error)",
    color: "white",
    transform: "scale(1.05)",
  },
  recordBtnDisabled: { opacity: 0.3, cursor: "not-allowed" },
  recordRipple: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: "50%",
    border: "2px solid var(--error)",
    animation: "ripple 1.5s ease-out infinite",
  },
  stopBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 500,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-light)",
    borderRadius: "var(--radius-full)",
    color: "var(--text-primary)",
    cursor: "pointer",
    transition: "all 0.15s",
    animation: "fadeIn 0.2s ease-out",
  },
  recordLabel: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    letterSpacing: "0.02em",
  },

  // Logs Panel
  logsPanel: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "50vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-secondary)",
    borderTop: "1px solid var(--border)",
    animation: "slideUp 0.2s ease-out",
    zIndex: 20,
  },
  logsPanelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
  },
  logsPanelTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  logsActions: { display: "flex", gap: 4, alignItems: "center" },
  logsFilterBtn: {
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 500,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
  logsContent: {
    flex: 1,
    overflow: "auto",
    padding: "8px 0",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
  },
  logsEmpty: {
    padding: "24px 16px",
    textAlign: "center",
    color: "var(--text-tertiary)",
    fontSize: 12,
  },
  logLine: {
    display: "flex",
    gap: 8,
    padding: "3px 16px",
    lineHeight: "1.6",
    alignItems: "baseline",
  },
  logLevel: { fontWeight: 600, fontSize: 10, flexShrink: 0, width: 40 },
  logTime: { color: "var(--text-tertiary)", flexShrink: 0, fontSize: 11, width: 72 },
  logMsg: { color: "var(--text-secondary)", wordBreak: "break-word" as const },

  // Footer
  footer: {
    padding: "8px 20px",
    textAlign: "center",
    fontSize: 11,
    color: "var(--text-tertiary)",
    opacity: 0.4,
    letterSpacing: "0.03em",
    borderTop: "1px solid var(--border)",
  },
};
