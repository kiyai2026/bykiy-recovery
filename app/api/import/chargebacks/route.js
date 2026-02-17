import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import Papa from 'papaparse';

/* -- Smart Header Detection -- */
const HEADER_KEYWORDS = ['amount','transaction','card','date','case','arn','reason','dispute',
  'chargeback','reference','merchant','mid','status','customer','email','phone','order',
  'acquirer','issuer','bin','pan','presentment','settlement','currency','authorization',
  'refund','credit','debit','fee','network','visa','mastercard','processor','cardholder',
  'trans','received','original'];

function looksLikeHeaderRow(values) {
  const lower = values.map(v => String(v).toLowerCase().trim());
  let matches = 0;
  for (const val of lower) {
    for (const kw of HEADER_KEYWORDS) {
      if (val.includes(kw)) { matches++; break; }
    }
  }
  return matches >= 3;
}

function smartParse(text) {
  let result = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
  if (result.data.length === 0) return result;
  const headers = Object.keys(result.data[0] || {});
  if (looksLikeHeaderRow(headers)) return { ...result, detectedHeaderRow: 0 };
  const rawResult = Papa.parse(text, { header: false, skipEmptyLines: true });
  const rawRows = rawResult.data;
  for (let i = 0; i < Math.min(rawRows.length, 30); i++) {
    const row = rawRows[i];
    if (!row || row.length < 3) continue;
    if (looksLikeHeaderRow(row)) {
      const dataRows = rawRows.slice(i + 1);
      const realHeaders = row.map(h => String(h).trim());
      const parsed = dataRows.filter(r => r.length >= 2).map(r => {
        const obj = {};
        realHeaders.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? String(r[idx]).trim() : ''; });
        return obj;
      });
      return { data: parsed, meta: { fields: realHeaders }, detectedHeaderRow: i };
    }
  }
  return { ...result, detectedHeaderRow: -1 };
}

/* -- Column finders -- */
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

/* -- Auto-match chargebacks to shopify_orders -- */
async function runMatching(db) {
  const { data: unmatched } = await db.from('chargebacks')
    .select('*').is('matched_order_id', null).limit(500);
  if (!unmatched || unmatched.length === 0) return { total: 0, matched: 0 };

  const { data: orders } = await db.from('shopify_orders').select('*').limit(5000);
  if (!orders) return { total: unmatched.length, matched: 0 };

  const emailMap = {};
  const amountMap = {};
  for (const o of orders) {
    if (o.customer_email) {
      const em = o.customer_email.toLowerCase().trim();
      if (!emailMap[em]) emailMap[em] = [];
      emailMap[em].push(o);
    }
    const amt = parseFloat(o.total_amount) || 0;
    if (amt > 0) {
      const key = amt.toFixed(2);
      if (!amountMap[key]) amountMap[key] = [];
      amountMap[key].push(o);
    }
  }

  let high = 0, medium = 0, low = 0;
  for (const cb of unmatched) {
    const cbEmail = (cb.customer_email || '').toLowerCase().trim();
    const cbAmt = parseFloat(cb.amount) || 0;
    const cbAmtKey = cbAmt.toFixed(2);
    let bestOrder = null, confidence = 'none';

    if (cbEmail && emailMap[cbEmail]) {
      const byAmt = emailMap[cbEmail].find(o => Math.abs((parseFloat(o.total_amount)||0) - cbAmt) < 0.02);
      if (byAmt) { bestOrder = byAmt; confidence = 'high'; }
    }
    if (!bestOrder && cbEmail && emailMap[cbEmail]) {
      bestOrder = emailMap[cbEmail][0]; confidence = 'medium';
    }
    if (!bestOrder && cbAmt > 0 && amountMap[cbAmtKey]) {
      const card = cb.card_last4 || '';
      if (card) {
        const byCard = amountMap[cbAmtKey].find(o => (o.card_last4||'') === card);
        if (byCard) { bestOrder = byCard; confidence = 'low'; }
      }
      if (!bestOrder && amountMap[cbAmtKey].length === 1) {
        bestOrder = amountMap[cbAmtKey][0]; confidence = 'low';
      }
    }

    if (bestOrder) {
      await db.from('chargebacks').update({
        matched_order_id: bestOrder.id,
        match_confidence: confidence
      }).eq('id', cb.id);
      if (confidence === 'high') high++;
      else if (confidence === 'medium') medium++;
      else low++;
    }
  }
  return { total: unmatched.length, high, medium, low, still_unmatched: unmatched.length - high - medium - low };
}

