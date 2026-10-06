import { useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallState = 'available' | 'installed' | 'ios' | 'manual' | 'unsupported';

interface InstallBridge {
  __bitecareInstallPrompt: BeforeInstallPromptEvent | null;
  __bitecareInstallListeners: Set<(available: boolean) => void>;
}

/**
 * The page shell captures `beforeinstallprompt` before the app bundle runs,
 * because the browser fires it once and early. Read the prompt from there so a
 * listener attached after load still sees it.
 */
function bridge(): InstallBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Partial<InstallBridge>;
  return (w.__bitecareInstallPrompt !== undefined && w.__bitecareInstallListeners)
    ? (w as InstallBridge)
    : null;
}

function detect(): InstallState {
  if (typeof window === 'undefined') return 'unsupported';

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return 'installed';

  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  if (isIOS) return 'ios';

  // Android and desktop browsers: offer the app with a manual fallback, so the
  // option is present even where the browser never fires its own prompt.
  return 'manual';
}

export function useInstallApp() {
  const [nativeAvailable, setNativeAvailable] = useState(() => bridge()?.__bitecareInstallPrompt != null);
  const [state, setState] = useState<InstallState>(detect);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const b = bridge();
    if (!b) return;
    const listener = (available: boolean) => {
      setNativeAvailable(available);
      if (available) setState((prev) => (prev === 'manual' ? 'available' : prev));
      else setState('installed');
    };
    setNativeAvailable(b.__bitecareInstallPrompt != null);
    b.__bitecareInstallListeners.add(listener);
    return () => { b.__bitecareInstallListeners.delete(listener); };
  }, []);

  /** Runs the browser's own prompt. Returns false when there is none to show. */
  const install = useCallback(async (): Promise<boolean> => {
    const b = bridge();
    const prompt = b?.__bitecareInstallPrompt;
    if (!prompt) return false;
    setInstalling(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        if (b) b.__bitecareInstallPrompt = null;
        setNativeAvailable(false);
        setState('installed');
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setInstalling(false);
    }
  }, []);

  // iOS has no prompt, and some browsers never fire one, so both cases get
  // written instructions instead of a button that silently does nothing.
  const canInstall = state === 'ios' || state === 'manual' || (state === 'available' && nativeAvailable);
  const needsManualSteps = state === 'ios' || state === 'manual';

  return { canInstall, install, installing, platform: state, needsManualSteps };
}
