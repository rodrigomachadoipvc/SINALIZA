import { isValidPassword, OCCURRENCE_DESCRIPTION_MIN } from '@sinaliza/shared';
import { z } from 'zod';

import { t } from '../i18n/pt-PT';

const PHONE_PATTERN = /^\+?[0-9 ]{9,20}$/;

export const emailSchema = z.string().trim().pipe(z.email(t.validacao.email));

export const nameSchema = z.string().trim().min(2, t.validacao.nome).max(120, t.validacao.nome);

export const passwordSchema = z.string().refine(isValidPassword, t.validacao.palavraPasse);

export const phoneSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || PHONE_PATTERN.test(v), t.validacao.telemovel);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, t.validacao.palavraPasseObrigatoria),
});

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const profileSchema = z.object({ name: nameSchema, phone: phoneSchema });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, t.validacao.palavraPasseAtual),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: t.validacao.confirmar,
  });

/** Report step 2: the messages shown next to each field, or nothing when valid. */
export function validateDetails(
  categoryId: string | null,
  description: string,
): { category?: string; description?: string } {
  return {
    ...(categoryId ? {} : { category: t.validacao.categoria }),
    ...(description.trim().length >= OCCURRENCE_DESCRIPTION_MIN
      ? {}
      : { description: t.validacao.descricaoCurta }),
  };
}
