import type { ReactNode } from 'react';

import { Logo } from '../components/Logo';

/** Centred card used by the pages that need no session (login and password recovery). */
export function PublicLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cinza-claro p-8">
      <div className="w-full max-w-md rounded-cartao bg-branco p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <Logo className="h-16" />
        </div>
        <h1 className="mb-6 text-center">{title}</h1>
        {children}
      </div>
    </main>
  );
}
