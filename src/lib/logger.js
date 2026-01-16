/**
 * Conditional Logger - Only logs in development mode
 * Production builds suppress console output for security and performance
 */

const isDev = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
   window.location.hostname === '127.0.0.1' ||
   window.location.hostname.startsWith('192.168.'));

/**
 * Development-only logger
 * @param {...any} args - Arguments to log
 */
export const log = isDev ? console.log.bind(console, '[LOG]') : () => {};

/**
 * Development-only warning logger
 * @param {...any} args - Arguments to log
 */
export const warn = isDev ? console.warn.bind(console, '[WARN]') : () => {};

/**
 * Development-only error logger (always logs errors in production too)
 * @param {...any} args - Arguments to log
 */
export const error = console.error.bind(console, '[ERROR]');

/**
 * Development-only debug logger
 * @param {...any} args - Arguments to log
 */
export const debug = isDev ? console.debug.bind(console, '[DEBUG]') : () => {};

export default { log, warn, error, debug, isDev };
