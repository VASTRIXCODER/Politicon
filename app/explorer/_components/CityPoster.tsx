import { Fragment } from 'react';
import { CITY_DATA, type ExplorerCityData } from '@/components/three/scenes/bracketCityData';
import { cn } from '@/lib/utils';
import { posterShapes, type PosterTower } from './cityPosterGeometry';
import styles from './city.module.css';

/*
 * The explorer's city as a server-rendered vector drawing: the poster the
 * SceneView shows before (and, on devices without 3D or with it switched
 * off, instead of) the WebGL model. Drawn from the same layout and camera
 * as the scene's first frame (cityPosterGeometry.ts), so the hand-off is a
 * cross-fade between two pictures of one model: gains in teal glass above
 * the paper street, costs in amber below it inside the acrylic, a floor
 * line every $100 a year, the category band at each tower's far end, and
 * every district's name under it.
 *
 * Decorative (SceneView hides it from assistive tech; the page says every
 * figure in text). The focus the page's controls pick lights it through
 * CSS alone: data-focus-bracket / data-focus-category on the frame around
 * it (city.module.css), so it needs no JavaScript of its own. A wide
 * drawing for tablets and up, a compact one (2 × 2 blocks) for phones.
 */

function Tower({ t }: { t: PosterTower }) {
  return (
    <g className={styles.tower} data-category={t.category} data-sign={t.gain ? 'gain' : 'loss'}>
      {t.faces.map((f, i) => (
        <path key={i} d={f.d} className={styles[f.tone]} />
      ))}
      {t.floors && <path d={t.floors} className={styles.floors} />}
      <path d={t.band} className={styles.band} style={{ fill: `rgb(var(--c-cat-${t.category}))` }} />
      {t.roof && <path d={t.roof} className={styles.top} />}
    </g>
  );
}

function PosterSvg({ data, compact, aspect, id, className }: { data: ExplorerCityData; compact: boolean; aspect: number; id: string; className?: string }) {
  const s = posterShapes(data, { compact, aspect, width: compact ? 600 : 1000 });
  return (
    <svg
      viewBox={`0 0 ${s.width} ${s.height}`}
      className={cn(styles.svg, className)}
      aria-hidden="true"
      focusable="false"
      data-compact={compact ? '' : undefined}
    >
      <defs>
        <radialGradient id={`${id}-blob`}>
          <stop offset="0" className={styles.stopShadow} stopOpacity="0.22" />
          <stop offset="1" className={styles.stopShadow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-pool`}>
          <stop offset="0" className={styles.stopPool} stopOpacity="0.5" />
          <stop offset="0.6" className={styles.stopPool} stopOpacity="0.16" />
          <stop offset="1" className={styles.stopPool} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-acrylic`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={styles.stopAcrylic} stopOpacity="0.16" />
          <stop offset="1" className={styles.stopAcrylic} stopOpacity="0.05" />
        </linearGradient>
      </defs>

      <ellipse {...s.shadow} fill={`url(#${id}-blob)`} />
      <path d={s.foot} className={styles.foot} />

      {/* Costs, inside the acrylic below the street. */}
      {s.districts.map((d) => (
        <g key={d.bracket} className={styles.district} data-bracket={d.bracket}>
          {d.costs.map((t) => (
            <Tower key={t.category} t={t} />
          ))}
        </g>
      ))}

      <path d={s.acrylic} fill={`url(#${id}-acrylic)`} className={styles.acrylic} />
      <path d={s.acrylicEdge} className={styles.acrylicEdge} />
      <path d={s.paperEdge} className={styles.paperEdge} />
      <path d={s.paperTop} className={styles.paperTop} />
      <path d={s.inlay} className={styles.inlay} />

      {/* The street: each district's lot, the lamp's pool, and its gains. */}
      {s.districts.map((d) => (
        <g key={d.bracket} className={styles.district} data-bracket={d.bracket}>
          <ellipse {...d.pool} fill={`url(#${id}-pool)`} className={styles.pool} />
          <path d={d.lot} className={styles.lot} />
          {d.gains.map((t) => (
            <Fragment key={t.category}>
              {t.shadow && <ellipse {...t.shadow} fill={`url(#${id}-blob)`} />}
              <Tower t={t} />
            </Fragment>
          ))}
          {/* On a phone the districts sit too close to name in place: the page lists them under the box. */}
          {!compact && (
            <text x={d.label_at.x} y={d.label_at.y} dy={24} textAnchor="middle" className={styles.posterLabel}>
              {d.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** The two drawings (wide and compact), filling the SceneView's box; CSS shows the one that fits. */
export default function CityPoster({ data = CITY_DATA }: { data?: ExplorerCityData }) {
  return (
    <div className={styles.posters}>
      <PosterSvg data={data} compact={false} aspect={2.1} id="city-wide" className={styles.wide} />
      <PosterSvg data={data} compact aspect={1.5} id="city-compact" className={styles.compact} />
    </div>
  );
}
