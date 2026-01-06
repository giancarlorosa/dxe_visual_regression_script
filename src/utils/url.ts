/**
 * URL Transformation Utilities
 * Functions for manipulating URLs in cross-domain testing scenarios
 */

/**
 * Replaces the domain/origin of a URL while preserving the path, query, and hash.
 *
 * @param originalUrl - Full URL from API (e.g., "https://local.ddev.site/lung-cancer?foo=bar#section")
 * @param newDomain - Domain to use (e.g., "https://www.production.org" or "https://www.production.org/")
 * @returns Transformed URL (e.g., "https://www.production.org/lung-cancer?foo=bar#section")
 *
 * @example
 * // Basic usage
 * replaceDomain("https://local.site/page", "https://prod.site")
 * // Returns: "https://prod.site/page"
 *
 * @example
 * // With query params and hash
 * replaceDomain("https://local.site/page?foo=bar#section", "https://prod.site/")
 * // Returns: "https://prod.site/page?foo=bar#section"
 *
 * @example
 * // Null domain returns original
 * replaceDomain("https://local.site/page", null)
 * // Returns: "https://local.site/page"
 */
export function replaceDomain(
  originalUrl: string,
  newDomain: string | null | undefined
): string {
  // If newDomain is null, undefined, or empty string, return original unchanged
  if (!newDomain || newDomain.trim() === '') {
    return originalUrl;
  }

  try {
    // Parse the original URL to extract path, query, and hash
    const parsedOriginal = new URL(originalUrl);

    // Normalize newDomain: remove trailing slash if present
    const normalizedDomain = newDomain.replace(/\/+$/, '');

    // Combine new domain with original path, search, and hash
    // pathname always starts with '/', so no need to add one
    return `${normalizedDomain}${parsedOriginal.pathname}${parsedOriginal.search}${parsedOriginal.hash}`;
  } catch (error) {
    // If URL parsing fails, return original unchanged
    // This handles edge cases where originalUrl might be malformed
    console.warn(`Warning: Could not parse URL "${originalUrl}", using original`);
    return originalUrl;
  }
}
