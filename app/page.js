'use client';
import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, CheckCircle, Clock, DollarSign, Users, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-96 text-gray-400">Loading dashboard...</div>;

  const s = stats || {
    totalOrders: 0, totalChargebacks: 0, matchRate: 0,
    totalAtRisk: 0, recoveryPipeline: [], tierBreakdown: [],
    recovered: 0, lost: 0, pending: 0
  };

  const COLORS = ['#f39c12', '#e74c3c', '#27ae60', '#3498db', '#9b59b6'];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Recovery Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Real-time overview of your chargeback recovery</p>
        </div>
        <button onClick={() => window.location.reload()} className="btn-primary">Refresh Data</button>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Users size={20} />} label="Recovery Customers" value={s.totalCustomers || 0} color="text-brand" />
        <StatCard icon={<AlertTriangle size={20} />} label="Total Chargebacks" value={s.totalChargebacks || 0} color="text-red-400" />
        <StatCard icon={<DollarSign size={20} />} label="$ At Risk" value={`$${(s.totalAtRisk || 0).toLocaleString()}`} color="text-yellow-400" />
        <StatCard icon={<TrendingUp size={20} />} label="Match Rate" value={`${s.matchRate || 0}%`} color="text-green-400" />
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<CheckCircle size={20} />} label="Recovered" value={s.recovered || 0} color="text-green-400" />
        <StatCard icon={<Clock size={20} />} label="In Progress" value={s.pending || 0} color="text-yellow-400" />
        <StatCard icon={<DollarSign size={20} />} label="$ Recovered" value={`$${(s.recoveredAmount || 0).toLocaleString()}`} color="text-green-400" />
        <StatCard icon={<DollarSign size={20} />} label="$ Lost" value={`$${(s.lostAmount || 0).toLocaleString()}`} color="text-red-400" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recovery Pipeline */}
        <div className="card">
          <h3 className="text-white font-semibold mb-4">Recovery Pipeline</h3>
          {s.recoveryPipeline && s.recoveryPipeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={s.recoveryPipeline}>
                <XAxis dataKey="status" tick={{ fill: '#888', fontSize: 11 }} />
                <YAxis tick={{ fill: '#888' }} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 8 }} />
                <Bar dataKey="count" fill="#f39c12" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-sm">No data yet. Import orders to get started.</p>
          )}
        </div>

        {/* Tier Breakdown */}
        <div className="card">
          <h3 className="text-white font-semibold mb-4">Tier Breakdown</h3>
          {s.tierBreakdown && s.tierBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={s.tierBreakdown} dataKey="count" nameKey="tier" cx="50%" cy="50%" outerRadius={90} label={({ tier, count }) => `${tier}: ${count}`}>
                  {s.tierBreakdown.map((entry, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-sm">No data yet. Import orders to populate tier data.</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-white font-semibold mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <a href="/settings" className="btn-primary">Import Shopify Orders</a>
          <a href="/settings" className="btn-primary">Import Chargebacks</a>
          <a href="/customers" className="btn-secondary">View Recovery Customers</a>
          <a href="/chargebacks" className="btn-secondary">View Chargebacks</a>
          <a href="/chat" className="btn-secondary">Open AI Chat</a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={color}>{icon}</div>
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}
