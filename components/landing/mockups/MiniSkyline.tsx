import type { CSSProperties } from 'react';
import { BRACKET_ROWS, CATEGORIES, CHART_SCALE } from '@/lib/explorerData';
import { cn } from '@/lib/utils';
import box from './mockups.module.css';
import styles from './explorer.module.css';

/** Short bracket names for the district labels on phones (dollars implied). */
const SHORT: Record<(typeof BRACKET_ROWS)[number]['key'], string> = {
  under25k: '<25k',
  '25to50k': '25–50k',
  '50to75k': '50–75k',
  '75to100k': '75–100k',
  '100kPlus': '100k+',
};

/** A height on the explorer's linear chart scale, in units of the tallest tower (--sky). */
const tall = (amount: number) => `calc(var(--sky) * ${Math.min(Math.abs(amount), CHART_SCALE) / CHART_SCALE})`;

// The deepest cost in the dataset sets how far the water reaches.
const DEEPEST = Math.max(0, ...BRACKET_ROWS.flatMap((r) => Object.values(r.totals).map((v) => -v)));

const TOWER = { '--d': '0.4rem' } as CSSProperties;

/**
 * "Brackets as a city", in CSS 2.5D: the explorer's illustrative dataset as
 * five districts, one per income bracket, each with a tower per category.
 * Gains rise above the street in ledger teal, costs sink below it into the
 * water in ember amber, all on the explorer chart's one linear scale. The
 * district of the bracket picked in PublicExplorer is lit (explorer.module.css).
 *
 * Decorative: the picker's panel beside it states the same numbers in text.
 */
export default function MiniSkyline({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" data-decorative="" className={cn(styles.city, className)}>
      <div className={styles.plate}>
        <div className="grid grid-cols-5 gap-2.5 sm:gap-5">
          {BRACKET_ROWS.map((row) => (
            <div key={row.key} data-bracket={row.key} className={styles.district}>
              <div className={styles.sky}>
                {CATEGORIES.map((cat) => {
                  const amount = row.totals[cat.key];
                  return (
                    <span key={cat.key} className={styles.slot}>
                      {amount > 0 && (
                        <span
                          className={cn(box.box, box.gain, box.windows, styles.tower)}
                          style={{ ...TOWER, height: tall(amount) }}
                        />
                      )}
                    </span>
                  );
                })}
              </div>
              <span
                className={cn(box.box, styles.street, 'block')}
                style={{ '--d': '0.5rem', '--face': 'rgb(var(--c-fg) / 0.18)' } as CSSProperties}
              />
              <div className={styles.water} style={{ height: tall(DEEPEST) }}>
                <div className={styles.below}>
                  {CATEGORIES.map((cat) => {
                    const amount = row.totals[cat.key];
                    return (
                      <span key={cat.key} className={styles.slot}>
                        {amount < 0 && (
                          <span
                            className={cn(box.box, box.loss, box.windows, styles.tower, styles.sunk)}
                            style={{ ...TOWER, height: tall(amount) }}
                          />
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
              {/* Every name stays readable (muted text, never dimmed); the chosen one is ink (explorer.module.css). */}
              <p className={cn(styles.label, 'mt-4 text-center font-mono-data text-meta text-muted')}>
                <span className="sm:hidden">{SHORT[row.key]}</span>
                <span className="hidden sm:inline">{row.label}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
