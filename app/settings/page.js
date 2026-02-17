'use client';
import { useState } from 'react';
import { Upload, Database, Key, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings & Import</h1>
        <p className="text-gray-400 text-sm mt-1">Import your data and configure API connections</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ImportSection
          title="Import Shopify Orders"
          icon={<Database size={20} className="text-brand" />}
          description="Export orders from Shopify (Orders \u2192 Export \u2192 CSV) and upload here. The system auto-assigns recovery tiers based on order age."
          endpoint="/api/import/shopify-orders"
          fieldName="file"
          accept=".csv"
        />
        <ImportSection
          title="Import Echelon Payments Chargebacks"
          icon={<AlertTriangle size={20} className="text-blue-400" />}
          description="Export your chargeback report from Echelon Payments as CSV. The system will auto-match to Shopify orders."
          endpoint="/api/import/chargebacks"
          fieldName="file"
          accept=".csv"
          extraFields={{ processor: 'echelon_payments' }}
        />
        <ImportSection
          title="Import Green Payments Chargebacks"
          icon={<AlertTriangle size={20} className="text-green-400" />}
          description="Export your chargeback report from Green Payments as CSV. The system will auto-match to Shopify orders."
          endpoint="/api/import/chargebacks"
          fieldName="file"
          accept=".csv"
          extraFields={{ processor: 'green_payments' }}
        />
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Key size={20} className="text-brand" />
            <h3 className="text-white font-semibold">API Connections</h3>
          </div>
          <div className="space-y-3">
            <ApiStatus label="Supabase" value={process.env.NEXT_PUBLIC_SUPABASE_URL} isPublic={true} />
            <ApiStatus label="Shopify" envVar="SHOPIFY_ACCESS_TOKEN" />
            <ApiStatus label="Klaviyo" envVar="KLAVIYO_API_KEY" />
            <ApiStatus label="Google Gemini" envVar="GEMINI_API_KEY" />
          </div>
          <p className="text-gray-500 text-xs mt-4">API keys are set in .env.local file. Redeploy after changes.</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCw size={20} className="text-brand" />
            <h3 className="text-white font-semibold">Run Auto-Match</h3>
          </div>
          <p className="text-gray-400 text-sm mb-4">Runs the matching algorithm on all unmatched chargebacks. Tries email+amount (high), then amount+card (medium), then amount+date (low).</p>
          <MatchButton />
        </div>
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Database size={20} className="text-brand" />
            <h3 className="text-white font-semibold">How to Export from Shopify</h3>
          </div>
          <ol className="text-gray-300 text-sm space-y-2">
            <li className="flex gap-2"><span className="text-brand font-bold">1.</span> Go to Shopify Admin \u2192 Orders</li>
            <li className="flex gap-2"><span className="text-brand font-bold">2.</span> Filter: Unfulfilled + Date range</li>
            <li className="flex gap-2"><span className="text-brand font-bold">3.</span> Click Export \u2192 CSV for current page</li>
            <li className="flex gap-2"><span className="text-brand font-bold">4.</span> Upload the CSV above</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function ImportSection({ title, icon, description, endpoint, fieldName, accept, extraFields }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setResult(null);
    const formData = new FormData();
    formData.append(fieldName, file);
    if (extraFields) {
      Object.entries(extraFields).forEach(([k, v]) => formData.append(k, v));
    }
    try {
      const resp = await fetch(endpoint, { method: 'POST', body: formData });
      const data = await resp.json();
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    }
    setUploading(false);
  };

  const hasImported = result && !result.error && result.imported > 0;
  const zeroImported = result && !result.error && result.imported === 0;

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <h3 className="text-white font-semibold">{title}</h3>
      </div>
      <p className="text-gray-400 text-sm mb-4">{description}</p>
      <input type="file" accept={accept} onChange={handleUpload} disabled={uploading} className="input w-full text-sm" />
      {uploading && <p className="text-brand text-sm mt-2 animate-pulse">Processing...</p>}
      {hasImported && (
        <div className="mt-3 p-3 bg-green-900/30 border border-green-800/50 rounded-lg">
          <p className="text-green-300 text-sm flex items-center gap-2"><CheckCircle size={14} /> Imported {result.imported} records (parsed {result.total_rows || '?'} rows)</p>
          {result.skipped > 0 && <p className="text-yellow-400 text-xs mt-1">Skipped: {result.skipped} rows</p>}
          {result.matching && (
            <p className="text-green-400 text-xs mt-1">Auto-matched: {result.matching.high || 0} high, {result.matching.medium || 0} medium, {result.matching.low || 0} low</p>
          )}
          {result.headers_found && (
            <p className="text-gray-400 text-xs mt-2">Columns: {result.headers_found.join(', ')}</p>
          )}
          {result.raw_sample && result.raw_sample.length > 0 && (
            <details className="mt-2">
              <summary className="text-gray-400 text-xs cursor-pointer">View raw sample data</summary>
              <pre className="text-gray-300 text-xs mt-1 overflow-x-auto max-h-40 bg-dark-800 p-2 rounded">{JSON.stringify(result.raw_sample, null, 2)}</pre>
            </details>
          )}
          {result.errors && result.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-red-400 text-xs">Errors ({result.errors.length}):</p>
              {result.errors.slice(0, 3).map((e, i) => <p key={i} className="text-red-300 text-xs">{JSON.stringify(e)}</p>)}
            </div>
          )}
        </div>
      )}
      {zeroImported && (
        <div className="mt-3 p-3 bg-yellow-900/30 border border-yellow-800/50 rounded-lg">
          <p className="text-yellow-300 text-sm flex items-center gap-2"><AlertTriangle size={14} /> Imported 0 records</p>
          <p className="text-gray-400 text-xs mt-1">Total rows parsed: {result.total_rows || 0} | Skipped: {result.skipped || 0}</p>
          {result.headers_found && result.headers_found.length > 0 && (
            <div className="mt-2">
              <p className="text-gray-400 text-xs">CSV columns found:</p>
              <p className="text-gray-300 text-xs mt-1 font-mono break-all">{result.headers_found.join(', ')}</p>
            </div>
          )}
          {result.errors && result.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-red-400 text-xs">Errors:</p>
              {result.errors.slice(0, 3).map((e, i) => <p key={i} className="text-red-300 text-xs">{JSON.stringify(e)}</p>)}
            </div>
          )}
        </div>
      )}
      {result?.error && <p className="text-red-400 text-sm mt-2">{result.error}</p>}
    </div>
  );
}

