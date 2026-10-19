import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  DIORAMA,
  DWELLINGS,
  FIGURE_HEIGHTS,
  LEDGER_CLEARANCE,
  PLAQUE,
  PROP_SCALE,
  PROP_SPOTS,
  dwellingFootprint,
  dwellingTop,
  dwellingWindows,
  householdLayout,
  householdPieces,
  householdProjector,
  householdShot,
  isEmptyHousehold,
  newestPiece,
  piecePosition,
  type Vec3,
} from '@/components/three/kit/dioramaLayout';
import { EMPTY_HOUSEHOLD, householdFromProfile, type Dwelling, type HouseholdModel } from '@/lib/household';
import { DEBT_TYPES } from '@/lib/profileOptions';

// Where a household's pieces stand on the plinth, and the camera that frames
// them (components/three/kit/dioramaLayout.ts): shared by the 3D scene and
// the posters, so these are the numbers both draw from.

const DWELLING_KINDS = Object.keys(DWELLINGS) as Dwelling[];
const ALL_DEBTS = DEBT_TYPES.map((o) => o.value).filter((v) => v !== 'none');

const everything = (housing: string, extra: Partial<Parameters<typeof householdFromProfile>[0]> = {}): HouseholdModel =>
  householdFromProfile({
    state: 'Ohio',
    housingSituation: housing as never,
    filingStatus: 'married_joint',
    hasDependents: true,
    dependentsCount: 6,
    dependentAgeBands: ['5_12'],
    debtTypes: ALL_DEBTS,
    ...extra,
  });

const HOUSING_FOR: Record<Dwelling, string> = {
  apartment: 'rent',
  house: 'own_mortgage',
  'family-home': 'live_with_family',
  campus: 'campus',
  cottage: 'other',
};

const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** A circle's worth of room each piece needs on the ground. */
function footprintOf(id: string): number {
  if (id.startsWith('adult')) return 0.05;
  if (id.startsWith('dependent')) return 0.045;
  if (id === 'prop:car') return 0.17;
  return 0.085 * PROP_SCALE;
}

/** Distance from a ground point to a dwelling's footprint (0 inside it). */
function toDwelling(d: Dwelling, p: Vec3): number {
  const f = dwellingFootprint(d);
  const [cx, , cz] = DIORAMA.house.center;
  const dx = Math.max(0, Math.abs(p[0] - cx) - f.halfWidth);
  const dz = Math.max(0, p[2] - cz > 0 ? p[2] - cz - f.front : cz - p[2] - f.back);
  return Math.hypot(dx, dz);
}

