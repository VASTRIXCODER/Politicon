import type { Browser, Page } from '@playwright/test';
import { FAKE_HOST, FEED, db } from './hermetic-journey';
import { mockAi, newAccount, requireHermeticBuild, seedProfileAndAnalyses } from './signed-in';
import { expect, test } from './support';

/**
 * The long-task probe, beside the frame-rate probe (frame-rate.spec.ts): a
 * Chrome trace of a page's first load on a CPU slowed 4×, the 3D stage at
 * tier 1 (?fx=1), as a tier-1 phone (the mobile project). It reports every
 * main-thread task over 200 ms with what ran inside it (scripts by chunk
 * and function, style, layout, paint), and the total blocking time (each
 * task's time over 50 ms), for the landing page, the dashboard and an
 * impact page (signed in hermetically, as a11y-app.spec.ts is).
 *
 * A report, not a gate: WebGL runs in software here (SwiftShader), so the
 * GPU's share of a frame lands on the CPU and inflates what any device with
 * a GPU would see. It runs on demand with the frame-rate probe:
 *   E2E_PERF=1 npx playwright test long-tasks --project=mobile
 * Each page's report is printed and attached as an annotation.
 */

/** CPU slowdown (E2E_PERF_CPU overrides it, e.g. 1 for the machine's own baseline). */
const CPU_RATE = Number(process.env.E2E_PERF_CPU || 4);
/** Tasks at least this long are reported one by one (ms). */
const LONG_MS = 200;
/** How long the trace runs on after the page is ready: the stage loads when the page is idle. */
const TAIL_MS = 8_000;

test.skip(!process.env.E2E_PERF, 'On demand: E2E_PERF=1 npx playwright test long-tasks --project=mobile');
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: { name?: string; data?: { url?: string; functionName?: string; type?: string; stackTrace?: { url?: string; functionName?: string }[] }; beginData?: { url?: string } };
}

/** Where an event's work came from: a script's chunk and function, or the event's own name. */
function source(e: TraceEvent): string {
  const data = e.args?.data;
  const url = data?.url || data?.stackTrace?.[0]?.url || e.args?.beginData?.url || '';
  const file = url ? url.replace(/^.*\/_next\/static\//, '').replace(/^https?:\/\/[^/]+/, '') : '';
  const fn = data?.functionName || data?.stackTrace?.[0]?.functionName || '';
  const what = e.name === 'EventDispatch' && data?.type ? `${e.name}(${data.type})` : e.name;
  return [what, file, fn && `${fn}()`].filter(Boolean).join(' ');
}

/** The main-thread tasks over LONG_MS, each with its largest pieces, and the total blocking time. */
function longTasks(events: TraceEvent[]) {
  const mains = new Set(
    events.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`),
  );
  const onMain = events.filter((e) => e.ph === 'X' && e.dur != null && mains.has(`${e.pid}:${e.tid}`)).sort((a, b) => a.ts - b.ts || b.dur! - a.dur!);
  const tasks = onMain.filter((e) => e.name === 'RunTask');
  const blocking = tasks.reduce((sum, t) => sum + Math.max(0, t.dur! / 1000 - 50), 0);
  const long = tasks
    .filter((t) => t.dur! / 1000 >= LONG_MS)
    .map((t) => {
      // The task's direct children (events inside it that aren't inside another child), largest first.
      const inside = onMain.filter((e) => e !== t && e.pid === t.pid && e.tid === t.tid && e.ts >= t.ts && e.ts + e.dur! <= t.ts + t.dur!);
      const top: TraceEvent[] = [];
      let end = -1;
      for (const e of inside) {
        if (e.ts >= end) {
          top.push(e);
          end = e.ts + e.dur!;
        }
      }
      // Go one level down through generic wrappers, so the script or the layout shows.
      const pieces = top.flatMap((c) => {
        if (!/^(ThreadControllerImpl::RunTask|RunMicrotasks|v8\.callFunction|FunctionCall|TimerFire|FireAnimationFrame)$/.test(c.name)) return [c];
        const sub = inside.filter((e) => e !== c && e.ts >= c.ts && e.ts + e.dur! <= c.ts + c.dur! && e.dur! >= c.dur! * 0.25);
        return sub.length ? [c, ...sub.slice(0, 2)] : [c];
      });
      const parts = pieces
        .sort((a, b) => b.dur! - a.dur!)
        .slice(0, 5)
        .map((e) => `${Math.round(e.dur! / 1000)} ms ${source(e)}`);
      return { at: t.ts, ms: Math.round(t.dur! / 1000), parts };
    });
  const start = Math.min(...tasks.map((t) => t.ts));
  return { long: long.map((l) => ({ ...l, at: Math.round((l.at - start) / 1000) })), blocking: Math.round(blocking), count: tasks.length };
}

async function traceLoad(browser: Browser, page: Page, path: string, label: string, ready: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
  await browser.startTracing(page, {
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'v8.execute', 'toplevel'],
  });
  let buffer: Buffer;
  try {
    await page.goto(path);
    await ready();
    await page.waitForTimeout(TAIL_MS);
  } finally {
    buffer = await browser.stopTracing();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  const { long, blocking, count } = longTasks((JSON.parse(buffer.toString('utf8')) as { traceEvents: TraceEvent[] }).traceEvents);
  const lines = [
    `${label} at ${CPU_RATE}× CPU, tier 1: ${long.length} task(s) over ${LONG_MS} ms of ${count}, total blocking time ${blocking} ms`,
    ...long.map((t) => `  +${t.at} ms: ${t.ms} ms\n${t.parts.map((p) => `      ${p}`).join('\n')}`),
  ];
  const report = lines.join('\n');
  console.log(`long-tasks ${report}`);
  test.info().annotations.push({ type: 'long-tasks', description: report });
  await test.info().attach(`long-tasks-${label.replace(/\W+/g, '-')}.txt`, { body: report, contentType: 'text/plain' });
}

test('the landing page', async ({ browser, page }) => {
  test.setTimeout(120_000);
  await traceLoad(browser, page, '/?fx=1', '/', async () => {
    await expect(page.getByRole('heading', { level: 1, name: /your money\. real bills\. crystal clear\./i })).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('signed in', () => {
  test.use({ allowedHosts: [FAKE_HOST] });

  test.beforeEach(async ({ request }) => {
    await requireHermeticBuild(request);
  });

  test('the dashboard and an impact page', async ({ browser, page, request }) => {
    test.setTimeout(240_000);
    const unexpected = await mockAi(page);
    const database = db(request);
    const userId = await newAccount(page, database);
    await seedProfileAndAnalyses(database, userId);

    await traceLoad(browser, page, '/dashboard?fx=1', '/dashboard', async () => {
      await expect(page.locator('[data-feed-card]')).toHaveCount(FEED.length, { timeout: 60_000 });
    });
    await traceLoad(browser, page, `/impact/${encodeURIComponent(FEED[0].id)}?fx=1`, '/impact/[policyId]', async () => {
      await expect(page.getByRole('heading', { level: 1 })).toContainText(FEED[0].title, { timeout: 60_000 });
    });
    expect(unexpected, 'API calls nothing answered').toEqual([]);
  });
});
