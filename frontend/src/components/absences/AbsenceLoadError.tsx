import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function AbsenceLoadError({ message, onRetry }: { message: string; onRetry: () => unknown }) {
  return (
    <div role="alert" className="m-4 flex flex-col items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
      <p className="flex-1 text-sm text-amber-900">{message}</p>
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <RotateCcw className="h-4 w-4" /> Réessayer
      </button>
    </div>
  );
}
