/**
 * LOW 5 / LOW 6: pagination + LIKE escape helpers shared by all list endpoints.
 *
 * Pagination params must be clamped to safe bounds so a client cannot request
 * pageSize=1000000 and OOM the server. Search inputs fed into PostgREST `.ilike`
 * filters must have `%` and `_` escaped so a user cannot craft a string that
 * matches every row.
 */

/**
 * Clamp `page` and `pageSize` from raw URLSearchParams strings.
 *
 *   page:     must be an integer >= 1 (default 1)
 *   pageSize: must be an integer in [1, 100] (default 20)
 */
export function clampPagination(
  rawPage: string | null,
  rawPageSize: string | null
): { page: number; pageSize: number } {
  let page = parseInt(rawPage || '1', 10)
  let pageSize = parseInt(rawPageSize || '20', 10)
  if (!Number.isFinite(page) || page < 1) page = 1
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20
  if (pageSize > 100) pageSize = 100
  return { page, pageSize }
}

/**
 * Escape a user-supplied string so it can be safely interpolated into a
 * PostgREST `.ilike.%...%` filter without being interpreted as a wildcard.
 *
 * `%` matches any sequence; `_` matches any single char. Both are escaped by
 * prefixing with a backslash, which PostgREST treats as a literal escape
 * inside `ilike` patterns.
 */
export function escapeLike(input: string): string {
  return String(input).replace(/[%_\\]/g, '\\$&')
}