function ApiStatus({ label, value, isPublic = false }) {
  const isSet = isPublic ? !!value : null;
  return (
    <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
      <span className="text-gray-300 text-sm">{label}</span>
      {isPublic ? (
        <span className={"badge " + (isSet ? "badge-high" : "badge-none")}>{isSet ? 'Connected' : 'Not Set'}</span>
      ) : (
        <span className="badge bg-dark-500 text-gray-400">Server-side</span>
      )}
    </div>
  );
}

function MatchButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const run = async () => {
    setRunning(true);
    try {
      const resp = await fetch('/api/match/run', { method: 'POST' });
      const data = await resp.json();
      setResult(data.results || data);
    } catch (e) {
      setResult({ error: e.message });
    }
    setRunning(false);
  };
  return (
    <div>
      <button onClick={run} disabled={running} className="btn-primary w-full">{running ? 'Running...' : 'Run Auto-Match Now'}</button>
      {result && !result.error && (
        <div className="mt-3 text-sm text-gray-300">
          <p>Processed: {result.total_unmatched || result.total || 0}</p>
          <p>High matches: {result.newly_matched_high || result.high || 0}</p>
          <p>Medium matches: {result.newly_matched_medium || result.medium || 0}</p>
          <p>Still unmatched: {result.still_unmatched || 0}</p>
        </div>
      )}
    </div>
  );
}