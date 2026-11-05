import { useEffect, useState } from 'react';
import { useGetContactHistoryQuery, useLazyGetContactHistoryQuery } from '../store/api/contactsApi';

export function usePagedContactHistory(id: number, ledger: 'client' | 'fournisseur' | 'charge', tab: string, dateFrom: string, dateTo: string, search: string, sort: { col: string; dir: string }, defaultPage: number | 'last' = 1) {
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [limit, setLimit] = useState(50);
  const key = JSON.stringify([id, ledger, tab, dateFrom, dateTo, debouncedSearch, limit, tab === 'paiements' ? sort : null]);
  const [position, setPosition] = useState({ key: '', page: 1 });
  const page = position.key === key ? position.page : defaultPage;
  const query = useGetContactHistoryQuery({ id, ledger, tab, dateFrom, dateTo, search: debouncedSearch, page, limit, sortBy: tab === 'paiements' ? sort.col : undefined, sortDir: tab === 'paiements' ? sort.dir : undefined });
  const history = query.currentData ?? (query.data?.contactId === id ? query.data : undefined);
  const [fetchPrint, printQuery] = useLazyGetContactHistoryQuery();
  const [printHistory, setPrintHistory] = useState<any>(null);
  const [printError, setPrintError] = useState(false);
  useEffect(() => { setPrintHistory(null); setPrintError(false); }, [key, query.currentData]);
  const preparePrint = async () => {
    setPrintError(false);
    try {
      const result = await fetchPrint({ id, ledger, tab: 'complet', dateFrom, dateTo, search: debouncedSearch, all: true }).unwrap();
      setPrintHistory(result);
      return true;
    } catch { setPrintError(true); return false; }
  };
  return {
    history,
    isLoading: query.isFetching && !history,
    isFetching: query.isFetching || search !== debouncedSearch,
    isError: query.isError,
    refetch: query.refetch,
    pagination: history?.historyPagination,
    page, limit,
    setPage: (next: number) => setPosition({ key, page: next }),
    setLimit,
    printHistory, preparePrint, printLoading: printQuery.isFetching, printError,
    selectionKey: `${key}:${page}`,
  };
}
