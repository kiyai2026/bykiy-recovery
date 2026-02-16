import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are a customer service agent for BY KIY, a fashion/lifestyle brand. A customer is reaching out about an unfulfilled order.

Your personality: Warm, genuine, empathetic. Never robotic. Use the customer's first name. Be real — acknowledge the mistake honestly.

Your goals:
1. Sincerely apologize for the delay — own it, don't make excuses
2. Offer them two clear options:
   - Option A: Express ship their order THIS WEEK + 30% discount code (COMEBACK30)
   - Option B: Full refund within 3-5 business days + 30% discount code (COMEBACK30)
3. If they choose shipping, confirm enthusiastically and set their status
4. If they choose refund, confirm gracefully and process it
5. If they have other concerns, address them warmly and offer to escalate to the founder if needed
6. Keep responses concise (2-4 paragraphs max) and conversational

IMPORTANT: You represent a real brand that made a real mistake. Be humble and human.`;

export async function POST(request) {
  const db = getServiceSupabase();

  try {
    const { customer_id, message } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // Get customer context
    let customerContext = '';
    let conversationId = null;

    if (customer_id) {
      const { data: customer } = await db
        .from('recovery_customers')
        .select('*')
        .eq('id', customer_id)
        .single();

      if (customer) {
        customerContext = `\n\nCustomer context:
- Name: ${customer.customer_name}
- Email: ${customer.customer_email}
- Order Amount: $${customer.order_amount}
- Order Date: ${customer.order_date}
- Tier: ${customer.tier} (${customer.tier === 'A' ? 'oldest, 18+ months' : customer.tier === 'B' ? '12-18 months' : customer.tier === 'C' ? '6-12 months' : 'partial fulfillment'})
- Current Status: ${customer.recovery_status}
- Last Contact: ${customer.last_contact_date || 'never'}`;
      }

      // Get or create conversation
      const { data: existing } = await db
        .from('ai_conversations')
        .select('*')
        .eq('recovery_customer_id', customer_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        conversationId = existing[0].id;
      } else {
        const { data: newConvo } = await db
          .from('ai_conversations')
          .insert({ recovery_customer_id: customer_id, channel: 'live_chat', messages: [], status: 'active' })
          .select()
          .single();
        conversationId = newConvo?.id;
      }
    }

    // Get conversation history
    let history = [];
    if (conversationId) {
      const { data: convo } = await db
        .from('ai_conversations')
        .select('messages')
        .eq('id', conversationId)
        .single();
      history = convo?.messages || [];
    }

    // Build messages for Gemini
    const geminiMessages = history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    geminiMessages.push({ role: 'user', parts: [{ text: message }] });

    // Call Gemini API
    const geminiKey = process.env.GEMINI_API_KEY;
    let aiResponse = "I'm sorry, the AI chat is not configured yet. Please set your GEMINI_API_KEY in the environment variables.";

    if (geminiKey) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT + customerContext }] },
              contents: geminiMessages,
              generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
            })
          }
        );

        const data = await resp.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          aiResponse = data.candidates[0].content.parts[0].text;
        }
      } catch (e) {
        console.error('Gemini API error:', e);
        aiResponse = "I'm having trouble connecting right now. Let me get a human team member to help you. Can you email us at support@bykiy.com?";
      }
    }

    // Save to conversation
    if (conversationId) {
      const newMessages = [
        ...history,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() },
      ];
      await db.from('ai_conversations').update({ messages: newMessages }).eq('id', conversationId);
    }

    // Detect resolution intent
    const lowerMsg = message.toLowerCase();
    if (customer_id) {
      if (lowerMsg.includes('ship') || lowerMsg.includes('send it') || lowerMsg.includes('option a')) {
        await db.from('recovery_customers').update({ recovery_status: 'chose_ship' }).eq('id', customer_id);
      } else if (lowerMsg.includes('refund') || lowerMsg.includes('money back') || lowerMsg.includes('option b')) {
        await db.from('recovery_customers').update({ recovery_status: 'chose_refund' }).eq('id', customer_id);
      }
    }

    return NextResponse.json({
      success: true,
      response: aiResponse,
      conversation_id: conversationId,
    });
  } catch (error) {
    console.error('AI chat error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
