/**
 * Client-side secret redaction. Masks API keys, passwords and similar
 * credentials before text is sent to the AI.
 *
 * Detection is intentionally broad: false positives are preferred over leaks.
 * Each match is replaced with `[REDACTED:****]`, where the asterisk count is
 * close to — but never exactly — the original secret length.
 */

export type Rng = () => number;

interface SecretPattern {
  name: string;
  regex: RegExp;
  /** Optional extra check to cut down on noisy matches. */
  accept?: (match: string) => boolean;
}

const REDACTED_PREFIX = '[REDACTED:';

export const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'private_key_block',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    name: 'jwt',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    name: 'bearer_token',
    regex: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g,
  },
  {
    // OpenAI (sk-, sk-proj-, sk-svcacct-, sk-admin-); also catches Anthropic sk-ant-.
    name: 'openai_key',
    regex: /\bsk-[A-Za-z0-9_-]{20,}/g,
  },
  {
    // Gemini / Google Cloud API keys.
    name: 'google_api_key',
    regex: /\bAIza[0-9A-Za-z_-]{35}/g,
  },
  {
    name: 'aws_access_key_id',
    regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|A3T[A-Z0-9])[A-Z0-9]{16}\b/g,
  },
  {
    name: 'github_token',
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/g,
  },
  {
    // Standalone AWS secret access key: 40 base64-ish chars. Requiring mixed
    // case + digit skips git SHAs (lowercase hex).
    name: 'aws_secret_key',
    regex: /(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/g,
    accept: (m) => /[A-Z]/.test(m) && /[a-z]/.test(m) && /[0-9]/.test(m),
  },
];

/**
 * Generic `name = value` / `name: value` assignments where the name looks
 * sensitive. Only the value (group 2) is masked so the AI keeps the context.
 */
const ASSIGNMENT_PATTERN =
  /((?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token|client[_-]?secret|private[_-]?key|credential)[A-Za-z0-9_-]*["']?\s*[:=]\s*["']?)([^\s"'`,;]{6,})/gi;

/** Mask length is original ± 1–4, never equal, never below 1. */
export function maskLength(originalLength: number, rng: Rng = Math.random): number {
  const delta = 1 + Math.floor(rng() * 4);
  const shrink = rng() < 0.5 && originalLength - delta >= 1;
  return shrink ? originalLength - delta : originalLength + delta;
}

export function mask(secret: string, rng: Rng = Math.random): string {
  return `${REDACTED_PREFIX}${'*'.repeat(maskLength(secret.length, rng))}]`;
}

export function redactSecrets(text: string, rng: Rng = Math.random): string {
  if (!text) return text;

  let result = text;
  for (const { regex, accept } of SECRET_PATTERNS) {
    result = result.replace(regex, (match) =>
      accept && !accept(match) ? match : mask(match, rng),
    );
  }

  result = result.replace(ASSIGNMENT_PATTERN, (full, prefix: string, value: string) =>
    value.startsWith(REDACTED_PREFIX) ? full : `${prefix}${mask(value, rng)}`,
  );

  return result;
}
