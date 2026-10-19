'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, History, Plus, Sparkles, X } from 'lucide-react';
import AiDisclaimer from '@/components/ui/AiDisclaimer';
import ReadingModeToggle from '@/components/ui/ReadingModeToggle';
import { useToast } from '@/components/ui/Toast';
import { useReadingMode } from '@/components/providers/ReadingModeProvider';
import BottomSheet from '@/components/guide/BottomSheet';
import { buildRail, droppedPolicy, type RailPolicy } from '@/components/guide/policyRail';
import styles from '@/components/guide/guide.module.css';
import { playCue } from '@/lib/sound';
import { cn } from '@/lib/utils';
import Composer from './Composer';
import ConversationList from './ConversationList';
import MessagePane, { TypingPane } from './MessagePane';
import OrbDock from './OrbDock';
import PolicyRail from './PolicyRail';
import QuickPrompts from './QuickPrompts';
import { GuideStatus, GuideTitle } from './ChamberTitle';
import { usePolicyFeed } from './usePolicyFeed';
import { useGuideConversation } from './useGuideConversation';
import type { ChatSession } from './types';

/*
 * The AI Policy Guide as "the Chamber" (the page is a night scene whatever
 * the site theme; app/advisor/page.tsx puts it in a night AppShell):
 *
 *   tablets and up   saved conversations in a side panel (left)
 *   desktops         "Your policies" in a side rail (right): chips to drag
 *                    onto the orb, each with an "Ask about this policy" button
 *   phones           both open as bottom sheets from the header
 *
 * At the head of the conversation the guide's orb breathes, swirls while a
 * reply is on its way and pulses as one arrives (components/guide). Below
 * it the suggested questions, the conversation (role=log, glass panes at
 * depth) and the composer pinned to the foot, with the AI disclaimer.
 *
 * Deleting a conversation asks first (ConfirmDialog) and reports back in a
 * toast; nothing uses window.confirm or alert.
 */

// Only needed once someone deletes a conversation: kept out of the page's first load.
// It brings its own motion/react setup (the page's layout doesn't load motion).
const ConfirmDialog = dynamic(() => import('@/components/ui/ConfirmDialogWithMotion'), { ssr: false });

const PANEL_HEADER = 'flex items-center justify-between gap-2 border-b border-fg/8 p-4';
/** The side panels: night glass (they hold controls and lists, not figures). */
const SIDE_PANEL = 'hidden h-full flex-shrink-0 flex-col overflow-hidden border-fg/8 bg-surface/70 backdrop-blur-md [@media(prefers-reduced-transparency:reduce)]:bg-surface';
const ICON_BUTTON = 'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-fg/10 bg-fg/5 text-muted transition-colors duration-200 ease-civic hover:border-fg/20 hover:text-ink';

