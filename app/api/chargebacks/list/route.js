import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  const db = getServiceSupabase();
  try {
    const { data, error } = await db
      .from('chargebacks')
      .select('*')
      .order('dispute_date', { ascending: false })
      .limit(200);

    if (error) throw error;
    return NextResponse.json({ chargebacks: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error.message, chargebacks: [] }, { status: 500 });
  }
}
