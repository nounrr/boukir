import React, { useMemo, useState } from 'react';
import {
  FileText,
  Package,
  Layers,
  Shield,
  Ruler,
  Box,
  CheckCircle2,
  AlertTriangle,
  Grid3x3,
  Settings,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '../utils/cn';

type AnyRecord = Record<string, any>;

export interface TechnicalSheetProps {
  fiche?: string | AnyRecord | null;
  className?: string;
  defaultExpanded?: boolean;
}

function formatValue(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    return v.join(', ');
  }
  return String(v);
}

export const TechnicalSheet: React.FC<TechnicalSheetProps> = ({ fiche, className, defaultExpanded }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'specs' | 'variants' | 'usage'>('general');
  const [isExpanded, setIsExpanded] = useState<boolean>(Boolean(defaultExpanded));

  const data = useMemo(() => {
    if (!fiche) return null;
    try {
      return typeof fiche === 'string' ? (JSON.parse(fiche) as AnyRecord) : (fiche as AnyRecord);
    } catch {
      return null;
    }
  }, [fiche]);

  const variants: AnyRecord[] = Array.isArray(data?.variants) ? (data!.variants as AnyRecord[]) : [];

  if (!data) return null;

  const specs = (data?.specs ?? {}) as AnyRecord;
  const section = (specs?.section_mm ?? {}) as AnyRecord;

  const allTabs = [
    { id: 'general' as const, label: 'Informations', icon: FileText },
    { id: 'specs' as const, label: 'Spécifications', icon: Ruler },
    { id: 'variants' as const, label: 'Variantes', icon: Grid3x3, show: variants.length > 0 },
    { id: 'usage' as const, label: 'Usage & Conformité', icon: Settings },
  ] satisfies Array<{ id: 'general' | 'specs' | 'variants' | 'usage'; label: string; icon: any; show?: boolean }>;

  const tabs = allTabs.filter((t) => t.show !== false);

  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white', className)}>
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Fiche technique</h3>
          {data?.version ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
              v{formatValue(data?.version)}
            </span>
          ) : null}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <>
          <div className="border-t border-gray-200">
            <div className="flex overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap border-b-2',
                      activeTab === tab.id
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-gray-500 hover:text-gray-900'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4">
            {activeTab === 'general' && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start gap-2">
                    <Package className="w-3.5 h-3.5 text-blue-600 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">Désignation</p>
                      <p className="text-sm font-medium truncate text-gray-900">{formatValue(data?.designation)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start gap-2">
                    <Grid3x3 className="w-3.5 h-3.5 text-blue-600 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">Catégorie</p>
                      <p className="text-sm font-medium text-gray-900">{formatValue(data?.category)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start gap-2">
                    <Layers className="w-3.5 h-3.5 text-blue-600 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">Matériau</p>
                      <p className="text-sm font-medium text-gray-900">{formatValue(data?.material)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start gap-2">
                    <Shield className="w-3.5 h-3.5 text-blue-600 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">Traitement</p>
                      <p className="text-sm font-medium text-gray-900">{formatValue(data?.treatment)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">Classe de service</p>
                      <p className="text-sm font-medium text-gray-900">{formatValue(data?.service_class)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start gap-2">
                    <Box className="w-3.5 h-3.5 text-blue-600 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">Unité de base</p>
                      <p className="text-sm font-medium text-gray-900">{formatValue(data?.base_unit)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'specs' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 mb-1">Section — largeur</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatValue(section?.width)} {section?.width && section?.width !== '—' ? 'mm' : ''}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 mb-1">Section — hauteur</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatValue(section?.height)} {section?.height && section?.height !== '—' ? 'mm' : ''}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 mb-1">Densité</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatValue(specs?.density_kg_m3)} {specs?.density_kg_m3 && specs?.density_kg_m3 !== '—' ? 'kg/m³' : ''}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 mb-1">Humidité</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatValue(specs?.moisture_content_pct)} {specs?.moisture_content_pct && specs?.moisture_content_pct !== '—' ? '%' : ''}
                    </p>
                  </div>
                </div>

                {specs?.length_notes && specs.length_notes !== '—' && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 mb-1">Notes de longueur</p>
                    <p className="text-sm text-gray-900">{formatValue(specs?.length_notes)}</p>
                  </div>
                )}

                {specs?.surface_finish && specs.surface_finish !== '—' && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 mb-1">Finition de surface</p>
                    <p className="text-sm text-gray-900">{formatValue(specs?.surface_finish)}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'variants' && variants.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {variants.map((v, idx) => (
                  <div key={v.id || idx} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full border border-gray-300 text-gray-700 bg-white">
                        {formatValue(v.name)}
                      </span>
                      {v.prix_vente && v.prix_vente !== '—' && (
                        <span className="text-xs font-bold text-blue-700">{formatValue(v.prix_vente)} MAD</span>
                      )}
                    </div>
                    <div className="space-y-0.5 text-xs text-gray-600">
                      {v.length_mm && v.length_mm !== '—' && <p>Longueur: {formatValue(v.length_mm)} mm</p>}
                      {v.reference && v.reference !== '—' && <p>Référence: {formatValue(v.reference)}</p>}
                      {v.stock_quantity && v.stock_quantity !== '—' && <p>Stock: {formatValue(v.stock_quantity)} unités</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'usage' && (
              <div className="space-y-3">
                {(data?.compliance?.notes || (Array.isArray(data?.compliance?.standards) && data.compliance.standards.length > 0)) && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      <h4 className="text-xs font-semibold text-gray-900">Conformité</h4>
                    </div>
                    <div className="space-y-2 text-xs">
                      {Array.isArray(data?.compliance?.standards) && data.compliance.standards.length > 0 && (
                        <div>
                          <span className="text-gray-500">Normes: </span>
                          <span className="text-gray-900">{formatValue(data.compliance.standards)}</span>
                        </div>
                      )}
                      {data?.compliance?.notes && data.compliance.notes !== '—' && (
                        <div>
                          <span className="text-gray-500">Notes: </span>
                          <span className="text-gray-900">{formatValue(data.compliance.notes)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(data?.usage?.recommended_applications || data?.usage?.indoor_outdoor || data?.usage?.precautions) && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-blue-600" />
                      <h4 className="text-xs font-semibold text-gray-900">Usage</h4>
                    </div>
                    <div className="space-y-2 text-xs">
                      {data?.usage?.recommended_applications && (
                        <div>
                          <span className="text-gray-500">Applications: </span>
                          <span className="text-gray-900">{formatValue(data.usage.recommended_applications)}</span>
                        </div>
                      )}
                      {data?.usage?.indoor_outdoor && data.usage.indoor_outdoor !== '—' && (
                        <div>
                          <span className="text-gray-500">Intérieur/Extérieur: </span>
                          <span className="text-gray-900">{formatValue(data.usage.indoor_outdoor)}</span>
                        </div>
                      )}
                      {data?.usage?.precautions && data.usage.precautions !== '—' && (
                        <div>
                          <span className="text-gray-500">Précautions: </span>
                          <span className="text-gray-900">{formatValue(data.usage.precautions)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(data?.packaging?.unit || data?.packaging?.palletization) && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-3.5 h-3.5 text-blue-600" />
                      <h4 className="text-xs font-semibold text-gray-900">Conditionnement</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {data?.packaging?.unit && data.packaging.unit !== '—' && (
                        <div>
                          <span className="text-gray-500">Unité: </span>
                          <span className="text-gray-900">{formatValue(data.packaging.unit)}</span>
                        </div>
                      )}
                      {data?.packaging?.palletization && data.packaging.palletization !== '—' && (
                        <div>
                          <span className="text-gray-500">Palettisation: </span>
                          <span className="text-gray-900">{formatValue(data.packaging.palletization)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
