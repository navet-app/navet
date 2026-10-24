export const SOLID_WALLPAPERS = [
  { value: 'solid:black', name: 'Black', labelKey: 'wallpaper.color.black', color: '#000000' },
  {
    value: 'solid:charcoal',
    name: 'Charcoal',
    labelKey: 'wallpaper.color.charcoal',
    color: '#18181b',
  },
  { value: 'solid:slate', name: 'Slate', labelKey: 'wallpaper.color.slate', color: '#334155' },
  { value: 'solid:navy', name: 'Navy', labelKey: 'wallpaper.color.navy', color: '#172554' },
  { value: 'solid:forest', name: 'Forest', labelKey: 'wallpaper.color.forest', color: '#14332a' },
  { value: 'solid:teal', name: 'Teal', labelKey: 'wallpaper.color.teal', color: '#134e4a' },
  { value: 'solid:plum', name: 'Plum', labelKey: 'wallpaper.color.plum', color: '#3b1d47' },
  {
    value: 'solid:burgundy',
    name: 'Burgundy',
    labelKey: 'wallpaper.color.burgundy',
    color: '#4c1d2b',
  },
  { value: 'solid:ivory', name: 'Ivory', labelKey: 'wallpaper.color.ivory', color: '#f5f1e8' },
  { value: 'solid:sand', name: 'Sand', labelKey: 'wallpaper.color.sand', color: '#e6d5b8' },
  { value: 'solid:mint', name: 'Mint', labelKey: 'wallpaper.color.mint', color: '#bce8d1' },
  { value: 'solid:sage', name: 'Sage', labelKey: 'wallpaper.color.sage', color: '#b7c8a3' },
  {
    value: 'solid:pistachio',
    name: 'Pistachio',
    labelKey: 'wallpaper.color.pistachio',
    color: '#d5e5a3',
  },
  {
    value: 'solid:seafoam',
    name: 'Seafoam',
    labelKey: 'wallpaper.color.seafoam',
    color: '#a8ddd7',
  },
  { value: 'solid:sky', name: 'Sky', labelKey: 'wallpaper.color.sky', color: '#b6dff5' },
  {
    value: 'solid:cornflower',
    name: 'Cornflower',
    labelKey: 'wallpaper.color.cornflower',
    color: '#8cace8',
  },
  {
    value: 'solid:periwinkle',
    name: 'Periwinkle',
    labelKey: 'wallpaper.color.periwinkle',
    color: '#b8bdf0',
  },
  {
    value: 'solid:lavender',
    name: 'Lavender',
    labelKey: 'wallpaper.color.lavender',
    color: '#d4c2eb',
  },
  { value: 'solid:rose', name: 'Rose', labelKey: 'wallpaper.color.rose', color: '#edbfd0' },
  { value: 'solid:peach', name: 'Peach', labelKey: 'wallpaper.color.peach', color: '#f4c7ab' },
  {
    value: 'solid:apricot',
    name: 'Apricot',
    labelKey: 'wallpaper.color.apricot',
    color: '#f2b378',
  },
  { value: 'solid:coral', name: 'Coral', labelKey: 'wallpaper.color.coral', color: '#ee9485' },
  {
    value: 'solid:terracotta',
    name: 'Terracotta',
    labelKey: 'wallpaper.color.terracotta',
    color: '#bf7057',
  },
  { value: 'solid:ochre', name: 'Ochre', labelKey: 'wallpaper.color.ochre', color: '#cfa34f' },
] as const;

export type SolidWallpaperToken = (typeof SOLID_WALLPAPERS)[number]['value'];

export function getSolidWallpaper(value: unknown) {
  return SOLID_WALLPAPERS.find((option) => option.value === value);
}

export function solidWallpaperForeground(color: string): string {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    ?.map((part) => {
      const value = Number.parseInt(part, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }) ?? [0, 0, 0];
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
