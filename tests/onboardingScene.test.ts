import { afterAll, describe, expect, it, vi } from 'vitest';
import { createElement as h, type ReactNode } from 'react';

// The household's 3D scene, mounted for real in React Three Fiber over a
// stand-in renderer (no WebGL here): every building, every piece, answers
// arriving, the reveal and its skip, and the turning avatar must mount and
// run frames without throwing. No e2e runs this path (CI renders posters), so
// this is what catches a broken scene before a browser does.

// The few browser bits the hooks touch, put back afterwards.
const g = globalThis as Record<string, unknown>;
const saved = { window: g.window, document: g.document, navigator: g.navigator, localStorage: g.localStorage, raf: g.requestAnimationFrame, act: g.IS_REACT_ACT_ENVIRONMENT };
const mediaQuery = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const raf = (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 0) as unknown as number;
g.window = { matchMedia: mediaQuery, addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, setTimeout, clearTimeout, requestAnimationFrame: raf, cancelAnimationFrame: clearTimeout, location: { search: '' } };
g.document = { documentElement: { getAttribute: () => null, setAttribute() {}, removeAttribute() {} }, hidden: false, visibilityState: 'visible' };
if (!g.navigator) g.navigator = { userAgent: 'node' };
(g.window as Record<string, unknown>).navigator = g.navigator;
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
g.requestAnimationFrame = raf;
g.IS_REACT_ACT_ENVIRONMENT = true;

afterAll(() => {
  g.window = saved.window;
  g.document = saved.document;
  g.localStorage = saved.localStorage;
  g.requestAnimationFrame = saved.raf;
  g.IS_REACT_ACT_ENVIRONMENT = saved.act;
  if (!saved.navigator) delete g.navigator;
});

// The studio's environment and the bloom pass render with the real GPU; they are the kit's, tested elsewhere.
vi.mock('@/components/three/kit/StudioLights', () => ({ default: () => null }));
vi.mock('@/components/three/kit/PostFX', () => ({ default: () => null }));

const THREE = await import('three');
const { act, advance, createRoot, extend, useThree } = await import('@react-three/fiber');
const { default: HouseholdScene } = await import('@/components/three/scenes/HouseholdScene');
const { default: HouseholdDiorama } = await import('@/components/three/kit/HouseholdDiorama');
const { EMPTY_HOUSEHOLD, householdFromProfile } = await import('@/lib/household');
extend(THREE as unknown as Parameters<typeof extend>[0]);

type State = { scene: import('three').Scene; camera: import('three').Camera };
let read: (() => State) | null = null;
function Probe() {
  read = useThree((s) => s.get) as unknown as () => State;
  return null;
}

/** Mounts `el` on a canvas-less root with a renderer that draws nothing. */
async function mount(el: ReactNode) {
  const canvas = { width: 600, height: 480, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => null };
  const gl = {
    domElement: canvas,
    xr: { enabled: false, isPresenting: false, addEventListener() {}, removeEventListener() {}, setAnimationLoop() {} },
    shadowMap: {},
    info: { render: {} },
    capabilities: {},
    extensions: { has: () => false },
    setSize() {},
    setPixelRatio() {},
    getPixelRatio: () => 1,
    render: vi.fn(),
    compile() {},
    dispose() {},
    setAnimationLoop() {},
  };
  const root = createRoot(canvas as unknown as HTMLCanvasElement);
  const show = (next: ReactNode) => root.render(h('group', null, next, h(Probe)));
  await act(async () => {
    await root.configure({ gl: () => gl as never, frameloop: 'never', size: { width: 600, height: 480, top: 0, left: 0 }, dpr: 1 });
    show(el);
  });
  let clock = performance.now();
  const frames = async (n: number) => {
    for (let i = 0; i < n; i++) await act(async () => advance((clock += 16)));
  };
  return {
    gl,
    frames,
    update: (next: ReactNode) => act(async () => show(next)),
    count: () => {
      let meshes = 0;
      read!().scene.traverse((o) => {
        if ((o as import('three').Mesh).isMesh) meshes++;
      });
      return meshes;
    },
    unmount: () => act(async () => root.unmount()),
  };
}

const ALL_DEBTS = ['mortgage', 'student_loans', 'auto_loan', 'credit_card', 'medical', 'personal_loan', 'business_loan'];
const household = (housing: string) =>
  householdFromProfile({
    state: 'Ohio',
    housingSituation: housing as never,
    filingStatus: 'married_joint',
    hasDependents: true,
    dependentsCount: 3,
    dependentAgeBands: ['5_12'],
    debtTypes: ALL_DEBTS,
  });

describe('the household scene', () => {
  it('keeps the film’s sample household when no household is given', async () => {
    const s = await mount(h(HouseholdDiorama, { glow: 0.5 }));
    await s.frames(2);
    // Plinth, house, car, tree, two figures and their shadows.
    expect(s.count()).toBeGreaterThan(20);
    expect(s.gl.render).toHaveBeenCalled();
    await s.unmount();
  });

  it.each(['rent', 'own_mortgage', 'live_with_family', 'campus', 'other'])('builds a %s household as answers arrive, then reveals it', async (housing) => {
    const model = household(housing);
    const s = await mount(h(HouseholdScene, { model: EMPTY_HOUSEHOLD, mode: 'build' }));
    await s.frames(2);
    const empty = s.count();
    await s.update(h(HouseholdScene, { model, mode: 'build', lastAdded: `dwelling:${model.dwelling}` }));
    await s.frames(30);
    expect(s.count()).toBeGreaterThan(empty + 30);
    await s.update(h(HouseholdScene, { model, mode: 'build', lastAdded: 'prop:card', reveal: true }));
    await s.frames(30);
    // Back from the last question, and a piece taken away.
    await s.update(h(HouseholdScene, { model: householdFromProfile({ state: 'Ohio', housingSituation: housing as never }), mode: 'build' }));
    await s.frames(10);
    await s.unmount();
  });

  it('turns the avatar', async () => {
    const s = await mount(h(HouseholdScene, { model: household('rent'), mode: 'avatar' }));
    await s.frames(5);
    expect(s.count()).toBeGreaterThan(30);
    await s.unmount();
  });
});
