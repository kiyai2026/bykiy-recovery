import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import Papa from 'papaparse';

export async function POST(request) {
  const db = getServiceSupabase();

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    const { data: rows } = Papa.parse(text, { header: true, skipEmptyLines: true });

    let imported = 0;
    let updated = 0;
    let errors = [];

    for (const row of rows) {
      const orderNumber = row['Name'] || row['Order'] || row['order_number'] || '';
      if (!orderNumber) continue;

      const record = {
        order_number: orderNumber.replace('#', '').trim(),
        order_date: row['Created at'] || row['created_at'] || null,
        total_amount: parseFloat((row['Total'] || row['total'] || '0').replace(/[^0-9.-]/g, '')) || 0,
        currency: row['Currency'] || 'USD',
        financial_status: (row['Financial Status'] || row['financial_status'] || 'paid').toLowerCase(),
        fulfillment_status: (row['Fulfillment Status'] || row['fulfillment_status'] || 'unfulfilled').toLowerCase() || 'unfulfilled',
        customer_email: (row['Email'] || row['email'] || '').toLowerCase().trim(),
        customer_name: `${row['Billing Name'] || row['Shipping Name'] || row['customer_name'] || ''}`.trim(),
        customer_phone: row['Billing Phone'] || row['Shipping Phone'] || row['Phone'] || null,
        payment_reference: row['Payment Reference'] || row['payment_reference'] || null,
        card_last4: row['Card Last4'] || row['card_last4'] || null,
        line_items: row['Lineitem name'] ? JSON.stringify([{ name: row['Lineitem name'], qty: row['Lineitem quantity'] || 1, price: row['Lineitem price'] || 0 }]) : null,
      };

      const { data, error } = await db
        .from('shopify_orders')
        .upsert(record, { onConflict: 'order_number' })
        .select();

      if (error) {
        errors.push({ order: orderNumber, error: error.message });
      } else {
        imported++;
      }
    }

    await autoAssignTiers(db);

    return NextResponse.json({
      success: true,
      imported,
      updated,
      errors: errors.slice(0, 10),
      total_rows: rows.length,
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