describe('householdLayout', () => {
  it('leaves an empty plinth empty', () => {
    expect(householdLayout(EMPTY_HOUSEHOLD)).toEqual({ dwelling: null, figures: [], props: [], state: null });
    expect(isEmptyHousehold(EMPTY_HOUSEHOLD)).toBe(true);
  });

  it('brings the grown-ups in with the first answer the plinth can show', () => {
    const one = householdLayout(householdFromProfile({ state: 'Ohio' }));
    expect(one.figures.map((f) => f.id)).toEqual(['adult-1']);
    const two = householdLayout(householdFromProfile({ state: 'Ohio', filingStatus: 'married_joint' }));
    expect(two.figures.map((f) => [f.id, f.height])).toEqual([
      ['adult-1', FIGURE_HEIGHTS.adult],
      ['adult-2', FIGURE_HEIGHTS.partner],
    ]);
    // The filing answer alone is not something to draw yet.
    expect(householdLayout(householdFromProfile({ filingStatus: 'married_joint' })).figures).toEqual([]);
  });

  it('draws dependents up to four, children smaller than grown-up dependents', () => {
    const kids = householdLayout(everything('rent'));
    expect(kids.figures.filter((f) => !f.adult).map((f) => f.id)).toEqual(['dependent-1:child', 'dependent-2:child', 'dependent-3:child', 'dependent-4:child']);
    expect(kids.figures.filter((f) => !f.adult).every((f) => f.height === FIGURE_HEIGHTS.child)).toBe(true);
    const grown = householdLayout(everything('rent', { dependentAgeBands: ['18_plus'], dependentsCount: 2 }));
    expect(grown.figures.filter((f) => !f.adult).map((f) => [f.id, f.height])).toEqual([
      ['dependent-1:adult', FIGURE_HEIGHTS.adultDependent],
      ['dependent-2:adult', FIGURE_HEIGHTS.adultDependent],
    ]);
    expect(FIGURE_HEIGHTS.child).toBeLessThan(FIGURE_HEIGHTS.adultDependent);
    expect(FIGURE_HEIGHTS.adultDependent).toBeLessThan(FIGURE_HEIGHTS.adult);
  });

  it('gives every kind of debt its own spot', () => {
    const l = householdLayout(everything('rent'));
    expect(l.props.map((p) => p.kind)).toEqual(['mortgage-key', 'grad-cap', 'car', 'card', 'medical', 'ledger', 'briefcase']);
    for (const p of l.props) expect(p.position).toBe(PROP_SPOTS[p.kind].position);
  });

  it('never moves a piece when another is added or removed', () => {
    const at = (m: HouseholdModel) => Object.fromEntries([...householdLayout(m).figures, ...householdLayout(m).props].map((x) => [x.id, x.position]));
    const full = at(everything('rent'));
    const fewer = at(everything('rent', { debtTypes: ['credit_card'], filingStatus: 'single', dependentsCount: 1 }));
    for (const [id, position] of Object.entries(fewer)) expect(position, id).toEqual(full[id]);
  });

  it('keeps every piece on the plinth, inside its inlay ring', () => {
    for (const d of DWELLING_KINDS) {
      const l = householdLayout(everything(HOUSING_FOR[d]));
      for (const x of [...l.figures, ...l.props]) expect(Math.hypot(x.position[0], x.position[2]) + footprintOf(x.id), x.id).toBeLessThan(DIORAMA.plinth.radius - 0.11);
      const f = dwellingFootprint(d);
      const [cx, , cz] = DIORAMA.house.center;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const corner: Vec3 = [cx + sx * f.halfWidth, 0, cz + (sz > 0 ? f.front : -f.back)];
        expect(Math.hypot(corner[0], corner[2]), `${d} corner`).toBeLessThan(DIORAMA.plinth.radius - 0.11);
      }
    }
  });

  it('keeps pieces clear of each other, of the building and of the tree', () => {
    for (const d of DWELLING_KINDS) {
      const l = householdLayout(everything(HOUSING_FOR[d]));
      const pieces = [...l.figures, ...l.props];
      for (let i = 0; i < pieces.length; i++) {
        const a = pieces[i];
        expect(toDwelling(d, a.position), `${a.id} vs the ${d}`).toBeGreaterThan(footprintOf(a.id) * 0.6);
        expect(flat(a.position, DIORAMA.tree), `${a.id} vs the tree`).toBeGreaterThan(footprintOf(a.id) + 0.14);
        for (let j = i + 1; j < pieces.length; j++) {
          const b = pieces[j];
          expect(flat(a.position, b.position), `${a.id} vs ${b.id}`).toBeGreaterThan(footprintOf(a.id) + footprintOf(b.id) - 0.02);
        }
      }
      expect(toDwelling(d, DIORAMA.tree), `the tree vs the ${d}`).toBeGreaterThan(0.14);
    }
  });

  it('leaves the ledger’s spot free for a column beside the home', () => {
    for (const d of DWELLING_KINDS) {
      const l = householdLayout(everything(HOUSING_FOR[d]));
      expect(toDwelling(d, DIORAMA.ledger), d).toBeGreaterThan(LEDGER_CLEARANCE);
      for (const x of [...l.figures, ...l.props]) {
        expect(flat(x.position, DIORAMA.ledger) - footprintOf(x.id), x.id).toBeGreaterThan(LEDGER_CLEARANCE);
      }
    }
  });

  it('draws only what the kit knows, even from a malformed model', () => {
    const bad = { ...EMPTY_HOUSEHOLD, dwelling: 'toString', props: ['yacht', 'car'], state: 'Ohio' } as unknown as HouseholdModel;
    const l = householdLayout(bad);
    expect(l.dwelling).toBeNull();
    expect(l.props.map((p) => p.kind)).toEqual(['car']);
  });
});

