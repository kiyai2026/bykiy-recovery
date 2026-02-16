import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const db = getServiceSupabase();
  const { searchParams } = new URL(request.url);

  const tier = searchParams.get('tier');
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  try {
    let query = db.from('recovery_customers').select('*', { count: 'exact' });

    if (tier) query = query.eq('tier', tier);
    if (status) query = query.eq('recovery_status', status);
    if (search) query = query.or(`customer_email.ilike.%${search}%,customer_name.ilike.%${search}%`);

    query = query.order('tier', { ascending: true })
                 .order('order_amount', { ascending: false })
                 .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      customers: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error('Customers error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
