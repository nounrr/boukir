import React from 'react';

/**
 * Pastilles « EN » et « 中文 » : vertes si la traduction est saisie, grises sinon
 * (dans ce cas le site affiche le texte français aux visiteurs anglais / chinois).
 */
const TranslationStatus: React.FC<{ en?: string | null; zh?: string | null; className?: string }> = ({ en, zh, className = '' }) => {
  const items = [
    { key: 'en', label: 'EN', lang: 'anglais', done: Boolean(en && en.trim()) },
    { key: 'zh', label: '中文', lang: 'chinois', done: Boolean(zh && zh.trim()) },
  ];
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {items.map((item) => (
        <span
          key={item.key}
          title={item.done ? `Traduction ${item.lang} saisie` : `Pas de traduction ${item.lang} : le site affiche le français`}
          className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
            item.done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-dashed border-gray-300 bg-white text-gray-400'
          }`}
        >
          {item.label}
        </span>
      ))}
    </span>
  );
};

export default TranslationStatus;
