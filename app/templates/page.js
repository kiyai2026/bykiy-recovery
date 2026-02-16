'use client';
import { useState } from 'react';
import { Copy, Check, Mail, MessageCircle, Phone } from 'lucide-react';

const TEMPLATES = [
  {
    id: 'apology_email',
    category: 'Email',
    icon: Mail,
    name: 'Apology + Options Email',
    subject: 'We owe you an apology — and your order, {first_name}',
    body: `Hi {first_name},

I'm reaching out personally because I owe you an apology. You placed order {order_number} on {order_date} for ${'{amount}'}, and we failed to get it to you on time. That's not acceptable, and I take full responsibility.

Here's what I want to do for you — your choice:

Option 1: We ship your order THIS WEEK via express air shipping, and I'm including a 30% discount code (COMEBACK30) for your next purchase as our way of saying sorry.

Option 2: We process a full refund to your original payment method within 3-5 business days, plus you still get the 30% discount code for whenever you're ready to shop with us again.

Just reply to this email with "SHIP" or "REFUND" and we'll take care of it immediately.

Again, I'm truly sorry for the wait. You deserved better.

With respect,
BY KIY Team`
  },
  {
    id: 'shipping_confirm',
    category: 'Email',
    icon: Mail,
    name: 'Shipping Confirmation',
    subject: 'Your order is on its way, {first_name}!',
    body: `Hi {first_name},

Great news — your order {order_number} has been shipped via express air and is on its way to you!

You should receive it within 5-7 business days. We'll send tracking info as soon as it's available.

As promised, here's your 30% discount code: COMEBACK30
Use it on your next order at bykiy.com — no expiration.

Thank you for your patience. We truly appreciate you.

Best,
BY KIY Team`
  },
  {
    id: 'last_chance',
    category: 'Email',
    icon: Mail,
    name: 'Last Chance Email',
    subject: 'Last call: Your ${amount} order — what would you like us to do?',
    body: `Hi {first_name},

I wanted to follow up one last time about your order {order_number} (${'{amount}'} from {order_date}).

We haven't heard back yet, and I want to make sure we resolve this. Two options ready for you:

1. Ship your order express this week + 30% discount code
2. Full refund + 30% discount code

If we don't hear back within 48 hours, we'll process a full refund automatically to protect your purchase.

Reply anytime. We're here for you.

BY KIY Team`
  },
  {
    id: 'sms_checkin',
    category: 'SMS',
    icon: MessageCircle,
    name: 'SMS Check-In',
    body: `Hi {first_name}, this is BY KIY. We owe you an apology about order {order_number}. We'd like to ship it express this week or give you a full refund — your choice. Reply SHIP or REFUND. Sorry for the wait!`
  },
  {
    id: 'sms_lastchance',
    category: 'SMS',
    icon: MessageCircle,
    name: 'SMS Last Chance',
    body: `{first_name}, last follow-up on your BY KIY order (${'{amount}'}). We'll process a full refund in 48hrs if we don't hear from you. Reply SHIP to get it express shipped instead. — BY KIY`
  },
  {
    id: 'whatsapp_outreach',
    category: 'WhatsApp',
    icon: Phone,
    name: 'WhatsApp Outreach',
    body: `Hey {first_name}! 👋

This is the team at BY KIY. I'm reaching out about your order {order_number} from {order_date}.

I know it's been way too long, and I'm really sorry about that. We want to make it right:

✈️ Option 1: Express ship your order this week + 30% off your next order
💰 Option 2: Full refund + 30% off code

Just reply with what you'd prefer and we'll take care of it right away!`
  },
  {
    id: 'live_chat_script',
    category: 'Live Chat',
    icon: MessageCircle,
    name: 'Live Chat Script',
    body: `Hi {first_name}! Thanks for reaching out to BY KIY.

I can see your order {order_number} from {order_date}. First, I want to sincerely apologize for the delay — you absolutely deserved better service.

I'd love to make this right. I have two options for you:

1. Express ship your order this week + a 30% discount code for next time
2. Full refund processed in 3-5 days + the discount code

Which would you prefer? I'm here to help either way.`
  },
  {
    id: 'post_recovery',
    category: 'Email',
    icon: Mail,
    name: 'Post-Recovery Thank You',
    subject: 'Thank you, {first_name} — you mean the world to us',
    body: `Hi {first_name},

I just wanted to personally thank you for giving us another chance. Your patience and understanding mean more than you know.

As a token of our appreciation, your 30% discount code COMEBACK30 is ready whenever you'd like to use it — no expiration, no minimum order.

We've made significant improvements to our shipping and fulfillment process, and we're committed to making sure this never happens again.

If you ever need anything at all, reply to this email. I read every message personally.

With gratitude,
BY KIY Team`
  },
];

export default function TemplatesPage() {
  const [copied, setCopied] = useState('');
  const [filter, setFilter] = useState('All');

  const copy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const categories = ['All', ...new Set(TEMPLATES.map(t => t.category))];
  const filtered = filter === 'All' ? TEMPLATES : TEMPLATES.filter(t => t.category === filter);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Message Templates</h1>
        <p className="text-gray-400 text-sm mt-1">Pre-written messages for every recovery scenario. Copy and customize.</p>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 mb-6">
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === cat ? 'bg-brand text-black' : 'bg-dark-700 text-gray-300 hover:bg-dark-500'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filtered.map(tmpl => {
          const Icon = tmpl.icon;
          return (
            <div key={tmpl.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon size={16} className="text-brand" />
                  <h3 className="text-white font-semibold text-sm">{tmpl.name}</h3>
                  <span className="badge bg-dark-500 text-gray-300">{tmpl.category}</span>
                </div>
                <button onClick={() => copy(tmpl.body, tmpl.id)} className="btn-secondary text-xs flex items-center gap-1">
                  {copied === tmpl.id ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
              {tmpl.subject && <p className="text-gray-400 text-xs mb-2"><strong>Subject:</strong> {tmpl.subject}</p>}
              <pre className="text-gray-300 text-xs whitespace-pre-wrap bg-dark-800 rounded-lg p-4 max-h-48 overflow-y-auto leading-relaxed">{tmpl.body}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
