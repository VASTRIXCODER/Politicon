import { useId } from 'react';
import { cn } from '@/lib/utils';

/*
 * The Capitol in violet light, drawn as one inline SVG: the 2.5D stand-in
 * for the 3D Capitol (components/three/scenes/HeroCapitol and the film's
 * first shot). It is what tier-0 devices, Data Saver, reduced effects and
 * every visitor before hydration see, so it is drawn to be finished, not a
 * placeholder.
 *
 * Light comes from the upper left: lit faces are porcelain, faces turned
 * away fall into a violet shade, and the far silhouette carries a violet
 * rim. Every colour is a token (styles/tokens.css) set through CSS, so the
 * drawing follows the theme: paper and porcelain by day, a dark violet mass
 * with glowing rims in the dark theme and inside [data-night] sections.
 *
 * Decorative: callers place it inside an aria-hidden poster.
 */

const STROKE = 'stroke-fg/[0.15]';

/** Column x positions, evenly spaced from `from` to `to`. */
const columns = (from: number, to: number, count: number) =>
  Array.from({ length: count }, (_, i) => from + ((to - from) * i) / Math.max(1, count - 1));

interface CapitolArtProps {
  className?: string;
  /** Motes of light rising off the dome (the hero; the film's first still). */
  motes?: boolean;
  /** Beams of light falling from the upper left. */
  beams?: boolean;
  /** 'meet' keeps the whole building in view (default); 'slice' fills the box edge to edge. */
  fit?: 'meet' | 'slice';
}