describe('the buildings', () => {
  it('keeps the film’s house as the house', () => {
    const { house } = DIORAMA;
    expect(DWELLINGS.house).toMatchObject({ kind: 'gabled', width: house.width, depth: house.depth, wall: house.wall, gable: house.gable });
  });

  it('makes the family home bigger than the house, and the cottage smaller', () => {
    const area = (d: Dwelling) => DWELLINGS[d].width * DWELLINGS[d].depth;
    expect(area('family-home')).toBeGreaterThan(area('house'));
    expect(dwellingTop('family-home')).toBeGreaterThan(dwellingTop('house'));
    expect(area('cottage')).toBeLessThan(area('house'));
    expect(dwellingTop('apartment')).toBeGreaterThan(dwellingTop('family-home'));
  });

  it('puts every window on a wall of its building, below the eaves', () => {
    for (const d of DWELLING_KINDS) {
      const s = DWELLINGS[d];
      const wallTop = s.kind === 'gabled' ? s.wall : s.height;
      for (const [x, y, z, ry, w, h] of dwellingWindows(d)) {
        expect(y - h / 2, `${d} window above the ground`).toBeGreaterThan(0);
        expect(y + h / 2, `${d} window below the eaves`).toBeLessThan(wallTop);
        if (ry === 0) {
          expect(z, d).toBeCloseTo(s.depth / 2 + 0.006, 6);
          expect(Math.abs(x) + w / 2, d).toBeLessThan(s.width / 2);
        } else {
          expect(Math.abs(x), d).toBeCloseTo(s.width / 2 + 0.006, 6);
          expect(Math.abs(z) + w / 2, d).toBeLessThan(s.depth / 2);
        }
      }
    }
  });

  it('leaves the front door’s place free of windows', () => {
    for (const d of DWELLING_KINDS) {
      const ground = dwellingWindows(d).filter(([x, y, , ry, w, h]) => ry === 0 && y - h / 2 < 0.2 && Math.abs(x) < w / 2 + 0.055);
      expect(ground, d).toEqual([]);
    }
  });

  it('gives the film’s house its five windows', () => {
    expect(dwellingWindows('house')).toHaveLength(5);
  });
});

describe('householdPieces and newestPiece', () => {
  it('names the pieces in a fixed order: building, people, debts, state', () => {
    const m = householdFromProfile({ state: 'Ohio', housingSituation: 'rent', debtTypes: ['credit_card'], hasDependents: true, dependentsCount: 1, dependentAgeBands: ['under_5'] });
    expect(householdPieces(m)).toEqual(['dwelling:apartment', 'adult-1', 'dependent-1:child', 'prop:card', 'state']);
    expect(householdPieces(EMPTY_HOUSEHOLD)).toEqual([]);
  });

  it('finds what an answer added', () => {
    const before = householdFromProfile({ state: 'Ohio' });
    expect(newestPiece(EMPTY_HOUSEHOLD, before)).toBe('adult-1');
    const rent = householdFromProfile({ state: 'Ohio', housingSituation: 'rent' });
    expect(newestPiece(before, rent)).toBe('dwelling:apartment');
    const own = householdFromProfile({ state: 'Ohio', housingSituation: 'own_outright' });
    expect(newestPiece(rent, own)).toBe('dwelling:house');
    const car = householdFromProfile({ state: 'Ohio', housingSituation: 'own_outright', debtTypes: ['auto_loan'] });
    expect(newestPiece(own, car)).toBe('prop:car');
  });

  it('finds nothing new when an answer only takes a piece away or changes nothing', () => {
    const car = householdFromProfile({ state: 'Ohio', debtTypes: ['auto_loan'] });
    const none = householdFromProfile({ state: 'Ohio', debtTypes: ['none'] });
    expect(newestPiece(car, none)).toBeNull();
    expect(newestPiece(car, car)).toBeNull();
  });

  it('treats a child who turns out to be grown up as a new figure', () => {
    const kid = householdFromProfile({ state: 'Ohio', hasDependents: true, dependentsCount: 1, dependentAgeBands: ['13_17'] });
    const grown = householdFromProfile({ state: 'Ohio', hasDependents: true, dependentsCount: 1, dependentAgeBands: ['18_plus'] });
    expect(newestPiece(kid, grown)).toBe('dependent-1:adult');
  });

  it('knows where each piece stands', () => {
    const m = everything('rent');
    const l = householdLayout(m);
    for (const id of householdPieces(m)) expect(piecePosition(l, id), id).not.toBeNull();
    expect(piecePosition(l, 'dwelling:apartment')).toBe(DIORAMA.house.center);
    expect(piecePosition(l, 'prop:car')).toBe(PROP_SPOTS.car.position);
    expect(piecePosition(l, 'state')).toBe(piecePosition(l, 'state'));
    expect(piecePosition(l, 'nothing')).toBeNull();
    expect(piecePosition(householdLayout(EMPTY_HOUSEHOLD), 'state')).toBeNull();
  });
});

