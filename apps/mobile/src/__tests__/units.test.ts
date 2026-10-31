import { firstName, initials, relativeDay } from '../lib/format';
import { fitWithin, formatMegabytes } from '../lib/photo';
import { changePasswordSchema, profileSchema, validateDetails } from '../lib/validation';
import { hasDraftContent, useDraft } from '../store/draft';
import { t } from '../i18n/pt-PT';

describe('format', () => {
  const now = new Date('2026-10-31T12:00:00Z');

  it('describes how long ago, in Lisbon calendar days', () => {
    expect(relativeDay('2026-10-31T08:00:00Z', now)).toBe('Hoje');
    expect(relativeDay('2026-10-30T23:30:00Z', now)).toBe('Ontem');
    expect(relativeDay('2026-10-28T10:00:00Z', now)).toBe('Há 3 dias');
    expect(relativeDay('2026-08-15T10:00:00Z', now)).toBe('Há 2 meses');
  });

  it('builds initials and first names', () => {
    expect(initials('Maria da Silva Fernandes')).toBe('MF');
    expect(initials('Rui')).toBe('R');
    expect(firstName('  Maria Fernandes ')).toBe('Maria');
  });
});

describe('photo', () => {
  it('keeps the longest side at or under 1600 px without distortion', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1080, 1920)).toEqual({ width: 900, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('formats sizes in MB with a decimal comma', () => {
    expect(formatMegabytes(1.5 * 1024 * 1024)).toBe('1,5');
  });
});

describe('validation', () => {
  it('asks for a category and at least 10 characters of description', () => {
    expect(validateDetails(null, 'curto')).toEqual({
      category: t.validacao.categoria,
      description: t.validacao.descricaoCurta,
    });
    expect(validateDetails('c1', '   só 9 c   ')).toEqual({
      description: t.validacao.descricaoCurta,
    });
    expect(validateDetails('c1', 'Candeeiro apagado')).toEqual({});
  });

  it('accepts an empty phone but not letters', () => {
    expect(profileSchema.safeParse({ name: 'Maria', phone: '' }).success).toBe(true);
    expect(profileSchema.safeParse({ name: 'Maria', phone: '+351 912 345 678' }).success).toBe(
      true,
    );
    expect(profileSchema.safeParse({ name: 'Maria', phone: 'abc' }).success).toBe(false);
  });

  it('requires the new password to be confirmed', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'Antiga12345',
      newPassword: 'Nova123456',
      confirm: 'Outra123456',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirm']);
  });
});

describe('draft', () => {
  it('only asks to discard when something was filled in', () => {
    expect(hasDraftContent(useDraft.getState())).toBe(false);
    useDraft.getState().setDetails('c1', '');
    expect(hasDraftContent(useDraft.getState())).toBe(true);
    useDraft.getState().reset();
    expect(useDraft.getState().categoryId).toBeNull();
  });
});
