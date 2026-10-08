'use client';

import { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import {
  Send, Zap, DollarSign, Home, Heart, GraduationCap, Briefcase, Plus, MessageSquare,
  Clock, ChevronLeft, Trash2, ChevronRight, Loader2, TrendingUp, TrendingDown, Minus, Sparkles, X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ChatMessage, DiscoveredPolicy } from '@/types';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';
import ViewFullImpactButton from '@/components/ViewFullImpactButton';
import FeedbackControls from '@/components/FeedbackControls';
import AiDisclaimer from '@/components/ui/AiDisclaimer';
import ReadingModeToggle from '@/components/ui/ReadingModeToggle';
import { useReadingMode } from '@/components/providers/ReadingModeProvider';
import { apiFetch } from '@/lib/api';

// General questions; specific bills come from the user's own feed (right panel).
const quickPrompts = [
  { icon: DollarSign, label: 'Taxes', text: 'Which kinds of tax changes would affect someone in my situation the most?' },
  { icon: Home, label: 'Housing', text: 'What kinds of housing policies could change my monthly housing costs?' },
  { icon: Heart, label: 'Healthcare', text: 'How do changes to health insurance subsidies usually affect households like mine?' },
  { icon: GraduationCap, label: 'Student Loans', text: 'How could federal student loan policy changes affect my budget?' },
  { icon: Briefcase, label: 'Work', text: 'Which labor and wage policies are most relevant to my job situation?' },
];

interface PolicyMeta {
  policyId: string;
  policyTitle: string;
  category?: string;
  context?: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ExtendedMessage[];
  policy_id?: string;
  created_at: string;
}

interface ExtendedMessage extends ChatMessage {
  policyId?: string;
  policyTitle?: string;
  category?: string;
  summary?: string;
  dollarLine?: string;
  hasFullAnalysis?: boolean;
  compiling?: boolean;
  /** UI-only messages (greeting, errors) are never sent to the model or saved. */
  local?: boolean;
  /** Set when the reply is a fixed safety response rather than model output. */
  guardrail?: string;
  /** On an error bubble: what to resend when the user taps "Try again". */
  retry?: { text: string; policyMeta?: PolicyMeta };
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <Zap className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="glass rounded-2xl rounded-tl-sm px-5 py-3.5">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-primary"
              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, sessionId, onRetry }: {
  message: ExtendedMessage; sessionId: string | null; onRetry?: (_m: ExtendedMessage) => void;
}) {
  const isUser = message.role === 'user';
  const isModelReply = !isUser && !message.local && !message.guardrail;
  const isPolicyReply = !isUser && (!!message.dollarLine || !!message.policyId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-end gap-3 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <Zap className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div className={`max-w-[78%] ${
        isUser
          ? 'bg-primary/20 border border-primary/25 text-text-primary rounded-2xl rounded-tr-sm'
          : 'glass text-text-muted rounded-2xl rounded-tl-sm'
      } px-5 py-3.5`}>
        {isPolicyReply ? (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-muted">{message.summary || message.content}</p>
            {message.dollarLine && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-gold/10 border border-gold/20 px-4 py-3">
                <DollarSign className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-gold font-mono-data leading-snug">{message.dollarLine}</p>
              </div>
            )}
            {message.compiling && (
              <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
                <Loader2 className="w-3 h-3 animate-spin text-primary" /> Compiling full analysis…
              </div>
            )}
            {message.policyId && (
              <ViewFullImpactButton
                policyId={message.policyId}
                policyTitle={message.policyTitle || message.policyId}
                category={message.category}
                description={message.summary}
                variant="chat"
              />
            )}
          </>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed" role={message.retry ? 'alert' : undefined}>{message.content}</p>
        )}
        {message.retry && onRetry && (
          <button
            onClick={() => onRetry(message)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80"
          >
            Try again
          </button>
        )}
        <p className={`text-[10px] mt-2 ${isUser ? 'text-primary/60' : 'text-text-muted/50'}`}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
        {/* Rated replies are tied to a saved conversation, with a copy of the reply's start. */}
        {isModelReply && sessionId && (
          <FeedbackControls
            targetType="chat_reply"
            targetId={`${sessionId}:${message.id}`}
            excerpt={message.content.slice(0, 500)}
            className="mt-1"
          />
        )}
      </div>
    </motion.div>
  );
}

const RELEVANCE_BADGE = (score: number) =>
  score >= 70 ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
    : score >= 40 ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
    : 'text-text-muted bg-white/5 border-white/10';

function DirDot({ d }: { d: string }) {
  if (d === 'positive') return <TrendingUp className="w-3 h-3 text-emerald-400" />;
  if (d === 'negative') return <TrendingDown className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-text-muted" />;
}

