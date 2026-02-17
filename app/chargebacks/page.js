'use client';
import { useState, useEffect } from 'react';
import { RefreshCw, Zap, Upload, Package, ShoppingBag, ChevronDown, ChevronUp, AlertTriangle, Calendar, CreditCard, Hash } from 'lucide-react';

export default function ChargebacksPage() {
  const [chargebacks, setChargebacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [matchResults, setMatchResults] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => { fetchChargebacks(); }, []);

  const fetchChargebacks = async () => {
    setLoading(true);
    try {
      const cbResp = await fetch('/api/chargebacks/list');
      const cbData = await cbResp.json();
      setChargebacks(cbData.chargebacks || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const runMatching = async () => {
    setMatching(true);
    try {
      const resp = await fetch('/api/match/run', { method: 'POST' });
      const data = await resp.json();
      setMatchResults(data.results || data);
      fetchChargebacks();
    } catch (e) { console.error(e); }
    setMatching(false);
  };

  const toggleExpand = (id) => setExpandedId(expandedId === id ? null : id);
  const confColor = { high: '#22c55e', medium: '#eab308', low: '#f97316', none: '#6b7280' };
  const confBg = { high: 'rgba(34,197,94,0.15)', medium: 'rgba(234,179,8,0.15)', low: 'rgba(249,115,22,0.15)', none: 'rgba(107,114,128,0.15)' };
  const total = chargebacks.length;
  const totalAmt = chargebacks.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const matched = chargebacks.filter(c => c.matched_order_id).length;
  const unmatched = total - matched;

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

      {total > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card text-center"><p className="text-2xl font-bold text-white">{total}</p><p className="text-xs text-gray-400">Total Chargebacks</p></div>
          <div className="card text-center"><p className="text-2xl font-bold text-red-400">${totalAmt.toLocaleString('en-US',{minimumFractionDigits:2})}</p><p className="text-xs text-gray-400">Total Disputed</p></div>
          <div className="card text-center"><p className="text-2xl font-bold text-green-400">{matched}</p><p className="text-xs text-gray-400">Matched to Orders</p></div>
          <div className="card text-center"><p className="text-2xl font-bold text-yellow-400">{unmatched}</p><p className="text-xs text-gray-400">Unmatched</p></div>
        </div>
      )}

      {matchResults && (
        <div className="card mb-6 border-brand/30">
          <h3 className="text-brand font-semibold mb-2">Match Results</h3>
          <div className="grid grid-cols-5 gap-4 text-center">
            <div><p className="text-2xl font-bold text-white">{matchResults.total||0}</p><p className="text-xs text-gray-400">Processed</p></div>
            <div><p className="text-2xl font-bold text-green-400">{matchResults.high||0}</p><p className="text-xs text-gray-400">High</p></div>
            <div><p className="text-2xl font-bold text-yellow-400">{matchResults.medium||0}</p><p className="text-xs text-gray-400">Medium</p></div>
            <div><p className="text-2xl font-bold text-orange-400">{matchResults.low||0}</p><p className="text-xs text-gray-400">Low</p></div>
            <div><p className="text-2xl font-bold text-red-400">{matchResults.still_unmatched||0}</p><p className="text-xs text-gray-400">Unmatched</p></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ImportCard processor="green_payments" label="Green Payments" onImport={fetchChargebacks} />
        <ImportCard processor="echelon_payments" label="Echelon Payments" onImport={fetchChargebacks} />
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-16">Loading chargebacks...</div>
      ) : chargebacks.length === 0 ? (
        <div className="card text-center py-16">
          <AlertTriangle size={40} className="mx-auto text-gray-500 mb-3" />
          <p className="text-gray-400 mb-2">No chargebacks imported yet.</p>
          <p className="text-gray-500 text-sm">Upload CSV files from Green Payments or Echelon Payments above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {chargebacks.map(cb => (
            <ChargebackCard key={cb.id} cb={cb} expanded={expandedId===cb.id} onToggle={()=>toggleExpand(cb.id)} confColor={confColor} confBg={confBg} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChargebackCard({ cb, expanded, onToggle, confColor, confBg }) {
  const amount = parseFloat(cb.amount) || 0;
  const conf = cb.match_confidence || 'none';
  const hasOrder = !!cb.matched_order_id;
  const products = cb.product_names || [];
  const lineItems = cb.line_items || [];
  const orderNum = cb.order_number || cb.matched_shopify_order_number;

  return (
    <div className="card" style={{ borderLeft: `3px solid ${confColor[conf]}` }}>
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="text-right" style={{ minWidth: '90px' }}>
            <p className="text-xl font-bold text-white">${amount.toLocaleString('en-US',{minimumFractionDigits:2})}</p>
            <p className="text-xs text-gray-500">{(cb.processor||'').replace('_',' ')}</p>
          </div>
          <div className="w-px h-10 bg-dark-500"></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-white font-medium truncate">{cb.customer_name || cb.customer_email || 'Unknown Customer'}</p>
              {cb.card_last4 && <span className="text-xs text-gray-500 flex items-center gap-1"><CreditCard size={10} /> •••• {cb.card_last4}</span>}
            </div>
            <div className="flex items-center gap-3 mt-1">
              {cb.chargeback_ref && <span className="text-xs text-gray-400">Ref: {cb.chargeback_ref}</span>}
              {cb.dispute_date && <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={10} /> {cb.dispute_date}</span>}
              {cb.reason_code && <span className="text-xs text-gray-500">{cb.reason_code}</span>}
            </div>
          </div>
          <div className="text-right" style={{ minWidth: '150px' }}>
            {hasOrder ? (
              <div>
                <p className="text-sm font-medium" style={{ color: confColor[conf] }}>
                  <Hash size={12} className="inline" />{orderNum || 'Matched'}
                </p>
                {products.length > 0 && (
                  <p className="text-xs text-gray-400 truncate" style={{ maxWidth: '150px' }}>
                    <Package size={10} className="inline mr-1" />{products.slice(0,2).join(', ')}{products.length>2?` +${products.length-2}`:''}
                  </p>
                )}
              </div>
            ) : (<span className="text-xs text-gray-500">No match</span>)}
          </div>
          <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ color: confColor[conf], backgroundColor: confBg[conf] }}>
            {conf==='none'?'UNMATCHED':conf.toUpperCase()}
          </span>
          <span className="text-xs px-2 py-1 rounded bg-dark-600 text-gray-300 capitalize">{cb.processor_status||'open'}</span>
        </div>
        {expanded ? <ChevronUp size={18} className="text-gray-400 ml-3" /> : <ChevronDown size={18} className="text-gray-400 ml-3" />}
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-dark-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-400" /> Chargeback Details
              </h4>
              <div className="space-y-2 text-sm">
                <DetailRow label="Reference" value={cb.chargeback_ref} />
                <DetailRow label="Transaction ID" value={cb.transaction_id} />
                <DetailRow label="Processor" value={(cb.processor||'').replace('_',' ')} />
                <DetailRow label="Amount" value={`$${amount.toFixed(2)} ${cb.currency||'USD'}`} highlight />
                <DetailRow label="Dispute Date" value={cb.dispute_date} />
                <DetailRow label="Reason Code" value={cb.reason_code} />
                <DetailRow label="Status" value={cb.processor_status} />
                <DetailRow label="Customer" value={cb.customer_name} />
                <DetailRow label="Email" value={cb.customer_email} />
                <DetailRow label="Card" value={cb.card_last4 ? `•••• ${cb.card_last4}` : null} />
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <ShoppingBag size={14} className="text-brand" /> Matched Shopify Order
              </h4>
              {hasOrder ? (
                <div>
                  <div className="space-y-2 text-sm mb-4">
                    <DetailRow label="Order #" value={orderNum} highlight />
                    <DetailRow label="Order Date" value={cb.order_date} />
                    <DetailRow label="Order Amount" value={cb.order_amount?`$${parseFloat(cb.order_amount).toFixed(2)}`:null} />
                    <DetailRow label="Customer" value={cb.order_customer_name} />
                    <DetailRow label="Email" value={cb.order_email} />
                    <DetailRow label="Payment" value={cb.order_financial_status} />
                    <DetailRow label="Fulfillment" value={cb.order_fulfillment_status} />
                    <DetailRow label="Match" value={conf.toUpperCase()} color={confColor[conf]} />
                  </div>
                  {lineItems.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Products in Dispute</h5>
                      <div className="space-y-2">
                        {lineItems.map((li,idx) => (
                          <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-dark-700/50">
                            <div className="w-8 h-8 rounded bg-dark-600 flex items-center justify-center flex-shrink-0">
                              <Package size={14} className="text-brand" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{li.name||li.title||'Item'}</p>
                              <div className="flex items-center gap-3 text-xs text-gray-400">
                                {li.sku && <span>SKU: {li.sku}</span>}
                                {li.quantity && <span>Qty: {li.quantity}</span>}
                                {li.price && <span>${parseFloat(li.price).toFixed(2)}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {lineItems.length===0 && products.length>0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Products</h5>
                      <div className="space-y-1">
                        {products.map((p,idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm text-gray-300">
                            <Package size={12} className="text-brand" /> {p}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <ShoppingBag size={28} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">No matching order found.</p>
                  <p className="text-gray-600 text-xs mt-1">Try running Auto-Match or import more Shopify orders.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, highlight, color }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={highlight?'text-white font-medium':'text-gray-300'} style={color?{color}:{}}>
        {value}
      </span>
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
    } catch (err) { setResult({ error: err.message }); }
    setUploading(false);
  };

  return (
    <div className="card">
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><Upload size={16} className="text-brand" /> {label}</h3>
      <p className="text-gray-400 text-sm mb-4">Upload a CSV export from {label}.</p>
      <input type="file" accept=".csv" onChange={handleUpload} className="input w-full text-sm" disabled={uploading} />
      {uploading && <p className="text-brand text-sm mt-2">Importing and matching...</p>}
      {result && !result.error && (
        <div className="mt-3 p-3 bg-green-900/30 border border-green-800/50 rounded-lg text-sm">
          <p className="text-green-300">Imported {result.imported} chargebacks{result.skipped?`, skipped ${result.skipped}`:''}</p>
          {result.matching && <p className="text-green-400 text-xs mt-1">Matched: {result.matching.high||0} high, {result.matching.medium||0} medium, {result.matching.low||0} low</p>}
          {result.detectedHeaderRow>0 && <p className="text-yellow-300 text-xs mt-1">Note: Detected data headers at row {result.detectedHeaderRow+1} (skipped metadata rows)</p>}
          {result.headers && (
            <details className="mt-2"><summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">CSV Headers ({result.headers.length})</summary>
            <p className="text-xs text-gray-500 mt-1 font-mono break-all">{result.headers.join(', ')}</p></details>
          )}
          {result.raw_sample && (
            <details className="mt-1"><summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">Raw Sample Data</summary>
            <pre className="text-xs text-gray-500 mt-1 overflow-auto max-h-32">{JSON.stringify(result.raw_sample,null,1)}</pre></details>
          )}
          {result.errors?.length>0 && (
            <details className="mt-1"><summary className="text-xs text-red-400 cursor-pointer">Errors ({result.errors.length})</summary>
            <p className="text-xs text-red-500 mt-1">{result.errors.join('; ')}</p></details>
          )}
        </div>
      )}
      {result?.error && <p className="text-red-400 text-sm mt-2">{result.error}</p>}
    </div>
  );
}
