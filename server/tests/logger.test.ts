import { describe, it, expect } from 'vitest';
import { createLogger, redact, type LogLevel } from '../src/shared/logging/logger';

// The structured logger is pure/dependency-free; tests inject a capturing sink so
// no real stdout/stderr writes happen and output can be asserted directly.

describe('redact()', () => {
  it('replaces sensitive keys at the top level', () => {
    const out = redact({ password: 'p', token: 't', keep: 'ok' }) as Record<string, unknown>;
    expect(out).toEqual({ password: '[REDACTED]', token: '[REDACTED]', keep: 'ok' });
  });

  it('redacts a broad set of sensitive key names (case-insensitive substrings)', () => {
    const out = redact({
      passwordHash: 'x',
      tokenHash: 'x',
      jwt: 'x',
      Cookie: 'x',
      secretValue: 'x',
      Authorization: 'Bearer x',
      apiKey: 'x',
      api_key: 'x',
      otp: '123456',
      email: 'a@b.dev',
    }) as Record<string, unknown>;
    for (const k of [
      'passwordHash',
      'tokenHash',
      'jwt',
      'Cookie',
      'secretValue',
      'Authorization',
      'apiKey',
      'api_key',
      'otp',
    ]) {
      expect(out[k]).toBe('[REDACTED]');
    }
    // Non-sensitive fields are preserved.
    expect(out['email']).toBe('a@b.dev');
  });

  it('redacts sensitive keys nested in objects and arrays', () => {
    // Note: the outer key is deliberately NOT sensitive ("items"), so recursion
    // into the array is exercised; the inner "token" keys are the sensitive ones.
    const out = redact({
      user: { name: 'A', passwordHash: 'secret' },
      items: [{ token: 'raw1' }, { token: 'raw2', note: 'keep' }],
    }) as Record<string, unknown>;
    const user = out['user'] as Record<string, unknown>;
    expect(user['name']).toBe('A');
    expect(user['passwordHash']).toBe('[REDACTED]');
    const items = out['items'] as Array<Record<string, unknown>>;
    expect(items[0]!['token']).toBe('[REDACTED]');
    expect(items[1]!['token']).toBe('[REDACTED]');
    expect(items[1]!['note']).toBe('keep');
  });

  it('redacts an array key whose NAME is itself sensitive (e.g. "tokens")', () => {
    const out = redact({ tokens: [{ token: 'raw1' }] }) as Record<string, unknown>;
    expect(out['tokens']).toBe('[REDACTED]');
  });

  it('normalizes Error instances to name/message/stack (not an empty object)', () => {
    const out = redact(new Error('boom')) as Record<string, unknown>;
    expect(out['name']).toBe('Error');
    expect(out['message']).toBe('boom');
    expect(out).toHaveProperty('stack');
  });

  it('does not mutate the input object', () => {
    const input = { password: 'p', nested: { token: 't' } };
    redact(input);
    expect(input.password).toBe('p');
    expect(input.nested.token).toBe('t');
  });
});

describe('createLogger() — level filtering', () => {
  it('drops messages below the configured level', () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'warn', pretty: false, sink: (_l, line) => lines.push(line) });
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    const msgs = lines.map((l) => JSON.parse(l).msg);
    expect(msgs).toEqual(['w', 'e']);
  });

  it('emits nothing at level "silent"', () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'silent' as LogLevel, pretty: false, sink: (_l, line) => lines.push(line) });
    log.error('e');
    expect(lines).toHaveLength(0);
  });
});

describe('createLogger() — output format', () => {
  it('emits compact JSON with ts/level/msg + redacted context when pretty=false', () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'debug', pretty: false, sink: (_l, line) => lines.push(line) });
    log.info('http_request', { status: 200, password: 'nope' });
    const record = JSON.parse(lines[0]!);
    expect(record.level).toBe('info');
    expect(record.msg).toBe('http_request');
    expect(record.status).toBe(200);
    expect(record.password).toBe('[REDACTED]');
    expect(typeof record.ts).toBe('string');
  });

  it('emits a human-readable line with the level and message when pretty=true', () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'debug', pretty: true, sink: (_l, line) => lines.push(line) });
    log.warn('login_failed', { reason: 'bad_credentials' });
    expect(lines[0]).toContain('WARN');
    expect(lines[0]).toContain('login_failed');
    expect(lines[0]).toContain('reason=bad_credentials');
  });

  it('routes level to the sink so callers can split streams', () => {
    const seen: LogLevel[] = [];
    const log = createLogger({ level: 'debug', pretty: false, sink: (level) => seen.push(level) });
    log.info('a');
    log.error('b');
    expect(seen).toEqual(['info', 'error']);
  });
});
