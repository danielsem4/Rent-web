/**
 * Phone-number normalization to E.164 (SECURITY_PRINCIPLES.md §10). Used to derive
 * `Worker.phoneE164` — the stable key for the "type your phone" login path and for
 * the partial-unique index that guarantees a typed number resolves to at most one
 * app-enabled worker.
 *
 * A phone number is confidential PII: never log the raw or normalized value.
 *
 * Accepts common input shapes and produces a strict E.164 string (`+` then 8–15
 * digits), or `null` when the input cannot be a valid number:
 *   - `+972 50-123-4567` / `+972501234567`  → `+972501234567`
 *   - `00972501234567`                       → `+972501234567`
 *   - `0501234567` (local, no country code)  → `+972501234567` (default country)
 *   - `501234567`                            → `+972501234567`
 * The default country calling code (Israel = 972) reflects the deployment; callers
 * that already collect `+`-prefixed numbers are unaffected by it.
 */

const DEFAULT_CALLING_CODE = '972';

/** E.164: a leading '+', a non-zero first digit, total 8–15 digits. */
const E164_RE = /^\+[1-9]\d{7,14}$/;

export function normalizeToE164(
  input: string,
  defaultCallingCode: string = DEFAULT_CALLING_CODE,
): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const hasPlus = trimmed.startsWith('+');
  // Keep digits only for the numeric body.
  const digits = trimmed.replace(/\D/g, '');
  if (digits === '') return null;

  let candidate: string;
  if (hasPlus) {
    candidate = `+${digits}`;
  } else if (digits.startsWith('00')) {
    candidate = `+${digits.slice(2)}`;
  } else if (digits.startsWith('0')) {
    candidate = `+${defaultCallingCode}${digits.slice(1)}`;
  } else {
    // Bare national/international digits without a leading 0 — if it already looks
    // like it carries a country code (long enough) keep it, else prepend default.
    candidate = digits.length >= 11 ? `+${digits}` : `+${defaultCallingCode}${digits}`;
  }

  return E164_RE.test(candidate) ? candidate : null;
}
