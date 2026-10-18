import { describe, expect, it } from 'vitest';
import { FILM_SHOTS, shotAt } from '@/lib/three/filmStore';
import { DIORAMA, LEDGER_DEFAULTS, ledgerLayout, slabShown } from '@/components/three/kit/dioramaLayout';
import {
  BILL_REST,
  BILL_REST_SCALE,
  CAMERA_KEYS,
  FILM_LEDGER,
  FILM_WIDE_PX,
  FILM_LEDGER_AMOUNTS,
  FILM_LEDGER_EXAMPLE,
  FILM_LEDGER_SCALE,
  FIREFLY_EVERY,
  HOME,
  HOUSE_CORE,
  LEDGER_AT,
  LEDGER_WIDTH,
  PARTICLE_COUNT,
  SHEET,
  STILL_PROGRESS,
  TIMELINE,
  aspectFit,
  billAt,
  cameraAt,
  catmullRom,
  cuesAt,
  faceToward,
  flowCurves,
  homeToWorld,
  particleLayout,
  poseDistance,
  quadMatrix3d,
  recordShown,
  shotLocal,
  stillProgress,
  type Vec3,
} from '@/components/three/scenes/filmShots';
import { duskProgress } from '@/components/landing/film/filmMath';

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const steps = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

/** World → diorama units (the inverse of homeToWorld). */
function worldToHome([x, y, z]: Vec3): [number, number, number] {
  const dx = x - HOME.position[0];
  const dz = z - HOME.position[2];
  const c = Math.cos(HOME.rotationY);
  const s = Math.sin(HOME.rotationY);
  return [dx * c - dz * s, y - HOME.position[1], dx * s + dz * c];
}

describe('the film script', () => {
  it('has five equal shots, and each still frame falls inside its own shot', () => {
    expect(FILM_SHOTS).toBe(5);
    expect(STILL_PROGRESS).toHaveLength(FILM_SHOTS);
    STILL_PROGRESS.forEach((p, shot) => expect(shotAt(p)).toBe(shot));
    expect(shotLocal(0)).toEqual({ shot: 0, t: 0 });
    expect(shotLocal(0.3)).toMatchObject({ shot: 1 });
    expect(shotLocal(0.3).t).toBeCloseTo(0.5);
    expect(shotLocal(1)).toEqual({ shot: 4, t: 1 });
  });

  it('picks a still for any shot index, clamped and rounded', () => {
    expect(stillProgress(2)).toBe(STILL_PROGRESS[2]);
    expect(stillProgress(-3)).toBe(STILL_PROGRESS[0]);
    expect(stillProgress(9)).toBe(STILL_PROGRESS[4]);
    expect(stillProgress(1.4)).toBe(STILL_PROGRESS[1]);
    expect(stillProgress(Number.NaN)).toBe(STILL_PROGRESS[0]);
  });

  it('keeps the day until shot 5, then turns to dusk', () => {
    expect(cuesAt(0).dusk).toBe(0);
    expect(cuesAt(TIMELINE.dusk.start).dusk).toBe(0);
    expect(cuesAt(0.79).dusk).toBe(0);
    expect(cuesAt(1).dusk).toBe(1);
    // Night by the time the page around the film dips into it: the scene's
    // sky (LandingFilm's Sky: night = (dusk - 0.3) / 0.7) is mostly night
    // when the captions turn, and fully so before the dusk still.
    const night = (p: number) => Math.min(1, Math.max(0, (cuesAt(p).dusk - 0.3) / 0.7));
    expect(night(duskProgress(4))).toBeGreaterThan(0.55);
    expect(night(STILL_PROGRESS[4])).toBe(1);
    for (const p of steps(40)) expect(cuesAt(p).dusk).toBeLessThanOrEqual(cuesAt(Math.min(1, p + 0.025)).dusk);
  });

  it('dissolves the bill in shot 3 and fills the ledger in shot 4', () => {
    expect(cuesAt(0.41).cut).toBe(0);
    expect(cuesAt(0.41).stream).toBe(0);
    expect(shotAt(TIMELINE.stream.start)).toBe(2);
    expect(cuesAt(TIMELINE.stream.end).cut).toBe(1);
    expect(cuesAt(TIMELINE.stream.end).stream).toBe(1);
    expect(cuesAt(TIMELINE.settle.start).fill).toBe(0);
    expect(shotAt(TIMELINE.settle.start)).toBe(3);
    expect(cuesAt(TIMELINE.settle.end).fill).toBe(1);
    // The ledger has resolved, net mark and all, before shot 4's still frame.
    expect(cuesAt(STILL_PROGRESS[3])).toMatchObject({ fill: 1, mark: 1 });
    expect(TIMELINE.net.end).toBeLessThan(0.8);
  });

  it("lights the house as the light arrives, and the beam flashes as the bill leaves the dome", () => {
    expect(cuesAt(0.3).windows).toBe(0);
    expect(cuesAt(TIMELINE.stream.end).windows).toBeGreaterThanOrEqual(0.5);
    expect(cuesAt(1).windows).toBe(1);
    expect(cuesAt(0.2).beam).toBeCloseTo(1);
    expect(cuesAt(0.5).beam).toBe(0);
    expect(cuesAt(0).beam).toBeGreaterThan(0);
  });

  it('starts the fireflies at dusk only', () => {
    expect(cuesAt(0.8).fireflies).toBe(0);
    expect(cuesAt(1).fireflies).toBe(1);
  });
});

