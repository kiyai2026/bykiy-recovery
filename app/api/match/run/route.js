import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST() {
  const db = getServiceSupabase();

  try {
    // Call the PostgreSQL matching function we created
    const { data, error } = await db.rpc('match_chargebacks');

    if (error) {
      console.error('Match function error:', error);
      // Fallback: do matching in JS
      return NextResponse.json(await jsMatching(db));
    }

    return NextResponse.json({
      success: true,
      results: data && data[0] ? data[0] : { total_unmatched: 0, newly_matched_high: 0, newly_matched_medium: 0, newly_matched_low: 0, still_unmatched: 0 },
    });
  } catch (error) {
    console.error('Match error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function jsMatching(db) {
  const { data: unmatched } = await db
    .from('chargebacks')
    .select('*')
    .is('matched_order_id', null);

  if (!unmatched) return { success: true, results: { total_unmatched: 0 } };

  let high = 0, medium = 0, low = 0;

  for (const cb of unmatched) {
    let matchedId = null;

    if (cb.customer_email) {
      const { data: m } = await db.from('shopify_orders').select('id')
        .ilike('customer_email', cb.customer_email).eq('total_amount', cb.amount).limit(1);
      if (m?.length) { matchedId = m[0].id; high++;
        await db.from('chargebacks').update({ matched_order_id: matchedId, match_confidence: 'high', match_method: 'email+amount' }).eq('id', cb.id);
        continue;
      }
    }

    if (cb.card_last4) {
      const { data: m } = await db.from('shopify_orders').select('id')
        .eq('total_amount', cb.amount).eq('card_last4', cb.card_last4).limit(1);
      if (m?.length) { matchedId = m[0].id; medium++;
        await db.from('chargebacks').update({ matched_order_id: matchedId, match_confidence: 'medium', match_method: 'amount+card' }).eq('id', cb.id);
        continue;
      }
    }

    await db.from('chargebacks').update({ match_confidence: 'none' }).eq('id', cb.id);
  }

  return {
    success: true,
    results: { total_unmatched: unmatched.length, newly_matched_high: high, newly_matched_medium: medium, newly_matched_low: low, still_unmatched: unmatched.length - high - medium - low },
  };
}
