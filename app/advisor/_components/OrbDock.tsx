'use client';

import { useEffect, useState, type MutableRefObject, type ReactNode } from 'react';
import GuideOrbView from '@/components/guide/GuideOrbView';
import { POLICY_DRAG_TYPE, isPolicyDrag } from '@/components/guide/policyRail';
import { orbState } from '@/components/guide/orbVoice';
import { useOrbVoice } from '@/components/guide/useOrbVoice';
import styles from '@/components/guide/guide.module.css';
import { cn } from '@/lib/utils';

/**
 * The head of the conversation: the guide's orb, and beside it the page's
 * title. Both are a drop target for the rail's policy chips: drop one on the
 * light to "feed" it to the guide, which asks about it at once. While a chip
 * is being dragged anywhere on the page, a ring opens around the orb and the
 * line under the title says where to drop it; over the target the ring
 * lights up. (The rail's "Ask about this policy" buttons do the same without
 * dragging.)
 *
 * The orb's voice lives here (useOrbVoice), so its pulses, one per word of a
 * reply, re-render only the dock, never the conversation. The page hands a
 * reply to it through `speakRef`.
 */
export default function OrbDock({ thinking, speakRef, dragging, onDropPolicy, title, status }: {
  /** A reply is on its way (the log shows the typing indicator). */
  thinking: boolean;
  /** Filled in with the orb's speak(), for the page to call when a reply lands. */
  speakRef: MutableRefObject<(_text: string) => void>;
  /** A policy chip is being dragged somewhere on the page. */
  dragging: boolean;
  onDropPolicy: (_id: string) => void;
  /** The page's h1. */
  title: ReactNode;
  /** The line under it (replaced by where to drop while a chip is dragged). */
  status: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const drop = over ? 'over' : dragging ? 'ready' : undefined;
  const voice = useOrbVoice();
  useEffect(() => {
    speakRef.current = voice.speak;
  }, [speakRef, voice.speak]);
  // The orb thinks exactly while the log shows the typing indicator, then speaks the reply.
  const state = orbState(thinking, voice.speaking);

  return (
    <div
      data-orb-dock={drop ?? 'idle'}
      onDragOver={(e) => {
        if (!isPolicyDrag(e.dataTransfer.types)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!isPolicyDrag(e.dataTransfer.types)) return;
        e.preventDefault();
        setOver(false);
        onDropPolicy(e.dataTransfer.getData(POLICY_DRAG_TYPE));
      }}
      className="flex min-w-0 flex-1 items-center gap-3 rounded-[1.75rem] sm:gap-4"
    >
      {/* data-state draws the orb's state on the dock too (a ring of light), so stills and reduced motion show it. */}
      <div data-drop={drop} data-state={state} className={cn(styles.dock, 'size-16 flex-shrink-0 sm:size-20 lg:size-28')}>
        <GuideOrbView className="size-full" state={state} pulse={voice.pulse} />
      </div>
      <div className="min-w-0 flex-1">
        {title}
        {drop ? (
          // Mouse users only (dragging); the rail's buttons say the same for everyone else.
          <p aria-hidden="true" className="mt-0.5 text-xs font-medium text-primary-300">
            {over ? 'Let go to ask the guide about it' : 'Drop a policy on the light to ask about it'}
          </p>
        ) : (
          status
        )}
      </div>
    </div>
  );
}
