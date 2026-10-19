'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api';
import { prefersLessMotion } from '@/lib/motion';
import { policyCategory, track } from '@/lib/track';
import type { DiscoveredPolicy } from '@/types';
import type { RailAnalysisRow } from '@/components/guide/policyRail';
import {
  INITIAL_MESSAGE,
  MAX_HISTORY_TURNS,
  MAX_PREFILL_CHARS,
  MAX_RAIL_ANALYSES,
  MAX_SESSIONS,
  MAX_TURN_CHARS,
  policyQuestion,
  type ChatSession,
  type ExtendedMessage,
  type PolicyMeta,
} from './types';

interface Options {
  /** The user's policy feed (for the dashboard's ?policyId= hand-off). */
  feed: readonly DiscoveredPolicy[];
  feedLoading: boolean;
  /** Plain-language replies (the reading mode). */
  simple: boolean;
  /** Called with each reply that lands (model or fixed), e.g. to make the orb speak it. */
  onReply?: (reply: ExtendedMessage) => void;
}

/**
 * The Policy Guide's conversation: the saved conversations, the messages of
 * the open one, the composer's text, sending (with the reply's guardrail,
 * error and retry handling) and saving, and the two ways a question can
 * arrive prefilled. Behaviour is exactly the advisor's before the Chamber
 * redesign; only window.confirm/alert moved out (deleteSession reports
 * success, and the page confirms and toasts).
 *
 * - Only real turns (never the greeting or error bubbles) go to the model,
 *   the last 20, each capped at 4,000 characters.
 * - Switching conversations cancels the reply being waited for, so it can
 *   never land in (or be saved to) another conversation.
 * - A new conversation's first save inserts its row; a follow-up saved
 *   before that finishes waits for it and updates the same row.
 * - ?policyId= (the dashboard's "Ask the guide") prefills the question for
 *   a policy in the user's own feed once the feed has loaded; ?q= (the
 *   landing page's search) prefills its question. Neither is ever sent
 *   until the user presses send.
 */
