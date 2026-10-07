import { useState } from 'react';
import { BadgeCheck, Download, Loader2, Smartphone } from 'lucide-react';
import { installUnavailableMessage, useInstallApp } from '@/lib/installPrompt';

/**
 * Offers installing BiteCare on the current device. Where the browser provides
 * its own prompt the button fires it directly; where the browser never offers
 * one the button explains that plainly, rather than sending the user into
 * browser settings or faking an install.
 */
export default function InstallAppButton() {
  const { state, install, installing } = useInstallApp();
  const [showFallback, setShowFallback] = useState(false);

  // The user closed the browser's prompt; it cannot be shown again this session.
  if (state === 'dismissed') return null;

  if (state === 'installed') {
    return (
      <p
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 backdrop-blur-sm text-white text-sm font-medium border border-white/25"
        aria-live="polite"
      >
        <BadgeCheck className="w-4 h-4" />
        BiteCare is installed on this device
      </p>
    );
  }

  const handleClick = async () => {
    if (state === 'unavailable') {
      setShowFallback(true);
      return;
    }
    await install();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={installing}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-sm font-medium border border-white/25 transition-colors disabled:opacity-60"
      >
        {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        Install app on this device
      </button>

      {showFallback && (
        <p
          className="flex items-start gap-2 max-w-xs text-xs text-white/85 text-left bg-black/35 backdrop-blur-sm rounded-lg p-3"
          role="status"
          aria-live="polite"
        >
          <Smartphone className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{installUnavailableMessage()}</span>
        </p>
      )}
    </div>
  );
}
