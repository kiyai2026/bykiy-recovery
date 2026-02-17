import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  const db = getServiceSupabase();
  try {
    // Fetch chargebacks with matched order info via left join
    const { data: chargebacks, error } = await db
      .from('chargebacks')
      .select('*, shopify_orders(*)')
      .order('dispute_date', { ascending: false })
      .limit(200);

    if (error) throw error;

    // Enrich each chargeback with order details
    const enriched = (chargebacks || []).map(cb => {
      const order = cb.shopify_orders || null;
      let productNames = [];
      let lineItems = [];

      if (order) {
        // Parse line_items JSON if present
        if (order.line_items) {
          try {
            lineItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items;
            productNames = lineItems.map(li => li.name || li.title || 'Unknown Item');
          } catch (e) { /* ignore parse errors */ }
        }
      }

      return {
        ...cb,
        // Order info
        order_number: order?.order_number || null,
        order_date: order?.order_date || null,
        order_amount: order?.total_amount || null,
        order_email: order?.customer_email || null,
        order_customer_name: order?.customer_name || null,
        order_financial_status: order?.financial_status || null,
        order_fulfillment_status: order?.fulfillment_status || null,
        // Products
        product_names: productNames,
        line_items: lineItems,
        // Clean up nested object
        shopify_orders: undefined
      };
    });

    return NextResponse.json({ chargebacks: enriched });
  } catch (error) {
    return NextResponse.json({ error: error.message, chargebacks: [] }, { status: 500 });
  }
}
