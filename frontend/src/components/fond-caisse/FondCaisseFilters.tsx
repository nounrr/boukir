type Props = {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
};

const FondCaisseFilters = ({ dateFrom, dateTo, onDateFromChange, onDateToChange }: Props) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        Du
      </label>
      <input
        type="date"
        value={dateFrom}
        onChange={(event) => onDateFromChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
    </div>
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        Au
      </label>
      <input
        type="date"
        value={dateTo}
        onChange={(event) => onDateToChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
    </div>
  </div>
);

export default FondCaisseFilters;
