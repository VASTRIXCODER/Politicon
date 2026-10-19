'use client';

import { useState } from 'react';
import Badge from '@/components/ui/Badge';
import Surface from '@/components/ui/Surface';
import PolicyReceipt from './PolicyReceipt';
import SkylineSection from './SkylineSection';
import type { ReceiptLine, ReceiptOrder } from './receiptModel';

/*
 * /lab specimens for My Impact (App II), for visual QA: the policy receipt
 * (press "Reprint" to play its print again) beside the skyline, sharing one
 * focus, with example analyses (one with no projections, one at $0, gains
 * and costs whose 1, 3 and 5-year estimates aren't the yearly figure times
 * the years), and the skyline as a block of many towers.
 *
 *   import ReceiptLab from '@/components/impact/receipt/ReceiptLab';
 *   <ReceiptLab />
 */

type LabRow = ReceiptLine & { timeline: { year1?: number; year3?: number; year5?: number } | null };

const EXAMPLE: LabRow[] = [
  { id: 'ex-ctc', policy_id: 'ex-ctc', policy_title: 'Child Tax Credit Expansion Act', category: 'taxes', created_at: '2026-10-12T10:00:00Z', dollar_impact: 1240, timeline: { year1: 1200, year3: 3900, year5: 6100 } },
  { id: 'ex-housing', policy_id: 'ex-housing', policy_title: 'Housing Supply and Affordability Act', category: 'housing', created_at: '2026-10-14T10:00:00Z', dollar_impact: -420, timeline: { year1: -420, year3: -1150, year5: -1700 } },
  { id: 'ex-energy', policy_id: 'ex-energy', policy_title: 'Home Energy Rebate Program', category: 'energy', created_at: '2026-10-02T10:00:00Z', dollar_impact: 310, timeline: { year1: 0, year3: 640, year5: 1250 } },
  { id: 'ex-loans', policy_id: 'ex-loans', policy_title: 'Student Loan Repayment Reform', category: 'education', created_at: '2026-09-21T10:00:00Z', dollar_impact: -180, timeline: { year1: -180, year3: -560, year5: -820 } },
  { id: 'ex-zero', policy_id: 'ex-zero', policy_title: 'Federal Data Privacy Standards', category: 'other', created_at: '2026-09-18T10:00:00Z', dollar_impact: 0, timeline: { year1: 0, year3: 0, year5: 0 } },
  { id: 'ex-legacy', policy_id: 'ex-legacy', policy_title: 'An earlier, short analysis', category: 'healthcare', created_at: '2026-08-30T10:00:00Z', dollar_impact: 95, timeline: null },
];

const BLOCK: LabRow[] = Array.from({ length: 18 }, (_, i) => {
  const v = Math.round((((i * 37) % 23) - 8) * 140);
  return {
    id: `ex-block-${i}`,
    policy_id: `ex-block-${i}`,
    policy_title: `Example policy ${i + 1}`,
    category: 'taxes',
    created_at: '2026-10-01T10:00:00Z',
    dollar_impact: v,
    timeline: { year1: v, year3: Math.round(v * 2.6), year5: Math.round(v * 4.1) },
  };
});

export default function ReceiptLab() {
  const [focus, setFocus] = useState<string | null>(null);
  const [order, setOrder] = useState<ReceiptOrder>('impact');
  const [openId, setOpenId] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const lines = [...EXAMPLE].sort((a, b) =>
    order === 'impact' ? Math.abs(b.dollar_impact) - Math.abs(a.dollar_impact) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-6">
      <Surface as="article" variant="outline" pad="sm" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-medium text-ink">Policy receipt + skyline (My Impact)</h3>
            <p className="mt-1 text-sm text-muted">
              Example analyses. Point at a line to light its tower; the horizon switches between the analyses&apos; own 1, 3 and
              5-year estimates on one scale.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="example">Example</Badge>
            <button type="button" onClick={() => setRun((n) => n + 1)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary-300 hover:bg-fg/5">
              Reprint
            </button>
          </div>
        </div>
        <div className="grid items-start gap-8 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-5">
            <PolicyReceipt
              key={run}
              lines={lines}
              order={order}
              onOrderChange={setOrder}
              openId={openId}
              onToggle={(id) => setOpenId((c) => (c === id ? null : id))}
              details={(id) => <p className="text-sm text-muted">The summary of {EXAMPLE.find((r) => r.id === id)?.policy_title} opens here.</p>}
              focus={focus}
              onFocus={setFocus}
              print
            />
          </div>
          <div className="min-w-0 lg:col-span-7">
            <SkylineSection rows={lines} focus={focus} onFocus={setFocus} />
          </div>
        </div>
      </Surface>

      <Surface as="article" variant="outline" pad="sm" className="space-y-3">
        <h3 className="font-display text-lg font-medium text-ink">Skyline as a block (18 policies)</h3>
        <p className="text-sm text-muted">More than eight policies stand in rows, the receipt&apos;s first lines at the back; no plaques.</p>
        <SkylineSection rows={BLOCK} initialHorizon={3} />
      </Surface>
    </div>
  );
}
