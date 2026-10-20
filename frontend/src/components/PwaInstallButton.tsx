import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { canInstallPwa, installPwa, isIosDevice, isPwaInstalled } from '../utils/pwa';

const PwaInstallButton = () => {
  const [available, setAvailable] = useState(() => canInstallPwa() || (isIosDevice() && !isPwaInstalled()));

  useEffect(() => {
    const updateAvailability = () => setAvailable(canInstallPwa() || (isIosDevice() && !isPwaInstalled()));
    window.addEventListener('pwa-install-available', updateAvailability);
    return () => window.removeEventListener('pwa-install-available', updateAvailability);
  }, []);

  if (!available) return null;

  const handleInstall = () => {
    if (canInstallPwa()) {
      void installPwa();
    } else {
      window.alert('Sur iPhone ou iPad : ouvrez cette page dans Safari, touchez Partager, puis « Sur l’écran d’accueil ».');
    }
  };

  return (
    <button
      type="button"
      onClick={handleInstall}
      title="Installer l’application Boukir"
      className="flex items-center gap-1 rounded-md px-2 py-2 text-sm text-blue-800 hover:bg-blue-50"
    >
      <Download size={18} />
      <span className="hidden lg:inline">Installer l’app</span>
    </button>
  );
};

export default PwaInstallButton;
