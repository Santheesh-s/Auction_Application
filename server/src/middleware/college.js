import { AppError } from './errors.js';

/**
 * Checks that the user belongs to the same college as the listing.
 * For queries/views, returns 404 to avoid leaking existence across institutions.
 * For direct mutative operations, rejects with 403 FORBIDDEN_COLLEGE or 404.
 *
 * @param {object} listing - Object containing college_domain
 * @param {object} user - Authenticated user object containing college_domain
 * @param {boolean} [asNotFound=true] - Whether to return 404 (default) or 403
 */
export function requireSameCollege(listing, user, asNotFound = true) {
  if (!listing || !user) {
    throw new AppError('Listing not found', 404, 'NOT_FOUND');
  }

  const listingCollege = (listing.college_domain || listing.collegeDomain || '').toLowerCase().trim();
  const userCollege = (user.college_domain || user.collegeDomain || '').toLowerCase().trim();

  if (!listingCollege || !userCollege || listingCollege !== userCollege) {
    if (asNotFound) {
      throw new AppError('Listing not found', 404, 'NOT_FOUND');
    } else {
      throw new AppError(
        'Participation is restricted to students of the same college',
        403,
        'FORBIDDEN_COLLEGE'
      );
    }
  }
}
