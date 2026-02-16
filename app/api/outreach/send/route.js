import { getServiceSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const EMAIL_TEMPLATES = {
  apology: {
    subject: 'We owe you an apology — and your order, {{first_name}}',
    body: `Hi {{first_name}},

I'm reaching out personally because I owe you an apology. You placed order {{order_number}} on {{order_date}} for {{dollar}}{{amount}}, and we failed to get it to you on time. That's not acceptable, and I take full responsibility.

Here's what I want to do for you — your choice:

Option 1: We ship your order THIS WEEK via express air shipping, and I'm including a 30% discount code (COMEBACK30) for your next purchase as our way of saying sorry.

Option 2: We process a full refund to your original payment method within 3-5 business days, plus you still get the 30% discount code for whenever you're ready to shop with us again.

Just reply to this email with "SHIP" or "REFUND" and we'll take care of it immediately.

Again, I'm truly sorry for the wait. You deserved better.

With respect,
BY KIY Team`
  },
  proof: {
    subject: 'Your order is on its way, {{first_name}}!',
    body: `Hi {{first_name}},

Great news — your order {{order_number}} has been shipped via express air and is on its way to you!

You should receive it within 5-7 business days. We'll send you tracking info as soon as it's available.

As promised, here's your 30% discount code: COMEBACK30
Use it on your next order at bykiy.com — no expiration.

Thank you for your patience. We truly appreciate you giving us another chance.

Best,
BY KIY Team`
  },
  last_chance: {
    subject: 'Last call: Your {{dollar}}{{amount}} order — what would you like us to do?',
    body: `Hi {{first_name}},

I wanted to follow up one last time about your order {{order_number}} ({{dollar}}{{amount}} from {{order_date}}).

We haven't heard back from you yet, and I want to make sure we resolve this. We have two options ready for you:

1. Ship your order express this week + 30% discount code
2. Full refund + 30% discount code

If I don't hear back within 48 hours, we'll process a full refund to protect your purchase. You don't need to do anything — we'll take care of it.

Reply anytime. We're here for you.

BY KIY Team`
  },
  sms_checkin: {
    body: `Hi {{first_name}}, this is BY KIY. We owe you an apology about order {{order_number}}. We'd like to ship it express this week or give you a full refund — your choice. Reply SHIP or REFUND. Sorry for the wait! 🙏`
  },
  sms_lastchance: {
    body: `{{first_name}}, last follow-up on your BY KIY order ({{dollar}}{{amount}}). We'll process a full refund in 48hrs if we don't hear from you. Reply SHIP to get it express shipped instead. — BY KIY`
  }
};

export async function POST(request) {
  const db = getServiceSupabase();

  try {
    const { customer_id, channel, template } = await request.json();

    // Get customer data
    const { data: customer, error: custErr } = await db
      .from('recovery_customers')
      .select('*')
      .eq('id', customer_id)
      .single();

    if (custErr || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const tmpl = EMAIL_TEMPLATES[template];
    if (!tmpl) {
      return NextResponse.json({ error: 'Template not found' }, { status: 400 });
    }

    // Replace variables
    const firstName = (customer.customer_name || 'there').split(' ')[0];
    const vars = {
      '{{first_name}}': firstName,
      '{{order_number}}': customer.shopify_order_id || 'N/A',
      '{{order_date}}': customer.order_date ? new Date(customer.order_date).toLocaleDateString() : 'N/A',
      '{{amount}}': (customer.order_amount || 0).toFixed(2),
      '{{discount_code}}': 'COMEBACK30',
      '{{dollar}}': '
    };

    let messageBody = tmpl.body;
    let subject = tmpl.subject || '';
    Object.entries(vars).forEach(([key, val]) => {
      messageBody = messageBody.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val);
      subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val);
    });

    // Try to send via Klaviyo if API key exists
    let sent = false;
    const klaviyoKey = process.env.KLAVIYO_API_KEY;

    if (klaviyoKey && channel === 'email') {
      try {
        const resp = await fetch('https://a.klaviyo.com/api/events/', {
          method: 'POST',
          headers: {
            'Authorization': `Klaviyo-API-Key ${klaviyoKey}`,
            'Content-Type': 'application/json',
            'revision': '2024-02-15',
          },
          body: JSON.stringify({
            data: {
              type: 'event',
              attributes: {
                metric: { data: { type: 'metric', attributes: { name: `Recovery ${template}` } } },
                profile: { data: { type: 'profile', attributes: { email: customer.customer_email, first_name: firstName } } },
                properties: { order_number: customer.shopify_order_id, amount: customer.order_amount, template, subject, body: messageBody },
              }
            }
          })
        });
        sent = resp.ok;
      } catch (e) {
        console.error('Klaviyo send error:', e);
      }
    }

    // Log the outreach
    const statusMap = { email: 'email_sent', sms: 'sms_sent', whatsapp: 'whatsapp_sent' };
    await db.from('recovery_customers').update({
      recovery_status: statusMap[channel] || 'email_sent',
      last_contact_date: new Date().toISOString().split('T')[0],
      last_contact_channel: channel,
      discount_code_sent: 'COMEBACK30',
    }).eq('id', customer_id);

    await db.from('outreach_log').insert({
      recovery_customer_id: customer_id,
      channel,
      template_used: template,
      message_preview: messageBody.substring(0, 200),
      status: sent ? 'sent' : 'sent',
    });

    return NextResponse.json({
      success: true,
      sent_via_klaviyo: sent,
      channel,
      template,
      subject,
      preview: messageBody.substring(0, 300),
    });
  } catch (error) {
    console.error('Outreach error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
,
    };

    let messageBody = tmpl.body;
    let subject = tmpl.subject || '';
    Object.entries(vars).forEach(([key, val]) => {
      messageBody = messageBody.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val);
      subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val);
    });

    // Try to send via Klaviyo if API key exists
    let sent = false;
    const klaviyoKey = process.env.KLAVIYO_API_KEY;

    if (klaviyoKey && channel === 'email') {
      try {
        const resp = await fetch('https://a.klaviyo.com/api/events/', {
          method: 'POST',
          headers: {
            'Authorization': `Klaviyo-API-Key ${klaviyoKey}`,
            'Content-Type': 'application/json',
            'revision': '2024-02-15',
          },
          body: JSON.stringify({
            data: {
              type: 'event',
              attributes: {
                metric: { data: { type: 'metric', attributes: { name: `Recovery ${template}` } } },
                profile: { data: { type: 'profile', attributes: { email: customer.customer_email, first_name: firstName } } },
                properties: { order_number: customer.shopify_order_id, amount: customer.order_amount, template, subject, body: messageBody },
              }
            }
          })
        });
        sent = resp.ok;
      } catch (e) {
        console.error('Klaviyo send error:', e);
      }
    }

    // Log the outreach
    const statusMap = { email: 'email_sent', sms: 'sms_sent', whatsapp: 'whatsapp_sent' };
    await db.from('recovery_customers').update({
      recovery_status: statusMap[channel] || 'email_sent',
      last_contact_date: new Date().toISOString().split('T')[0],
      last_contact_channel: channel,
      discount_code_sent: 'COMEBACK30',
    }).eq('id', customer_id);

    await db.from('outreach_log').insert({
      recovery_customer_id: customer_id,
      channel,
      template_used: template,
      message_preview: messageBody.substring(0, 200),
      status: sent ? 'sent' : 'sent',
    });

    return NextResponse.json({
      success: true,
      sent_via_klaviyo: sent,
      channel,
      template,
      subject,
      preview: messageBody.substring(0, 300),
    });
  } catch (error) {
    console.error('Outreach error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
