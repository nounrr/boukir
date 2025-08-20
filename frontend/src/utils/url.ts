// Helpers to build absolute URLs to the backend (files, images, etc.)
// Priority: VITE_BACKEND_URL -> VITE_API_BASE_URL -> default dev http://localhost:3001

export const getBackendBaseUrl = (): string => {
  try {
    const env: any = (import.meta as any)?.env || {};
    const raw = env.VITE_BACKEND_URL || env.VITE_API_BASE_URL || 'http://boukirdiamond.com/';
    // const raw = env.VITE_BACKEND_URL || env.VITE_API_BASE_URL || 'http://localhost:3001';
    return String(raw).replace(/\/$/, '');
  } catch {
    return 'http://boukirdiamond.com/';
    // return 'http://localhost:3001';
  }
};

// Turn a relative path like "/uploads/payments/abc.jpg" into a full URL
// Keeps already absolute URLs (http/https), blob: and data: URIs unchanged
export const toBackendUrl = (path?: string | null): string => {
  const p = String(path || '').trim();
  if (!p) return '';
  if (/^(https?:)?\/\//i.test(p)) return p; // http, https, protocol-relative
  if (p.startsWith('blob:') || p.startsWith('data:')) return p;
  const base = getBackendBaseUrl();
  return `${base}${p.startsWith('/') ? '' : '/'}${p}`;
};
