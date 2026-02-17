import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import Papa from 'papaparse';

function findCol(row, names) {
  for (const n of names) {
    const keys = Object.keys(row);
    const match = keys.find(k => k.trim().toLowerCase() === n.toLowerCase());
    if (match && row[match] !== undefined && String(row[match]).trim() !== '') return String(row[match]).trim();
  }
  return '';
}

function fuzzyFindCol(row, keywords, opts = {}) {
  const keys = Object.keys(row);
  const exclude = (opts.exclude || []).map(e => e.toLowerCase());
  for (const kw of keywords) {
    const match = keys.find(k => {
      const kl = k.toLowerCase();
      if (!kl.includes(kw.toLowerCase())) return false;
      for (const ex of exclude) { if (kl.includes(ex)) return false; }
      return true;
    });
    if (match && row[match] !== undefined && String(row[match]).trim() !== '') return String(row[match]).trim();
  }
  return '';
}

function parseAmount(val) {
  if (!val) return 0;
  const str = String(val).replace(/[^0-9.-]/g, '');
  return parseFloat(str) || 0;
}

function looksLikeRef(val) {
  if (!val) return false;
  const s = String(val).trim();
  return s.length > 0 && (/\d/.test(s) || s.length > 15);
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
      const cbRef = findCol(row, ['Reference','Chargeback ID','Case Number','Case ID','Dispute ID',
        'CB Reference','ARN','Case #','Chargeback Reference','CB Ref','CB ID','Chargeback #','CB #',
        'Acquirer Reference Number','Chargeback Case Number','Retrieval Reference Number','RRN',
        'Chargeback Case ID','Dispute Case ID','Dispute Number','Alert ID'])
        || fuzzyFindCol(row, ['case num','case id','arn','dispute id','cb ref','cb id','reference num','retrieval'],
          { exclude: ['merchant','amount','date','reason','status','name','card','email'] });

      const rawAmt = findCol(row, ['Amount','Dispute Amount','Chargeback Amount','CB Amount',
        'Transaction Amount','Txn Amount','Amt','CB Amt','Gross Amount','Net Amount',
        'Original Amount','Presentment Amount','Chargeback Amt','Original Transaction Amount',
        'Original Txn Amount','Represented Amount','Disputed Amount'])
        || fuzzyFindCol(row, ['amount','amt'], { exclude: ['date','code','reason','name','merchant','status'] });
      const amount = parseAmount(rawAmt);

      const txnId = findCol(row, ['Transaction ID','Txn ID','Trans ID','Transaction #',
        'Auth Code','Authorization Code','Processor Reference','Original Transaction ID',
        'Merchant Reference Number','Payment ID','Order Number','Order ID','Invoice Number',
        'Invoice ID','Merchant Order','Merchant Trans'])
        || fuzzyFindCol(row, ['transaction id','txn id','trans id','auth code','order num','invoice','payment id'],
          { exclude: ['date','amount','name','merchant name'] });

      const disputeDate = findCol(row, ['Dispute Date','CB Date','Chargeback Date','Filed Date',
        'Open Date','Date','Received Date','Date Received','Report Date','Notification Date',
        'Dispute Received','Date Filed','Date Opened','Created Date','Initiation Date','Post Date'])
        || fuzzyFindCol(row, ['dispute date','chargeback date','filed date','received date','report date','notification date','initiation date','post date'],
          { exclude: ['transaction','original','sale','order','amount'] });

      const txnDate = findCol(row, ['Transaction Date','Txn Date','Trans Date','Sale Date','Order Date',
        'Original Transaction Date','Purchase Date','Original Date','Payment Date',
        'Original Txn Date','Settle Date','Settlement Date','Processing Date'])
        || fuzzyFindCol(row, ['transaction date','original date','sale date','purchase date','settle date','payment date'],
          { exclude: ['dispute','chargeback','filed','received','notification'] });

      const custName = findCol(row, ['Customer Name','Cardholder','Cardholder Name','Card Holder',
        'Customer','Consumer Name','Buyer Name','Shopper Name'])
        || fuzzyFindCol(row, ['cardholder','customer name','consumer','buyer'],
          { exclude: ['email','phone','id','merchant'] });

      const custEmail = (findCol(row, ['Email','Customer Email','Cardholder Email','Consumer Email',
        'Buyer Email','Shopper Email','Contact Email'])
        || fuzzyFindCol(row, ['email'], { exclude: ['merchant','support'] })).toLowerCase().trim();

      const cardLast4 = findCol(row, ['Card Last 4','Last 4','Card Last4','Last Four','Card Number',
        'Card #','Last 4 Digits','Card','PAN','Account Number','Acct Last 4','Card Ending',
        'Credit Card','CC Number','CC Last 4','Card Num'])
        || fuzzyFindCol(row, ['card','last 4','pan','acct','cc num'],
          { exclude: ['cardholder','card holder','holder','name','type','brand','scheme'] });

      const reasonCode = findCol(row, ['Reason Code','Code','CB Reason Code','Chargeback Reason Code',
        'Dispute Code','Response Code'])
        || fuzzyFindCol(row, ['reason code','dispute code'], { exclude: ['description'] });

      const reasonDesc = findCol(row, ['Reason','Description','Reason Description','CB Reason',
        'Chargeback Reason','Dispute Reason','Reason Text','CB Description'])
        || fuzzyFindCol(row, ['reason desc','dispute reason','cb reason'],
          { exclude: ['code'] });

      const status = (findCol(row, ['Status','Case Status','Dispute Status','CB Status','Resolution','Outcome'])
        || fuzzyFindCol(row, ['status','resolution','outcome'], { exclude: ['date','code','amount'] }) || 'open').toLowerCase();

      if (amount <= 0) { skipped++; continue; }
      if (!cbRef && !txnId && !custEmail && !cardLast4) { skipped++; continue; }

      const finalRef = (looksLikeRef(cbRef) ? cbRef : '') || txnId || ('auto_' + Date.now() + '_' + imported);

      const record = {
        processor,
        chargeback_ref: finalRef,
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