describe('the example ledger', () => {
  it('nets +$1,240 a year, from two gains and two costs', () => {
    const net = FILM_LEDGER_EXAMPLE.reduce((sum, e) => sum + e.amount, 0);
    expect(net).toBe(1240);
    expect(FILM_LEDGER.net).toBe(1240);
    expect(FILM_LEDGER_AMOUNTS.filter((a) => a > 0)).toHaveLength(2);
    expect(FILM_LEDGER_AMOUNTS.filter((a) => a < 0)).toHaveLength(2);
  });

  it('stacks gains up from the baseline and costs down from it, on a linear scale', () => {
    const { baseline, slabs, netY, pedestal } = FILM_LEDGER;
    for (const s of slabs) {
      if (s.gain) expect(s.bottom).toBeGreaterThan(baseline);
      else expect(s.top).toBeLessThan(baseline);
      // Height per dollar is the same for every slab: an honest scale.
      expect((s.top - s.bottom) / Math.abs(s.amount)).toBeCloseTo(FILM_LEDGER_SCALE, 10);
      expect(s.inner).toBeLessThan(s.outer);
    }
    expect(netY).toBeCloseTo(baseline + 1240 * FILM_LEDGER_SCALE, 10);
    expect(Math.min(...slabs.map((s) => s.bottom))).toBeGreaterThanOrEqual(pedestal);
    // Largest nearest the baseline.
    const gains = slabs.filter((s) => s.gain);
    expect(gains[0].amount).toBeGreaterThan(gains[1].amount);
    expect(gains[0].inner).toBeLessThan(gains[1].inner);
  });

  it('keeps its defaults when options are passed as undefined, and ignores zeros and NaN', () => {
    const a = ledgerLayout([500, -200]);
    const b = ledgerLayout([500, -200, 0, Number.NaN], { unitsPerDollar: undefined, pedestal: undefined, gap: undefined });
    expect(b).toEqual(a);
    expect(Number.isFinite(a.baseline)).toBe(true);
    expect(a.slabs).toHaveLength(2);
  });

  it('puts the baseline on the pedestal when there are no costs', () => {
    const l = ledgerLayout([300, 100]);
    expect(l.baseline).toBe(LEDGER_DEFAULTS.pedestal);
    expect(l.net).toBe(400);
    expect(ledgerLayout([]).slabs).toEqual([]);
  });

  it('grows each slab out from the baseline as the fill front passes it', () => {
    const { slabs, extent } = FILM_LEDGER;
    for (const s of slabs) {
      expect(slabShown(s, 0, extent)).toBe(0);
      expect(slabShown(s, 1, extent)).toBe(1);
      let last = 0;
      for (const f of steps(20)) {
        const shown = slabShown(s, f, extent);
        expect(shown).toBeGreaterThanOrEqual(last);
        last = shown;
      }
    }
  });
});

