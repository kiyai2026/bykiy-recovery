import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import Papa from 'papaparse';

export async function POST(request) {
  const db = getServiceSupabase();

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const processor = formData.get('processor') || 'green_payments';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    const { data: rows } = Papa.parse(text, { header: true, skipEmptyLines: true });

    let imported = 0;
    let errors = [];

    for (const row of rows) {
      const record = {
        processor,
        chargeback_ref: row['Reference'] || row['Chargeback ID'] || row['Case Number'] || row['ref'] || '',
        transaction_id: row['Transaction ID'] || row['transaction_id'] || null,
        dispute_date: row['Dispute Date'] || row['dispute_date'] || row['Date'] || null,
        transaction_date: row['Transaction Date'] || row['transaction_date'] || null,
        amount: parseFloat((row['Amount'] || row['amount'] || row['Dispute Amount'] || '0').replace(/[^0-9.-]/g, '')) || 0,
        customer_name: row['Customer Name'] || row['Cardholder'] || row['Name'] || null,
        customer_email: (row['Email'] || row['Customer Email'] || row['email'] || '').toLowerCase().trim() || null,
        card_last4: row['Card Last 4'] || row['Last 4'] || row['card_last4'] || null,
        reason_code: row['Reason Code'] || row['reason_code'] || null,
        reason_description: row['Reason'] || row['Description'] || row['reason'] || null,
        processor_status: (row['Status'] || row['status'] || 'open').toLowerCase(),
      };

      if (!record.chargeback_ref && !record.amount) continue;

      const { error } = await db.from('chargebacks').insert(record);
      if (error) {
        errors.push({ ref: record.chargeback_ref, error: error.message });
      } else {
        imported++;
      }
    }

    const matchResult = await runMatching(db);

    return NextResponse.json({
      success: true,
      imported,
      errors: errors.slice(0, 10),
      matching: matchResult,
    });
  } catch (error) {
    console.error('Import chargebacks error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function runMatching(db) {
  const { data: unmatched } = await db
    .from('chargebacks')
    .select('*')
    .is('matched_order_id', null);

  if (!unmatched || unmatched.length === 0) return { total: 0, matched: 0 };

  let highMatches = 0, medMatches = 0, lowMatches = 0;

  for (const cb of unmatched) {
    let matchedId = null;
    let confidence = 'none';
    let method = null;

    if (cb.customer_email) {
      const { data: match } = await db
        .from('shopify_orders')
        .select('id')
        .ilike('customer_email', cb.customer_email)
        .eq('total_amount', cb.amount)
        .limit(1);
      if (match && match.length > 0) {
        matchedId = match[0].id;
        confidence = 'high';
        method = 'email+amount';
        highMatches++;
      }
    }

    if (!matchedId && cb.card_last4) {
      const { data: match } = await db
        .from('shopify_orders')
        .select('id')
        .eq('total_amount', cb.amount)
        .eq('card_last4', cb.card_last4)
        .limit(1);
      if (match && match.length > 0) {
        matchedId = match[0].id;
        confidence = 'medium';
        method = 'amount+card';
        medMatches++;
      }
    }

    if (!matchedId && cb.transaction_date) {
      const txDate = new Date(cb.transaction_date);
      const before = new Date(txDate); before.setDate(before.getDate() - 3);
      const after = new Date(txDate); after.setDate(after.getDate() + 3);
      const { data: match } = await db
        .from('shopify_orders')
        .select('id')
        .eq('total_amount', cb.amount)
        .gte('order_date', before.toISOString())
        .lte('order_date', after.toISOString())
        .limit(1);
      if (match && match.length > 0) {
        matchedId = match[0].id;
        confidence = 'low';
        method = 'amount+date';
        lowMatches++;
      }
    }

    await db.from('chargebacks').update({
      matched_order_id: matchedId,
      match_confidence: confidence,
      match_method: method,
    }).eq('id', cb.id);
  }

  return {
    total: unmatched.length,
    high: highMatches,
    medium: medMatches,
    low: lowMatches,
    still_unmatched: unmatched.length - highMatches - medMatches - lowMatches,
  };
}
