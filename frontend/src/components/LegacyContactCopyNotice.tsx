import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function LegacyContactCopyNotice({ label, children }: { label: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const currentPath = pathname.replace(/^\/(clients|fournisseurs|charges)-copy(?=\/|$)/, '/$1');
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div><strong>{label} — ancienne version</strong><p className="mt-1 text-xs">Version avant pagination, récupérée depuis Git (5d32677). Calculs d’origine pour comparaison.</p></div>
      <Link to={currentPath} className="rounded-lg border border-amber-400 bg-white px-3 py-2 font-semibold hover:bg-amber-100">Voir la version actuelle</Link>
    </div>
    {children}
  </div>;
}
