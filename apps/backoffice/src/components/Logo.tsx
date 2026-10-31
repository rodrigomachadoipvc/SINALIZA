import logoUrl from '@sinaliza/shared/assets/logo.svg';
import symbolUrl from '@sinaliza/shared/assets/logo-symbol.svg';

export function Logo({ className = 'h-14' }: { className?: string }) {
  return <img src={logoUrl} alt="Sinaliza — Reporte, Acompanhe, Resolva!" className={className} />;
}

export function LogoSymbol({ className = 'size-10' }: { className?: string }) {
  return <img src={symbolUrl} alt="" className={className} />;
}
