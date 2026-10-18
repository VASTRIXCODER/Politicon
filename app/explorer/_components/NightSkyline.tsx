import { CITY_DATA } from '@/components/three/scenes/bracketCityData';
import { cn } from '@/lib/utils';

/*
 * The city again, at night, along the foot of the closing pane: a horizon
 * of violet light with the same towers standing on it (gains rising, costs
 * hanging below, on the same linear scale), glowing. Pure decoration in
 * CSS, server-rendered; the page has already said every figure.
 */

/** Tallest gain, in rem. */
const SKY = 4.5;

export default function NightSkyline({ className }: { className?: string }) {
  const scale = CITY_DATA.scale;
  const deepest = CITY_DATA.deepestShare * SKY;
  return (
    <div aria-hidden="true" data-decorative="" className={cn('pointer-events-none absolute inset-x-0 bottom-0', className)}>
      <div className="relative mx-auto flex max-w-3xl items-stretch justify-between px-8 sm:px-16" style={{ height: `${SKY + deepest + 1.5}rem` }}>
        {/* The horizon: the street, as a line of light. */}
        <span
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-glow/80 to-transparent"
          style={{ top: `${SKY + 0.5}rem` }}
        />
        <span
          className="absolute inset-x-[10%] h-10 -translate-y-1/2 bg-[radial-gradient(closest-side,rgb(var(--c-glow)/0.22),transparent)]"
          style={{ top: `${SKY + 0.5}rem` }}
        />
        {CITY_DATA.districts.map((d) => (
          <div key={d.bracket} className="relative flex gap-1 sm:gap-1.5">
            {d.towers.map((t) => {
              const h = (Math.abs(t.amount) / scale) * SKY;
              return (
                <span key={t.category} className="relative w-1.5 sm:w-2">
                  {t.amount > 0 && (
                    <span
                      className="absolute inset-x-0 rounded-t-[2px] bg-gain-fill/85 shadow-[0_0_14px_rgb(var(--c-gain-fill)/0.55)]"
                      style={{ bottom: `${deepest + 1}rem`, height: `${h}rem` }}
                    />
                  )}
                  {t.amount < 0 && (
                    <span
                      className="absolute inset-x-0 rounded-b-[2px] bg-loss-fill/80 shadow-[0_0_14px_rgb(var(--c-loss-fill)/0.5)]"
                      style={{ top: `${SKY + 0.5}rem`, height: `${h}rem` }}
                    />
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
