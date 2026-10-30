export interface CategorySeed {
  slug: string;
  name: string;
  /** Lucide icon name. */
  icon: string;
}

/** Lucide icons the admin can pick for a category (all exist in lucide-react and lucide-react-native). */
export const CATEGORY_ICONS = [
  'accessibility',
  'baby',
  'bike',
  'building-2',
  'bus',
  'car',
  'construction',
  'dog',
  'droplets',
  'ellipsis',
  'fence',
  'flame',
  'footprints',
  'hammer',
  'leaf',
  'lightbulb',
  'map-pin',
  'paint-bucket',
  'recycle',
  'school',
  'shield-alert',
  'signpost',
  'sprout',
  'traffic-cone',
  'trash-2',
  'tree-pine',
  'triangle-alert',
  'volume-2',
  'waves',
  'wind',
  'wrench',
  'zap',
] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

/** `Iluminação pública` → `iluminacao-publica`. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const DEFAULT_CATEGORIES: readonly CategorySeed[] = [
  { slug: 'vias', name: 'Vias e pavimento', icon: 'car' },
  { slug: 'iluminacao', name: 'Iluminação pública', icon: 'lightbulb' },
  { slug: 'residuos', name: 'Resíduos e limpeza', icon: 'trash-2' },
  { slug: 'sinalizacao', name: 'Sinalização', icon: 'signpost' },
  { slug: 'passeios', name: 'Passeios e acessibilidade', icon: 'accessibility' },
  { slug: 'outro', name: 'Outro', icon: 'ellipsis' },
];
