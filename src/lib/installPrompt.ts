import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * `available`   the browser handed us its own install prompt and we can show it
 * `installed`   BiteCare is already running as an installed app
 * `dismissed`   the user closed the browser prompt; it cannot be shown again
 * `unavailable` this browser or device never offers a native install prompt
 */
export type InstallState = 'available' | 'installed' | 'dismissed' | 'unavailable';

interface InstallBridge {
  __bitecareInstallPrompt: BeforeInstallPromptEvent | null;
  __bitecareInstallListeners: Set<() => void>;
}

export const INSTALL_UNAVAILABLE_MESSAGE =
  'Automatic installation is not available in this browser or on this device. BiteCare still works fully in the browser.';

export const INSTALL_UNAVAILABLE_MESSAGE_IOS =
  'Automatic installation is not available in Safari on iPhone and iPad. BiteCare still works fully in the browser.';

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Copy for the unsupported case, worded for the device the user is on. */
export function installUnavailableMessage(): string {
  return isIOS() ? INSTALL_UNAVAILABLE_MESSAGE_IOS : INSTALL_UNAVAILABLE_MESSAGE;
}

/**
 * The page shell captures `beforeinstallprompt` before the app bundle runs,
 * because the browser fires it once and early. Reading the prompt from there is
 * what lets a listener attached after load still see it.
 */
function bridge(): InstallBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Partial<InstallBridge>;
  return w.__bitecareInstallPrompt !== undefined && w.__bitecareInstallListeners
    ? (w as InstallBridge)
    : null;
}

function storedPrompt(): BeforeInstallPromptEvent | null {
  return bridge()?.__bitecareInstallPrompt ?? null;
}

/** True when BiteCare is already running as an installed, standalone app. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detect(): InstallState {
  if (isStandalone()) return 'installed';
  return storedPrompt() ? 'available' : 'unavailable';
}

/**
 * Drives the browser's own install prompt. Where the browser never offers one
 * the state is `unavailable`, so the UI can explain that plainly instead of
 * pretending to install or pushing the user into browser settings.
 */
export function useInstallApp() {
  const [state, setState] = useState<InstallState>(detect);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setState((prev) => {
        if (isStandalone()) return 'installed';
        if (storedPrompt()) return 'available';
        // Don't undo a dismissal: the consumed prompt cannot be shown again.
        return prev === 'dismissed' ? 'dismissed' : 'unavailable';
      });
    };

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const e = event as BeforeInstallPromptEvent;
      const b = bridge();
      if (b) b.__bitecareInstallPrompt = e;
      setState('available');
    };

    const onInstalled = () => {
      const b = bridge();
      if (b) b.__bitecareInstallPrompt = null;
      setState('installed');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    const b = bridge();
    b?.__bitecareInstallListeners.add(refresh);

    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener?.('change', refresh);

    refresh();

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      b?.__bitecareInstallListeners.delete(refresh);
      mq.removeEventListener?.('change', refresh);
    };
  }, []);

  /** Shows the browser's native install prompt. Returns true if installed. */
  const install = useCallback(async (): Promise<boolean> => {
    const prompt = storedPrompt();
    if (!prompt) {
      setState((prev) => (prev === 'dismissed' ? prev : 'unavailable'));
      return false;
    }

    setInstalling(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      // The event is single-use, so drop it either way.
      const b = bridge();
      if (b) b.__bitecareInstallPrompt = null;
      if (outcome === 'accepted') {
        setState('installed');
        return true;
      }
      setState('dismissed');
      return false;
    } catch {
      setState('unavailable');
      return false;
    } finally {
      setInstalling(false);
    }
  }, []);

  return { state, install, installing };
}
