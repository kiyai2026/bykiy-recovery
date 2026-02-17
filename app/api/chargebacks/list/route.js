import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  const db = getServiceSupabase();
  try {
    // Simple select without join first
    const { data: chargebacks, error } = await db
      .from('chargebacks')
      .select('*')
      .order('dispute_date', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message, chargebacks: [] }, { status: 500 });
    }

    // For each chargeback with a matched_order_id, fetch the order
    const enriched = [];
    for (const cb of (chargebacks || [])) {
      let orderInfo = {};
      if (cb.matched_order_id) {
        const { data: order } = await db
          .from('shopify_orders')
          .select('*')
          .eq('id', cb.matched_order_id)
          .single();
        if (order) {
          let lineItems = [];
          let productNames = [];
          if (order.line_items) {
            try {
              lineItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items;
              productNames = lineItems.map(li => li.name || li.title || 'Unknown Item');
            } catch (e) {}
          }
          orderInfo = {
            order_number: order.order_number || null,
            order_date: order.order_date || null,
            order_amount: order.total_amount || null,
            order_email: order.customer_email || null,
            order_customer_name: order.customer_name || null,
            order_financial_status: order.financial_status || null,
            order_fulfillment_status: order.fulfillment_status || null,
            product_names: productNames,
            line_items: lineItems
          };
        }
      }
      enriched.push({ ...cb, ...orderInfo });
    }

    return NextResponse.json({ chargebacks: enriched });
  } catch (error) {
    return NextResponse.json({ error: error.message, chargebacks: [] }, { status: 500 });
  }
}