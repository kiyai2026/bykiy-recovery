'use client';
import { useState, useEffect } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, Send, RefreshCw } from 'lucide-react';

const STATUS_COLORS = {
  not_contacted: 'bg-gray-800 text-gray-300',
  email_sent: 'bg-blue-900 text-blue-300',
  sms_sent: 'bg-purple-900 text-purple-300',
  whatsapp_sent: 'bg-green-900 text-green-300',
  responded: 'bg-yellow-900 text-yellow-300',
  chose_ship: 'bg-emerald-900 text-emerald-300',
  chose_refund: 'bg-orange-900 text-orange-300',
  recovered: 'bg-green-800 text-green-200',
  refunded: 'bg-red-900 text-red-300',
  lost: 'bg-red-800 text-red-200',
};

const TIER_COLORS = {
  A: 'bg-red-900 text-red-300',
  B: 'bg-orange-900 text-orange-300',
  C: 'bg-yellow-900 text-yellow-300',
  D: 'bg-blue-900 text-blue-300',
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState(null);

  const fetchCustomers = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: '25' });
    if (search) params.set('search', search);
    if (filterTier) params.set('tier', filterTier);
    if (filterStatus) params.set('status', filterStatus);

    fetch(`/api/customers/recovery?${params}`)
      .then(r => r.json())
      .then(data => {
        setCustomers(data.customers || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchCustomers(); }, [page, filterTier, filterStatus]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchCustomers();
  };

  const updateStatus = async (customerId, status, channel) => {
    await fetch(`/api/customers/${customerId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, channel }),
    });
    fetchCustomers();
  };

  const sendOutreach = async (customerId, channel, template) => {
    const resp = await fetch('/api/outreach/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, channel, template }),
    });
    const data = await resp.json();
    if (data.success) {
      alert(`${channel} sent successfully!`);
      fetchCustomers();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Recovery Customers</h1>
          <p className="text-gray-400 text-sm mt-1">{total} customers in pipeline</p>
        </div>
        <button onClick={fetchCustomers} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={16} /> Refresh
        </button>
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
              <option value="A">A — Oldest (18+ mo)</option>
              <option value="B">B — Old (12-18 mo)</option>
              <option value="C">C — Recent (6-12 mo)</option>
              <option value="D">D — Partial</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Status</label>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="input">
              <option value="">All Statuses</option>
              <option value="not_contacted">Not Contacted</option>
              <option value="email_sent">Email Sent</option>
              <option value="sms_sent">SMS Sent</option>
              <option value="responded">Responded</option>
              <option value="chose_ship">Chose Ship</option>
              <option value="chose_refund">Chose Refund</option>
              <option value="recovered">Recovered</option>
              <option value="refunded">Refunded</option>
              <option value="lost">Lost</option>
            </select>
          </div>
        </div>
      </div>

      {/* Customer Table */}
      {loading ? (
        <div className="text-center text-gray-400 py-16">Loading customers...</div>
      ) : customers.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-400 mb-4">No customers yet. Import Shopify orders from the Settings page to populate this list.</p>
          <a href="/settings" className="btn-primary">Go to Settings</a>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-500">
                  <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Customer</th>
                  <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Amount</th>
                  <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Date</th>
                  <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Tier</th>
                  <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Status</th>
                  <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Last Contact</th>
                  <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} className="border-b border-dark-500/50 hover:bg-dark-700/50 transition-colors">
                    <td className="p-3">
                      <p className="text-white text-sm font-medium">{c.customer_name || 'Unknown'}</p>
                      <p className="text-gray-400 text-xs">{c.customer_email}</p>
                    </td>
                    <td className="p-3 text-white font-medium">${(c.order_amount || 0).toFixed(2)}</td>
                    <td className="p-3 text-gray-300 text-sm">{c.order_date ? new Date(c.order_date).toLocaleDateString() : '—'}</td>
                    <td className="p-3"><span className={`badge ${TIER_COLORS[c.tier] || ''}`}>{c.tier}</span></td>
                    <td className="p-3"><span className={`badge ${STATUS_COLORS[c.recovery_status] || ''}`}>{(c.recovery_status || '').replace(/_/g, ' ')}</span></td>
                    <td className="p-3 text-gray-400 text-sm">{c.last_contact_date || '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => sendOutreach(c.id, 'email', 'apology')} className="text-xs bg-blue-900/50 text-blue-300 px-2 py-1 rounded hover:bg-blue-800/50" title="Send apology email">Email</button>
                        <button onClick={() => sendOutreach(c.id, 'sms', 'sms_checkin')} className="text-xs bg-purple-900/50 text-purple-300 px-2 py-1 rounded hover:bg-purple-800/50" title="Send SMS">SMS</button>
                        <button onClick={() => setSelected(c)} className="text-xs bg-brand/20 text-brand px-2 py-1 rounded hover:bg-brand/30" title="Open AI chat">Chat</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 px-3">
            <p className="text-sm text-gray-400">Page {page} of {totalPages} ({total} total)</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="btn-secondary disabled:opacity-30"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="btn-secondary disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        </>
      )}

      {/* Quick Chat Modal */}
      {selected && (
        <ChatModal customer={selected} onClose={() => setSelected(null)} />
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

    const resp = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customer.id, message: userMsg }),
    });
    const data = await resp.json();
    setMessages(prev => [...prev, { role: 'assistant', content: data.response || 'Error getting response' }]);
    setSending(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-700 border border-dark-500 rounded-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between p-4 border-b border-dark-500">
          <div>
            <p className="text-white font-semibold">{customer.customer_name}</p>
            <p className="text-gray-400 text-xs">{customer.customer_email} · ${customer.order_amount}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 200 }}>
          {messages.length === 0 && <p className="text-gray-500 text-sm text-center">Start a conversation. The AI knows this customer's order details.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`${m.role === 'user' ? 'ml-8 bg-brand/20 text-brand' : 'mr-8 bg-dark-500 text-gray-200'} rounded-xl px-4 py-2 text-sm`}>
              {m.content}
            </div>
          ))}
          {sending && <div className="mr-8 bg-dark-500 text-gray-400 rounded-xl px-4 py-2 text-sm animate-pulse">Thinking...</div>}
        </div>
        <form onSubmit={sendMessage} className="p-4 border-t border-dark-500 flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." className="input flex-1" />
          <button type="submit" disabled={sending} className="btn-primary"><Send size={16} /></button>
        </form>
      </div>
    </div>
  );
}
