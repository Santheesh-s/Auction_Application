import { getDomain } from 'tldts';
import { BLOCKED_PERSONAL_DOMAINS } from '../constants/domains.js';

const EDU_DOMAIN_REGEX = /\.(edu|ac\.[a-z]{2,}|edu\.[a-z]{2,})$/i;

/**
 * Derives the registrable college domain from an email address.
 * Examples:
 *   santheeshs.23cse@kongu.edu -> "kongu.edu"
 *   x@students.kongu.edu       -> "kongu.edu"
 *   x@cse.iitm.ac.in           -> "iitm.ac.in"
 *
 * @param {string} email
 * @returns {string|null} The registrable domain, or null if invalid
 */
export function getCollegeDomain(email) {
  if (!email || typeof email !== 'string') {
    throw new Error('Invalid email format');
  }

  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1 || atIndex === 0 || atIndex === trimmed.length - 1) {
    throw new Error('Invalid email format');
  }

  const hostPart = trimmed.slice(atIndex + 1);
  const domain = getDomain(hostPart);

  if (!domain) {
    throw new Error('Invalid email format');
  }

  if (isPersonalDomain(domain)) {
    throw new Error(`Personal email providers (@${domain}) are not permitted`);
  }

  return domain;
}

/**
 * Checks whether a domain is a free or personal email provider.
 * @param {string} domain
 * @returns {boolean}
 */
export function isPersonalDomain(domain) {
  if (!domain) return false;
  return BLOCKED_PERSONAL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Checks whether a domain ends in .edu, .ac.<cc>, or .edu.<cc>
 * @param {string} domain
 * @returns {boolean}
 */
export function isEducationalDomain(domain) {
  if (!domain) return false;
  return EDU_DOMAIN_REGEX.test(domain.toLowerCase());
}

/**
 * Validates an email for campus registration according to college domain rules.
 * @param {string} email
 * @returns {{ valid: boolean, collegeDomain: string|null, error: string|null }}
 */
export function validateCollegeEmail(email) {
  let domain;
  try {
    domain = getCollegeDomain(email);
  } catch (err) {
    return {
      valid: false,
      collegeDomain: null,
      error: err.message,
    };
  }

  if (process.env.REQUIRE_EDU_DOMAIN === 'true' && !isEducationalDomain(domain)) {
    return {
      valid: false,
      collegeDomain: domain,
      error: `Your college domain (@${domain}) must end in an educational extension (.edu, .ac.<country>, or .edu.<country>).`,
    };
  }

  return {
    valid: true,
    collegeDomain: domain,
    error: null,
  };
}
