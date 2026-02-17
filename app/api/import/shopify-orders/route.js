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

export async function POST(request) {
  const db = getServiceSupabase();
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    let text = await file.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const { data: rows, errors: parseErrors } = Papa.parse(text, {
      header: true, skipEmptyLines: true, transformHeader: h => h.trim()
    });

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    // Group rows by order number (Shopify exports one row per line item)
    const orderMap = new Map();
    for (const row of rows) {
      const orderNum = findCol(row, ['Name','Order','Order Number','order_number','Order Name','order_name','#','Order ID','order_id'])
        || fuzzyFindCol(row, ['order','name'], { exclude: ['customer','billing','shipping','lineitem','line item','product','item','fulfillment','financial','discount'] });
      if (!orderNum) continue;
      const key = String(orderNum).replace('#','').trim();
      if (!orderMap.has(key)) orderMap.set(key, []);
      orderMap.get(key).push(row);
    }

    let imported = 0, skipped = 0, errors = [];

    for (const [orderNum, orderRows] of orderMap) {
      const first = orderRows[0];

      const totalAmt = parseAmount(
        findCol(first, ['Total','total','Order Total','Amount','Grand Total','Subtotal','Total Price','total_price','Subtotal Price'])
        || fuzzyFindCol(first, ['total','amount','subtotal','price'], { exclude: ['lineitem','line item','discount','tax','shipping','refund','outstanding'] })
      );

      const custName = findCol(first, ['Billing Name','Shipping Name','Customer Name','Customer','customer_name','First Name','Last Name','customer_first_name'])
        || fuzzyFindCol(first, ['billing name','shipping name','customer name'], { exclude: ['email','phone','address','company','city','zip','province','country'] });

      const custEmail = (findCol(first, ['Email','email','Customer Email','customer_email','Billing Email'])
        || fuzzyFindCol(first, ['email'], { exclude: ['marketing','accept'] })).toLowerCase().trim();

      const custPhone = findCol(first, ['Billing Phone','Shipping Phone','Phone','phone','Customer Phone'])
        || fuzzyFindCol(first, ['phone'], { exclude: ['company'] });

      const orderDate = findCol(first, ['Created at','created_at','Created At','Date','Order Date','Created','Paid at','paid_at'])
        || fuzzyFindCol(first, ['created','date','paid at'], { exclude: ['fulfil','cancel','refund','update'] });

      const finStatus = (findCol(first, ['Financial Status','financial_status','Payment Status','payment_status'])
        || fuzzyFindCol(first, ['financial','payment status'], { exclude: ['fulfil'] }) || 'paid').toLowerCase();

      const fulStatus = (findCol(first, ['Fulfillment Status','fulfillment_status','Fulfillment','fulfillment'])
        || fuzzyFindCol(first, ['fulfillment','fulfil'], { exclude: ['financial','lineitem','line item'] }) || 'unfulfilled').toLowerCase() || 'unfulfilled';

      const payRef = findCol(first, ['Payment Reference','payment_reference','Payment Ref','Transaction ID','Receipt Number'])
        || fuzzyFindCol(first, ['payment ref','receipt','transaction id'], { exclude: ['date','status'] });

      const card4 = findCol(first, ['Card Last4','card_last4','Last 4','Card','Payment Method'])
        || '';

      // Aggregate line items from all rows for this order
      const lineItems = orderRows.map(row => {
        const name = findCol(row, ['Lineitem name','Lineitem Name','lineitem_name','Line Item Name','Product','Product Title','Item','Item Name','Lineitem SKU','lineitem_sku'])
          || fuzzyFindCol(row, ['lineitem name','product','item name'], { exclude: ['quantity','price','sku','tax','fulfil','requires','discount'] });
        const qty = parseInt(findCol(row, ['Lineitem quantity','lineitem_quantity','Quantity','Qty']) || '1') || 1;
        const price = parseAmount(findCol(row, ['Lineitem price','lineitem_price','Unit Price','Item Price']) || '0');
        const sku = findCol(row, ['Lineitem sku','lineitem_sku','SKU','sku','Lineitem SKU']) || '';
        if (!name && !sku) return null;
        return { name: name || sku, qty, price, sku };
      }).filter(Boolean);

      // Build shipping address
      const shipAddr = [
        findCol(first, ['Shipping Name','Shipping Street','Shipping Address1','shipping_address_1']),
        findCol(first, ['Shipping City','shipping_city']),
        findCol(first, ['Shipping Province','shipping_province','Shipping Province Name']),
        findCol(first, ['Shipping Zip','shipping_zip']),
        findCol(first, ['Shipping Country','shipping_country'])
      ].filter(Boolean).join(', ') || null;

      const record = {
        order_number: orderNum,
        order_date: orderDate || null,
        total_amount: totalAmt,
        currency: findCol(first, ['Currency','currency']) || 'USD',
        financial_status: finStatus,
        fulfillment_status: fulStatus,
        customer_email: custEmail,
        customer_name: custName || '',
        customer_phone: custPhone || null,
        payment_reference: payRef || null,
        card_last4: card4 ? String(card4).replace(/[^0-9]/g,'').slice(-4) || null : null,
        line_items: lineItems.length > 0 ? JSON.stringify(lineItems) : null,
        shipping_address: shipAddr,
      };

      const { error } = await db.from('shopify_orders').upsert(record, { onConflict: 'order_number' }).select();
      if (error) { errors.push({ order: orderNum, error: error.message }); }
      else { imported++; }
    }

    if (imported > 0) await autoAssignTiers(db);

    const raw_sample = rows.slice(0, 3);

    return NextResponse.json({
      success: true, imported, skipped: rows.length - imported - errors.length,
      errors: errors.slice(0, 10),
      total_rows: rows.length,
      unique_orders: orderMap.size,
      headers_found: headers.slice(0, 30),
      raw_sample,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function autoAssignTiers(db) {
  const { data: orders } = await db.from('shopify_orders').select('*')
    .in('fulfillment_status', ['unfulfilled','partial']).eq('financial_status', 'paid');
  if (!orders || orders.length === 0) return;
  const now = new Date();

  for (const order of orders) {
    const { count } = await db.from('recovery_customers')
      .select('*', { count: 'exact', head: true }).eq('shopify_order_id', order.id);
    if (count > 0) {
      await db.from('recovery_customers').update({
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_phone: order.customer_phone,
        order_amount: order.total_amount,
        order_date: order.order_date,
      }).eq('shopify_order_id', order.id);
      continue;
    }

    const orderDate = new Date(order.order_date);
    const monthsAgo = (now.getFullYear() - orderDate.getFullYear()) * 12 + (now.getMonth() - orderDate.getMonth());
    let tier = 'C';
    if (monthsAgo >= 18) tier = 'A';
    else if (monthsAgo >= 12) tier = 'B';
    else if (monthsAgo >= 6) tier = 'C';
    else tier = 'D';

    await db.from('recovery_customers').insert({
      shopify_order_id: order.id,
      customer_email: order.customer_email,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      order_amount: order.total_amount,
      order_date: order.order_date,
      tier, recovery_status: 'not_contacted',
    });
  }
}