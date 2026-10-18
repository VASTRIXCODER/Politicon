interface PrinciplesRibbonProps {
  /** True when state bills are loaded (Open States is configured): only then is it named. */
  stateBills: boolean;
}

/**
 * A quiet ribbon under the hero: where the bills come from and the rules
 * every estimate keeps. Static type between two hairlines, no motion, no
 * client code. Archive gold marks the official sources only.
 */
export default function PrinciplesRibbon({ stateBills }: PrinciplesRibbonProps) {
  const items = [
    { text: 'Congress.gov', record: true },
    ...(stateBills ? [{ text: 'Open States', record: true }] : []),
    { text: 'Non-partisan', record: false },
    { text: 'Assumptions shown', record: false },
    { text: 'Educational, not advice', record: false },
  ];
  return (
    <div className="border-y border-fg/10">
      <ul
        aria-label="Sources and principles"
        className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-5 font-mono-data text-meta uppercase tracking-[0.16em] text-muted sm:gap-x-0 sm:px-6 lg:px-8"
      >
        {items.map((item, i) => (
          <li key={item.text} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true" className="ml-5 mr-3 hidden h-1 w-1 rotate-45 bg-primary/50 sm:block lg:ml-7 lg:mr-5" />}
            {item.record && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gold" />}
            <span className={item.record ? 'text-ink' : undefined}>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
