interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: InstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event as InstallPromptEvent;
  window.dispatchEvent(new Event('pwa-install-available'));
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  window.dispatchEvent(new Event('pwa-install-available'));
});

export const isPwaInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

export const canInstallPwa = () => Boolean(installPrompt) && !isPwaInstalled();

export const isIosDevice = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const installPwa = async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  await prompt.userChoice;
  window.dispatchEvent(new Event('pwa-install-available'));
};

export const registerPwa = () => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});

  let checking = false;
  const checkForUpdate = async () => {
    if (checking || !navigator.onLine) return;
    checking = true;
    try {
      const response = await fetch(`/version.json?time=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const { version } = await response.json() as { version?: string };
      if (version && version !== __APP_BUILD_ID__ && sessionStorage.getItem('pwa-last-reload') !== version) {
        sessionStorage.setItem('pwa-last-reload', version);
        window.location.reload();
      }
    } catch {
      return;
    } finally {
      checking = false;
    }
  };

  void checkForUpdate();
  window.setInterval(() => void checkForUpdate(), 60_000);
  window.addEventListener('online', () => void checkForUpdate());
  window.addEventListener('focus', () => void checkForUpdate());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
};