describe('the camera', () => {
  it('passes through every key at its time', () => {
    for (const key of CAMERA_KEYS) {
      const pose = cameraAt(key.at);
      expect(dist(pose.position, key.position)).toBeLessThan(1e-6);
      expect(dist(pose.target, key.target)).toBeLessThan(1e-6);
      expect(pose.fov).toBeCloseTo(key.fov);
      expect(pose.span).toBeCloseTo(key.span);
    }
  });

  it('moves smoothly: no jumps between neighbouring frames, nothing undefined', () => {
    const n = 2000;
    let previous = cameraAt(0);
    let worst = 0;
    for (let i = 1; i <= n; i++) {
      const pose = cameraAt(i / n);
      for (const v of [...pose.position, ...pose.target, pose.fov]) expect(Number.isFinite(v)).toBe(true);
      worst = Math.max(worst, dist(pose.position, previous.position), dist(pose.target, previous.target));
      previous = { position: [...pose.position], target: [...pose.target], fov: pose.fov, span: pose.span, shift: pose.shift };
    }
    // A thousandth of the film never moves the camera more than a few centimetres of the model.
    expect(worst).toBeLessThan(0.05);
  });

  it('holds still outside the film', () => {
    expect(cameraAt(-1)).toEqual(cameraAt(0));
    expect(cameraAt(2)).toEqual(cameraAt(1));
  });

  it('pulls back for a portrait view until the subject fits, never for a wide one', () => {
    const wide = cameraAt(STILL_PROGRESS[2]);
    expect(aspectFit(16 / 9, wide.span, poseDistance(wide), wide.fov)).toEqual({ distance: 1, fov: 0 });
    expect(aspectFit(0, 5, 10, 30)).toEqual({ distance: 1, fov: 0 });
    const phone = 375 / 812;
    for (const p of STILL_PROGRESS) {
      const pose = cameraAt(p);
      const fit = aspectFit(phone, pose.span, poseDistance(pose), pose.fov);
      expect(fit.distance).toBeGreaterThanOrEqual(1);
      expect(fit.distance).toBeLessThanOrEqual(3);
      expect(fit.fov).toBeGreaterThan(0);
      // The subject fits across the view (or the pull-back is at its cap).
      const half = Math.tan(((pose.fov + fit.fov) * Math.PI) / 360) * phone * poseDistance(pose) * fit.distance;
      if (fit.distance < 3) expect(half * 2).toBeGreaterThanOrEqual(pose.span);
    }
    // A tight shot needs less pull-back than a wide one.
    const tight = cameraAt(STILL_PROGRESS[3]);
    const broad = cameraAt(STILL_PROGRESS[2]);
    expect(aspectFit(phone, tight.span, poseDistance(tight), tight.fov).distance).toBeLessThan(
      aspectFit(phone, broad.span, poseDistance(broad), broad.fov).distance
    );
  });

  it('interpolates a Catmull-Rom segment from its second point to its third', () => {
    const a: Vec3 = [0, 0, 0];
    const b: Vec3 = [1, 0, 0];
    const c: Vec3 = [2, 1, 0];
    const d: Vec3 = [3, 1, 0];
    expect(dist(catmullRom(a, b, c, d, 0), b)).toBeLessThan(1e-9);
    expect(dist(catmullRom(a, b, c, d, 1), c)).toBeLessThan(1e-9);
    // Coincident points don't divide by zero.
    expect(catmullRom(b, b, b, b, 0.5).every(Number.isFinite)).toBe(true);
  });
});

/**
 * Where a world point lands across a view (0 left … 1 right), as the film's
 * director frames it: the camera at cameraAt(p) pulled back by aspectFit,
 * looking at its target with +y up, and the wide-screen lens shift.
 */
function frameX(progress: number, aspect: number, widthPx: number, point: Vec3): number {
  const pose = cameraAt(progress);
  const fit = aspectFit(aspect, pose.span, poseDistance(pose), pose.fov);
  const [tx, ty, tz] = pose.target;
  const eye: Vec3 = [tx + (pose.position[0] - tx) * fit.distance, ty + (pose.position[1] - ty) * fit.distance, tz + (pose.position[2] - tz) * fit.distance];
  const f = [tx - eye[0], ty - eye[1], tz - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]);
  const fwd = [f[0] / fl, f[1] / fl, f[2] / fl];
  // right = forward × up, with up = +y.
  const rl = Math.hypot(fwd[2], fwd[0]);
  const right = [-fwd[2] / rl, 0, fwd[0] / rl];
  const d = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
  const z = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2];
  const halfWidth = Math.tan(((pose.fov + fit.fov) * Math.PI) / 360) * aspect;
  const x = (d[0] * right[0] + d[2] * right[2]) / z / halfWidth;
  return (x + 1) / 2 + (widthPx >= FILM_WIDE_PX ? pose.shift : 0);
}