export default function AdvisorChamber() {
  const { simple } = useReadingMode();
  const { feed, feedLoading } = usePolicyFeed();
  // The orb (in OrbDock) speaks each reply that lands.
  const speakRef = useRef<(_text: string) => void>(() => {});
  const chat = useGuideConversation({ feed, feedLoading, simple, onReply: (m) => speakRef.current(m.content) });

  const rail = useMemo(() => buildRail(feed, chat.analyses), [feed, chat.analyses]);
  const { toast, showToast } = useToast();

  // Side panels (tablets and desktops) and their phone sheets.
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historySheet, setHistorySheet] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [railSheet, setRailSheet] = useState(false);
  const historySheetButtonRef = useRef<HTMLButtonElement>(null);
  const railSheetButtonRef = useRef<HTMLButtonElement>(null);
  const railToggleRef = useRef<HTMLButtonElement>(null);
  const closeHistorySheet = useCallback(() => setHistorySheet(false), []);
  const closeRailSheet = useCallback(() => setRailSheet(false), []);
  const [dragging, setDragging] = useState(false);

  const uid = useId();
  const historyId = `${uid}-history`;
  const railId = `${uid}-rail`;
  const historyTitleId = `${uid}-history-title`;
  const historySheetTitleId = `${uid}-history-sheet-title`;
  const railTitleId = `${uid}-rail-title`;
  const railSheetTitleId = `${uid}-rail-sheet-title`;

  // Deleting: asked in a dialog, reported in a toast.
  const [toDelete, setToDelete] = useState<ChatSession | null>(null);
  const [deleting, setDeleting] = useState(false);
  // The dialog mounts on the first delete and then stays, so closing it gives focus back.
  const [confirmMounted, setConfirmMounted] = useState(false);
  const askDelete = (s: ChatSession) => {
    // The sheet is a modal of its own: close it first, so the dialog has the keyboard.
    setHistorySheet(false);
    setConfirmMounted(true);
    setToDelete(s);
  };
  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const ok = await chat.deleteSession(toDelete.id);
    setDeleting(false);
    setToDelete(null);
    if (ok) {
      showToast('Conversation deleted.');
      // Its delete button went with it: once the dialog has closed (after the
      // next frame, and its close event), carry on in the composer.
      requestAnimationFrame(() => {
        window.setTimeout(() => {
          if (!document.activeElement || document.activeElement === document.body) chat.inputRef.current?.focus();
        }, 0);
      });
    } else {
      showToast('Could not delete the conversation. Please try again.', 'error');
    }
  };

  const ask = (p: RailPolicy) => {
    setDragging(false);
    chat.askAbout(p);
  };
  const askFromSheet = (p: RailPolicy) => {
    closeRailSheet();
    ask(p);
  };
  // Only policies on the rail are taken from a drop (anything else is ignored).
  const dropPolicy = (id: string) => {
    setDragging(false);
    const p = droppedPolicy(rail, id);
    if (!p || chat.isTyping) return;
    playCue('tick');
    chat.askAbout(p);
  };

  const openSession = (s: ChatSession) => {
    closeHistorySheet();
    chat.loadSession(s);
  };
  const startNewChat = () => {
    closeHistorySheet();
    chat.newChat();
  };

  const newConversationButton = (
    <button
      type="button"
      onClick={startNewChat}
      className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary-300 transition-colors duration-200 ease-civic hover:bg-primary/25 hover:text-ink"
    >
      <Plus className="h-3 w-3" aria-hidden="true" /> New<span className="sr-only"> conversation</span>
    </button>
  );
  const conversationList = (
    <ConversationList sessions={chat.sessions} loading={chat.sessionsLoading} activeId={chat.activeSessionId} onOpen={openSession} onDelete={askDelete} />
  );
  const railHint = 'Drag a policy onto the light, or choose Ask about this policy.';

  return (
    // The night shell (AppShell night) is exactly the screen, and the light field
    // softens a night section's edge, so the day paper would show as a thin grey
    // frame round the screen; this box asks for night past its edges ("bleed").
    <div data-scene-night="bleed" className="flex h-full min-h-0 flex-col">
      {/* Room for the floating navigation bar. */}
      <div aria-hidden="true" className="h-[4.75rem] flex-shrink-0 sm:h-20" />
      <div className="relative flex min-h-0 flex-1">
        {/* Saved conversations (tablets and up). */}
        <section
          id={historyId}
          aria-labelledby={historyTitleId}
          inert={!historyOpen || undefined}
          className={cn(styles.side, SIDE_PANEL, 'md:flex', historyOpen ? 'w-[16.5rem] border-r opacity-100' : 'w-0 opacity-0')}
        >
          {/* Full width while the panel opens and closes, so nothing reflows. */}
          <div className="flex h-full w-[16.5rem] flex-col">
            <div className={PANEL_HEADER}>
              <h2 id={historyTitleId} className="flex-1 font-display text-base font-medium text-ink">Chat History</h2>
              {newConversationButton}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-busy={chat.sessionsLoading || undefined}>
              {conversationList}
            </div>
          </div>
        </section>

        {/* The conversation. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pb-3 sm:px-6">
            <div className="flex items-center gap-2.5 py-3 sm:gap-3">
              <button
                type="button"
                onClick={() => setHistoryOpen(o => !o)}
                aria-label="Chat history"
                aria-expanded={historyOpen}
                aria-controls={historyId}
                className={cn(ICON_BUTTON, 'hidden md:flex')}
              >
                {historyOpen ? <ChevronLeft className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button
                ref={historySheetButtonRef}
                type="button"
                onClick={() => setHistorySheet(true)}
                aria-label="Chat history"
                aria-haspopup="dialog"
                aria-expanded={historySheet}
                className={cn(ICON_BUTTON, 'md:hidden')}
              >
                <History className="h-4 w-4" aria-hidden="true" />
              </button>

              <OrbDock
                thinking={chat.isTyping}
                speakRef={speakRef}
                dragging={dragging}
                onDropPolicy={dropPolicy}
                title={<GuideTitle />}
                status={<GuideStatus />}
              />

              <button
                ref={railToggleRef}
                type="button"
                onClick={() => setRailOpen(o => !o)}
                aria-label="Your policies"
                aria-expanded={railOpen}
                aria-controls={railId}
                className={cn(ICON_BUTTON, 'hidden lg:flex')}
              >
                <Sparkles className="h-4 w-4 text-primary-300" aria-hidden="true" />
              </button>
              <button
                ref={railSheetButtonRef}
                type="button"
                onClick={() => setRailSheet(true)}
                aria-haspopup="dialog"
                aria-expanded={railSheet}
                className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full border border-fg/10 bg-fg/5 px-2.5 text-xs font-medium text-ink transition-colors duration-200 ease-civic hover:border-fg/20 sm:px-3 lg:hidden"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary-300" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Policies</span>
              </button>
            </div>

            {/* Suggested questions, and how the guide words its answers. */}
            <div className="flex items-center gap-3">
              <QuickPrompts disabled={chat.isTyping} onAsk={(text) => void chat.sendMessage(text)} />
              <ReadingModeToggle className="mb-2 hidden flex-shrink-0 sm:inline-flex" />
            </div>

            {/* New messages are read out as they arrive. Opening another conversation
                remounts the log, so its history isn't announced as new messages. The
                log fades into the dark at its top edge (a mask), so its focus ring is
                drawn by the frame around it, which the mask can't clip. */}
            <div className="relative min-h-0 flex-1 rounded-xl has-[[role=log]:focus-visible]:outline has-[[role=log]:focus-visible]:outline-2 has-[[role=log]:focus-visible]:outline-offset-2 has-[[role=log]:focus-visible]:outline-focus">
              <div
                key={chat.logKey}
                ref={chat.logRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label="Conversation"
                tabIndex={0}
                className={cn(styles.logFade, 'relative h-full overflow-y-auto rounded-xl px-0.5 pr-1 pt-4 focus-visible:outline-none')}
                style={{ scrollbarWidth: 'thin' }}
              >
                {chat.messages.map((msg, i) => (
                  <MessagePane
                    key={msg.id}
                    message={msg}
                    sessionId={chat.activeSessionId}
                    onRetry={i === chat.messages.length - 1 ? chat.retryMessage : undefined}
                  />
                ))}
                {chat.isTyping && <TypingPane />}
              </div>
            </div>

            <Composer
              value={chat.input}
              onChange={chat.setInput}
              onSubmit={chat.submitInput}
              disabled={chat.isTyping}
              inputRef={chat.inputRef}
              pendingPolicy={chat.pendingPolicy}
              onClearPolicy={chat.clearPendingPolicy}
              onDropPolicy={dropPolicy}
            />
            <AiDisclaimer className="mt-2 justify-center text-center" />
          </div>
        </div>

        {/* Your policies (desktops). */}
        <section
          id={railId}
          aria-labelledby={railTitleId}
          inert={!railOpen || undefined}
          className={cn(styles.side, SIDE_PANEL, 'lg:flex', railOpen ? 'w-[18.75rem] border-l opacity-100' : 'w-0 opacity-0')}
        >
          <div className="flex h-full w-[18.75rem] flex-col">
            <div className={PANEL_HEADER}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary-300" aria-hidden="true" />
                <h2 id={railTitleId} className="font-display text-base font-medium text-ink">Your policies</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRailOpen(false);
                  // The closed rail is inert: focus moves to the button that opens it again.
                  railToggleRef.current?.focus();
                }}
                aria-label="Close your policies"
                className="rounded-full p-1.5 text-muted transition-colors hover:bg-fg/5 hover:text-ink">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="px-4 pt-3 text-meta text-muted">{railHint}</p>
            <div className="min-h-0 flex-1 overflow-y-auto p-3" aria-busy={feedLoading || undefined}>
              <PolicyRail policies={rail} loading={feedLoading} onAsk={ask} onDragState={setDragging} skeletons={6} />
            </div>
          </div>
        </section>
      </div>

      {/* Phones: the saved conversations and the policies rise as sheets. */}
      <BottomSheet
        open={historySheet}
        onClose={closeHistorySheet}
        titleId={historySheetTitleId}
        title="Chat History"
        closeLabel="Close chat history"
        returnFocusRef={historySheetButtonRef}
        hideFrom="md"
        busy={chat.sessionsLoading}
      >
        <div className="mb-2 flex justify-end px-1">{newConversationButton}</div>
        {conversationList}
      </BottomSheet>
      <BottomSheet
        open={railSheet}
        onClose={closeRailSheet}
        titleId={railSheetTitleId}
        title="Your policies"
        hint="Choose Ask about this policy to ask the guide."
        closeLabel="Close your policies"
        returnFocusRef={railSheetButtonRef}
        hideFrom="lg"
        busy={feedLoading}
      >
        <PolicyRail policies={rail} loading={feedLoading} onAsk={askFromSheet} />
      </BottomSheet>

      {confirmMounted && (
        <ConfirmDialog
          open={!!toDelete}
          title="Delete this conversation?"
          body={toDelete ? <>“{toDelete.title}” will be deleted. This can’t be undone.</> : undefined}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          tone="danger"
          busy={deleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setToDelete(null)}
        />
      )}
      {toast}
    </div>
  );
}
