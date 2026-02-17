'use client';
import { useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, RefreshCw, Package, Mail, Phone, MapPin, Hash, Calendar, DollarSign, Tag, MessageSquare, Send, X, ShoppingBag, Clock, AlertTriangle } from 'lucide-react';

const STATUS_COLORS = {
  not_contacted: 'bg-gray-800 text-gray-300 border-gray-600',
  email_sent: 'bg-blue-900/50 text-blue-300 border-blue-700',
  sms_sent: 'bg-purple-900/50 text-purple-300 border-purple-700',
  whatsapp_sent: 'bg-green-900/50 text-green-300 border-green-700',
  responded: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  chose_ship: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  chose_refund: 'bg-orange-900/50 text-orange-300 border-orange-700',
  recovered: 'bg-green-800/50 text-green-200 border-green-600',
  refunded: 'bg-red-900/50 text-red-300 border-red-700',
  lost: 'bg-red-800/50 text-red-200 border-red-600',
};

const STATUS_LABELS = {
  not_contacted: 'Not Contacted',
  email_sent: 'Email Sent',
  sms_sent: 'SMS Sent',
  whatsapp_sent: 'WhatsApp Sent',
  responded: 'Responded',
  chose_ship: 'Chose Ship',
  chose_refund: 'Chose Refund',
  recovered: 'Recovered',
  refunded: 'Refunded',
  lost: 'Lost',
};

const TIER_COLORS = {
  A: 'bg-red-500/20 text-red-300 border-red-500/50',
  B: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  C: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  D: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
};

