import { useState } from 'react';
import { BadgeCheck, Download, Loader2, Smartphone, X } from 'lucide-react';
import { installUnavailableMessage, useInstallApp } from '@/lib/installPrompt';

/**
 * The header's install control. Fires the browser's native install prompt when
 * one is available, shows an installed state once BiteCare is running
 * standalone, and otherwise explains that automatic installation is not
 * available on this browser or device.
 */
export default function InstallAppMenu() {
  const { state, install, installing } = useInstallApp();
  const [showFallback, setShowFallback] = useState(false);

  if (state === 'dismissed') return null;

  if (state === 'installed') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-success-700 bg-success-50"
        title="BiteCare is installed on this device"
        aria-live="polite"
      >
        <BadgeCheck className="w-4 h-4" />
        <span className="hidden sm:inline">Installed</span>
      </span>
    );
  }

  const handleClick = async () => {
    if (state === 'unavailable') {
      setShowFallback((v) => !v);
      return;
    }
    await install();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={installing}
        className="flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors disabled:opacity-60"
      >
        {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        <span className="hidden sm:inline">Install app</span>
      </button>

      {showFallback && (
        <div
          className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200 shadow-lg p-4 z-50"
          role="status"
          aria-live="polite"
        >
          <button
            type="button"
            onClick={() => setShowFallback(false)}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <Smartphone className="w-5 h-5 text-primary-600 flex-shrink-0" />
            <p className="font-semibold text-gray-900 text-sm pr-6">Automatic install unavailable</p>
          </div>
          <p className="text-sm text-gray-600">{installUnavailableMessage()}</p>
        </div>
      )}
    </div>
  );
}
