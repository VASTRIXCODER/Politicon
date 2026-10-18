import { Info } from 'lucide-react';
import { ILLUSTRATIVE_NOTE } from '@/lib/explorerData';
import { cn } from '@/lib/utils';

/** The required "these are examples" note, shown with every view of the explorer's data. */
export default function IllustrativeNote({ className }: { className?: string }) {
  return (
    <p className={cn('inline-flex items-start gap-2 rounded-tile border border-dashed border-fg/25 px-3 py-2 text-xs text-muted', className)}>
      <Info className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span>{ILLUSTRATIVE_NOTE}</span>
    </p>
  );
}