/* -- Main POST handler -- */
export async function POST(request) {
  const db = getServiceSupabase();
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const processor = formData.get('processor') || 'unknown';
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    let text = await file.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const parsed = smartParse(text);
    const rows = parsed.data || [];
    const headers = parsed.meta?.fields || (rows.length > 0 ? Object.keys(rows[0]) : []);

    let imported = 0, skipped = 0, errors = [];
    const rawSample = rows.slice(0, 3);

    for (const row of rows) {
      const cbRef = findCol(row, ['Reference','Case','Case Number','Case ID','Dispute ID',
        'Chargeback ID','CB Reference','ARN','Case #','Chargeback Reference','CB Ref',
        'CB ID','Chargeback #','Acquirer Reference Number','Chargeback Case Number',
        'Retrieval Reference Number','RRN'])
        || fuzzyFindCol(row, ['case','arn','dispute id','cb ref','reference','retrieval'],
          { exclude: ['merchant','amount','date','reason','status','name','card','email'] });

      const rawAmt = findCol(row, ['Amount','Dispute Amount','Chargeback Amount','CB Amount',
        'Transaction Amount','Txn Amount','Gross Amount','Net Amount','Presentment Amount',
        'Original Amount','Disputed Amount','Original Trans Amount','Case Amount Total',
        'Case Amount'])
        || fuzzyFindCol(row, ['amount','amt'], { exclude: ['date','code','reason','name','merchant'] });
      const amount = parseAmount(rawAmt);

      const email = findCol(row, ['Email','Customer Email','Cardholder Email','Card Holder Email'])
        || fuzzyFindCol(row, ['email'], { exclude: ['merchant','company'] });
      const name = findCol(row, ['Customer Name','Cardholder Name','Card Holder Name','Name'])
        || fuzzyFindCol(row, ['customer','cardholder','card holder'],
          { exclude: ['email','phone','id','number','merchant'] });

      const card = findCol(row, ['Card Last 4','Last 4','Card Number','Cardholder Number',
        'Pan Last 4','Last Four','Card No'])
        || fuzzyFindCol(row, ['last4','last 4','card num','cardholder num','pan'],
          { exclude: ['date','name'] });

      const txnId = findCol(row, ['Transaction ID','Txn ID','Transaction Reference','Auth Code',
        'Authorization Code','Trans ID','MID'])
        || fuzzyFindCol(row, ['transaction id','txn id','auth code','mid'],
          { exclude: ['date','amount'] });

      const disputeDate = findCol(row, ['Dispute Date','Chargeback Date','CB Date','Date Opened',
        'Date Created','Created Date','Filed Date','Date Received','Received Date'])
        || fuzzyFindCol(row, ['received','filed','opened','created','dispute'],
          { exclude: ['amount','code','reason','card','trans'] });

      const txnDate = findCol(row, ['Transaction Date','Trans Date','Purchase Date','Order Date',
        'Original Date','Sale Date','Txn Date'])
        || fuzzyFindCol(row, ['trans date','purchase','sale date','txn date','order date'],
          { exclude: ['amount','code','reason','card','received','dispute'] });

      const reasonCode = findCol(row, ['Reason Code','Reason','CB Reason','Chargeback Reason',
        'Dispute Reason','Category'])
        || fuzzyFindCol(row, ['reason','category'], { exclude: ['date','amount','name'] });

      if (amount <= 0 && !cbRef && !txnId && !email && !card) { skipped++; continue; }

      const record = {
        processor,
        transaction_id: cbRef || txnId || null,
        amount,
        dispute_date: disputeDate || null,
        transaction_date: txnDate || null,
        reason_code: reasonCode || null,
        customer_name: name || null,
        customer_email: email || null,
        card_last4: card ? card.replace(/\D/g, '').slice(-4) : null,
        match_confidence: 'none',
        matched_order_id: null
      };

      const { error: insertErr } = await db.from('chargebacks').insert(record);
      if (insertErr) {
        if (errors.length < 5) errors.push(insertErr.message);
        skipped++;
      } else {
        imported++;
      }
    }

    const matching = imported > 0 ? await runMatching(db) : null;

    return NextResponse.json({
      imported, skipped, total_rows: rows.length,
      detectedHeaderRow: parsed.detectedHeaderRow ?? null,
      headers, raw_sample: rawSample, matching,
      errors: errors.slice(0, 5)
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}