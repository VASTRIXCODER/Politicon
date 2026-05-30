'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Zap, DollarSign, Home, Heart, GraduationCap, Briefcase } from 'lucide-react';
import { ChatMessage } from '@/types';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';

const quickPrompts = [
  { icon: Home, label: 'Housing', text: 'How does the first-time homebuyer credit affect me?' },
  { icon: GraduationCap, label: 'Student Loans', text: 'Explain how the student loan rate adjustment impacts my monthly budget.' },
  { icon: Heart, label: 'Healthcare', text: 'Am I eligible for ACA subsidy extensions and how much would I save?' },
  { icon: Briefcase, label: 'Career', text: 'What clean energy job training programs could I qualify for?' },
  { icon: DollarSign, label: 'Taxes', text: 'How does the proposed capital gains tax increase affect my investments?' },
];

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

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-end gap-3 mb-4 ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <Zap className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div className={`max-w-[75%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed ${
        isUser
          ? 'bg-primary/20 border border-primary/25 text-text-primary rounded-tr-sm'
          : 'glass text-text-muted rounded-tl-sm'
      }`}>
        <p className="whitespace-pre-wrap">{message.content}</p>
        <p className={`text-[10px] mt-2 ${
          isUser ? 'text-primary/60' : 'text-text-muted/50'
        }`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </motion.div>
  );
}

export default function AdvisorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      role: 'assistant',
      content: "Hi! I'm your Politicon AI Financial Advisor. I have your profile loaded and can tell you exactly how any policy affects your wallet — in real dollars.\n\nWhat would you like to know?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const history = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...history, { role: 'user', parts: [{ text: text.trim() }] }] }),
      });
      const data = await res.json();
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: data.response || 'I apologize, I had trouble processing that. Please try again.', timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      const errMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: 'I\'m having trouble connecting right now. Please try again in a moment.', timestamp: new Date() };
      setMessages(prev => [...prev, errMsg]);
    }
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <AmbientBackground />
      <div className="relative z-10 flex flex-col" style={{ height: '100vh' }}>
        <Navbar />
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 pt-24 pb-6 overflow-hidden">

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold text-text-primary">AI Financial Advisor</h1>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-xs text-text-muted">Profile loaded • Non-partisan • Dollar-specific answers</p>
                </div>
              </div>
            </div>
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
          <div className="flex-1 overflow-y-auto pr-1 space-y-0" style={{ scrollbarWidth: 'thin' }}>
            {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="mt-4 glass-strong rounded-2xl p-3">
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about any policy and how it affects your finances..."
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
    </div>
  );
}
