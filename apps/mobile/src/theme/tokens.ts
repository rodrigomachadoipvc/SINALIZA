import type { OccurrenceStatus } from '@sinaliza/shared';
import type { TextStyle } from 'react-native';

/** Design tokens from the spec (section 6). Components never use colours outside this list. */
export const colors = {
  azul: '#1A2B4C',
  azulPressionado: '#12203A',
  amarelo: '#FFC107',
  amareloPressionado: '#E0A800',
  ambar: '#B45309',
  branco: '#FFFFFF',
  cinzaClaro: '#F4F5F7',
  cinzaTexto: '#4B5563',
  cinzaContorno: '#6B7280',
  cinzaDivisoria: '#D1D5DB',
  sucesso: '#2E7D32',
  erro: '#C62828',
  erroPressionado: '#A31F1F',
  info: '#1565C0',
  superficieAmarelo: '#FFF8E1',
  superficieErro: '#FDECEA',
  superficieSucesso: '#EAF4EA',
  superficieInfo: '#E8F0FB',
  /** Active tab background: white at 12 % over the blue bar. */
  brancoRealce: 'rgba(255, 255, 255, 0.12)',
  /** Dialog backdrop: blue at 60 %. */
  fundoDialogo: 'rgba(26, 43, 76, 0.6)',
} as const;

export const statusColors: Record<OccurrenceStatus, string> = {
  RECEBIDA: '#4B5563',
  EM_ANALISE: '#1565C0',
  EM_RESOLUCAO: '#B45309',
  RESOLVIDA: '#2E7D32',
  REJEITADA: '#C62828',
  DUPLICADA: '#546E7A',
  ANULADA: '#6B7280',
};

/** 8 pt grid. */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64 } as const;

export const radius = { campo: 8, cartao: 12, total: 999 } as const;

/** Minimum touch target (48 × 48 dp). */
export const TOUCH = 48;

export const fonts = {
  titulo: 'Poppins_600SemiBold',
  tituloBold: 'Poppins_700Bold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

export const type = {
  titulo: { fontFamily: fonts.titulo, fontSize: 24, lineHeight: 32, color: colors.azul },
  h2: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, color: colors.azul },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, color: colors.azul },
  corpo: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: colors.azul },
  pequeno: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.cinzaTexto },
  botao: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  rotulo: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.azul },
  legenda: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.cinzaTexto },
  legendaForte: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.azul },
} as const satisfies Record<string, TextStyle>;

/** Text scales with the system setting, up to 200 % (spec section 6). */
export const MAX_FONT_SCALE = 2;
