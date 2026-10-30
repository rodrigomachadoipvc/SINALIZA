export interface CategorySeed {
  slug: string;
  name: string;
  /** Lucide icon name. */
  icon: string;
}

export const DEFAULT_CATEGORIES: readonly CategorySeed[] = [
  { slug: 'vias', name: 'Vias e pavimento', icon: 'car' },
  { slug: 'iluminacao', name: 'Iluminação pública', icon: 'lightbulb' },
  { slug: 'residuos', name: 'Resíduos e limpeza', icon: 'trash-2' },
  { slug: 'sinalizacao', name: 'Sinalização', icon: 'signpost' },
  { slug: 'passeios', name: 'Passeios e acessibilidade', icon: 'accessibility' },
  { slug: 'outro', name: 'Outro', icon: 'ellipsis' },
];
