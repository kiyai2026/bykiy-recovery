import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import Papa from 'papaparse';

function findCol(row, names) {
  for (const n of names) {
    const keys = Object.keys(row);
    const match = keys.find(k => k.trim().toLowerCase() === n.toLowerCase());
    if (match && row[match] !== undefined && row[match] !== '') return row[match];
  }
  return '';
}

export async function POST(request) {
  const db = getServiceSupabase();

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const processor = formData.get('processor') || 'green_payments';

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    let text = await file.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const { data: rows, errors: parseErrors } = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    let imported = 0;
    let skipped = 0;
    let errors = [];

    for (const row of rows) {
      const cbRef = findCol(row, ['Reference', 'Chargeback ID', 'Case Number', 'ref', 'Case ID', 'Dispute ID', 'CB Reference', 'ARN', 'ID', 'Case #', 'Chargeback Reference']);
      const amount = parseFloat(String(findCol(row, ['Amount', 'amount', 'Dispute Amount', 'Chargeback Amount', 'CB Amount', 'Transaction Amount', 'Txn Amount', 'Total']) || '0').replace(/[^0-9.-]/g, '')) || 0;

      if (!cbRef && !amount) { skipped++; continue; }

      const record = {
        processor,
        chargeback_ref: cbRef || ('auto_' + Date.now() + '_' + imported),
        transaction_id: findCol(row, ['Transaction ID', 'transaction_id', 'Txn ID', 'Trans ID', 'Transaction #', 'Auth Code']) || null,
        dispute_date: findCol(row, ['Dispute Date', 'dispute_date', 'Date', 'CB Date', 'Chargeback Date', 'Filed Date', 'Open Date', 'Created']) || null,
        transaction_date: findCol(row, ['Transaction Date', 'transaction_date', 'Txn Date', 'Trans Date', 'Sale Date', 'Order Date', 'Original Transaction Date']) || null,
        amount,
        customer_name: findCol(row, ['Customer Name', 'Cardholder', 'Name', 'Cardholder Name', 'Card Holder', 'Customer']) || null,
        customer_email: (findCol(row, ['Email', 'Customer Email', 'email', 'Cardholder Email']) || '').toLowerCase().trim() || null,
        card_last4: findCol(row, ['Card Last 4', 'Last 4', 'card_last4', 'Last Four', 'Card Number', 'Card #', 'Card Last4', 'Last 4 Digits']) || null,
        reason_code: findCol(row, ['Reason Code', 'reason_code', 'Code', 'CB Reason Code', 'Chargeback Reason Code']) || null,
        reason_description: findCol(row, ['Reason', 'Description', 'reason', 'Reason Description', 'CB Reason', 'Chargeback Reason', 'Dispute Reason']) || null,
        processor_status: (findCol(row, ['Status', 'status', 'Case Status', 'Dispute Status', 'CB Status']) || 'open').toLowerCase(),
      };

      const { error } = await db.from('chargebacks').insert(record);
      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          skipped++;
        } else {
          errors.push({ ref: record.chargeback_ref, error: error.message });
        }
      } else {
        imported++;
      }
    }

    let matchResult = { total: 0, high: 0, medium: 0, low: 0 };
    if (imported > 0) matchResult = await runMatching(db);

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: errors.slice(0, 10),
      total_rows: rows.length,
      headers_found: headers.slice(0, 20),
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

  if (!unmatched || unmatched.length === 0) return { total: 0, high: 0, medium: 0, low: 0 };

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
  };
}
