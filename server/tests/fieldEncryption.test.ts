import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptField,
  decryptField,
  encryptBuffer,
  decryptBuffer,
} from '../src/shared/utils/fieldEncryption';
import { AppError } from '../src/shared/errors/AppError';

// A valid 32-byte key (64 hex chars) for the round-trip tests.
const KEY = 'a'.repeat(64);

beforeAll(() => {
  process.env['FIELD_ENCRYPTION_KEY'] = KEY;
});

describe('fieldEncryption (AES-256-GCM)', () => {
  it('round-trips a value through encrypt → decrypt', () => {
    const plaintext = 'AB1234567';
    const encrypted = encryptField(plaintext);
    expect(decryptField(encrypted)).toBe(plaintext);
  });

  it('produces ciphertext that does not contain the plaintext', () => {
    const plaintext = 'SECRET-PASSPORT-99';
    const encrypted = encryptField(plaintext);
    expect(encrypted).not.toContain(plaintext);
  });

  it('produces a different ciphertext each time (random IV, no equality leakage)', () => {
    const plaintext = 'POLICY-0001';
    expect(encryptField(plaintext)).not.toBe(encryptField(plaintext));
  });

  it('handles unicode/utf-8 plaintext', () => {
    const plaintext = 'דרכון-123';
    expect(decryptField(encryptField(plaintext))).toBe(plaintext);
  });

  it('throws on a malformed stored value', () => {
    expect(() => decryptField('not-a-valid-blob')).toThrow(AppError);
  });

  it('throws (does not return plaintext) on a tampered ciphertext', () => {
    const encrypted = encryptField('tamper-me');
    const parts = encrypted.split('.');
    // Flip the last base64 char of the ciphertext segment.
    const data = parts[2]!;
    const flipped = data.slice(0, -1) + (data.slice(-1) === 'A' ? 'B' : 'A');
    const tampered = `${parts[0]}.${parts[1]}.${flipped}`;
    expect(() => decryptField(tampered)).toThrow(AppError);
  });

  it('fails closed when the key is missing/invalid', () => {
    const saved = process.env['FIELD_ENCRYPTION_KEY'];
    process.env['FIELD_ENCRYPTION_KEY'] = 'too-short';
    try {
      expect(() => encryptField('x')).toThrow(/FIELD_ENCRYPTION_KEY/);
    } finally {
      process.env['FIELD_ENCRYPTION_KEY'] = saved;
    }
  });
});

describe('bufferEncryption (AES-256-GCM, for stored files)', () => {
  it('round-trips binary bytes through encrypt → decrypt', () => {
    const plaintext = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x10, 0x42]); // %PDF...
    const encrypted = encryptBuffer(plaintext);
    expect(decryptBuffer(encrypted)).toEqual(plaintext);
  });

  it('produces ciphertext that does not contain the plaintext bytes', () => {
    const plaintext = Buffer.from('SENSITIVE-PASSPORT-SCAN-BYTES', 'utf8');
    const encrypted = encryptBuffer(plaintext);
    expect(encrypted.includes(plaintext)).toBe(false);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plaintext = Buffer.from('same bytes');
    expect(encryptBuffer(plaintext).equals(encryptBuffer(plaintext))).toBe(false);
  });

  it('handles an empty buffer', () => {
    expect(decryptBuffer(encryptBuffer(Buffer.alloc(0))).length).toBe(0);
  });

  it('throws on a truncated/malformed blob', () => {
    expect(() => decryptBuffer(Buffer.from([1, 2, 3]))).toThrow(AppError);
  });

  it('throws (does not return plaintext) on a tampered ciphertext', () => {
    const encrypted = encryptBuffer(Buffer.from('tamper me please'));
    encrypted[encrypted.length - 1] ^= 0xff; // flip the last byte
    expect(() => decryptBuffer(encrypted)).toThrow(AppError);
  });
});
