import { AlertTriangle } from 'lucide-react';

export default function ConfigMissing() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 max-w-lg w-full p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Configuration Required</h1>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            <span className="font-display font-bold">BiteCare</span> cannot connect to Supabase because the required settings are missing.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-xs font-mono text-gray-700 space-y-1">
            <p className="text-gray-500 mb-2"># Copy .env.example to .env and fill in your values:</p>
            <p>VITE_SUPABASE_URL=https://your-project.supabase.co</p>
            <p>VITE_SUPABASE_ANON_KEY=your-anon-key</p>
          </div>
          <p className="text-sm text-gray-500">
            For local development with Docker, copy <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">.env.local.example</code> to <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">.env.local</code> instead. Then restart the app.
          </p>
        </div>
      </div>
    </div>
  );
}
