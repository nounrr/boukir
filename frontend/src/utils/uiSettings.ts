import type { CSSProperties } from 'react';
import type { UiSettings } from '../store/api/uiSettingsApi';

export const getUiLineConfig = (settings: UiSettings | undefined, key: string) =>
  settings?.lineStyles?.[key];

export const getUiRowStyle = (config?: {
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
}): CSSProperties | undefined => {
  if (!config) return undefined;
  return {
    backgroundColor: config.bgColor,
    color: config.textColor,
    borderLeftColor: config.borderColor,
  };
};

export const getUiBadgeStyle = (config?: {
  badgeBgColor?: string;
  badgeTextColor?: string;
}): CSSProperties | undefined => {
  if (!config) return undefined;
  return {
    backgroundColor: config.badgeBgColor,
    color: config.badgeTextColor,
  };
};
