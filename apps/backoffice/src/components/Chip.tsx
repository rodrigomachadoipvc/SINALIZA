import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

/** Filter chip: 36 px visible, 48 px clickable area, with a check mark when selected. */
export function Chip({
  selected,
  onToggle,
  children,
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className="group flex min-h-12 items-center"
    >
      <span
        className={`flex h-9 items-center gap-1 rounded-full border px-3 text-pequeno font-medium ${
          selected
            ? 'border-azul bg-azul text-branco'
            : 'border-cinza-contorno bg-branco text-azul group-hover:bg-cinza-claro'
        }`}
      >
        {selected ? <Check size={16} strokeWidth={2.5} aria-hidden="true" /> : null}
        {children}
      </span>
    </button>
  );
}
