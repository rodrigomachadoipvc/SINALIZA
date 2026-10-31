import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'highlight' | 'secondary' | 'destructive' | 'text';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-azul text-branco hover:bg-azul-pressionado active:bg-azul-pressionado',
  // Yellow is always paired with blue text, never white (spec section 6).
  highlight: 'bg-amarelo text-azul hover:bg-amarelo-pressionado active:bg-amarelo-pressionado',
  secondary:
    'border-2 border-azul bg-branco text-azul hover:bg-cinza-claro active:bg-cinza-divisoria',
  destructive: 'bg-erro text-branco hover:bg-erro-pressionado active:bg-erro-pressionado',
  text: 'text-azul underline-offset-4 hover:underline px-2',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  icon,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-campo px-5 text-corpo font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
