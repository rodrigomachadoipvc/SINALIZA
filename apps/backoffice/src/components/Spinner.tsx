export function Spinner({ label }: { label?: string }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      className="inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

export function PageLoading() {
  return (
    <div className="flex justify-center py-16 text-azul">
      <Spinner label="A carregar…" />
    </div>
  );
}
