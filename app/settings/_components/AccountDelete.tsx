'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { AccountRow } from './AccountParts';
import { SettingsPane } from './SettingsSection';

/*
 * Account → Delete account: a danger pane with one button. The irreversible
 * part (what goes, typing DELETE, the password) happens in a ConfirmDialog
 * (AccountDeleteDialog), which loads the first time the button is pointed
 * at, focused or pressed, so it stays out of the page's first load.
 */

const loadDialog = () => import('./AccountDeleteDialog');
const AccountDeleteDialog = dynamic(loadDialog, { ssr: false, loading: () => null });

export default function AccountDelete({ hasPassword }: { hasPassword: boolean }) {
  // Mounted on first use, then kept (closed) so it opens at once next time.
  const [wanted, setWanted] = useState(false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const preload = () => {
    void loadDialog();
  };

  const close = () => {
    setOpen(false);
    // The dialog returns focus to whatever opened it; some browsers don't focus a clicked button.
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) triggerRef.current?.focus();
    });
  };

  return (
    <SettingsPane tone="danger">
      <AccountRow title="Delete account" description="Permanently delete your account and all data" tone="danger">
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm leading-relaxed text-muted">
            Your analyzed policies, chat history and financial profile are deleted with it. You&apos;ll be asked to confirm.
          </p>
          <Button
            ref={triggerRef}
            variant="ghost"
            aria-haspopup="dialog"
            onPointerEnter={preload}
            onFocus={preload}
            onClick={() => {
              setWanted(true);
              setOpen(true);
            }}
            icon={<Trash2 className="h-4 w-4" />}
            className="border-danger/35 text-danger hover:border-danger/60 hover:bg-danger/5 dark:border-danger/40"
          >
            Delete account
          </Button>
        </div>
      </AccountRow>
      {wanted && <AccountDeleteDialog open={open} hasPassword={hasPassword} onClose={close} />}
    </SettingsPane>
  );
}
