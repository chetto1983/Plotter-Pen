/**
 * The errors of the server as the page shows them. The API answers a failure with
 * `{"error": "..."}`, already in Italian; a body without it, such as the page of a proxy, is said
 * by its HTTP status.
 */

/**
 * The text of a failed answer whose body is already read.
 * @param {object|null} body
 * @param {Response} response
 * @returns {string}
 */
export function errorText(body, response) {
  return body?.error || `il server ha risposto con lo stato HTTP ${response.status}`;
}

/**
 * The error of a failed answer, reading its body.
 * @param {Response} response
 * @returns {Promise<Error>}
 */
export async function responseError(response) {
  const body = await response.json().catch(() => null);
  return new Error(errorText(body, response));
}
