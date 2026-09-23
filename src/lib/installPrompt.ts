import { useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallState = 'available' | 'installed' | 'ios' | 'unsupported';

function detect(): InstallState {
  if (typeof window === 'undefined') return 'unsupported';

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return 'installed';

  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  if (isIOS) return 'ios';

  return 'available';
}

// Tracks whether the browser has fired its native install prompt event.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    listeners.forEach((listener) => listener(true));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((listener) => listener(false));
  });
}

export function useInstallApp() {
  const [nativeAvailable, setNativeAvailable] = useState(deferredPrompt !== null);
  const [state, setState] = useState<InstallState>(detect);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const listener = (available: boolean) => {
      setNativeAvailable(available);
      if (!available) setState('installed');
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        deferredPrompt = null;
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

  const canInstall = state === 'ios' || (state === 'available' && nativeAvailable);

  return { canInstall, install, installing, platform: state };
}
