// Standard CSS named colors, kept local so both applications build independently.
const cssColors: Record<string, string> = {
  "aliceblue": "#f0f8ff",
  "antiquewhite": "#faebd7",
  "aqua": "#00ffff",
  "aquamarine": "#7fffd4",
  "azure": "#f0ffff",
  "beige": "#f5f5dc",
  "bisque": "#ffe4c4",
  "black": "#000000",
  "blanchedalmond": "#ffebcd",
  "blue": "#0000ff",
  "blueviolet": "#8a2be2",
  "brown": "#a52a2a",
  "burlywood": "#deb887",
  "cadetblue": "#5f9ea0",
  "chartreuse": "#7fff00",
  "chocolate": "#d2691e",
  "coral": "#ff7f50",
  "cornflowerblue": "#6495ed",
  "cornsilk": "#fff8dc",
  "crimson": "#dc143c",
  "cyan": "#00ffff",
  "darkblue": "#00008b",
  "darkcyan": "#008b8b",
  "darkgoldenrod": "#b8860b",
  "darkgray": "#a9a9a9",
  "darkgreen": "#006400",
  "darkgrey": "#a9a9a9",
  "darkkhaki": "#bdb76b",
  "darkmagenta": "#8b008b",
  "darkolivegreen": "#556b2f",
  "darkorange": "#ff8c00",
  "darkorchid": "#9932cc",
  "darkred": "#8b0000",
  "darksalmon": "#e9967a",
  "darkseagreen": "#8fbc8f",
  "darkslateblue": "#483d8b",
  "darkslategray": "#2f4f4f",
  "darkslategrey": "#2f4f4f",
  "darkturquoise": "#00ced1",
  "darkviolet": "#9400d3",
  "deeppink": "#ff1493",
  "deepskyblue": "#00bfff",
  "dimgray": "#696969",
  "dimgrey": "#696969",
  "dodgerblue": "#1e90ff",
  "firebrick": "#b22222",
  "floralwhite": "#fffaf0",
  "forestgreen": "#228b22",
  "fuchsia": "#ff00ff",
  "gainsboro": "#dcdcdc",
  "ghostwhite": "#f8f8ff",
  "gold": "#ffd700",
  "goldenrod": "#daa520",
  "gray": "#808080",
  "green": "#008000",
  "greenyellow": "#adff2f",
  "grey": "#808080",
  "honeydew": "#f0fff0",
  "hotpink": "#ff69b4",
  "indianred": "#cd5c5c",
  "indigo": "#4b0082",
  "ivory": "#fffff0",
  "khaki": "#f0e68c",
  "lavender": "#e6e6fa",
  "lavenderblush": "#fff0f5",
  "lawngreen": "#7cfc00",
  "lemonchiffon": "#fffacd",
  "lightblue": "#add8e6",
  "lightcoral": "#f08080",
  "lightcyan": "#e0ffff",
  "lightgoldenrodyellow": "#fafad2",
  "lightgray": "#d3d3d3",
  "lightgreen": "#90ee90",
  "lightgrey": "#d3d3d3",
  "lightpink": "#ffb6c1",
  "lightsalmon": "#ffa07a",
  "lightseagreen": "#20b2aa",
  "lightskyblue": "#87cefa",
  "lightslategray": "#778899",
  "lightslategrey": "#778899",
  "lightsteelblue": "#b0c4de",
  "lightyellow": "#ffffe0",
  "lime": "#00ff00",
  "limegreen": "#32cd32",
  "linen": "#faf0e6",
  "magenta": "#ff00ff",
  "maroon": "#800000",
  "mediumaquamarine": "#66cdaa",
  "mediumblue": "#0000cd",
  "mediumorchid": "#ba55d3",
  "mediumpurple": "#9370db",
  "mediumseagreen": "#3cb371",
  "mediumslateblue": "#7b68ee",
  "mediumspringgreen": "#00fa9a",
  "mediumturquoise": "#48d1cc",
  "mediumvioletred": "#c71585",
  "midnightblue": "#191970",
  "mintcream": "#f5fffa",
  "mistyrose": "#ffe4e1",
  "moccasin": "#ffe4b5",
  "navajowhite": "#ffdead",
  "navy": "#000080",
  "oldlace": "#fdf5e6",
  "olive": "#808000",
  "olivedrab": "#6b8e23",
  "orange": "#ffa500",
  "orangered": "#ff4500",
  "orchid": "#da70d6",
  "palegoldenrod": "#eee8aa",
  "palegreen": "#98fb98",
  "paleturquoise": "#afeeee",
  "palevioletred": "#db7093",
  "papayawhip": "#ffefd5",
  "peachpuff": "#ffdab9",
  "peru": "#cd853f",
  "pink": "#ffc0cb",
  "plum": "#dda0dd",
  "powderblue": "#b0e0e6",
  "purple": "#800080",
  "rebeccapurple": "#663399",
  "red": "#ff0000",
  "rosybrown": "#bc8f8f",
  "royalblue": "#4169e1",
  "saddlebrown": "#8b4513",
  "salmon": "#fa8072",
  "sandybrown": "#f4a460",
  "seagreen": "#2e8b57",
  "seashell": "#fff5ee",
  "sienna": "#a0522d",
  "silver": "#c0c0c0",
  "skyblue": "#87ceeb",
  "slateblue": "#6a5acd",
  "slategray": "#708090",
  "slategrey": "#708090",
  "snow": "#fffafa",
  "springgreen": "#00ff7f",
  "steelblue": "#4682b4",
  "tan": "#d2b48c",
  "teal": "#008080",
  "thistle": "#d8bfd8",
  "tomato": "#ff6347",
  "turquoise": "#40e0d0",
  "violet": "#ee82ee",
  "wheat": "#f5deb3",
  "white": "#ffffff",
  "whitesmoke": "#f5f5f5",
  "yellow": "#ffff00",
  "yellowgreen": "#9acd32"
};