describe('the household camera', () => {
  /** three.js's own camera for a shot, to check the posters' projection against. */
  function threeCamera(shot: ReturnType<typeof householdShot>, aspect: number) {
    const cam = new PerspectiveCamera(shot.fov, aspect, 0.1, 40);
    cam.position.set(...shot.position);
    cam.lookAt(...shot.target);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    return cam;
  }

  /** The plinth's rims and the tallest building's top corners. */
  const extremes: Vec3[] = (() => {
    const out: Vec3[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const [x, z] = [Math.cos(a) * DIORAMA.plinth.radius, Math.sin(a) * DIORAMA.plinth.radius];
      out.push([x, 0, z], [x, -DIORAMA.plinth.height, z]);
    }
    const [cx, , cz] = DIORAMA.house.center;
    const s = DWELLINGS.apartment;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push([cx + (sx * s.width) / 2, dwellingTop('apartment'), cz + (sz * s.depth) / 2]);
    return out;
  })();

  it('projects exactly as three.js does', () => {
    for (const aspect of [1, 1.25, 2.4]) {
      for (const reveal of [0, 0.5, 1]) {
        const shot = householdShot('build', aspect, reveal);
        const cam = threeCamera(shot, aspect);
        const project = householdProjector(shot, aspect);
        for (const p of [...extremes, PLAQUE]) {
          const v = new Vector3(...p).project(cam);
          const q = project(...p);
          expect(q.x).toBeCloseTo((v.x + 1) / 2, 6);
          expect(q.y).toBeCloseTo((1 - v.y) / 2, 6);
        }
      }
    }
  });

  it('frames the whole plinth and the tallest building in the panel, with air around them', () => {
    for (const aspect of [1, 1.25, 1.5]) {
      for (const reveal of [0, 1]) {
        const project = householdProjector(householdShot('build', aspect, reveal), aspect);
        for (const p of extremes) {
          const q = project(...p);
          expect(q.x, `aspect ${aspect}`).toBeGreaterThan(0.03);
          expect(q.x).toBeLessThan(0.97);
          expect(q.y).toBeGreaterThan(0.03);
          expect(q.y).toBeLessThan(0.97);
        }
      }
    }
  });

  it('frames a phone’s wide band closer, keeping the buildings and the whole plinth in view', () => {
    const aspect = 2.4;
    const project = householdProjector(householdShot('build', aspect), aspect);
    // The drum's foot too: cut by the box's edge, it reads as a broken plinth (the box has no frame).
    for (const p of extremes) {
      const q = project(...p);
      expect(q.x).toBeGreaterThan(0.02);
      expect(q.x).toBeLessThan(0.98);
      expect(q.y).toBeGreaterThan(0.02);
      expect(q.y).toBeLessThan(0.99);
    }
    const panel = householdShot('build', 1.25);
    const band = householdShot('build', aspect);
    const distance = (s: typeof panel) => Math.hypot(...s.position.map((v, i) => v - s.target[i]));
    expect(distance(band)).toBeLessThan(distance(panel));
  });

  it('frames the phone band close on the household: every piece in view, the plinth running out of the frame', () => {
    const aspect = 4 / 3;
    const project = householdProjector(householdShot('build', aspect, 0, true), aspect);
    const [cx, , cz] = DIORAMA.house.center;
    const inside: Vec3[] = [];
    for (const d of ['apartment', 'family-home', 'campus', 'house', 'cottage'] as const) {
      const s = DWELLINGS[d];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) inside.push([cx + (sx * s.width) / 2, dwellingTop(d), cz + (sz * s.depth) / 2], [cx + (sx * s.width) / 2, 0, cz + (sz * s.depth) / 2]);
    }
    for (const spot of Object.values(PROP_SPOTS)) inside.push(spot.position, [spot.position[0], 0.12, spot.position[2]]);
    for (const p of inside) {
      const q = project(...p);
      expect(q.x).toBeGreaterThan(0.02);
      expect(q.x).toBeLessThan(0.98);
      expect(q.y).toBeGreaterThan(0.01);
      expect(q.y).toBeLessThan(0.95);
    }
    // Closer than the panel: the drum's rim leaves the box.
    expect(extremes.some((p) => { const q = project(...p); return q.x < 0 || q.x > 1 || q.y > 1; })).toBe(true);
    // The reveal still pulls back from it.
    const d = (s: ReturnType<typeof householdShot>) => Math.hypot(...s.position.map((v, i) => v - s.target[i]));
    expect(d(householdShot('build', aspect, 1, true))).toBeGreaterThan(d(householdShot('build', aspect, 0, true)) * 1.15);
    // Only the build view has a close framing; the avatar always shows its whole plinth.
    expect(householdShot('avatar', 1, 0, true)).toEqual(householdShot('avatar', 1));
  });

  it('pulls back for the reveal', () => {
    for (const aspect of [1, 1.25, 2.4]) {
      const a = householdShot('build', aspect, 0);
      const b = householdShot('build', aspect, 1);
      const d = (s: typeof a) => Math.hypot(...s.position.map((v, i) => v - s.target[i]));
      expect(d(b)).toBeGreaterThan(d(a) * 1.15);
      expect(householdShot('build', aspect, 5)).toEqual(b);
      expect(householdShot('build', aspect, -1)).toEqual(a);
    }
  });

  it('frames the turning avatar whole, whichever way it faces', () => {
    const project = householdProjector(householdShot('avatar', 1), 1);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      for (const p of [
        [Math.cos(a) * DIORAMA.plinth.radius, -DIORAMA.plinth.height, Math.sin(a) * DIORAMA.plinth.radius],
        [Math.cos(a) * DIORAMA.plinth.radius, 0, Math.sin(a) * DIORAMA.plinth.radius],
        // Anything on the plinth sweeps through this ring as it turns.
        [Math.cos(a) * 0.75, dwellingTop('apartment'), Math.sin(a) * 0.75],
      ] as Vec3[]) {
        const q = project(...p);
        expect(q.x).toBeGreaterThan(0.02);
        expect(q.x).toBeLessThan(0.98);
        expect(q.y).toBeGreaterThan(0.02);
        expect(q.y).toBeLessThan(0.98);
      }
    }
  });

  it('survives a box with no size', () => {
    for (const aspect of [0, Number.NaN, -1]) {
      const shot = householdShot('build', aspect);
      expect(shot.position.every(Number.isFinite)).toBe(true);
    }
  });

  it('sets the plaque on the drum, facing the camera', () => {
    expect(Math.hypot(PLAQUE[0], PLAQUE[2])).toBeGreaterThan(DIORAMA.plinth.radius);
    expect(PLAQUE[1]).toBeLessThan(0);
    expect(PLAQUE[1]).toBeGreaterThan(-DIORAMA.plinth.height);
    const shot = householdShot('build', 1.25);
    const toCam = [shot.position[0] - PLAQUE[0], shot.position[2] - PLAQUE[2]];
    expect(PLAQUE[0] * toCam[0] + PLAQUE[2] * toCam[1]).toBeGreaterThan(0);
    const q = householdProjector(shot, 1.25)(...PLAQUE);
    expect(q.x).toBeGreaterThan(0.35);
    expect(q.x).toBeLessThan(0.65);
    expect(q.y).toBeGreaterThan(0.75);
    expect(q.y).toBeLessThan(0.97);
  });
});
