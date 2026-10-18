import { MARK_PATHS, MARK_VIEWBOX } from '@/lib/brand/mark';
import styles from './auth.module.css';

/** The sheet's text lines as [top %, width %], after BillSheet's layout (kit/BillSheet.tsx). */
const LINES: [number, number][] = [
  [25, 82],
  [30, 82],
  [35, 82],
  [40, 56],
  [45, 82],
  [50, 82],
  [55, 82],
  [60, 56],
  [65, 82],
];

/**
 * The sign-in seal in CSS (the AuthSeal scene's poster): a lilac bill sheet
 * leaning back in a three-quarter turn, a violet glass medallion bearing the
 * Aperture Dome pressed into it, the archive-gold record seal in its corner
 * and, now and then, a band of light crossing it. Server-rendered and
 * decorative (SceneView hides it from assistive tech); it holds still under
 * reduced motion.
 */
export default function SealPoster() {
  return (
    <div className={`absolute inset-0 flex items-center justify-center overflow-hidden ${styles.stage}`}>
      <div className={`relative h-[80%] overflow-hidden ${styles.sheet}`}>
        <span className={`absolute left-[9%] top-[10%] h-[3.4%] w-[60%] ${styles.line}`} />
        <span className={`absolute left-[9%] top-[16%] h-[1.8%] w-[39%] ${styles.line}`} />
        {LINES.map(([top, width]) => (
          <span key={top} className={`absolute left-[9%] h-[1.1%] ${styles.line}`} style={{ top: `${top}%`, width: `${width}%` }} />
        ))}

        {/* The glass medallion, with the mark standing in relief and its lens alight. */}
        <span className={`absolute left-[17%] top-[30%] flex aspect-square w-[56%] items-center justify-center ${styles.medallion}`}>
          <svg viewBox={MARK_VIEWBOX} className="h-[62%] w-[62%] drop-shadow-[0_2px_2px_rgb(30_12_90/0.45)]">
            <path d={MARK_PATHS.aperture} fill="#FFFFFF" />
            <path d={MARK_PATHS.dome + MARK_PATHS.base} fill="rgb(255 255 255 / 0.78)" />
          </svg>
        </span>

        <span className={`absolute bottom-[8%] right-[9%] flex aspect-square w-[21%] items-center justify-center ${styles.record}`}>
          <svg viewBox={MARK_VIEWBOX} className="h-[58%] w-[58%]">
            <path d={MARK_PATHS.dome + MARK_PATHS.base} fill="rgb(92 67 7 / 0.7)" />
          </svg>
        </span>

        <span className={`absolute inset-0 ${styles.sweep}`} />
      </div>
    </div>
  );
}