const TIER_LABELS = { A: 'Priority A • 18+ mo', B: 'Tier B • 12-18 mo', C: 'Tier C • 6-12 mo', D: 'Tier D • Recent' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [chatOpen, setChatOpen] = useState(null);

  const fetchCustomers = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: '25' });
    if (search) params.set('search', search);
    if (filterTier) params.set('tier', filterTier);
    if (filterStatus) params.set('status', filterStatus);
    fetch(`/api/customers/recovery?${params}`)
      .then(r => r.json())
      .then(data => { setCustomers(data.customers || []); setTotal(data.total || 0); setTotalPages(data.totalPages || 1); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchCustomers(); }, [page, filterTier, filterStatus]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchCustomers(); };

  const sendOutreach = async (customerId, channel) => {
    const resp = await fetch('/api/outreach/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, channel, template: channel === 'email' ? 'apology' : 'sms_checkin' }),
    });
    const data = await resp.json();
    if (data.success) fetchCustomers();
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Recovery Customers</h1>
          <p className="text-gray-400 text-sm mt-1">{total} customers in pipeline</p>
        </div>
        <button onClick={fetchCustomers} className="btn-secondary flex items-center gap-2"><RefreshCw size={16} /> Refresh</button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-400 block mb-1">Search</label>
            <div className="flex gap-2">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email or name..." className="input flex-1" />
              <button type="submit" className="btn-primary"><Search size={16} /></button>
            </div>
          </form>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Tier</label>
            <select value={filterTier} onChange={e => { setFilterTier(e.target.value); setPage(1); }} className="input">
              <option value="">All Tiers</option>
              <option value="A">A — Priority (18+ mo)</option>
              <option value="B">B — Old (12-18 mo)</option>
              <option value="C">C — Recent (6-12 mo)</option>
              <option value="D">D — New</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Status</label>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="input">
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Customer Cards */}
      {loading ? (
        <div className="text-center text-gray-400 py-16 animate-pulse">Loading customers...</div>
      ) : customers.length === 0 ? (
        <div className="card text-center py-16">
          <ShoppingBag size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 mb-4">No customers found. Import Shopify orders from Settings.</p>
          <a href="/settings" className="btn-primary">Go to Settings</a>
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {customers.map(c => (
              <CustomerCard key={c.id} customer={c} expanded={expanded === c.id}
                onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                onSend={sendOutreach} onChat={() => setChatOpen(c)} />
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 px-3">
            <p className="text-sm text-gray-400">Page {page} of {totalPages} ({total} total)</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="btn-secondary disabled:opacity-30"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="btn-secondary disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        </>
      )}
      {chatOpen && <ChatModal customer={chatOpen} onClose={() => setChatOpen(null)} />}
    </div>
  );
}
function CustomerCard({ customer: c, expanded, onToggle, onSend, onChat }) {
  const daysSinceOrder = c.order_date ? Math.floor((Date.now() - new Date(c.order_date).getTime()) / 86400000) : null;
  const items = c.line_items || [];
  const displayName = c.customer_name || 'Unknown Customer';
  const initials = displayName !== 'Unknown Customer' ? displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) : '??';

  return (
    <div className="bg-dark-700 border border-dark-500 rounded-xl overflow-hidden hover:border-dark-400 transition-all">
      {/* Main Row - Always visible */}
      <div className="p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center flex-shrink-0">
            <span className="text-brand font-bold text-sm">{initials}</span>
          </div>

          {/* Main Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-white font-semibold">{displayName}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${TIER_COLORS[c.tier] || ''}`}>Tier {c.tier}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[c.recovery_status] || ''}`}>{STATUS_LABELS[c.recovery_status] || c.recovery_status}</span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-400">
              {c.customer_email && <span className="flex items-center gap-1"><Mail size={11} />{c.customer_email}</span>}
              {c.customer_phone && <span className="flex items-center gap-1"><Phone size={11} />{c.customer_phone}</span>}
              {c.order_number && <span className="flex items-center gap-1"><Hash size={11} />#{c.order_number}</span>}
            </div>

            {/* Product & Amount Row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              {c.order_amount > 0 && <span className="text-brand font-bold text-lg">${c.order_amount.toFixed(2)}</span>}
              {c.order_amount === 0 && <span className="text-gray-500 text-sm italic">Amount not imported</span>}
              {c.product_names && (
                <span className="flex items-center gap-1.5 text-sm text-gray-300 bg-dark-600 px-2 py-0.5 rounded">
                  <Package size={13} className="text-gray-500" />
                  <span className="truncate max-w-[300px]">{c.product_names}</span>
                </span>
              )}
              {items.length > 1 && <span className="text-xs text-gray-500">+{items.length - 1} more items</span>}
            </div>

            {/* Timeline row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[11px] text-gray-500">
              {c.order_date && <span className="flex items-center gap-1"><Calendar size={10} />{new Date(c.order_date).toLocaleDateString()}</span>}
              {daysSinceOrder !== null && <span className="flex items-center gap-1"><Clock size={10} />{daysSinceOrder} days ago</span>}
              {c.last_contact_date && <span className="flex items-center gap-1"><Send size={10} />Last contact: {new Date(c.last_contact_date).toLocaleDateString()}</span>}
              {!c.last_contact_date && c.recovery_status === 'not_contacted' && <span className="flex items-center gap-1 text-yellow-600"><AlertTriangle size={10} />Never contacted</span>}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); onSend(c.id, 'email'); }} className="text-[11px] bg-blue-900/40 text-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-800/50 border border-blue-800/30 transition-colors flex items-center gap-1"><Mail size={11} />Email</button>
            <button onClick={e => { e.stopPropagation(); onSend(c.id, 'sms'); }} className="text-[11px] bg-purple-900/40 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-800/50 border border-purple-800/30 transition-colors flex items-center gap-1"><MessageSquare size={11} />SMS</button>
            <button onClick={e => { e.stopPropagation(); onChat(); }} className="text-[11px] bg-brand/20 text-brand px-3 py-1.5 rounded-lg hover:bg-brand/30 border border-brand/30 transition-colors flex items-center gap-1"><Send size={11} />AI Chat</button>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-dark-500 bg-dark-800/50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Order Details */}
            <div>
              <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">Order Details</h4>
              <div className="space-y-1.5 text-sm">
                <p className="text-gray-300"><span className="text-gray-500">Order #:</span> {c.order_number || '—'}</p>
                <p className="text-gray-300"><span className="text-gray-500">Date:</span> {c.order_date ? new Date(c.order_date).toLocaleDateString() : '—'}</p>
                <p className="text-gray-300"><span className="text-gray-500">Amount:</span> <span className="text-brand font-semibold">${(c.order_amount || 0).toFixed(2)}</span></p>
                <p className="text-gray-300"><span className="text-gray-500">Payment:</span> {c.financial_status || '—'}</p>
                <p className="text-gray-300"><span className="text-gray-500">Fulfillment:</span> {c.fulfillment_status || '—'}</p>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">Products ({items.length})</h4>
              {items.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 bg-dark-700 rounded-lg p-2">
                      <div className="w-8 h-8 bg-dark-600 rounded flex items-center justify-center flex-shrink-0">
                        <Package size={14} className="text-gray-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-200 truncate">{item.name}</p>
                        <p className="text-[11px] text-gray-500">Qty: {item.qty}{item.price > 0 ? ` • $${item.price}` : ''}{item.sku ? ` • ${item.sku}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-gray-500 text-sm italic">No product data imported</p>}
            </div>

            {/* Contact & Recovery */}
            <div>
              <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">Recovery Info</h4>
              <div className="space-y-1.5 text-sm">
                <p className="text-gray-300"><span className="text-gray-500">Tier:</span> {TIER_LABELS[c.tier] || c.tier}</p>
                <p className="text-gray-300"><span className="text-gray-500">Status:</span> {STATUS_LABELS[c.recovery_status] || c.recovery_status}</p>
                <p className="text-gray-300"><span className="text-gray-500">Last Contact:</span> {c.last_contact_date ? new Date(c.last_contact_date).toLocaleDateString() : 'Never'}</p>
                {c.last_contact_channel && <p className="text-gray-300"><span className="text-gray-500">Channel:</span> {c.last_contact_channel}</p>}
                {c.response_notes && <p className="text-gray-300"><span className="text-gray-500">Notes:</span> {c.response_notes}</p>}
                {c.shipping_address && <p className="text-gray-300"><span className="text-gray-500">Ship to:</span> {c.shipping_address}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function ChatModal({ customer, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    try {
      const resp = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customer.id, message: userMsg }),
      });
      const data = await resp.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.error || 'No response' }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + e.message }]);
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-700 border border-dark-500 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-dark-500">
          <div>
            <h3 className="text-white font-semibold">AI Chat</h3>
            <p className="text-gray-400 text-xs">{customer.customer_name || customer.customer_email} • #{customer.order_number || customer.shopify_order_id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
          {messages.length === 0 && <p className="text-gray-500 text-sm text-center">Ask AI for help with this customer recovery...</p>}
          {messages.map((m, i) => (
            <div key={i} className={`text-sm p-3 rounded-lg ${m.role === 'user' ? 'bg-brand/20 text-brand ml-8' : 'bg-dark-600 text-gray-200 mr-8'}`}>
              {m.content}
            </div>
          ))}
          {sending && <div className="text-gray-500 text-sm animate-pulse">Thinking...</div>}
        </div>
        <form onSubmit={sendMessage} className="p-4 border-t border-dark-500 flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about this customer..." className="input flex-1" autoFocus />
          <button type="submit" disabled={sending} className="btn-primary"><Send size={16} /></button>
        </form>
      </div>
    </div>
  );
}