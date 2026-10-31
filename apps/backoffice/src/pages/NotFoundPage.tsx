import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1>Página não encontrada</h1>
      <p className="text-cinza-texto">O endereço não existe ou não tem permissão para o ver.</p>
      <Link to="/" className="font-medium underline underline-offset-4">
        Voltar ao dashboard
      </Link>
    </div>
  );
}
