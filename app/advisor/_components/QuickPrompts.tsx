import { QUICK_PROMPTS } from './types';

/** Suggested general questions, one tap each (sent at once; a draft in the composer is left alone). */
export default function QuickPrompts({ disabled, onAsk }: { disabled: boolean; onAsk: (_text: string) => void }) {
  return (
    // relative: the buttons' screen-reader text (absolutely positioned) stays inside this scroller, so the
    // chips past the edge don't widen the Chamber (an overflow-hidden main) and shift it sideways.
    <div role="group" aria-label="Suggested questions" className="relative -mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-2 scrollbar-hide">
      {QUICK_PROMPTS.map(p => {
        const Icon = p.icon;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => onAsk(p.text)}
            disabled={disabled}
            className="flex flex-shrink-0 items-center gap-2 rounded-full border border-fg/10 bg-surface/80 px-4 py-2 text-xs text-muted transition-colors duration-200 ease-civic hover:border-primary/35 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon className="h-3.5 w-3.5 text-primary-300" aria-hidden="true" />{p.label}<span className="sr-only">: ask “{p.text}”</span>
          </button>
        );
      })}
    </div>
  );
}