function FeedPolicyCard({ policy, onPick }: { policy: DiscoveredPolicy; onPick: (_p: DiscoveredPolicy) => void }) {
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(POLICY_DRAG_TYPE, policy.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onPick(policy)}
      className="w-full text-left glass hover:border-primary/30 rounded-xl p-3 mb-2 transition-all cursor-grab active:cursor-grabbing group"
    >
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className={`text-[9px] font-mono-data px-1.5 py-0.5 rounded-full border ${RELEVANCE_BADGE(policy.relevanceScore)}`}>
          {policy.relevanceScore}
        </span>
        <span className="text-[9px] text-text-muted px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 capitalize">{policy.category}</span>
        <DirDot d={policy.direction} />
      </div>
      <p className="text-xs font-medium text-text-primary leading-snug group-hover:text-primary transition-colors line-clamp-2">{policy.title}</p>
      {policy.estimatedImpact && <p className="text-[10px] font-mono-data text-text-muted mt-1">{policy.estimatedImpact}</p>}
    </button>
  );
}

const POLICY_DRAG_TYPE = 'application/x-politicon-policy';
const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CHARS = 4000;

const INITIAL_MESSAGE: ExtendedMessage = {
  id: '0',
  local: true,
  role: 'assistant',
  content: "Hi! I'm Politicon's AI Policy Guide. I can explain how policies may affect your finances, using the ranges in your profile. My numbers are educational estimates, not financial advice.\n\nPick a policy from the feed on the right, or ask me anything.",
  timestamp: new Date(),
};

