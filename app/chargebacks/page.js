'use client';
import { useState, useEffect } from 'react';
import { RefreshCw, Zap, Upload } from 'lucide-react';

export default function ChargebacksPage() {
  const [chargebacks, setChargebacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [matchResults, setMatchResults] = useState(null);

  useEffect(() => {
    fetchChargebacks();
  }, []);

  const fetchChargebacks = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/dashboard/stats');
      const stats = await resp.json();

      // Fetch actual chargebacks via a simple query
      const cbResp = await fetch('/api/chargebacks/list');
      const cbData = await cbResp.json();
      setChargebacks(cbData.chargebacks || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const runMatching = async () => {
    setMatching(true);
    try {
      const resp = await fetch('/api/match/run', { method: 'POST' });
      const data = await resp.json();
      setMatchResults(data.results || data);
      fetchChargebacks();
    } catch (e) {
      console.error(e);
    }
    setMatching(false);
  };

  const CONF_COLORS = {
    high: 'badge-high',
    medium: 'badge-medium',
    low: 'badge-low',
    none: 'badge-none',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Chargeback Matcher</h1>
          <p className="text-gray-400 text-sm mt-1">Auto-match processor chargebacks to Shopify orders</p>
        </div>
        <div className="flex gap-3">
          <button onClick={runMatching} disabled={matching} className="btn-primary flex items-center gap-2">
            <Zap size={16} /> {matching ? 'Matching...' : 'Run Auto-Match'}
          </button>
          <button onClick={fetchChargebacks} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* Match Results Banner */}
      {matchResults && (
        <div className="card mb-6 border-brand/30">
          <h3 className="text-brand font-semibold mb-2">Match Results</h3>
          <div className="grid grid-cols-5 gap-4 text-center">
            <div><p className="text-2xl font-bold text-white">{matchResults.total_unmatched || matchResults.total || 0}</p><p className="text-xs text-gray-400">Processed</p></div>
            <div><p className="text-2xl font-bold text-green-400">{matchResults.newly_matched_high || matchResults.high || 0}</p><p className="text-xs text-gray-400">High Match</p></div>
            <div><p className="text-2xl font-bold text-yellow-400">{matchResults.newly_matched_medium || matchResults.medium || 0}</p><p className="text-xs text-gray-400">Medium Match</p></div>
            <div><p className="text-2xl font-bold text-orange-400">{matchResults.newly_matched_low || matchResults.low || 0}</p><p className="text-xs text-gray-400">Low Match</p></div>
            <div><p className="text-2xl font-bold text-red-400">{matchResults.still_unmatched || 0}</p><p className="text-xs text-gray-400">Unmatched</p></div>
          </div>
        </div>
      )}

      {/* Import Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ImportCard processor="green_payments" label="Green Payments" onImport={fetchChargebacks} />
        <ImportCard processor="echelon_payments" label="Echelon Payments" onImport={fetchChargebacks} />
      </div>

      {/* Chargebacks Table */}
      {loading ? (
        <div className="text-center text-gray-400 py-16">Loading chargebacks...</div>
      ) : chargebacks.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-400 mb-2">No chargebacks imported yet.</p>
          <p className="text-gray-500 text-sm">Use the import cards above to upload CSV files from Green Payments or Echelon Payments.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-500">
                <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Ref #</th>
                <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Processor</th>
                <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Amount</th>
                <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Date</th>
                <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Customer</th>
                <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Match</th>
                <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Matched Order</th>
                <th className="text-left text-xs text-gray-400 uppercase tracking-wider p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {chargebacks.map(cb => (
                <tr key={cb.id} className="border-b border-dark-500/50 hover:bg-dark-700/50">
                  <td className="p-3 text-white text-sm font-mono">{cb.chargeback_ref || '—'}</td>
                  <td className="p-3 text-sm capitalize">{(cb.processor || '').replace('_', ' ')}</td>
                  <td className="p-3 text-white font-medium">${(cb.amount || 0).toFixed(2)}</td>
                  <td className="p-3 text-gray-300 text-sm">{cb.dispute_date || '—'}</td>
                  <td className="p-3 text-sm">{cb.customer_email || cb.customer_name || '—'}</td>
                  <td className="p-3"><span className={`badge ${CONF_COLORS[cb.match_confidence] || 'badge-none'}`}>{cb.match_confidence || 'pending'}</span></td>
                  <td className="p-3 text-sm text-brand">{cb.matched_order_id ? `#${cb.matched_order_id}` : '—'}</td>
                  <td className="p-3 text-sm capitalize">{cb.processor_status || 'open'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ImportCard({ processor, label, onImport }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('processor', processor);

    try {
      const resp = await fetch('/api/import/chargebacks', { method: 'POST', body: formData });
      const data = await resp.json();
      setResult(data);
      onImport();
    } catch (err) {
      setResult({ error: err.message });
    }
    setUploading(false);
  };

  return (
    <div className="card">
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><Upload size={16} className="text-brand" /> {label}</h3>
      <p className="text-gray-400 text-sm mb-4">Upload a CSV export from {label}. The system will auto-match chargebacks to your Shopify orders.</p>
      <input type="file" accept=".csv" onChange={handleUpload} className="input w-full text-sm" disabled={uploading} />
      {uploading && <p className="text-brand text-sm mt-2">Importing and matching...</p>}
      {result && !result.error && (
        <div className="mt-3 p-3 bg-green-900/30 border border-green-800/50 rounded-lg text-sm">
          <p className="text-green-300">Imported {result.imported} chargebacks</p>
          {result.matching && <p className="text-green-400 text-xs mt-1">Matched: {result.matching.high || 0} high, {result.matching.medium || 0} medium, {result.matching.low || 0} low</p>}
        </div>
      )}
      {result?.error && <p className="text-red-400 text-sm mt-2">{result.error}</p>}
    </div>
  );
}
