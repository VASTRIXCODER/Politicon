'use client';

import { useState, useRef, useEffect, useLayoutEffect, Suspense, useCallback, useId } from 'react';
import { m, AnimatePresence } from 'framer-motion';
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
import { useModalDialog } from '@/components/layout/useModalDialog';

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
  updated_at?: string;
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
      <div aria-hidden="true" className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <Zap className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="glass backdrop-filter-none rounded-2xl rounded-tl-sm px-5 py-3.5">
        <span className="sr-only">The Policy Guide is typing…</span>
        <div aria-hidden="true" className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <m.div key={i} className="w-1.5 h-1.5 rounded-full bg-primary"
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
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-end gap-3 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {!isUser && (
        <div aria-hidden="true" className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <Zap className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div className={`max-w-[78%] ${
        isUser
          ? 'bg-primary/20 border border-primary/25 text-text-primary rounded-2xl rounded-tr-sm'
          : 'glass backdrop-filter-none text-text-muted rounded-2xl rounded-tl-sm'
      } px-5 py-3.5`}>
        <span className="sr-only">{isUser ? 'You said:' : 'Policy Guide said:'} </span>
        {isPolicyReply ? (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-muted">{message.summary || message.content}</p>
            {message.dollarLine && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-gold/10 border border-gold/20 px-4 py-3">
                <DollarSign className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm font-medium text-gold font-mono-data leading-snug">{message.dollarLine}</p>
              </div>
            )}
            {message.compiling && (
              <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
                <Loader2 className="w-3 h-3 animate-spin text-primary" aria-hidden="true" /> Compiling full analysis…
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
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        )}
        {message.retry && onRetry && (
          <button
            type="button"
            onClick={() => onRetry(message)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary-300 hover:text-text-primary rounded"
          >
            Try again
          </button>
        )}
        <p className={`text-meta mt-2 ${isUser ? 'text-white/70' : 'text-text-muted'}`}>
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
    </m.div>
  );
}

const RELEVANCE_BADGE = (score: number) =>
  score >= 70 ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
    : score >= 40 ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
    : 'text-text-muted bg-white/5 border-white/10';

function DirDot({ d }: { d: string }) {
  const [Icon, color, label] =
    d === 'positive' ? [TrendingUp, 'text-emerald-400', 'Likely helps you']
      : d === 'negative' ? [TrendingDown, 'text-red-400', 'Likely costs you']
      : [Minus, 'text-text-muted', 'Mixed or neutral effect'];
  return (
    <>
      <Icon className={`w-3 h-3 ${color}`} aria-hidden="true" />
      <span className="sr-only">{label}.</span>
    </>
  );
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
      // Repeated inside an already-blurred panel, so no backdrop blur of its own.
      className="w-full flex flex-col text-left glass backdrop-filter-none hover:border-primary/30 hover:bg-white/[0.065] rounded-xl p-3 mb-2 transition-all cursor-pointer group"
    >
      {/* The title comes first for screen readers; the badges still show above it. */}
      <span className="sr-only">Ask about: </span>
      <span className="text-xs font-medium text-text-primary leading-snug group-hover:text-primary-300 transition-colors line-clamp-2">{policy.title}</span>
      <span className="order-first flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className={`text-meta font-mono-data px-1.5 rounded-full border ${RELEVANCE_BADGE(policy.relevanceScore)}`}>
          <span className="sr-only">Relevance </span>{policy.relevanceScore}<span className="sr-only"> out of 100.</span>
        </span>
        <span className="text-meta text-text-muted px-1.5 rounded-full bg-white/5 border border-white/10 capitalize">{policy.category}</span>
        <DirDot d={policy.direction} />
      </span>
      {policy.estimatedImpact && <span className="block text-meta font-mono-data text-text-muted mt-1">{policy.estimatedImpact}</span>}
    </button>
  );
}

const POLICY_DRAG_TYPE = 'application/x-politicon-policy';
const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CHARS = 4000;
/** Longest question accepted from ?q= (the landing page's search box). */
const MAX_PREFILL_CHARS = 500;

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
  const questionParam = searchParams.get('q');
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
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userId = useRef<string | null>(null);
  const prefilledRef = useRef(false);
  const [pendingPolicy, setPendingPolicy] = useState<PolicyMeta | null>(null);
  // The reply being waited for; switching conversations cancels it so it can
  // never land in (or be saved to) a different conversation.
  const inflight = useRef<AbortController | null>(null);
  const conversation = useRef(0); // bumped whenever the user switches conversations
  // A new conversation's first save inserts its row; a follow-up saved before
  // that finishes waits for it and updates the same row instead of inserting.
  const firstInsert = useRef<{ conversation: number; id: Promise<string | null> } | null>(null);
  const [mobileFeedOpen, setMobileFeedOpen] = useState(false);
  // Below md the history panel overlays the chat, so it behaves as a modal dialog there.
  const [isSmall, setIsSmall] = useState(false);
  const historyToggleRef = useRef<HTMLButtonElement>(null);
  const feedButtonRef = useRef<HTMLButtonElement>(null);
  const closeHistory = useCallback(() => setSidebarOpen(false), []);
  const closeMobileFeed = useCallback(() => setMobileFeedOpen(false), []);
  const historyModal = sidebarOpen && isSmall;
  // Bumped when another conversation is opened, to remount the message log (see below).
  const [logKey, setLogKey] = useState(0);
  const historyRef = useModalDialog<HTMLDivElement>(historyModal, closeHistory, { returnFocusRef: historyToggleRef });
  const feedSheetRef = useModalDialog<HTMLDivElement>(mobileFeedOpen, closeMobileFeed, { returnFocusRef: feedButtonRef, lockScroll: true });
  const uid = useId();
  const historyTitleId = `${uid}-history-title`;
  const feedTitleId = `${uid}-feed-title`;
  const sheetTitleId = `${uid}-sheet-title`;

  // Small screens start with the history sidebar closed.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    if (mq.matches) setSidebarOpen(false);
    setIsSmall(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsSmall(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  useEffect(() => () => inflight.current?.abort(), []);

  // Keep the newest message in view. Only the log scrolls (never the page), and
  // it jumps instead of gliding when the OS asks for reduced motion: an explicit
  // 'smooth' isn't covered by the global scroll-behavior override.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    log.scrollTo({ top: log.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
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

  const saveSession = async (sessionId: string | null, msgs: ExtendedMessage[], firstUserMsg: string | undefined, conv: number) => {
    if (!userId.current) return sessionId;
    if (!sessionId && firstInsert.current?.conversation === conv) sessionId = await firstInsert.current.id;
    const supabase = createClient();
    const title = firstUserMsg ? (firstUserMsg.length > 60 ? `${firstUserMsg.slice(0, 57)}…` : firstUserMsg) : 'New conversation';
    const serialized = msgs.filter(m => !m.local).map(m => ({ ...m, compiling: false, timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp }));
    try {
      if (sessionId) {
        const id = sessionId;
        await supabase.from('chat_sessions').update({ messages: serialized }).eq('id', id);
        // Most recently updated first, matching the order on load.
        setSessions(prev => {
          const s = prev.find(x => x.id === id);
          return s ? [{ ...s, messages: msgs, updated_at: new Date().toISOString() }, ...prev.filter(x => x.id !== id)] : prev;
        });
        return id;
      }
      const insert = (async () => {
        const { data } = await supabase.from('chat_sessions').insert({
          user_id: userId.current, title, messages: serialized,
        }).select().single();
        if (!data) return null;
        setSessions(prev => [{ ...data, messages: msgs }, ...prev]);
        return data.id as string;
      })();
      firstInsert.current = { conversation: conv, id: insert.catch(() => null) };
      return await insert;
    } catch {
      console.warn('Could not save chat session');
    }
    return null;
  };

  /** `fromComposer`: the text is what's typed in the box, so the box is cleared; retries and quick prompts leave a draft alone. */
  const sendMessage = useCallback(async (text: string, policyMeta?: PolicyMeta, fromComposer = false) => {
    if (!text.trim() || isTyping) return;

    const isFirst = !messages.some(m => m.role === 'user');
    const userMsg: ExtendedMessage = { id: Date.now().toString(), role: 'user', content: text.trim(), timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    if (fromComposer) setInput('');
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
      // Shown once, not saved, and not sent back to the model. A used-up daily
      // quota resets within a day, so it gets neither a wait time nor a retry.
      const wait = res.code === 'rate_limited' && res.retryAfter && res.retryAfter > 0 ? ` You can try again in about ${Math.ceil(res.retryAfter / 60)} min.` : '';
      const retryable = res.status === 0 || (res.status === 429 && res.code !== 'daily_quota') || res.status >= 500;
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant', local: true,
        content: `${res.message}${wait}`, timestamp: new Date(),
        retry: retryable ? { text: text.trim(), policyMeta } : undefined,
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
    const savedId = await saveSession(activeSessionId, finalMessages, title, startedIn);
    if (!activeSessionId && savedId && conversation.current === startedIn) setActiveSessionId(savedId);
  }, [messages, isTyping, activeSessionId, simple]);

  /**
   * Resend a failed message: drop the error bubble and the user turn it
   * answered. Only the latest message can be retried, so later turns are
   * never cut off (or overwritten in the saved conversation).
   */
  const retryMessage = (errorMsg: ExtendedMessage) => {
    if (!errorMsg.retry || isTyping || messages[messages.length - 1]?.id !== errorMsg.id) return;
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

  // Arriving with ?q= (the landing page's search box) puts that question in
  // the composer. It is never sent automatically. ?policyId= takes precedence.
  useEffect(() => {
    if (policyIdParam || prefilledRef.current) return;
    const question = questionParam?.trim().slice(0, MAX_PREFILL_CHARS).trim();
    if (!question) return;
    prefilledRef.current = true;
    setInput(question);
    inputRef.current?.focus();
  }, [policyIdParam, questionParam]);

  // Size the composer to its text however it was set (typing, prefill, clearing).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  const pickPolicy = (p: DiscoveredPolicy) => {
    setPendingPolicy(null);
    sendMessage(`Tell me about the financial impact of ${p.title}`, {
      policyId: p.id, policyTitle: p.title, category: p.category,
    });
  };

  const submitInput = () => {
    const meta = pendingPolicy;
    setPendingPolicy(null);
    sendMessage(input, meta || undefined, true);
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
    setLogKey(k => k + 1);
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
    if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false);
    setActiveSessionId(null);
    setLogKey(k => k + 1);
    setMessages([{ ...INITIAL_MESSAGE, timestamp: new Date() }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submitInput(); }
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <AmbientBackground />
      <div className="relative z-10 flex flex-col h-screen supports-[height:100dvh]:h-[100dvh]">
        <Navbar />
        <div className="flex-1 flex overflow-hidden pt-20 relative">

          {/* Small screens: the history overlays the chat; tapping outside closes it. */}
          <AnimatePresence>
            {sidebarOpen && (
              <m.div
                key="history-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="md:hidden absolute inset-x-0 top-20 bottom-0 z-30 bg-black/50"
                onClick={closeHistory}
                aria-hidden
              />
            )}
          </AnimatePresence>

          {/* Left: Chat history */}
          <AnimatePresence>
            {sidebarOpen && (
              <m.div
                ref={historyRef}
                role={historyModal ? 'dialog' : 'region'}
                aria-modal={historyModal || undefined}
                aria-labelledby={historyTitleId}
                tabIndex={-1}
                initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="h-full glass-strong border-0 border-r border-white/8 flex flex-col overflow-hidden flex-shrink-0 max-md:absolute max-md:top-20 max-md:bottom-0 max-md:left-0 max-md:h-auto max-md:z-40 focus:outline-none"
              >
                <div className="p-4 border-b border-white/8 flex items-center justify-between gap-2">
                  <h2 id={historyTitleId} className="text-sm font-semibold text-text-primary flex-1">Chat History</h2>
                  <button type="button" onClick={newChat}
                    className="flex items-center gap-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary-300 px-3 py-1.5 rounded-xl text-xs font-medium transition-all">
                    <Plus className="w-3 h-3" aria-hidden="true" /> New<span className="sr-only"> conversation</span>
                  </button>
                  <button type="button" onClick={closeHistory} aria-label="Close chat history" className="md:hidden p-1.5 rounded-lg hover:bg-white/5">
                    <X className="w-4 h-4 text-text-muted" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2" aria-busy={sessionsLoading || undefined}>
                  {sessionsLoading ? (
                    <div className="space-y-2 p-2">
                      <span className="sr-only">Loading conversations…</span>
                      {[...Array(4)].map((_, i) => <div key={i} aria-hidden="true" className="h-14 bg-white/5 rounded-xl animate-pulse" />)}
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="p-4 text-center">
                      <MessageSquare className="w-6 h-6 text-text-muted mx-auto mb-2" aria-hidden="true" />
                      <p className="text-xs text-text-muted">No conversations yet. Start chatting!</p>
                    </div>
                  ) : (
                    <ul>
                      {sessions.map(session => (
                        <li key={session.id} className={`group relative mb-1 rounded-xl transition-all ${
                          activeSessionId === session.id ? 'bg-primary/15 border border-primary/20' : 'hover:bg-white/5 border border-transparent'
                        }`}>
                          <button type="button" onClick={() => loadSession(session)} aria-current={activeSessionId === session.id || undefined}
                            className="w-full text-left p-3 pr-9 rounded-xl">
                            <span className="block text-xs font-medium text-text-primary truncate">{session.title}</span>
                            <span className="flex items-center gap-1 mt-1">
                              <Clock className="w-2.5 h-2.5 text-text-muted" aria-hidden="true" />
                              <span className="text-meta text-text-muted">{new Date(session.updated_at || session.created_at).toLocaleDateString()}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSession(session.id)}
                            aria-label={`Delete conversation “${session.title}”`}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-text-muted opacity-60 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-300 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* Center: Chat */}
          <main id="main" tabIndex={-1} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 py-4 overflow-hidden">

              {/* Header */}
              <div className="mb-4 flex items-center gap-3">
                <button ref={historyToggleRef} type="button" onClick={() => setSidebarOpen(o => !o)} aria-label="Chat history" aria-expanded={sidebarOpen} className="p-2 rounded-xl glass hover:border-white/16 transition-all">
                  {sidebarOpen ? <ChevronLeft className="w-4 h-4 text-text-muted" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 text-text-muted" aria-hidden="true" />}
                </button>
                <div aria-hidden="true" className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="font-display text-xl font-bold text-text-primary">AI Policy Guide</h1>
                  <div className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-xs text-text-muted">Profile loaded • Non-partisan • Dollar-specific answers</p>
                  </div>
                </div>
                <ReadingModeToggle className="hidden sm:inline-flex" />
                <button type="button" onClick={() => setFeedOpen(o => !o)} className="p-2 rounded-xl glass hover:border-white/16 transition-all hidden lg:flex" aria-label="Policy feed" aria-expanded={feedOpen}>
                  <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
                </button>
                <button ref={feedButtonRef} type="button" onClick={() => setMobileFeedOpen(true)} aria-haspopup="dialog" aria-expanded={mobileFeedOpen}
                  className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl glass text-xs text-text-primary">
                  <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden /> Policies
                </button>
              </div>

              {/* Quick prompts */}
              <div role="group" aria-label="Suggested questions" className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
                {quickPrompts.map(p => {
                  const Icon = p.icon;
                  return (
                    <button key={p.label} type="button" onClick={() => sendMessage(p.text)} disabled={isTyping}
                      className="disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 flex items-center gap-2 glass backdrop-filter-none border-white/8 hover:border-primary/30 px-4 py-2.5 rounded-xl text-xs text-text-muted hover:text-text-primary transition-all">
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />{p.label}<span className="sr-only">: ask “{p.text}”</span>
                    </button>
                  );
                })}
              </div>

              {/* Messages */}
              {/* New messages are read out as they arrive. Opening another conversation
                  remounts the log, so its history isn't announced as new messages. */}
              <div
                key={logKey}
                ref={logRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label="Conversation"
                tabIndex={0}
                className="flex-1 overflow-y-auto pr-1 rounded-xl"
                style={{ scrollbarWidth: 'thin' }}
              >
                {messages.map((msg, i) => (
                  <MessageBubble key={msg.id} message={msg} sessionId={activeSessionId} onRetry={i === messages.length - 1 ? retryMessage : undefined} />
                ))}
                {isTyping && <TypingIndicator />}
              </div>

              {/* Input (drop target). The textarea draws no outline of its own; the
                  whole composer shows the focus ring instead. */}
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
                className={`mt-4 glass-strong rounded-2xl p-3 transition-all has-[textarea:focus-visible]:border-primary-300 has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-primary-300/60 ${dragOver ? 'border-primary/50 ring-2 ring-primary/30' : ''}`}
              >
                <div className="flex items-end gap-3">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    aria-label="Message the Policy Guide"
                    onKeyDown={handleKeyDown}
                    placeholder={dragOver ? 'Drop a policy here to analyze it…' : 'Ask about any policy and how it affects your finances…'}
                    rows={1}
                    maxLength={MAX_TURN_CHARS}
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted resize-none outline-none py-1.5 max-h-32"
                    style={{ minHeight: '28px' }}
                  />
                  <button type="button" onClick={submitInput} disabled={!input.trim() || isTyping} aria-label="Send message"
                    className="w-9 h-9 rounded-xl bg-primary-fill hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0">
                    <Send className="w-4 h-4 text-white" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <AiDisclaimer className="mt-2 justify-center text-center" />
            </div>
          </main>

          {/* Small screens: the feed opens as a bottom sheet */}
          <AnimatePresence>
            {mobileFeedOpen && (
              <>
                <m.div
                  key="feed-backdrop"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="lg:hidden fixed inset-0 bg-black/60 z-[110]"
                  onClick={closeMobileFeed}
                  aria-hidden="true"
                />
                <m.div
                  key="feed-sheet"
                  ref={feedSheetRef}
                  role="dialog" aria-modal="true" aria-labelledby={sheetTitleId}
                  tabIndex={-1}
                  initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                  transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                  className="lg:hidden fixed inset-x-0 bottom-0 z-[120] max-h-[75dvh] glass-strong border-0 border-t border-white/10 rounded-t-3xl flex flex-col focus:outline-none"
                >
                  <div className="p-4 border-b border-white/8 flex items-center justify-between">
                    <h2 id={sheetTitleId} className="text-sm font-semibold text-text-primary">Your Policy Feed</h2>
                    <button type="button" onClick={closeMobileFeed} aria-label="Close policy feed" className="p-2 rounded-lg hover:bg-white/5">
                      <X className="w-4 h-4 text-text-muted" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto overscroll-contain p-3" aria-busy={feedLoading || undefined}>
                    {feedLoading ? (
                      <div className="space-y-2">
                        <span className="sr-only">Loading your policy feed…</span>
                        {[...Array(4)].map((_, i) => <div key={i} aria-hidden="true" className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
                      </div>
                    ) : feed.length === 0 ? (
                      <p className="p-4 text-center text-xs text-text-muted">No policies in your feed yet. Visit your dashboard to generate one.</p>
                    ) : (
                      feed.map(p => <FeedPolicyCard key={p.id} policy={p} onPick={(x) => { closeMobileFeed(); pickPolicy(x); }} />)
                    )}
                  </div>
                </m.div>
              </>
            )}
          </AnimatePresence>

          {/* Right: Policy feed */}
          <AnimatePresence>
            {feedOpen && (
              <m.aside
                aria-labelledby={feedTitleId}
                initial={{ width: 0, opacity: 0 }} animate={{ width: 300, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="h-full glass-strong border-0 border-l border-white/8 flex-col overflow-hidden flex-shrink-0 hidden lg:flex"
              >
                <div className="p-4 border-b border-white/8 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
                    <h2 id={feedTitleId} className="text-sm font-semibold text-text-primary">Your Policy Feed</h2>
                  </div>
                  <button type="button" onClick={() => setFeedOpen(false)} aria-label="Close policy feed" className="p-1 rounded-lg hover:bg-white/5 transition-all">
                    <X className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
                  </button>
                </div>
                <p className="text-meta text-text-muted px-4 pt-3">Click or drag a policy into the chat.</p>
                <div className="flex-1 overflow-y-auto p-3" aria-busy={feedLoading || undefined}>
                  {feedLoading ? (
                    <div className="space-y-2">
                      <span className="sr-only">Loading your policy feed…</span>
                      {[...Array(6)].map((_, i) => <div key={i} aria-hidden="true" className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
                    </div>
                  ) : feed.length === 0 ? (
                    <div className="p-4 text-center">
                      <Sparkles className="w-6 h-6 text-text-muted mx-auto mb-2" aria-hidden="true" />
                      <p className="text-xs text-text-muted">No policies in your feed yet. Visit your dashboard to generate one.</p>
                    </div>
                  ) : (
                    feed.map(p => <FeedPolicyCard key={p.id} policy={p} onPick={pickPolicy} />)
                  )}
                </div>
              </m.aside>
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
        <div className="relative z-10">
          <Navbar />
          {/* The prerendered HTML is this fallback, so it carries the skip-link target. */}
          <main id="main" tabIndex={-1} aria-busy="true" className="pt-20">
            <span className="sr-only">Loading the Policy Guide…</span>
          </main>
        </div>
      </div>
    }>
      <AdvisorInner />
    </Suspense>
  );
}
