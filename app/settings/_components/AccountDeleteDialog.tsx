'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import MotionProvider from '@/components/providers/MotionProvider';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { apiFetch } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import { DANGER_FIELD, FieldLabel } from './AccountParts';
import { DELETE_PHRASE, clearLocalData, deleteProblem } from './settingsModel';

/*
 * The last step of deleting an account: a danger ConfirmDialog that says
 * exactly what goes, and keeps the typed safety catch (type DELETE, and the
 * password for accounts that have one). Nothing is sent until both are in;
 * a missing or wrong answer is explained inside the dialog, beside the
 * field, where it can be seen (a toast would sit under the dialog).
 *
 * Loaded on demand by AccountDelete (with its own MotionProvider for the
 * dialog's entrance), so neither it nor motion/react is in the settings
 * page's first load.
 */

export default function AccountDeleteDialog({ open, hasPassword, onClose }: {
  open: boolean;
  hasPassword: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const ids = { deleteConfirm: `${uid}-delete-confirm`, deletePassword: `${uid}-delete-password`, error: `${uid}-delete-error` };

  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  // What stops the deletion, and the field it's about (null: not one field, e.g. the network).
  // `n` re-announces a repeated reason.
  const [problem, setProblem] = useState<{ message: string; field: 'confirm' | 'password' | null; n: number } | null>(null);
  const tries = useRef(0);
  const [deleting, setDeleting] = useState(false);
  const confirmRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Once open, start in the typed confirmation (ConfirmDialog, a child, has
  // already opened the dialog and put focus on Cancel; typing can't delete).
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  const cancel = () => {
    if (deleting) return;
    setDeleteConfirm('');
    setDeletePassword('');
    setProblem(null);
    onClose();
  };

  const deleteAccount = async () => {
    const missing = deleteProblem({ confirm: deleteConfirm, password: deletePassword, hasPassword });
    if (missing) {
      const field = deleteConfirm !== DELETE_PHRASE ? 'confirm' : 'password';
      setProblem({ message: missing, field, n: ++tries.current });
      (field === 'confirm' ? confirmRef : passwordRef).current?.focus();
      return;
    }
    setProblem(null);
    setDeleting(true);
    const res = await apiFetch('/api/account/delete', { method: 'DELETE', body: hasPassword ? { password: deletePassword } : {} });
    if (!res.ok) {
      const aboutPassword = hasPassword && (res.code === 'wrong_password' || res.code === 'password_required');
      setProblem({ message: res.message, field: aboutPassword ? 'password' : null, n: ++tries.current });
      setDeleting(false);
      // The field was disabled while deleting; it's back once this render lands.
      if (aboutPassword) requestAnimationFrame(() => passwordRef.current?.select());
      return;
    }
    try {
      clearLocalData(localStorage);
    } catch { /* storage unavailable */ }
    await createClient().auth.signOut({ scope: 'local' });
    router.push('/');
  };

  const confirmWrong = problem?.field === 'confirm';
  const passwordWrong = problem?.field === 'password';

  return (
    <MotionProvider>
      <ConfirmDialog
        open={open}
        tone="danger"
        title="Delete your account?"
        body={
          <>
            <p>
              This will permanently delete your account, all analyzed policies, chat history and financial profile.{' '}
              <strong className="font-semibold text-danger">This cannot be undone.</strong>
            </p>
            {/* Phones: the fields take the dialog's full width (under its icon too). */}
            <div className="mt-5 space-y-4 max-sm:-ml-14">
              <div>
                <FieldLabel htmlFor={ids.deleteConfirm}>Type DELETE to confirm</FieldLabel>
                <input
                  ref={confirmRef}
                  id={ids.deleteConfirm}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={DELETE_PHRASE}
                  disabled={deleting}
                  aria-invalid={confirmWrong || undefined}
                  aria-describedby={confirmWrong ? ids.error : undefined}
                  className={DANGER_FIELD}
                />
              </div>
              {hasPassword && (
                <div>
                  <FieldLabel htmlFor={ids.deletePassword}>Your password</FieldLabel>
                  <input
                    ref={passwordRef}
                    id={ids.deletePassword}
                    type="password"
                    autoComplete="current-password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Confirm with your password"
                    disabled={deleting}
                    aria-invalid={passwordWrong || undefined}
                    aria-describedby={passwordWrong ? ids.error : undefined}
                    className={DANGER_FIELD}
                  />
                </div>
              )}
            </div>
            {/* Stays mounted (and empty, so no height) so each reason is announced as it appears. */}
            <div id={ids.error} role="alert" className="max-sm:-ml-14">
              {problem && (
                <p key={problem.n} className="mt-4 flex items-start gap-1.5 text-sm text-danger">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  {problem.message}
                </p>
              )}
            </div>
          </>
        }
        confirmLabel="Permanently Delete My Account"
        busy={deleting}
        busyLabel="Deleting…"
        onConfirm={deleteAccount}
        onCancel={cancel}
      />
    </MotionProvider>
  );
}
