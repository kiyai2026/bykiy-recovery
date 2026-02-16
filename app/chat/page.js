'use client';
import { useState, useEffect, useRef } from 'react';
import { Send, Users, MessageSquare } from 'lucide-react';

export default function ChatPage() {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    fetch('/api/customers/recovery?limit=100')
      .then(r => r.json())
      .then(d => setCustomers(d.customers || []));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectCustomer = (c) => {
    setSelected(c);
    setMessages([]);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    const msg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg, time: new Date().toLocaleTimeString() }]);

    try {
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: selected?.id, message: msg }),
      });
      const data = await resp.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response, time: new Date().toLocaleTimeString() }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error connecting to AI. Check your Gemini API key in Settings.', time: new Date().toLocaleTimeString() }]);
    }
    setSending(false);
  };

  const filtered = customers.filter(c =>
    !search || (c.customer_name || '').toLowerCase().includes(search.toLowerCase()) || (c.customer_email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-64px)] -m-8">
      {/* Customer Sidebar */}
      <div className="w-80 bg-dark-700 border-r border-dark-500 flex flex-col">
        <div className="p-4 border-b border-dark-500">
          <h2 className="text-white font-semibold flex items-center gap-2 mb-3"><Users size={18} /> Customers</h2>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="input w-full text-sm" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No customers. Import orders first.</p>
          ) : filtered.map(c => (
            <button key={c.id} onClick={() => selectCustomer(c)} className={`w-full text-left p-4 border-b border-dark-500/50 hover:bg-dark-600 transition-colors ${selected?.id === c.id ? 'bg-dark-600 border-l-2 border-l-brand' : ''}`}>
              <p className="text-white text-sm font-medium truncate">{c.customer_name || 'Unknown'}</p>
              <p className="text-gray-400 text-xs truncate">{c.customer_email}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-brand text-xs font-semibold">${c.order_amount}</span>
                <span className="text-gray-500 text-xs">Tier {c.tier}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-dark-800">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare size={48} className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Select a customer to start an AI-powered conversation</p>
              <p className="text-gray-500 text-sm mt-2">The AI knows each customer's order details and will help resolve their issue</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-dark-500 bg-dark-700">
              <p className="text-white font-semibold">{selected.customer_name}</p>
              <p className="text-gray-400 text-xs">{selected.customer_email} · Order ${selected.order_amount} · {selected.order_date} · Tier {selected.tier} · Status: {selected.recovery_status}</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="bg-dark-700/50 rounded-xl p-4 text-sm text-gray-400 max-w-md">
                AI assistant is ready. Type a message as if you were the customer, or type instructions to draft a response.
              </div>
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-md rounded-2xl px-4 py-3 ${m.role === 'user' ? 'bg-brand/20 text-brand' : 'bg-dark-700 text-gray-200'}`}>
                    <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{m.time}</p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-dark-700 text-gray-400 rounded-2xl px-4 py-3 text-sm animate-pulse">Thinking...</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="p-4 border-t border-dark-500 flex gap-3">
              <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message or scenario..." className="input flex-1" autoFocus />
              <button type="submit" disabled={sending} className="btn-primary px-6"><Send size={16} /></button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
