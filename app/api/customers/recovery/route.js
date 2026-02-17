import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const db = getServiceSupabase();
  const { searchParams } = new URL(request.url);

  const tier = searchParams.get('tier');
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '25');
  const offset = (page - 1) * limit;

  try {
    let query = db.from('recovery_customers').select('*, shopify_orders(*)', { count: 'exact' });

    if (tier) query = query.eq('tier', tier);
    if (status) query = query.eq('recovery_status', status);
    if (search) query = query.or(`customer_email.ilike.%${search}%,customer_name.ilike.%${search}%`);

    query = query.order('tier', { ascending: true })
                 .order('order_amount', { ascending: false })
                 .range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    const customers = (data || []).map(c => {
      const order = c.shopify_orders || {};
      let lineItems = [];
      try { lineItems = order.line_items ? JSON.parse(order.line_items) : []; } catch(e) {}
      return {
        ...c,
        order_number: order.order_number || null,
        product_names: lineItems.map(i => i.name).filter(Boolean).join(', ') || null,
        line_items: lineItems,
        financial_status: order.financial_status || null,
        fulfillment_status: order.fulfillment_status || null,
        shipping_address: order.shipping_address || null,
        order_amount: c.order_amount || order.total_amount || 0,
        customer_name: c.customer_name || order.customer_name || '',
        customer_email: c.customer_email || order.customer_email || '',
        customer_phone: c.customer_phone || order.customer_phone || null,
      };
    });

    return NextResponse.json({
      customers,
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error('Customers error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}