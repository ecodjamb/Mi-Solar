export const MISOLAR_PASSWORD_LENGTH = 8;

export function validMiSolarPassword(value) {
  return Array.from(String(value ?? '')).length === MISOLAR_PASSWORD_LENGTH;
}
