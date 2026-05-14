import { CalendarDays, DollarSign, Wallet } from 'lucide-react';

type Props = {
  todayTotal: number;
  daysCount: number;
  periodTotal: number;
};

const FondCaisseSummaryCards = ({ todayTotal, daysCount, periodTotal }: Props) => {
  const cards = [
    {
      label: 'Total caisse du jour',
      value: `${todayTotal.toFixed(2)} DH`,
      icon: DollarSign,
      color: 'bg-blue-100 text-blue-700',
    },
    {
      label: 'Jours periode',
      value: String(daysCount),
      icon: CalendarDays,
      color: 'bg-orange-100 text-orange-700',
    },
    {
      label: 'Somme totaux periode',
      value: `${periodTotal.toFixed(2)} DH`,
      icon: Wallet,
      color: 'bg-emerald-100 text-emerald-700',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <section key={card.label} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${card.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default FondCaisseSummaryCards;
