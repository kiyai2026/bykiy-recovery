import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  const db = getServiceSupabase();

  try {
    // Total recovery customers
    const { count: totalCustomers } = await db
      .from('recovery_customers')
      .select('*', { count: 'exact', head: true });

    // Total chargebacks
    const { count: totalChargebacks } = await db
      .from('chargebacks')
      .select('*', { count: 'exact', head: true });

    // Matched chargebacks
    const { count: matchedChargebacks } = await db
      .from('chargebacks')
      .select('*', { count: 'exact', head: true })
      .not('matched_order_id', 'is', null);

    // Total $ at risk (sum of chargeback amounts)
    const { data: atRiskData } = await db
      .from('chargebacks')
      .select('amount');
    const totalAtRisk = (atRiskData || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

    // Recovery pipeline counts
    const { data: pipelineData } = await db
      .from('recovery_customers')
      .select('recovery_status');
    const pipelineMap = {};
    (pipelineData || []).forEach(r => {
      const s = r.recovery_status || 'not_contacted';
      pipelineMap[s] = (pipelineMap[s] || 0) + 1;
    });
    const recoveryPipeline = Object.entries(pipelineMap).map(([status, count]) => ({ status, count }));

    // Tier breakdown
    const { data: tierData } = await db
      .from('recovery_customers')
      .select('tier');
    const tierMap = {};
    (tierData || []).forEach(r => {
      const t = r.tier || 'Unknown';
      tierMap[t] = (tierMap[t] || 0) + 1;
    });
    const tierBreakdown = Object.entries(tierMap).map(([tier, count]) => ({ tier, count }));

    // Recovered / Lost / Pending amounts
    const { data: recoveryAmounts } = await db
      .from('recovery_customers')
      .select('recovery_status, order_amount');
    let recovered = 0, lost = 0, pending = 0;
    let recoveredAmount = 0, lostAmount = 0;
    (recoveryAmounts || []).forEach(r => {
      const amt = Number(r.order_amount || 0);
      if (['recovered', 'chose_ship'].includes(r.recovery_status)) { recovered++; recoveredAmount += amt; }
      else if (['lost', 'refunded'].includes(r.recovery_status)) { lost++; lostAmount += amt; }
      else { pending++; }
    });

    const matchRate = totalChargebacks > 0 ? Math.round((matchedChargebacks / totalChargebacks) * 100) : 0;

    return NextResponse.json({
      totalCustomers: totalCustomers || 0,
      totalChargebacks: totalChargebacks || 0,
      matchedChargebacks: matchedChargebacks || 0,
      matchRate,
      totalAtRisk: Math.round(totalAtRisk),
      recoveryPipeline,
      tierBreakdown,
      recovered,
      lost,
      pending,
      recoveredAmount: Math.round(recoveredAmount),
      lostAmount: Math.round(lostAmount),
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