const frenchColors: Record<string, string> = {
  blanc: '#ffffff', 'blanc pur': '#fafafa', noir: '#000000',
  gris: '#6b7280', 'gris perle': '#d3d3d3', 'gris clair': '#d3d3d3', 'gris fonce': '#374151',
  rouge: '#ef4444', bleu: '#3b82f6', 'bleu ciel': '#87ceeb', 'bleu marine': '#000080',
  'bleu clair': '#87ceeb', 'bleu fonce': '#00008b', vert: '#10b981', 'vert clair': '#90ee90',
  'vert fonce': '#006400', jaune: '#fbbf24', orange: '#f97316', violet: '#8b5cf6',
  marron: '#92400e', beige: '#d4c5b9', 'beige sable': '#c9b99b', rose: '#ec4899',
  argent: '#c0c0c0', argente: '#c0c0c0', or: '#ffd700', dore: '#ffd700',
  'light blue': '#60a5fa', turquoise: '#40e0d0', kaki: '#808000', bordeaux: '#800020', creme: '#fffdd0', ivoire: '#fffff0',
};

const rgbHex = (channels: number[]) => '#' + channels.map(value =>
  Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')
).join('');

export function resolveColorHex(value?: string | null): string | null {
  const key = String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  if (!key) return null;
  const hex = key.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i)?.[1];
  if (hex) return '#' + (hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex);
  const namedColor = frenchColors[key] || cssColors[key];
  if (typeof namedColor === 'string') return namedColor;
  // Keep supporting RGB/HSL values already used by existing variants.
  const rgb = key.match(/^rgb\(\s*([\d.]+)(%)?[,\s]+([\d.]+)(%)?[,\s]+([\d.]+)(%)?\s*\)$/);
  if (rgb && [1, 3, 5].every(i => Number.isFinite(Number(rgb[i])))) {
    return rgbHex([1, 3, 5].map(i => Number(rgb[i]) * (rgb[i + 1] ? 2.55 : 1)));
  }
  const hsl = key.match(/^hsl\(\s*(-?[\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%\s*\)$/);
  if (hsl && [1, 2, 3].every(i => Number.isFinite(Number(hsl[i])))) {
    const h = ((Number(hsl[1]) % 360) + 360) % 360 / 30;
    const s = Math.min(100, Number(hsl[2])) / 100;
    const l = Math.min(100, Number(hsl[3])) / 100;
    const a = s * Math.min(l, 1 - l);
    return rgbHex([0, 8, 4].map(n => {
      const k = (n + h) % 12;
      return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    }));
  }
  return null;
}

export function getColorForeground(color: string): string {
  const hex = resolveColorHex(color) || '#e5e7eb';
  const channels = [1, 3, 5].map(i => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
}

export function getVariantColor(colorName?: string | null, variantName?: string | null) {
  const background = resolveColorHex(colorName?.trim() || variantName) || '#e5e7eb';
  return { background, foreground: getColorForeground(background) };
}
