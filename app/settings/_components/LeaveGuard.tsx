'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { hasUnsavedChanges, leaveTarget, subscribeUnsavedChanges } from './unsavedChanges';

/*
 * The leave-page warning: while a form on Settings holds unsaved changes
 * (useUnsavedChanges in unsavedChanges.ts), leaving asks first.
 *   - A link to another page of the app (the navbar, the footer, "Re-run")
 *     is held, and a dialog asks whether to leave without saving or keep
 *     editing. Links within the page (the section nav) and links that open
 *     a new tab are left alone.
 *   - Closing the tab, reloading or typing an address gets the browser's own
 *     "Leave site?" prompt (beforeunload), the only one a page may show there.
 * Nothing else is held: saving, discarding, signing out and the account's
 * own dialogs work as before. Nor are the browser's Back and Forward
 * buttons: the App Router handles them in the page (popstate, which fires
 * no beforeunload), and holding one would mean planting an extra history
 * entry under the router's own, so they leave without asking. Choosing to leave clicks the held link again,
 * so it navigates exactly as it would have (next/link, its scroll and
 * history). The dialog brings motion/react with it, so it loads (once) only
 * when the page first has unsaved changes.
 */

const loadDialog = () => import('@/components/ui/ConfirmDialogWithMotion');
const ConfirmDialog = dynamic(loadDialog, { ssr: false, loading: () => null });

export default function LeaveGuard() {
  const unsaved = useSyncExternalStore(subscribeUnsavedChanges, hasUnsavedChanges, () => false);
  // Where a held link was going; the dialog is open while it's set.
  const [pending, setPending] = useState<string | null>(null);
  // The held link itself, clicked again once the person chooses to leave.
  const heldLink = useRef<HTMLAnchorElement | null>(null);
  // Mounted on first use, then kept (closed) so it opens at once next time.
  const [wanted, setWanted] = useState(false);
  // Set once the person chose to leave, so the browser doesn't ask again on the way out.
  const leaving = useRef(false);

  useEffect(() => {
    if (!unsaved) return;
    void loadDialog();

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      // Older browsers need a returnValue to show the prompt.
      e.returnValue = '';
    };

    // Capture phase: before the link's own click handler (next/link checks defaultPrevented).
    const onClick = (e: MouseEvent) => {
      if (leaving.current) return;
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const to = leaveTarget(e, { href: link.href, target: link.target, download: link.hasAttribute('download') }, window.location.href);
      if (!to) return;
      e.preventDefault();
      heldLink.current = link;
      setWanted(true);
      setPending(to);
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [unsaved]);

  const leave = () => {
    if (!pending) return;
    leaving.current = true;
    const to = pending;
    const link = heldLink.current;
    heldLink.current = null;
    setPending(null);
    // The same link, clicked again once the dialog has closed (the guard now
    // lets it through); if it has gone from the page meanwhile, a plain
    // navigation to where it pointed.
    window.setTimeout(() => {
      if (link?.isConnected) link.click();
      else window.location.assign(to);
    }, 0);
  };

  if (!wanted) return null;
  return (
    <ConfirmDialog
      open={pending !== null}
      tone="danger"
      title="Leave without saving?"
      body="You have changes on this page that aren’t saved yet. If you leave now, they’ll be lost."
      confirmLabel="Leave without saving"
      cancelLabel="Keep editing"
      onConfirm={leave}
      onCancel={() => {
        heldLink.current = null;
        setPending(null);
      }}
    />
  );
}
