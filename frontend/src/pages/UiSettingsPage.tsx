import React, { useEffect, useState } from 'react';
import { Palette, Save, RotateCcw, MonitorCog } from 'lucide-react';
import { useGetUiSettingsQuery, useUpdateUiSettingsMutation, type UiSettings } from '../store/api/uiSettingsApi';
import { showError, showSuccess } from '../utils/notifications';

const colorFields = [
  { key: 'bgColor', label: 'Fond ligne' },
  { key: 'textColor', label: 'Texte ligne' },
  { key: 'borderColor', label: 'Bordure gauche' },
  { key: 'badgeBgColor', label: 'Fond badge' },
  { key: 'badgeTextColor', label: 'Texte badge' },
] as const;

const UiSettingsPage: React.FC = () => {
  const { data, isLoading } = useGetUiSettingsQuery();
  const [updateUiSettings, { isLoading: isSaving }] = useUpdateUiSettingsMutation();
  const [form, setForm] = useState<UiSettings | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const handleColorChange = (styleKey: string, field: keyof UiSettings['lineStyles'][string], value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lineStyles: {
          ...prev.lineStyles,
          [styleKey]: {
            ...prev.lineStyles[styleKey],
            [field]: value,
          },
        },
      };
    });
  };

  const handleSubmit = async () => {
    if (!form) return;
    try {
      await updateUiSettings(form).unwrap();
      showSuccess('Paramètres UI enregistrés');
    } catch (error: any) {
      showError(error?.data?.message || error?.message || 'Erreur lors de la sauvegarde');
    }
  };

  const handleReset = () => {
    if (data) setForm(data);
  };

  if (isLoading || !form) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-56 bg-gray-200 rounded animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <MonitorCog className="w-7 h-7 text-blue-600" />
              Paramètres UI
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              Gérez les couleurs des lignes et badges pour les types de bon, avoir et paiement.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="w-4 h-4" />
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              Enregistrer
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(form.toggles.showEcommerceBons)}
            onChange={(e) =>
              setForm((prev) =>
                prev
                  ? {
                      ...prev,
                      toggles: {
                        ...prev.toggles,
                        showEcommerceBons: e.target.checked,
                      },
                    }
                  : prev
              )
            }
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm font-medium text-gray-800">Afficher les bons e-commerce</span>
        </label>
      </div>

      <div className="space-y-4">
        {Object.entries(form.lineStyles).map(([styleKey, config]) => (
          <div key={styleKey} className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-5">
              <Palette className="w-5 h-5 text-violet-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{config.label}</h2>
                <p className="text-xs text-gray-500">{styleKey}</p>
              </div>
            </div>

            <div
              className="rounded-xl border-l-4 px-4 py-3 mb-5"
              style={{
                backgroundColor: config.bgColor,
                color: config.textColor,
                borderLeftColor: config.borderColor,
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <span
                  className="text-xs px-2 py-1 rounded-full font-semibold"
                  style={{ backgroundColor: config.badgeBgColor, color: config.badgeTextColor }}
                >
                  {config.label}
                </span>
                <span className="text-sm font-medium">Aperçu de ligne</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {colorFields.map((field) => (
                <label key={field.key} className="space-y-2">
                  <span className="text-xs font-medium text-gray-600">{field.label}</span>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                    <input
                      type="color"
                      value={config[field.key]}
                      onChange={(e) => handleColorChange(styleKey, field.key, e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={config[field.key]}
                      onChange={(e) => handleColorChange(styleKey, field.key, e.target.value)}
                      className="w-full text-sm text-gray-700 focus:outline-none"
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UiSettingsPage;
