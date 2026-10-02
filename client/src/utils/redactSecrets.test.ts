import { describe, expect, it } from 'vitest';
import { mask, maskLength, redactSecrets } from './redactSecrets';

const REDACTED = /\[REDACTED:\*+\]/;

function expectRedacted(input: string, secret: string) {
  const out = redactSecrets(input);
  expect(out).not.toContain(secret);
  expect(out).toMatch(REDACTED);
}

describe('maskLength', () => {
  it('is never equal to the original length and stays within ±4', () => {
    for (let len = 1; len <= 200; len++) {
      for (let i = 0; i < 20; i++) {
        const n = maskLength(len);
        expect(n).not.toBe(len);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(Math.abs(n - len)).toBeLessThanOrEqual(4);
      }
    }
  });

  it('grows instead of shrinking below 1', () => {
    expect(maskLength(1, () => 0)).toBe(2);
  });

  it('can shrink or grow depending on rng', () => {
    const shrinkRng = (() => { const v = [0.99, 0.1]; let i = 0; return () => v[i++]; })();
    const growRng = (() => { const v = [0.99, 0.9]; let i = 0; return () => v[i++]; })();
    expect(maskLength(20, shrinkRng)).toBe(16);
    expect(maskLength(20, growRng)).toBe(24);
  });
});

describe('mask', () => {
  it('produces a labelled asterisk mask', () => {
    expect(mask('abcdefgh')).toMatch(/^\[REDACTED:\*+\]$/);
  });
});

describe('redactSecrets patterns', () => {
  it('redacts OpenAI keys (legacy and project)', () => {
    expectRedacted('key: sk-abcdefghijklmnopqrstuvwxyz0123456789', 'sk-abcdefghijklmnopqrstuvwxyz0123456789');
    expectRedacted('sk-proj-AbC123_dEf456-GhI789jKl012MnO345', 'sk-proj-AbC123_dEf456-GhI789jKl012MnO345');
  });

  it('redacts Anthropic-style sk-ant- keys', () => {
    expectRedacted('sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF', 'sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF');
  });

  it('redacts Gemini / Google API keys', () => {
    const key = 'AIzaSyD-1234567890abcdefghijklmnopqrstu';
    expectRedacted(`const k = "${key}";`, key);
  });

  it('redacts AWS access key IDs', () => {
    expectRedacted('AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE');
    expectRedacted('ASIAY34FZKBOKMUTVV7A', 'ASIAY34FZKBOKMUTVV7A');
  });

  it('redacts standalone AWS secret access keys', () => {
    const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    expectRedacted(`aws ${secret} here`, secret);
  });

  it('redacts GitHub tokens', () => {
    const t = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
    expectRedacted(t, t);
  });

  it('redacts JWTs and bearer tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expectRedacted(`Authorization: ${jwt}`, jwt);
    expectRedacted('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123', 'abcdefghijklmnopqrstuvwxyz123');
  });

  it('redacts private key blocks', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----';
    const out = redactSecrets(`before\n${pem}\nafter`);
    expect(out).not.toContain('MIIEowIBAAKCAQEA');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('redacts only the value in sensitive assignments', () => {
    const out = redactSecrets('DB_PASSWORD=hunter2hunter2\napi_key: "myKeyValue123"');
    expect(out).not.toContain('hunter2hunter2');
    expect(out).not.toContain('myKeyValue123');
    expect(out).toContain('DB_PASSWORD=');
    expect(out).toContain('api_key: "');
  });

  it('does not double-mask already redacted values', () => {
    const out = redactSecrets('api_key = sk-abcdefghijklmnopqrstuvwxyz');
    expect(out.match(/\[REDACTED:/g)).toHaveLength(1);
  });
});

describe('redactSecrets non-matches', () => {
  it('leaves ordinary code and git SHAs alone', () => {
    const text = 'const x = 42;\ncommit 9fceb02d0ae598e95dc970b74767f19372d61af8';
    expect(redactSecrets(text)).toBe(text);
  });

  it('handles empty input', () => {
    expect(redactSecrets('')).toBe('');
  });

  it('accepts known false positives (broad by design)', () => {
    // Short-ish words after "token:" still get masked — intentional.
    expect(redactSecrets('token: tokenizer')).toMatch(REDACTED);
  });
});
