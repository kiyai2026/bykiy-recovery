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
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    let text = await file.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const { data: rows, errors: parseErrors } = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    let imported = 0;
    let skipped = 0;
    let errors = [];

    for (const row of rows) {
      const orderNumber = findCol(row, ['Name', 'Order', 'Order Number', 'order_number', 'Order Name', 'order_name', '#', 'Order ID', 'order_id']);
      if (!orderNumber) { skipped++; continue; }

      const rawName = findCol(row, ['Billing Name', 'Shipping Name', 'Customer Name', 'Customer', 'customer_name']);
      const record = {
        order_number: String(orderNumber).replace('#', '').trim(),
        order_date: findCol(row, ['Created at', 'created_at', 'Created At', 'Date', 'Order Date', 'Created', 'Paid at']) || null,
        total_amount: parseFloat(String(findCol(row, ['Total', 'total', 'Order Total', 'Amount', 'Grand Total', 'Subtotal']) || '0').replace(/[^0-9.-]/g, '')) || 0,
        currency: findCol(row, ['Currency', 'currency']) || 'USD',
        financial_status: (findCol(row, ['Financial Status', 'financial_status', 'Payment Status', 'payment_status']) || 'paid').toLowerCase(),
        fulfillment_status: (findCol(row, ['Fulfillment Status', 'fulfillment_status', 'Fulfillment', 'fulfillment']) || 'unfulfilled').toLowerCase() || 'unfulfilled',
        customer_email: (findCol(row, ['Email', 'email', 'Customer Email', 'customer_email', 'Billing Email']) || '').toLowerCase().trim(),
        customer_name: rawName || '',
        customer_phone: findCol(row, ['Billing Phone', 'Shipping Phone', 'Phone', 'phone', 'Customer Phone']) || null,
        payment_reference: findCol(row, ['Payment Reference', 'payment_reference', 'Payment Ref', 'Transaction ID']) || null,
        card_last4: findCol(row, ['Card Last4', 'card_last4', 'Last 4', 'Card']) || null,
        line_items: findCol(row, ['Lineitem name', 'Line Item Name']) ? JSON.stringify([{ name: findCol(row, ['Lineitem name', 'Line Item Name']), qty: findCol(row, ['Lineitem quantity']) || 1, price: findCol(row, ['Lineitem price']) || 0 }]) : null,
      };

      const { error } = await db
        .from('shopify_orders')
        .upsert(record, { onConflict: 'order_number' })
        .select();

      if (error) {
        errors.push({ order: record.order_number, error: error.message });
      } else {
        imported++;
      }
    }

    if (imported > 0) await autoAssignTiers(db);

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: errors.slice(0, 10),
      total_rows: rows.length,
      headers_found: headers.slice(0, 20),
      parse_errors: parseErrors ? parseErrors.length : 0,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function autoAssignTiers(db) {
  const { data: orders } = await db
    .from('shopify_orders')
    .select('*')
    .in('fulfillment_status', ['unfulfilled', 'partial'])
    .eq('financial_status', 'paid');

  if (!orders || orders.length === 0) return;
  const now = new Date();

  for (const order of orders) {
    const { count } = await db
      .from('recovery_customers')
      .select('*', { count: 'exact', head: true })
      .eq('shopify_order_id', order.id);

    if (count > 0) continue;

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
      tier,
      recovery_status: 'not_contacted',
    });
  }
}
