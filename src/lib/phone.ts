/**
 * Normalises an Indonesian phone number to the local format starting with "0"
 * (e.g. "+62 812-3456-7890" -> "081234567890"). The result is a string so the
 * leading zero is preserved. Returns null when the input is not a plausible
 * Indonesian number.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^[+\d\s().-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("62")) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith("8")) digits = `0${digits}`;
  return /^0[1-9]\d{7,12}$/.test(digits) ? digits : null;
}
