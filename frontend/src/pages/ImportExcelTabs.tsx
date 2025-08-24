import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ImportContacts from './Excelcontact';
import ImportProducts from './excelproduct';

type TabKey = 'contacts' | 'products';

export default function ImportExcelTabs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('t') as TabKey) || 'contacts';
  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    const current = searchParams.get('t');
    if (current !== tab) {
      const next = new URLSearchParams(searchParams);
      next.set('t', tab);
      setSearchParams(next, { replace: true });
    }
  }, [tab]);

  const tabs = useMemo(
    () => [
      { key: 'contacts' as TabKey, label: 'Importer contacts' },
      { key: 'products' as TabKey, label: 'Importer produits' },
    ],
    []
  );

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <h3>Imports Excel</h3>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              background: tab === t.key ? '#1f2937' : '#ffffff',
              color: tab === t.key ? '#ffffff' : '#111827',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        {tab === 'contacts' ? <ImportContacts /> : <ImportProducts />}
      </div>
    </div>
  );
}