describe('the pinned film on a wide screen', () => {
  // 1280 × 800: the caption column ends near 43% of the width (its scrim has
  // faded out by 60%), and the rail starts near 84%.
  const BAND = [0.44, 0.84] as const;
  const H = DIORAMA.house;
  const dome: Vec3 = [0, 1.9, 0];
  const drum: Vec3 = [0, 1.0, 0];
  const houseWall = homeToWorld([H.center[0] - H.width / 2, 0.2, H.center[2]]);
  const roof = homeToWorld([H.center[0], H.wall + H.gable, H.center[2]]);
  const ledgerTop: Vec3 = [LEDGER_AT[0], FILM_LEDGER.top, LEDGER_AT[2]];
  const ledgerSide = homeToWorld([DIORAMA.ledger[0] + LEDGER_WIDTH / 2 + 0.06, 0.3, DIORAMA.ledger[2]]);
  /** What each shot's resting frame is about. */
  const SUBJECTS: Record<number, Record<string, Vec3>> = {
    0: { dome, drum },
    1: { bill: BILL_REST },
    2: { house: HOUSE_CORE, roof, 'ledger foot': LEDGER_AT, 'ledger side': ledgerSide },
    3: { 'house wall': houseWall, roof, 'ledger top': ledgerTop, 'ledger side': ledgerSide },
    4: { dome, drum, house: HOUSE_CORE, roof, 'ledger top': ledgerTop, 'ledger side': ledgerSide },
  };

  it('keeps every shot’s subject between the caption column and the rail', () => {
    for (const [shot, points] of Object.entries(SUBJECTS)) {
      const p = STILL_PROGRESS[Number(shot)];
      for (const [name, point] of Object.entries(points)) {
        const x = frameX(p, 1280 / 800, 1280, point);
        expect(x, `shot ${Number(shot) + 1}: ${name}`).toBeGreaterThanOrEqual(BAND[0]);
        expect(x, `shot ${Number(shot) + 1}: ${name}`).toBeLessThanOrEqual(BAND[1]);
      }
    }
  });

  it('shifts only the wide-screen film: phones and still frames compose as written', () => {
    const p = STILL_PROGRESS[3];
    expect(frameX(p, 1280 / 800, 1280, HOUSE_CORE) - frameX(p, 1280 / 800, 1000, HOUSE_CORE)).toBeCloseTo(cameraAt(p).shift, 6);
    // The dusk still, centred in its own panel: the Capitol behind, the house in front.
    const still = STILL_PROGRESS[4];
    const capitol = frameX(still, 16 / 11, 900, dome);
    const house = frameX(still, 16 / 11, 900, HOUSE_CORE);
    expect(capitol).toBeGreaterThan(0.25);
    expect(house).toBeLessThan(0.75);
    expect(capitol).toBeLessThan(house);
  });
});

describe('the bill’s official record', () => {
  it('shows only while the sheet rests, and is gone before it dissolves', () => {
    expect(recordShown(TIMELINE.bill.emerge)).toBe(0);
    expect(recordShown(STILL_PROGRESS[1])).toBe(1);
    expect(recordShown(TIMELINE.stream.start + 0.02)).toBe(0);
    expect(recordShown(STILL_PROGRESS[2])).toBe(0);
  });

  it('maps its box exactly onto the projected corners of the sheet', () => {
    const quad = [
      [100, 50],
      [400, 80],
      [380, 470],
      [90, 420],
    ] as const;
    const css = quadMatrix3d(300, 400, quad[0], quad[1], quad[2], quad[3]);
    expect(css).toMatch(/^matrix3d\(/);
    const m = css!.slice('matrix3d('.length, -1).split(',').map(Number);
    // Column-major: x' = (m0 x + m4 y + m12) / (m3 x + m7 y + m15), y' likewise with m1, m5, m13.
    const map = (x: number, y: number) => {
      const w = m[3] * x + m[7] * y + m[15];
      return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w];
    };
    const corners = [map(0, 0), map(300, 0), map(300, 400), map(0, 400)];
    corners.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(quad[i][0], 3);
      expect(y).toBeCloseTo(quad[i][1], 3);
    });
  });

  it('gives up on a sheet seen edge-on', () => {
    expect(quadMatrix3d(300, 400, [10, 10], [10, 10], [10, 10], [10, 10])).toBeNull();
    expect(quadMatrix3d(0, 400, [0, 0], [1, 0], [1, 1], [0, 1])).toBeNull();
  });
});

describe('the bill', () => {
  it('appears at the lantern in shot 2 and comes to rest facing the camera', () => {
    expect(billAt(0.1).visible).toBe(false);
    expect(billAt(TIMELINE.bill.emerge).visible).toBe(true);
    expect(shotAt(TIMELINE.bill.emerge)).toBe(0);
    const rest = billAt(TIMELINE.bill.arrive);
    expect(dist(rest.position, BILL_REST)).toBeLessThan(1e-6);
    expect(rest.scale).toBeCloseTo(BILL_REST_SCALE);
    expect(billAt(STILL_PROGRESS[1])).toMatchObject({ visible: true, cut: 0 });
  });

  it('is gone once it has dissolved', () => {
    expect(billAt(TIMELINE.stream.end).visible).toBe(false);
    expect(billAt(STILL_PROGRESS[2]).cut).toBeGreaterThan(0);
  });

  it('turns a sheet to face a point', () => {
    expect(faceToward([0, 0, 0], [0, 0, 5])).toEqual({ yaw: 0, pitch: -0 });
    expect(faceToward([0, 0, 0], [5, 0, 0]).yaw).toBeCloseTo(Math.PI / 2);
    expect(faceToward([0, 0, 0], [0, 5, 5]).pitch).toBeCloseTo(-Math.PI / 4);
  });
});

