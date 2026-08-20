import { describe, it, expect, afterEach } from 'vitest';
import { authenticator } from 'otplib';
import { generateTotpSecret, buildOtpAuthUrl, verifyTotp } from '../src/shared/utils/totp';

// verifyTotp/generate share otplib's `authenticator` singleton (configured with
// window:1 by totp.ts). Some tests set a fixed epoch to make time deterministic;
// restore the default afterward so other tests are unaffected.
const DEFAULT_OPTIONS = { window: 1 };
afterEach(() => {
  authenticator.options = DEFAULT_OPTIONS;
});

describe('TOTP (RFC 6238)', () => {
  it('generates a usable base32 secret', () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(secret).toMatch(/^[A-Z2-7]+$/); // base32 alphabet
  });

  it('accepts the current code and rejects a wrong one', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotp(code, secret)).toBe(true);
    expect(verifyTotp('000000', secret)).toBe(false);
  });

  it('returns false (never throws) for malformed input', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp('', secret)).toBe(false);
    expect(verifyTotp('abcdef', secret)).toBe(false);
  });

  it('tolerates ±1 step of clock skew but rejects codes outside the window', () => {
    const secret = generateTotpSecret();
    const base = 1_700_000_000_000; // fixed epoch (ms)

    authenticator.options = { window: 1, epoch: base };
    const code = authenticator.generate(secret);

    // One step later (+30s): the previous step's code is still accepted.
    authenticator.options = { window: 1, epoch: base + 30_000 };
    expect(verifyTotp(code, secret)).toBe(true);

    // Four steps later (+120s): well outside the ±1 window → rejected.
    authenticator.options = { window: 1, epoch: base + 120_000 };
    expect(verifyTotp(code, secret)).toBe(false);
  });

  it('builds an otpauth:// provisioning URI with the issuer and account', () => {
    const url = buildOtpAuthUrl('user@test.dev', generateTotpSecret());
    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain('issuer=rent%2B'); // "rent+" url-encoded
    expect(url).toContain('secret=');
  });
});
