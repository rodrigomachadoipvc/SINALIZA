import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

type Kind = 'error' | 'warning' | 'success' | 'info';

const STYLES: Record<Kind, { box: string; icon: typeof Info; label: string }> = {
  error: { box: 'bg-superficie-erro border-erro text-erro', icon: CircleAlert, label: 'Erro' },
  warning: {
    box: 'bg-superficie-amarelo border-ambar text-ambar',
    icon: TriangleAlert,
    label: 'Atenção',
  },
  success: {
    box: 'bg-superficie-sucesso border-sucesso text-sucesso',
    icon: CircleCheck,
    label: 'Sucesso',
  },
  info: { box: 'bg-superficie-info border-info text-info', icon: Info, label: 'Informação' },
};

/** Notice with a 4 px side bar, icon and text (spec section 6). */
export function Alert({
  kind,
  title,
  children,
}: {
  kind: Kind;
  title?: string;
  children?: ReactNode;
}) {
  const style = STYLES[kind];
  const Icon = style.icon;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-campo border-l-4 px-4 py-3 ${style.box}`}
    >
      <Icon size={24} className="shrink-0" aria-label={style.label} />
      <div className="text-pequeno text-azul">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