describe('the light', () => {
  it('stays within the kit particle caps', () => {
    expect(PARTICLE_COUNT[1]).toBeLessThanOrEqual(4_000);
    expect(PARTICLE_COUNT[2]).toBeLessThanOrEqual(25_000);
  });

  it('places the household and its ledger in front of the Capitol', () => {
    const [x, , z] = homeToWorld([0, 0, 0]);
    expect([x, z]).toEqual([HOME.position[0], HOME.position[2]]);
    expect(worldToHome(homeToWorld([0.3, 0.2, -0.4]))).toEqual([
      expect.closeTo(0.3, 9),
      expect.closeTo(0.2, 9),
      expect.closeTo(-0.4, 9),
    ]);
    expect(dist(LEDGER_AT, homeToWorld(DIORAMA.ledger))).toBeLessThan(1e-9);
  });

  it('flows from the bill into the house, then from the house into the ledger', () => {
    const { leg1, leg2 } = flowCurves();
    expect(leg1.length).toBeGreaterThan(4);
    expect(leg2.length).toBeGreaterThan(4);
    for (const c of leg1) {
      expect(dist(c[c.length - 1], HOUSE_CORE)).toBeLessThan(1e-9);
      expect(dist(c[0], BILL_REST)).toBeLessThan(SHEET.width);
    }
    for (const c of leg2) {
      expect(dist(c[0], HOUSE_CORE)).toBeLessThan(1e-9);
      expect(worldToHome(c[c.length - 1])[1]).toBeCloseTo(FILM_LEDGER.baseline + 0.05, 9);
    }
  });

  it('lays out every particle on the sheet, in the house and in a slab of the right kind', () => {
    const n = 3000;
    const l = particleLayout(n);
    expect(l.count).toBe(n);
    const H = DIORAMA.house;
    const half = LEDGER_WIDTH / 2;
    let fireflies = 0;
    for (let i = 0; i < n; i++) {
      const [sx, sy] = [l.sheet[i * 2], l.sheet[i * 2 + 1]];
      expect(Math.abs(sx)).toBeLessThanOrEqual(SHEET.width / 2);
      expect(Math.abs(sy)).toBeLessThanOrEqual(SHEET.height / 2);
      for (let k = 0; k < 2; k++) {
        expect(l.order[i * 4 + k]).toBeGreaterThanOrEqual(0);
        expect(l.order[i * 4 + k]).toBeLessThanOrEqual(1);
      }
      if (l.order[i * 4 + 2] >= 0) fireflies++;

      const home = worldToHome([l.home[i * 3], l.home[i * 3 + 1], l.home[i * 3 + 2]]);
      expect(Math.abs(home[0] - H.center[0])).toBeLessThan(H.width / 2);
      expect(Math.abs(home[2] - H.center[2])).toBeLessThan(H.depth / 2);
      expect(home[1]).toBeGreaterThan(0);
      expect(home[1]).toBeLessThan(H.wall);

      const slot = worldToHome([l.slot[i * 3], l.slot[i * 3 + 1], l.slot[i * 3 + 2]]);
      expect(Math.abs(slot[0] - DIORAMA.ledger[0])).toBeLessThan(half);
      expect(Math.abs(slot[2] - DIORAMA.ledger[2])).toBeLessThan(half);
      const slab = FILM_LEDGER.slabs.find((s) => slot[1] >= s.bottom && slot[1] <= s.top);
      expect(slab).toBeDefined();
      expect(l.kind[i]).toBe(slab!.gain ? 1 : -1);

      expect(l.rows[i * 2]).toBeLessThan(l.rowCount.leg1);
      expect(l.rows[i * 2 + 1]).toBeLessThan(l.rowCount.leg2);
    }
    expect(fireflies).toBe(Math.ceil(n / FIREFLY_EVERY));
  });

  it('is the same on every load (still frames are composed, not random)', () => {
    const a = particleLayout(500);
    const b = particleLayout(500);
    expect(Array.from(a.slot)).toEqual(Array.from(b.slot));
    expect(Array.from(a.order)).toEqual(Array.from(b.order));
  });
});
