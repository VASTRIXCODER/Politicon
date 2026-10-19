'use client';

import MotionProvider from '@/components/providers/MotionProvider';
import ConfirmDialog, { type ConfirmDialogProps } from '@/components/ui/ConfirmDialog';

/**
 * ConfirmDialog with the motion/react setup it animates with (its panel is
 * an m.div, which needs LazyMotion), for pages whose layout doesn't load
 * motion: the provider then comes with the dialog's own lazy chunk, not with
 * the page's first load (the impact pages and the Policy Guide).
 */
export default function ConfirmDialogWithMotion(props: ConfirmDialogProps) {
  return (
    <MotionProvider>
      <ConfirmDialog {...props} />
    </MotionProvider>
  );
}
