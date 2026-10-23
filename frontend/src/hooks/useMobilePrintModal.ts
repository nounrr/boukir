import { useEffect, useState } from 'react';

const MOBILE_PRINT_QUERY = '(max-width: 639px)';

function isPhonePrintViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const narrowViewport = window.matchMedia(MOBILE_PRINT_QUERY).matches;
  const touchPhone = navigator.maxTouchPoints > 0 && Math.min(window.screen.width, window.screen.height) <= 639;
  return narrowViewport || touchPhone;
}

export function useMobilePrintModal(): boolean {
  const [isMobile, setIsMobile] = useState(isPhonePrintViewport);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_PRINT_QUERY);
    const update = () => setIsMobile(isPhonePrintViewport());
    update();
    media.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => { media.removeEventListener('change', update); window.removeEventListener('resize', update); };
  }, []);

  return isMobile;
}
