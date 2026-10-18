import styles from './errors.module.css';

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
 * The 404 page's lost bill in CSS (the LostBill scene's poster): a paper
 * sheet with its archive-gold record seal, adrift in a shaft of soft violet
 * light with motes in it and a faint shadow on the floor far below.
 * Server-rendered and decorative (SceneView hides it from assistive tech).
 */
export default function LostBillPoster() {
  return (
    <div className="absolute inset-0 overflow-hidden [perspective:1100px]">
      <div className={`absolute inset-0 ${styles.shaft}`} />
      <div className={`absolute inset-0 ${styles.motes}`} />
      <div className={`absolute inset-x-[27%] bottom-[7%] h-[7%] ${styles.floor}`} />
      <div className={`absolute inset-0 flex items-center justify-center pb-[6%] ${styles.drift}`}>
        <div className={`relative h-[56%] ${styles.sheet}`}>
          <span className={`absolute left-[9%] top-[10%] h-[3.4%] w-[60%] ${styles.line}`} />
          <span className={`absolute left-[9%] top-[16%] h-[1.8%] w-[39%] ${styles.line}`} />
          {LINES.map(([top, width]) => (
            <span key={top} className={`absolute left-[9%] h-[1.1%] ${styles.line}`} style={{ top: `${top}%`, width: `${width}%` }} />
          ))}
          <span className={`absolute bottom-[8%] right-[9%] aspect-square w-[21%] ${styles.record}`} />
        </div>
      </div>
    </div>
  );
}