function AdvisorInner() {
  const searchParams = useSearchParams();
  const policyIdParam = searchParams.get('policyId');
  const { simple } = useReadingMode();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ExtendedMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [feedOpen, setFeedOpen] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [feed, setFeed] = useState<DiscoveredPolicy[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userId = useRef<string | null>(null);
  const prefilledRef = useRef(false);
  const [pendingPolicy, setPendingPolicy] = useState<PolicyMeta | null>(null);
  // The reply being waited for; switching conversations cancels it so it can
  // never land in (or be saved to) a different conversation.
  const inflight = useRef<AbortController | null>(null);
  const conversation = useRef(0); // bumped whenever the user switches conversations
  const [mobileFeedOpen, setMobileFeedOpen] = useState(false);

  // Small screens start with the history sidebar closed.
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false);
  }, []);
  useEffect(() => () => inflight.current?.abort(), []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setSessionsLoading(false); return; }
      userId.current = user.id;
      try {
        const { data } = await supabase
          .from('chat_sessions')
          .select('id, title, messages, created_at, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(30);
        if (data) {
          setSessions(data.map(s => ({
            ...s,
            messages: (s.messages as ExtendedMessage[]).map(m => ({ ...m, timestamp: new Date(m.timestamp), compiling: false })),
          })));
        }
      } catch {
        console.warn('Could not load chat sessions');
      }
      setSessionsLoading(false);
    });
  }, []);

  // Load the personalized policy feed (cached server-side). A 202 means it's
  // being built in the background — show what we have and check back.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const wait = (ms: number) => new Promise<boolean>(resolve => {
      const t = setTimeout(() => resolve(true), ms);
      signal.addEventListener('abort', () => { clearTimeout(t); resolve(false); }, { once: true });
    });
    async function loadFeed() {
      setFeedLoading(true);
      for (let attempt = 0; attempt < 60 && !signal.aborted; attempt++) {
        const res = await apiFetch<{ policies?: DiscoveredPolicy[] }>('/api/policies/feed', { signal });
        if (signal.aborted) return;
        if (res.ok && Array.isArray(res.data.policies) && res.data.policies.length > 0) {
          setFeed(res.data.policies);
          setFeedLoading(false);
        }
        if (res.ok && res.status === 202) {
          if (!(await wait(5000))) return;
          continue;
        }
        // On an error, keep any feed already shown.
        break;
      }
      if (!signal.aborted) setFeedLoading(false);
    }
    loadFeed();
    return () => controller.abort();
  }, []);

  const saveSession = async (sessionId: string | null, msgs: ExtendedMessage[], firstUserMsg?: string) => {
    if (!userId.current) return sessionId;
    const supabase = createClient();
    const title = firstUserMsg ? (firstUserMsg.length > 60 ? `${firstUserMsg.slice(0, 57)}…` : firstUserMsg) : 'New conversation';
    const serialized = msgs.filter(m => !m.local).map(m => ({ ...m, compiling: false, timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp }));
    try {
      if (sessionId) {
        await supabase.from('chat_sessions').update({ messages: serialized }).eq('id', sessionId);
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: msgs } : s));
        return sessionId;
      } else {
        const { data } = await supabase.from('chat_sessions').insert({
          user_id: userId.current, title, messages: serialized,
        }).select().single();
        if (data) {
          setSessions(prev => [{ ...data, messages: msgs }, ...prev]);
          return data.id as string;
        }
      }
    } catch {
      console.warn('Could not save chat session');
    }
    return null;
  };

  const sendMessage = useCallback(async (text: string, policyMeta?: PolicyMeta) => {
    if (!text.trim() || isTyping) return;

    const isFirst = !messages.some(m => m.role === 'user');
    const userMsg: ExtendedMessage = { id: Date.now().toString(), role: 'user', content: text.trim(), timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setIsTyping(true);
    const controller = new AbortController();
    inflight.current = controller;
    const startedIn = conversation.current;

    // Only real conversation turns go to the model — never the UI greeting or
    // error bubbles — and only the recent part of a long conversation.
    const history = newMessages
      .filter(m => !m.local)
      .slice(-MAX_HISTORY_TURNS)
      .map(m => ({ role: m.role, content: m.content.slice(0, MAX_TURN_CHARS) }));
    const res = await apiFetch<{
      response: string; summary?: string; dollarLine?: string; policyId?: string;
      policyTitle?: string; category?: string; hasFullAnalysis?: boolean; guardrail?: string;
    }>('/api/advisor', {
      body: { messages: history, ...(policyMeta ? { policyId: policyMeta.policyId } : {}), simpleMode: simple },
      signal: controller.signal,
    });
    if (controller.signal.aborted) return; // the user switched conversations
    inflight.current = null;

    if (!res.ok) {
      // Shown once, not saved, and not sent back to the model.
      const wait = res.retryAfter && res.retryAfter > 0 ? ` You can try again in about ${Math.ceil(res.retryAfter / 60)} min.` : '';
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant', local: true,
        content: `${res.message}${res.status === 429 ? wait : ''}`, timestamp: new Date(),
        retry: res.status === 0 || res.status === 429 || res.status >= 500 ? { text: text.trim(), policyMeta } : undefined,
      }]);
      setIsTyping(false);
      return;
    }

    const data = res.data;
    const aiMsg: ExtendedMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: data.response,
      timestamp: new Date(),
      summary: data.summary || undefined,
      dollarLine: data.dollarLine || undefined,
      policyId: data.policyId || policyMeta?.policyId || undefined,
      policyTitle: data.policyTitle || policyMeta?.policyTitle || undefined,
      category: data.category || policyMeta?.category || undefined,
      hasFullAnalysis: data.hasFullAnalysis || false,
      guardrail: data.guardrail || undefined,
    };
    const finalMessages = [...newMessages, aiMsg];
    setMessages(finalMessages);

    setIsTyping(false);
    const title = isFirst ? (policyMeta?.policyTitle || text.trim()) : undefined;
    const savedId = await saveSession(activeSessionId, finalMessages, title);
    if (!activeSessionId && savedId && conversation.current === startedIn) setActiveSessionId(savedId);
  }, [messages, isTyping, activeSessionId, simple]);

  /** Resend a failed message: drop the error bubble and the user turn it answered. */
  const retryMessage = (errorMsg: ExtendedMessage) => {
    if (!errorMsg.retry || isTyping) return;
    const { text, policyMeta } = errorMsg.retry;
    const idx = messages.findIndex(m => m.id === errorMsg.id);
    const trimmed = messages.slice(0, idx > 0 && messages[idx - 1].role === 'user' ? idx - 1 : idx);
    setMessages(trimmed);
    // sendMessage reads `messages` from its closure, so send on the next render.
    setPendingRetry({ text, policyMeta });
  };
  const [pendingRetry, setPendingRetry] = useState<{ text: string; policyMeta?: PolicyMeta } | null>(null);
  useEffect(() => {
    if (!pendingRetry) return;
    setPendingRetry(null);
    sendMessage(pendingRetry.text, pendingRetry.policyMeta);
  }, [pendingRetry, sendMessage]);

  // Arriving with ?policyId= (e.g. "Ask advisor" on the dashboard) prefills the
  // question for a policy from the user's own feed. Nothing is sent until the
  // user presses send.
  useEffect(() => {
    if (!policyIdParam || prefilledRef.current || feedLoading) return;
    const match = feed.find(p => p.id === policyIdParam);
    if (!match) return;
    prefilledRef.current = true;
    setPendingPolicy({ policyId: match.id, policyTitle: match.title, category: match.category });
    setInput(`Tell me about the financial impact of ${match.title}`);
    inputRef.current?.focus();
  }, [policyIdParam, feed, feedLoading]);

  const pickPolicy = (p: DiscoveredPolicy) => {
    setPendingPolicy(null);
    sendMessage(`Tell me about the financial impact of ${p.title}`, {
      policyId: p.id, policyTitle: p.title, category: p.category,
    });
  };

  const submitInput = () => {
    const meta = pendingPolicy;
    setPendingPolicy(null);
    sendMessage(input, meta || undefined);
  };

  const cancelInflight = () => {
    conversation.current += 1;
    inflight.current?.abort();
    inflight.current = null;
    setIsTyping(false);
  };

  const loadSession = (session: ChatSession) => {
    cancelInflight();
    if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false);
    setActiveSessionId(session.id);
    setMessages(session.messages.length > 0 ? session.messages : [{ ...INITIAL_MESSAGE, timestamp: new Date() }]);
  };

  const deleteSession = async (id: string) => {
    if (!window.confirm('Delete this conversation? This can’t be undone.')) return;
    const { error } = await createClient().from('chat_sessions').delete().eq('id', id);
    if (error) { window.alert('Could not delete the conversation. Please try again.'); return; }
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) newChat();
  };

  const newChat = () => {
    cancelInflight();
    setActiveSessionId(null);
    setMessages([{ ...INITIAL_MESSAGE, timestamp: new Date() }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submitInput(); }
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <AmbientBackground />
      <div className="relative z-10 flex flex-col h-screen h-[100dvh]">
        <Navbar />
        <div className="flex-1 flex overflow-hidden pt-20 relative">

          {/* Left: Chat history */}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="h-full glass-strong border-r border-white/8 flex flex-col overflow-hidden flex-shrink-0 max-md:absolute max-md:top-20 max-md:bottom-0 max-md:left-0 max-md:h-auto max-md:z-40"
              >
                <div className="p-4 border-b border-white/8 flex items-center justify-between">
                  <span className="text-sm font-semibold text-text-primary">Chat History</span>
                  <button onClick={newChat}
                    className="flex items-center gap-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-3 py-1.5 rounded-xl text-xs font-medium transition-all">
                    <Plus className="w-3 h-3" /> New
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {sessionsLoading ? (
                    <div className="space-y-2 p-2">
                      {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="p-4 text-center">
                      <MessageSquare className="w-6 h-6 text-text-muted mx-auto mb-2" />
                      <p className="text-xs text-text-muted">No conversations yet. Start chatting!</p>
                    </div>
                  ) : (
                    sessions.map(session => (
                      <div key={session.id} className={`group relative mb-1 rounded-xl transition-all ${
                        activeSessionId === session.id ? 'bg-primary/15 border border-primary/20' : 'hover:bg-white/5 border border-transparent'
                      }`}>
                        <button onClick={() => loadSession(session)} className="w-full text-left p-3 pr-9">
                          <p className="text-xs font-medium text-text-primary truncate">{session.title}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="w-2.5 h-2.5 text-text-muted" />
                            <span className="text-[10px] text-text-muted">{new Date(session.created_at).toLocaleDateString()}</span>
                          </div>
                        </button>
                        <button
                          onClick={() => deleteSession(session.id)}
                          aria-label={`Delete conversation “${session.title}”`}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-text-muted opacity-60 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-300 hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Center: Chat */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 py-4 overflow-hidden">

              {/* Header */}
              <div className="mb-4 flex items-center gap-3">
                <button onClick={() => setSidebarOpen(o => !o)} aria-label={sidebarOpen ? 'Hide chat history' : 'Show chat history'} aria-expanded={sidebarOpen} className="p-2 rounded-xl glass hover:border-white/16 transition-all">
                  {sidebarOpen ? <ChevronLeft className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
                </button>
                <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h1 className="font-display text-xl font-bold text-text-primary">AI Policy Guide</h1>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-xs text-text-muted">Profile loaded • Non-partisan • Dollar-specific answers</p>
                  </div>
                </div>
                <ReadingModeToggle className="hidden sm:inline-flex" />
                <button onClick={() => setFeedOpen(o => !o)} className="p-2 rounded-xl glass hover:border-white/16 transition-all hidden lg:flex" aria-label="Toggle policy feed" aria-pressed={feedOpen}>
                  <Sparkles className="w-4 h-4 text-primary" />
                </button>
                <button onClick={() => setMobileFeedOpen(true)} className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl glass text-xs text-text-primary">
                  <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden /> Policies
                </button>
              </div>

              {/* Quick prompts */}
              <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
                {quickPrompts.map(p => {
                  const Icon = p.icon;
                  return (
                    <button key={p.label} onClick={() => sendMessage(p.text)} disabled={isTyping}
                      className="disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 flex items-center gap-2 glass border border-white/8 hover:border-primary/30 px-4 py-2.5 rounded-xl text-xs text-text-muted hover:text-text-primary transition-all">
                      <Icon className="w-3.5 h-3.5" />{p.label}
                    </button>
                  );
                })}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                {messages.map(msg => <MessageBubble key={msg.id} message={msg} sessionId={activeSessionId} onRetry={retryMessage} />)}
                {isTyping && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>

              {/* Input (drop target) */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  // Only ids of policies already in the loaded feed are accepted.
                  const id = e.dataTransfer.getData(POLICY_DRAG_TYPE);
                  const p = feed.find(f => f.id === id);
                  if (p) pickPolicy(p);
                }}
                className={`mt-4 glass-strong rounded-2xl p-3 transition-all ${dragOver ? 'border-primary/50 ring-2 ring-primary/30' : ''}`}
              >
                <div className="flex items-end gap-3">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => {
                      setInput(e.target.value);
                      // Grow with the text, up to the max height.
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                    }}
                    aria-label="Message the Policy Guide"
                    onKeyDown={handleKeyDown}
                    placeholder={dragOver ? 'Drop a policy here to analyze it…' : 'Ask about any policy and how it affects your finances…'}
                    rows={1}
                    maxLength={MAX_TURN_CHARS}
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted resize-none outline-none py-1.5 max-h-32"
                    style={{ minHeight: '28px' }}
                  />
                  <button onClick={submitInput} disabled={!input.trim() || isTyping} aria-label="Send message"
                    className="w-9 h-9 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0">
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
              <AiDisclaimer className="mt-2 justify-center text-center" />
            </div>
          </div>

          {/* Small screens: the feed opens as a bottom sheet */}
          <AnimatePresence>
            {mobileFeedOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="lg:hidden fixed inset-0 bg-black/60 z-[110]"
                  onClick={() => setMobileFeedOpen(false)}
                />
                <motion.div
                  role="dialog" aria-modal="true" aria-label="Your policy feed"
                  initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                  transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                  className="lg:hidden fixed inset-x-0 bottom-0 z-[120] max-h-[75dvh] glass-strong border-t border-white/10 rounded-t-3xl flex flex-col"
                >
                  <div className="p-4 border-b border-white/8 flex items-center justify-between">
                    <span className="text-sm font-semibold text-text-primary">Your Policy Feed</span>
                    <button onClick={() => setMobileFeedOpen(false)} aria-label="Close policy feed" className="p-2 rounded-lg hover:bg-white/5">
                      <X className="w-4 h-4 text-text-muted" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    {feedLoading ? (
                      <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>
                    ) : feed.length === 0 ? (
                      <p className="p-4 text-center text-xs text-text-muted">No policies in your feed yet. Visit your dashboard to generate one.</p>
                    ) : (
                      feed.map(p => <FeedPolicyCard key={p.id} policy={p} onPick={(x) => { setMobileFeedOpen(false); pickPolicy(x); }} />)
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Right: Policy feed */}
          <AnimatePresence>
            {feedOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }} animate={{ width: 300, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="h-full glass-strong border-l border-white/8 flex-col overflow-hidden flex-shrink-0 hidden lg:flex"
              >
                <div className="p-4 border-b border-white/8 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-text-primary">Your Policy Feed</span>
                  </div>
                  <button onClick={() => setFeedOpen(false)} aria-label="Close policy feed" className="p-1 rounded-lg hover:bg-white/5 transition-all">
                    <X className="w-3.5 h-3.5 text-text-muted" />
                  </button>
                </div>
                <p className="text-[10px] text-text-muted px-4 pt-3">Click or drag a policy into the chat.</p>
                <div className="flex-1 overflow-y-auto p-3">
                  {feedLoading ? (
                    <div className="space-y-2">
                      {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
                    </div>
                  ) : feed.length === 0 ? (
                    <div className="p-4 text-center">
                      <Sparkles className="w-6 h-6 text-text-muted mx-auto mb-2" />
                      <p className="text-xs text-text-muted">No policies in your feed yet. Visit your dashboard to generate one.</p>
                    </div>
                  ) : (
                    feed.map(p => <FeedPolicyCard key={p.id} policy={p} onPick={pickPolicy} />)
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function AdvisorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen relative">
        <AmbientBackground />
        <div className="relative z-10"><Navbar /></div>
      </div>
    }>
      <AdvisorInner />
    </Suspense>
  );
}
