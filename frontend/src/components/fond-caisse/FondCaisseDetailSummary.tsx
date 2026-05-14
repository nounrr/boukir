import { ArrowDownCircle, ArrowUpCircle, Calculator, ListChecks } from 'lucide-react';

type Props = {
  totalEntrees: number;
  totalSorties: number;
  totalCumule: number;
  actionsCount: number;
};

const fmt = (value: number) => `${Number(value || 0).toFixed(2)} DH`;

const FondCaisseDetailSummary = ({ totalEntrees, totalSorties, totalCumule, actionsCount }: Props) => {
  const cards = [
    { label: 'Entrees', value: fmt(totalEntrees), icon: ArrowUpCircle, color: 'bg-emerald-100 text-emerald-700' },
    { label: 'Sorties', value: fmt(totalSorties), icon: ArrowDownCircle, color: 'bg-red-100 text-red-700' },
    { label: 'Total cumule', value: fmt(totalCumule), icon: Calculator, color: 'bg-yellow-100 text-yellow-700' },
    { label: 'Actions', value: String(actionsCount), icon: ListChecks, color: 'bg-blue-100 text-blue-700' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <section key={card.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${card.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
                <p className="text-lg font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default FondCaisseDetailSummary;
