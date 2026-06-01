'use client';

import { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import {
  Send, Zap, DollarSign, Home, Heart, GraduationCap, Briefcase, Plus, MessageSquare,
  Clock, ChevronLeft, ChevronRight, Loader2, TrendingUp, TrendingDown, Minus, Sparkles, X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ChatMessage, DiscoveredPolicy } from '@/types';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';
import ViewFullImpactButton from '@/components/ViewFullImpactButton';

const quickPrompts = [
  { icon: Home, label: 'Housing', text: 'How does the first-time homebuyer credit affect me?' },
  { icon: GraduationCap, label: 'Student Loans', text: 'Explain how the student loan rate adjustment impacts my monthly budget.' },
  { icon: Heart, label: 'Healthcare', text: 'Am I eligible for ACA subsidy extensions and how much would I save?' },
  { icon: Briefcase, label: 'Career', text: 'What clean energy job training programs could I qualify for?' },
  { icon: DollarSign, label: 'Taxes', text: 'How does the proposed capital gains tax increase affect my investments?' },
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

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

function MessageBubble({ message }: { message: ExtendedMessage }) {
  const isUser = message.role === 'user';
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
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        )}
        <p className={`text-[10px] mt-2 ${isUser ? 'text-primary/60' : 'text-text-muted/50'}`}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
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
        e.dataTransfer.setData('application/json', JSON.stringify(policy));
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

const INITIAL_MESSAGE: ExtendedMessage = {
  id: '0',
  role: 'assistant',
  content: "Hi! I'm your Politicon AI Financial Advisor. I have your profile loaded and can tell you exactly how any policy affects your wallet — in real dollars.\n\nPick a policy from the feed on the right, or ask me anything.",
  timestamp: new Date(),
};

function AdvisorInner() {
  const searchParams = useSearchParams();
  const policyParam = searchParams.get('policy');
  const contextParam = searchParams.get('context');

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
  const autoSentRef = useRef(false);

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
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
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

  // Load the personalized policy feed (cached server-side)
  useEffect(() => {
    async function loadFeed() {
      setFeedLoading(true);
      try {
        const res = await fetch('/api/policies/feed');
        const data = await res.json();
        setFeed(Array.isArray(data.policies) ? data.policies : Array.isArray(data) ? data : []);
      } catch {
        setFeed([]);
      } finally {
        setFeedLoading(false);
      }
    }
    loadFeed();
  }, []);

  const saveSession = async (sessionId: string | null, msgs: ExtendedMessage[], firstUserMsg?: string) => {
    if (!userId.current) return sessionId;
    const supabase = createClient();
    const title = firstUserMsg?.slice(0, 40) || 'New conversation';
    const serialized = msgs.map(m => ({ ...m, compiling: false, timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp }));
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

    const isFirst = messages.length === 1;
    const userMsg: ExtendedMessage = { id: Date.now().toString(), role: 'user', content: text.trim(), timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      const history = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...history, { role: 'user', parts: [{ text: text.trim() }] }],
          ...(policyMeta ? { policyContext: policyMeta } : {}),
        }),
      });
      const data = await res.json();

      const aiId = (Date.now() + 1).toString();
      const aiMsg: ExtendedMessage = {
        id: aiId,
        role: 'assistant',
        content: data.response || 'I had trouble processing that. Please try again.',
        timestamp: new Date(),
        summary: data.summary || undefined,
        dollarLine: data.dollarLine || undefined,
        policyId: data.policyId || policyMeta?.policyId || undefined,
        policyTitle: data.policyTitle || policyMeta?.policyTitle || undefined,
        category: data.category || policyMeta?.category || undefined,
        hasFullAnalysis: data.hasFullAnalysis || false,
        compiling: !!policyMeta,
      };
      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);

      const savedId = await saveSession(activeSessionId, finalMessages, isFirst ? text.trim() : undefined);
      if (!activeSessionId && savedId) setActiveSessionId(savedId);

      // Background: pre-compile the full analysis so View Full Impact is instant.
      if (policyMeta) {
        fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            policy: {
              id: policyMeta.policyId, title: policyMeta.policyTitle,
              summary: policyMeta.context || policyMeta.policyTitle, description: policyMeta.context || policyMeta.policyTitle,
              category: policyMeta.category || 'General', status: 'proposed', date: new Date().toISOString(),
              source: 'Advisor', sourceUrl: '', governingBody: 'Federal', region: 'Federal',
              confidenceLevel: 'medium', impacts: [], assumptions: [], tags: [],
            },
          }),
        }).catch(() => null).finally(() => {
          setMessages(prev => prev.map(m => m.id === aiId ? { ...m, compiling: false } : m));
        });
      }
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      }]);
    }
    setIsTyping(false);
  }, [messages, isTyping, activeSessionId]);

  // Auto-send from URL params once on mount
  useEffect(() => {
    if (!policyParam || autoSentRef.current) return;
    autoSentRef.current = true;
    const text = contextParam
      ? `Tell me about the financial impact of ${policyParam}: ${contextParam}`
      : `Tell me about the financial impact of ${policyParam}`;
    const meta: PolicyMeta = { policyId: slugify(policyParam), policyTitle: policyParam, context: contextParam || undefined };
    const timer = setTimeout(() => sendMessage(text, meta), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyParam, contextParam]);

  const pickPolicy = (p: DiscoveredPolicy) => {
    sendMessage(`Tell me about the financial impact of ${p.title}`, {
      policyId: p.id, policyTitle: p.title, category: p.category, context: p.summary || p.description,
    });
  };

  const loadSession = (session: ChatSession) => {
    setActiveSessionId(session.id);
    setMessages(session.messages.length > 0 ? session.messages : [{ ...INITIAL_MESSAGE, timestamp: new Date() }]);
  };

  const newChat = () => {
    setActiveSessionId(null);
    setMessages([{ ...INITIAL_MESSAGE, timestamp: new Date() }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <AmbientBackground />
      <div className="relative z-10 flex flex-col" style={{ height: '100vh' }}>
        <Navbar />
        <div className="flex-1 flex overflow-hidden pt-20">

          {/* Left: Chat history */}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="h-full glass-strong border-r border-white/8 flex flex-col overflow-hidden flex-shrink-0"
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
                      <button key={session.id} onClick={() => loadSession(session)}
                        className={`w-full text-left p-3 rounded-xl mb-1 transition-all ${
                          activeSessionId === session.id ? 'bg-primary/15 border border-primary/20' : 'hover:bg-white/5 border border-transparent'
                        }`}>
                        <p className="text-xs font-medium text-text-primary truncate">{session.title}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="w-2.5 h-2.5 text-text-muted" />
                          <span className="text-[10px] text-text-muted">{new Date(session.created_at).toLocaleDateString()}</span>
                        </div>
                      </button>
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
                <button onClick={() => setSidebarOpen(o => !o)} className="p-2 rounded-xl glass hover:border-white/16 transition-all">
                  {sidebarOpen ? <ChevronLeft className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
                </button>
                <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h1 className="font-display text-xl font-bold text-text-primary">AI Financial Advisor</h1>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-xs text-text-muted">Profile loaded • Non-partisan • Dollar-specific answers</p>
                  </div>
                </div>
                <button onClick={() => setFeedOpen(o => !o)} className="p-2 rounded-xl glass hover:border-white/16 transition-all hidden lg:flex" title="Toggle policy feed">
                  <Sparkles className="w-4 h-4 text-primary" />
                </button>
              </div>

              {/* Quick prompts */}
              <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
                {quickPrompts.map(p => {
                  const Icon = p.icon;
                  return (
                    <button key={p.label} onClick={() => sendMessage(p.text)}
                      className="flex-shrink-0 flex items-center gap-2 glass border border-white/8 hover:border-primary/30 px-4 py-2.5 rounded-xl text-xs text-text-muted hover:text-text-primary transition-all">
                      <Icon className="w-3.5 h-3.5" />{p.label}
                    </button>
                  );
                })}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
                {isTyping && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>

              {/* Input (drop target) */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  try {
                    const p = JSON.parse(e.dataTransfer.getData('application/json')) as DiscoveredPolicy;
                    if (p?.title) pickPolicy(p);
                  } catch { /* ignore bad drops */ }
                }}
                className={`mt-4 glass-strong rounded-2xl p-3 transition-all ${dragOver ? 'border-primary/50 ring-2 ring-primary/30' : ''}`}
              >
                <div className="flex items-end gap-3">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={dragOver ? 'Drop a policy here to analyze it…' : 'Ask about any policy and how it affects your finances…'}
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted resize-none outline-none py-1.5 max-h-32"
                    style={{ minHeight: '28px' }}
                  />
                  <button onClick={() => sendMessage(input)} disabled={!input.trim() || isTyping}
                    className="w-9 h-9 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0">
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-text-muted text-center mt-2">Not financial advice. For informational purposes only.</p>
            </div>
          </div>

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
                  <button onClick={() => setFeedOpen(false)} className="p-1 rounded-lg hover:bg-white/5 transition-all">
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
