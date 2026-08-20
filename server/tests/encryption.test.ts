import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '../src/shared/utils/encryption';

// The MFA TOTP secret must be RECOVERABLE (not hashed), so it is encrypted at
// rest with AES-256-GCM (SECURITY_PRINCIPLES.md §8). These tests prove the
// round-trip works and that tampering/corruption is rejected (auth tag).

describe('encryption (AES-256-GCM)', () => {
  it('round-trips a value: decrypt(encrypt(x)) === x', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV) but decrypts the same', () => {
    const secret = 'KRSXG5A=';
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(secret);
    expect(decryptSecret(b)).toBe(secret);
  });

  it('rejects a tampered ciphertext (auth tag fails)', () => {
    const blob = encryptSecret('JBSWY3DPEHPK3PXP');
    const [iv, tag, ct] = blob.split(':');
    // Corrupt the auth tag — GCM verification must reject it.
    const tagBytes = Buffer.from(tag!, 'base64');
    tagBytes[0] = tagBytes[0]! ^ 0xff;
    expect(() => decryptSecret(`${iv}:${tagBytes.toString('base64')}:${ct}`)).toThrow();
  });

  it('throws on a malformed blob', () => {
    expect(() => decryptSecret('not-a-valid-blob')).toThrow();
    expect(() => decryptSecret('only:two')).toThrow();
  });
});