export function useGuideConversation({ feed, feedLoading, simple, onReply }: Options) {
  const searchParams = useSearchParams();
  const policyIdParam = searchParams.get('policyId');
  const questionParam = searchParams.get('q');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ExtendedMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  // The user's own analyses, for the "Your policies" rail (empty until loaded, or if they can't be).
  const [analyses, setAnalyses] = useState<RailAnalysisRow[]>([]);
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
  // Bumped when another conversation is opened, to remount the message log.
  const [logKey, setLogKey] = useState(0);
  const onReplyRef = useRef(onReply);
  useEffect(() => {
    onReplyRef.current = onReply;
  });

  useEffect(() => () => inflight.current?.abort(), []);

  // Keep the newest message in view. Only the log scrolls (never the page), and
  // it jumps instead of gliding under reduced motion or "Pause motion": an
  // explicit 'smooth' isn't covered by the global scroll-behavior override.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTo({ top: log.scrollHeight, behavior: prefersLessMotion() ? 'auto' : 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setSessionsLoading(false); return; }
      userId.current = user.id;
      // The rail's analyses load alongside, quietly: without them it shows the feed alone.
      void (async () => {
        try {
          const { data, error } = await supabase
            .from('policy_analyses')
            .select('policy_id, policy_title, category, dollar_impact')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(MAX_RAIL_ANALYSES);
          if (!error && Array.isArray(data)) setAnalyses(data as RailAnalysisRow[]);
        } catch {
          // No analyses on the rail; the feed is still there.
        }
      })();
      try {
        const { data } = await supabase
          .from('chat_sessions')
          .select('id, title, messages, created_at, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(MAX_SESSIONS);
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
    // Never the message itself: only whether it was about a feed policy, and how it went.
    track('guide_message_sent', {
      source: policyMeta ? 'policy' : 'chat',
      category: policyCategory(policyMeta?.category),
      reading_mode: simple ? 'simple' : 'expert',
      status: !res.ok ? 'error' : res.data.guardrail ? 'guardrail' : 'ok',
    });

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
    onReplyRef.current?.(aiMsg);
    const title = isFirst ? (policyMeta?.policyTitle || text.trim()) : undefined;
    const savedId = await saveSession(activeSessionId, finalMessages, title, startedIn);
    if (!activeSessionId && savedId && conversation.current === startedIn) setActiveSessionId(savedId);
  }, [messages, isTyping, activeSessionId, simple]);

  /**
   * Resend a failed message: drop the error bubble and the user turn it
   * answered. Only the latest message can be retried, so later turns are
   * never cut off (or overwritten in the saved conversation).
   */
  const [pendingRetry, setPendingRetry] = useState<{ text: string; policyMeta?: PolicyMeta } | null>(null);
  const retryMessage = (errorMsg: ExtendedMessage) => {
    if (!errorMsg.retry || isTyping || messages[messages.length - 1]?.id !== errorMsg.id) return;
    const { text, policyMeta } = errorMsg.retry;
    const idx = messages.findIndex(m => m.id === errorMsg.id);
    const trimmed = messages.slice(0, idx > 0 && messages[idx - 1].role === 'user' ? idx - 1 : idx);
    setMessages(trimmed);
    // sendMessage reads `messages` from its closure, so send on the next render.
    setPendingRetry({ text, policyMeta });
  };
  useEffect(() => {
    if (!pendingRetry) return;
    setPendingRetry(null);
    void sendMessage(pendingRetry.text, pendingRetry.policyMeta);
  }, [pendingRetry, sendMessage]);

  // Arriving with ?policyId= (e.g. "Ask the guide" on the dashboard) prefills the
  // question for a policy from the user's own feed. Nothing is sent until the
  // user presses send.
  useEffect(() => {
    if (!policyIdParam || prefilledRef.current || feedLoading) return;
    const match = feed.find(p => p.id === policyIdParam);
    if (!match) return;
    prefilledRef.current = true;
    setPendingPolicy({ policyId: match.id, policyTitle: match.title, category: match.category });
    setInput(policyQuestion(match.title));
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

  /** Ask about one of the user's policies straight away (a chip, a drop on the orb or the composer). */
  const askAbout = (p: { id: string; title: string; category?: string }) => {
    setPendingPolicy(null);
    void sendMessage(policyQuestion(p.title), {
      policyId: p.id, policyTitle: p.title, category: p.category,
    });
  };

  const submitInput = () => {
    const meta = pendingPolicy;
    setPendingPolicy(null);
    void sendMessage(input, meta || undefined, true);
  };

  const cancelInflight = () => {
    conversation.current += 1;
    inflight.current?.abort();
    inflight.current = null;
    setIsTyping(false);
  };

  const loadSession = (session: ChatSession) => {
    cancelInflight();
    setActiveSessionId(session.id);
    setLogKey(k => k + 1);
    setMessages(session.messages.length > 0 ? session.messages : [{ ...INITIAL_MESSAGE, timestamp: new Date() }]);
  };

  const newChat = () => {
    cancelInflight();
    setActiveSessionId(null);
    setLogKey(k => k + 1);
    setMessages([{ ...INITIAL_MESSAGE, timestamp: new Date() }]);
  };

  /** Deletes a saved conversation (the page asks first). False when it couldn't be deleted. */
  const deleteSession = async (id: string): Promise<boolean> => {
    try {
      const { error } = await createClient().from('chat_sessions').delete().eq('id', id);
      if (error) return false;
    } catch {
      return false;
    }
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) newChat();
    return true;
  };

  return {
    sessions,
    sessionsLoading,
    activeSessionId,
    messages,
    input,
    setInput,
    isTyping,
    analyses,
    pendingPolicy,
    clearPendingPolicy: () => setPendingPolicy(null),
    logRef,
    inputRef,
    logKey,
    sendMessage,
    retryMessage,
    askAbout,
    submitInput,
    loadSession,
    newChat,
    deleteSession,
  };
}
