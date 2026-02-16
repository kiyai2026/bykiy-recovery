import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  const db = getServiceSupabase();
  const { id } = params;

  try {
    const body = await request.json();
    const { status, channel, notes } = body;

    // Update customer status
    const updateData = { recovery_status: status };
    if (channel) updateData.last_contact_channel = channel;
    if (channel) updateData.last_contact_date = new Date().toISOString().split('T')[0];
    if (notes) updateData.response_notes = notes;

    const { data, error } = await db
      .from('recovery_customers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log to outreach log
    if (channel) {
      await db.from('outreach_log').insert({
        recovery_customer_id: parseInt(id),
        channel,
        template_used: status,
        message_preview: notes ? notes.substring(0, 200) : `Status changed to ${status}`,
        status: 'sent',
      });
    }

    return NextResponse.json({ success: true, customer: data });
  } catch (error) {
    console.error('Update status error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