export default function CapitolArt({ className, motes = true, beams = true, fit = 'meet' }: CapitolArtProps) {
  // Gradient ids must be unique per drawing: the hero and the film's first
  // still both draw the Capitol on the same page.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  const wingColumns = (x0: number, x1: number) =>
    columns(x0, x1, 9).map((x) => (
      <g key={x}>
        <rect x={x - 2.4} y={332} width={4.8} height={36} fill={url('column')} />
        <rect x={x - 3.4} y={329} width={6.8} height={3} className="fill-raised" />
      </g>
    ));

  return (
    <svg
      viewBox="0 0 640 600"
      preserveAspectRatio={`xMidYMid ${fit}`}
      // The light and the plaza run past the drawing's edges into the box.
      overflow="visible"
      aria-hidden="true"
      focusable="false"
      className={cn('h-full w-full', className)}
    >
      <defs>
        {/* The halo the dome sits in. */}
        <radialGradient id={id('halo')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0.42] dark:[stop-opacity:0.5]" />
          <stop offset="0.45" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0.14]" />
          <stop offset="1" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0]" />
        </radialGradient>
        <linearGradient id={id('beam')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0.3]" />
          <stop offset="1" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0]" />
        </linearGradient>
        {/* Stone: lit from above. */}
        <linearGradient id={id('stone')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="[stop-color:rgb(var(--c-raised))]" />
          <stop offset="1" className="[stop-color:rgb(var(--c-surface))]" />
        </linearGradient>
        {/* A cylinder (the drums): lit on the left, turning into violet shade. */}
        <linearGradient id={id('drum')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="[stop-color:rgb(var(--c-surface))]" />
          <stop offset="0.28" className="[stop-color:rgb(var(--c-raised))]" />
          <stop offset="0.7" className="[stop-color:rgb(var(--c-surface))]" />
          <stop offset="1" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.32]" />
        </linearGradient>
        <linearGradient id={id('dome')} x1="0.15" y1="0.1" x2="0.95" y2="0.85">
          <stop offset="0" className="[stop-color:rgb(var(--c-raised))]" />
          <stop offset="0.42" className="[stop-color:rgb(var(--c-raised))]" />
          <stop offset="0.78" className="[stop-color:rgb(var(--c-surface))]" />
          <stop offset="1" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.4]" />
        </linearGradient>
        {/* A column shaft: a narrow cylinder. */}
        <linearGradient id={id('column')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="[stop-color:rgb(var(--c-raised))]" />
          <stop offset="0.55" className="[stop-color:rgb(var(--c-raised))]" />
          <stop offset="1" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.3]" />
        </linearGradient>
        {/* The shade behind a colonnade. */}
        <linearGradient id={id('recess')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.2] dark:[stop-opacity:0.28]" />
          <stop offset="1" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.08]" />
        </linearGradient>
        {/* Paper fog rising from the ground: the drawing fades into the page. */}
        <linearGradient id={id('fog')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="[stop-color:rgb(var(--c-canvas))] [stop-opacity:0]" />
          <stop offset="0.55" className="[stop-color:rgb(var(--c-canvas))] [stop-opacity:0.75]" />
          <stop offset="1" className="[stop-color:rgb(var(--c-canvas))]" />
        </linearGradient>
        <linearGradient id={id('cast')} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.14] dark:[stop-opacity:0.2]" />
          <stop offset="1" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0]" />
        </linearGradient>
        <radialGradient id={id('shadow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.22]" />
          <stop offset="1" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0]" />
        </radialGradient>
      </defs>

      {/* Light: the halo, and beams falling from the upper left. */}
      <ellipse cx="330" cy="190" rx="300" ry="250" fill={url('halo')} />
      {beams && (
        <g>
          <path d="M-260 -260 L-120 -260 L352 236 L312 250 Z" fill={url('beam')} opacity="0.9" />
          <path d="M-40 -260 L40 -260 L372 214 L350 226 Z" fill={url('beam')} opacity="0.55" />
          <path d="M-300 -60 L-300 10 L290 280 L300 262 Z" fill={url('beam')} opacity="0.4" />
        </g>
      )}

      {/* The plaza: faint perspective joints running out from the steps toward
          the viewer (the 2.5D ground plane), and the building's shadow cast
          down and to the right by the light from the upper left. */}
      <g fill="none" strokeWidth="1" className="stroke-fg/[0.07] dark:stroke-violet-glow/[0.1]">
        {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => (
          <path key={k} d={`M${320 + k * 30} 436 L${320 + k * 160} 590`} />
        ))}
      </g>
      <path d="M396 436 H590 L660 484 H500 Z" fill={url('cast')} />
      <ellipse cx="320" cy="440" rx="290" ry="30" fill={url('shadow')} />

      {/* ---- The dome assembly (set back, so the portico overlaps its foot). ---- */}
      <g className={STROKE} strokeWidth="1">
        {/* Attic over the central block. */}
        <rect x="226" y="246" width="188" height="30" fill={url('stone')} />
        <rect x="220" y="240" width="200" height="7" className="fill-raised" />

        {/* Peristyle drum: a colonnade round the drum. */}
        <rect x="236" y="190" width="168" height="52" fill={url('drum')} />
        <rect x="244" y="198" width="152" height="40" fill={url('recess')} stroke="none" />
        {columns(248, 392, 13).map((x, i) => {
          // Columns round a cylinder: thinner and closer toward the edges.
          const t = (x - 320) / 72;
          const w = 5.2 * Math.sqrt(Math.max(0.25, 1 - t * t));
          return <rect key={i} x={x - w / 2} y={198} width={w} height={40} fill={url('column')} stroke="none" />;
        })}
        <rect x="230" y="183" width="180" height="8" rx="1.5" className="fill-raised" />
        <rect x="236" y="238" width="168" height="5" className="fill-raised" />

        {/* Upper drum with its ring of windows. */}
        <rect x="254" y="160" width="132" height="24" fill={url('drum')} />
        {columns(266, 374, 8).map((x) => (
          <rect key={x} x={x - 3} y={166} width={6} height={11} rx={3} className="fill-violet/25 dark:fill-violet-glow/30" stroke="none" />
        ))}
        <rect x="250" y="155" width="140" height="6" rx="1.5" className="fill-raised" />

        {/* The dome, its ribs, and the lantern. */}
        <path d="M258 156 C258 104 288 74 320 72 C352 74 382 104 382 156 Z" fill={url('dome')} />
        <g fill="none" className="stroke-fg/[0.1]">
          {[-3, -2, -1, 1, 2, 3].map((k) => (
            <path key={k} d={`M${320 + k * 19} 156 Q${320 + k * 17} 98 ${320 + k * 2.4} 73`} />
          ))}
          <path d="M261 134 Q320 122 379 134" />
          <path d="M268 112 Q320 101 372 112" />
        </g>
        <rect x="308" y="52" width="24" height="22" fill={url('drum')} />
        {[312, 318, 324, 330].map((x) => (
          <rect key={x} x={x - 1} y={56} width={2} height={15} className="fill-violet/25 dark:fill-violet-glow/30" stroke="none" />
        ))}
        <path d="M305 53 Q320 38 335 53 Z" fill={url('dome')} />
        <rect x="318" y="26" width="4" height="15" rx="1.5" className="fill-raised" />
        <circle cx="320" cy="24" r="3" className="fill-raised" />
      </g>

      {/* Rim light along the dome's far side, and its lit edge. */}
      <path
        d="M320 72 C352 74 382 104 382 156"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        className="stroke-violet/60 dark:stroke-violet-glow/80"
      />
      <path d="M258 156 C258 104 288 74 320 72" fill="none" strokeWidth="1.4" className="stroke-white/90 dark:stroke-violet-glow/35" />

      {/* ---- The wings. ---- */}
      <g className={STROKE} strokeWidth="1">
        {[
          { x: 82, w: 172 },
          { x: 386, w: 172 },
        ].map(({ x, w }) => (
          <g key={x}>
            <rect x={x} y={318} width={w} height={56} fill={url('stone')} />
            <rect x={x + 6} y={330} width={w - 12} height={40} fill={url('recess')} stroke="none" />
            {wingColumns(x + 12, x + w - 12)}
            <rect x={x - 3} y={312} width={w + 6} height={8} className="fill-raised" />
            {/* Balustrade. */}
            <rect x={x} y={306} width={w} height={6} className="fill-surface" />
          </g>
        ))}
      </g>

      {/* ---- The central portico, in front of the dome. ---- */}
      <g className={STROKE} strokeWidth="1">
        <rect x="244" y="292" width="152" height="82" fill={url('stone')} />
        <rect x="250" y="304" width="140" height="66" fill={url('recess')} stroke="none" />
        {columns(256, 384, 8).map((x) => (
          <g key={x}>
            <rect x={x - 3.4} y={306} width={6.8} height={62} fill={url('column')} stroke="none" />
            <rect x={x - 4.8} y={302} width={9.6} height={4} className="fill-raised" stroke="none" />
          </g>
        ))}
        <rect x="238" y="290" width="164" height="12" className="fill-raised" />
        {/* Pediment. */}
        <path d="M234 291 L320 258 L406 291 Z" className="fill-raised" />
        <path d="M252 287 L320 264 L388 287 Z" fill={url('recess')} stroke="none" />
      </g>
      {/* Rim light on the pediment's far slope. */}
      <path d="M320 258 L406 291" fill="none" strokeWidth="1.6" strokeLinecap="round" className="stroke-violet/45 dark:stroke-violet-glow/70" />

      {/* ---- Terrace and steps. ---- */}
      <g className={STROKE} strokeWidth="1">
        <rect x="62" y="372" width="516" height="14" fill={url('stone')} />
        <rect x="50" y="386" width="540" height="12" className="fill-surface" />
        <path d="M232 398 H408 L420 410 H220 Z" className="fill-raised" />
        <path d="M220 410 H420 L432 422 H208 Z" className="fill-surface" />
        <path d="M208 422 H432 L446 436 H194 Z" className="fill-raised" />
      </g>

      {/* Motes of light lifting off the dome: the bill about to leave. */}
      {motes && (
        <g className="fill-violet dark:fill-violet-glow">
          {[
            [356, 64, 2.2, 0.75],
            [372, 46, 1.4, 0.55],
            [390, 70, 1.8, 0.5],
            [404, 38, 1.2, 0.45],
            [344, 30, 1.6, 0.6],
            [420, 58, 2, 0.35],
            [436, 26, 1.3, 0.3],
            [384, 14, 1.1, 0.4],
            [300, 40, 1.2, 0.35],
            [458, 46, 1.5, 0.25],
          ].map(([cx, cy, r, o]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} opacity={o} />
          ))}
        </g>
      )}

      {/* Paper fog over the far plaza: the drawing fades into the page. */}
      <rect x="-600" y="440" width="1840" height="220" fill={url('fog')} />
    </svg>
  );
}
