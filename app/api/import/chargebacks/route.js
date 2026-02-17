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

function fuzzyFindCol(row, keywords) {
  const keys = Object.keys(row);
  for (const kw of keywords) {
    const match = keys.find(k => k.toLowerCase().includes(kw.toLowerCase()));
    if (match && row[match] !== undefined && row[match] !== '') return row[match];
  }
  return '';
}

function parseAmount(val) {
  if (!val) return 0;
  const str = String(val).replace(/[^0-9.-]/g, '');
  return parseFloat(str) || 0;
}

export async function POST(request) {
  const db = getServiceSupabase();
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const processor = formData.get('processor') || 'unknown';
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    let text = await file.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const { data: rows, errors: parseErrors } = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim()
    });

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    let imported = 0, skipped = 0, errors = [];

    for (const row of rows) {
      const cbRef = findCol(row, ['Reference','Chargeback ID','Case Number','Case ID','Dispute ID','CB Reference','ARN','ID','Case #','Chargeback Reference','Ref','CB ID','Chargeback #','CB #','CB Ref'])
        || fuzzyFindCol(row, ['reference','case','arn','dispute id','chargeback','cb ref','cb id']);

      const amount = parseAmount(
        findCol(row, ['Amount','Dispute Amount','Chargeback Amount','CB Amount','Transaction Amount','Txn Amount','Total','Amt','CB Amt','Gross Amount','Net Amount','Original Amount'])
        || fuzzyFindCol(row, ['amount','amt','total','gross','net','dispute'])
      );

      const txnId = findCol(row, ['Transaction ID','Txn ID','Trans ID','Transaction #','Auth Code','Authorization','Authorization Code','Processor Reference','Original Transaction ID','Merchant Reference'])
        || fuzzyFindCol(row, ['transaction','txn','trans','auth','merchant ref']);

      const disputeDate = findCol(row, ['Dispute Date','CB Date','Chargeback Date','Filed Date','Open Date','Created','Date','Received Date','Date Received','Report Date','Notification Date'])
        || fuzzyFindCol(row, ['dispute date','chargeback date','filed','received','report date','notification']);

      const txnDate = findCol(row, ['Transaction Date','Txn Date','Trans Date','Sale Date','Order Date','Original Transaction Date','Purchase Date','Original Date'])
        || fuzzyFindCol(row, ['transaction date','original date','sale date','purchase','order date']);

      const custName = findCol(row, ['Customer Name','Cardholder','Name','Cardholder Name','Card Holder','Customer','First Name','Consumer Name'])
        || fuzzyFindCol(row, ['cardholder','customer','consumer','name']);

      const custEmail = (findCol(row, ['Email','Customer Email','Cardholder Email','Consumer Email'])
        || fuzzyFindCol(row, ['email'])).toLowerCase().trim();

      const cardLast4 = findCol(row, ['Card Last 4','Last 4','Card Last4','Last Four','Card Number','Card #','Last 4 Digits','Card','PAN','Account Number'])
        || fuzzyFindCol(row, ['card','last 4','pan','account']);

      const reasonCode = findCol(row, ['Reason Code','Code','CB Reason Code','Chargeback Reason Code','Dispute Code'])
        || fuzzyFindCol(row, ['reason code','dispute code']);

      const reasonDesc = findCol(row, ['Reason','Description','Reason Description','CB Reason','Chargeback Reason','Dispute Reason'])
        || fuzzyFindCol(row, ['reason','description','dispute reason']);

      const status = (findCol(row, ['Status','Case Status','Dispute Status','CB Status','Resolution','Outcome'])
        || fuzzyFindCol(row, ['status','resolution','outcome']) || 'open').toLowerCase();

      if (!cbRef && !amount && !txnId) { skipped++; continue; }

      const record = {
        processor,
        chargeback_ref: cbRef || txnId || ('auto_' + Date.now() + '_' + imported),
        transaction_id: txnId || null,
        dispute_date: disputeDate || null,
        transaction_date: txnDate || null,
        amount,
        customer_name: custName || null,
        customer_email: custEmail || null,
        card_last4: cardLast4 ? String(cardLast4).replace(/[^0-9]/g, '').slice(-4) : null,
        reason_code: reasonCode || null,
        reason_description: reasonDesc || null,
        processor_status: status,
      };

      const { error } = await db.from('chargebacks').insert(record);
      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) { skipped++; }
        else { errors.push({ ref: record.chargeback_ref, error: error.message }); }
      } else { imported++; }
    }

    let matchResult = { total: 0, high: 0, medium: 0, low: 0 };
    if (imported > 0) matchResult = await runMatching(db);

    const raw_sample = rows.slice(0, 3);

    return NextResponse.json({
      success: true, imported, skipped,
      errors: errors.slice(0, 10),
      total_rows: rows.length,
      headers_found: headers.slice(0, 30),
      matching: matchResult,
      raw_sample,
    });
  } catch (error) {
    console.error('Import chargebacks error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function runMatching(db) {
  const { data: unmatched } = await db.from('chargebacks').select('*').is('matched_order_id', null);
  if (!unmatched || unmatched.length === 0) return { total: 0, high: 0, medium: 0, low: 0 };
  let highMatches = 0, medMatches = 0, lowMatches = 0;

  for (const cb of unmatched) {
    let matchedId = null, confidence = 'none', method = null;

    if (cb.customer_email) {
      const { data: match } = await db.from('shopify_orders').select('id')
        .ilike('customer_email', cb.customer_email).eq('total_amount', cb.amount).limit(1);
      if (match && match.length > 0) { matchedId = match[0].id; confidence = 'high'; method = 'email+amount'; highMatches++; }
    }
    if (!matchedId && cb.card_last4) {
      const { data: match } = await db.from('shopify_orders').select('id')
        .eq('total_amount', cb.amount).eq('card_last4', cb.card_last4).limit(1);
      if (match && match.length > 0) { matchedId = match[0].id; confidence = 'medium'; method = 'amount+card'; medMatches++; }
    }
    if (!matchedId && cb.transaction_date) {
      const txDate = new Date(cb.transaction_date);
      const before = new Date(txDate); before.setDate(before.getDate() - 3);
      const after = new Date(txDate); after.setDate(after.getDate() + 3);
      const { data: match } = await db.from('shopify_orders').select('id')
        .eq('total_amount', cb.amount).gte('order_date', before.toISOString()).lte('order_date', after.toISOString()).limit(1);
      if (match && match.length > 0) { matchedId = match[0].id; confidence = 'low'; method = 'amount+date'; lowMatches++; }
    }
    await db.from('chargebacks').update({ matched_order_id: matchedId, match_confidence: confidence, match_method: method }).eq('id', cb.id);
  }
  return { total: unmatched.length, high: highMatches, medium: medMatches, low: lowMatches };
}