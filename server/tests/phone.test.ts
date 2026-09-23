import { describe, it, expect } from 'vitest';
import { normalizeToE164 } from '../src/shared/utils/phone';

describe('normalizeToE164', () => {
  it('keeps a well-formed international number', () => {
    expect(normalizeToE164('+972501234567')).toBe('+972501234567');
  });

  it('strips spaces, dashes and parentheses', () => {
    expect(normalizeToE164('+972 (50) 123-4567')).toBe('+972501234567');
  });

  it('converts a 00-prefixed international number', () => {
    expect(normalizeToE164('00972501234567')).toBe('+972501234567');
  });

  it('expands a national 0-prefixed number using the default country code', () => {
    expect(normalizeToE164('0501234567')).toBe('+972501234567');
  });

  it('honors an explicit default country code', () => {
    expect(normalizeToE164('0501234567', '44')).toBe('+44501234567');
  });

  it('rejects empty / junk input', () => {
    expect(normalizeToE164('')).toBeNull();
    expect(normalizeToE164('   ')).toBeNull();
    expect(normalizeToE164('abc')).toBeNull();
  });

  it('rejects an implausibly short number', () => {
    expect(normalizeToE164('+123')).toBeNull();
  });

  it('two inputs for the same number normalize identically (stable key)', () => {
    expect(normalizeToE164('050-123-4567')).toBe(normalizeToE164('+972 50 123 4567'));
  });
});
