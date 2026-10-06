import { useState } from 'react';
import { Download, Loader2, Smartphone } from 'lucide-react';
import { useInstallApp } from '@/lib/installPrompt';

/**
 * Offers installing BiteCare on the current device. Where the browser provides
 * its own prompt the button uses it; on iOS and browsers that never fire one it
 * shows the exact steps instead, so the option is always present and never a
 * button that quietly does nothing.
 */
export default function InstallAppButton() {
  const { canInstall, install, installing, platform, needsManualSteps } = useInstallApp();
  const [showHelp, setShowHelp] = useState(false);

  if (!canInstall) return null;

  const handleClick = async () => {
    if (needsManualSteps) { setShowHelp(true); return; }
    await install();
  };

  const help = platform === 'ios'
    ? 'Tap the Share button in Safari, then choose Add to Home Screen.'
    : 'Open your browser menu (the three dots) and choose Install app or Add to Home screen.';

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
      {showHelp && (
        <p className="flex items-start gap-2 max-w-xs text-xs text-white/85 text-left bg-black/35 backdrop-blur-sm rounded-lg p-3">
          <Smartphone className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{help}</span>
        </p>
      )}
    </div>
  );
}
