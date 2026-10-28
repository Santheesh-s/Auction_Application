import { getDomain } from 'tldts';

export const BLOCKED_PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.in',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'rediffmail.com',
  'aol.com',
  'zoho.com',
]);

export function getCollegeDomainClient(email) {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1 || atIndex === 0 || atIndex === trimmed.length - 1) {
    return null;
  }

  const hostPart = trimmed.slice(atIndex + 1);
  return getDomain(hostPart) || null;
}

export function isPersonalDomainClient(domain) {
  if (!domain) return false;
  return BLOCKED_PERSONAL_DOMAINS.has(domain.toLowerCase());
}
