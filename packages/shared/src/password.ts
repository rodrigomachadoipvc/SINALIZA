export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RULE_MESSAGE = 'Mínimo 8 caracteres, com letras e números.';

/** At least 8 characters with at least one letter and one digit. */
export function isValidPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && /\p{L}/u.test(password) && /\d/.test(password);
}
