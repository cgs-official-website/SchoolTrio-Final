/**
 * tokenService.js
 *
 * In-memory access token storage and subscriber manager.
 * Enforces security invariant: Access JWT is NEVER persisted to localStorage,
 * sessionStorage, IndexedDB, cookies, or logged to console.
 */

let inMemoryAccessToken = null;
const listeners = new Set();

/**
 * Retrieves current in-memory access token.
 * @returns {string|null}
 */
export const getAccessToken = () => {
  return inMemoryAccessToken;
};

/**
 * Sets access token in memory and notifies subscribers.
 * @param {string|null} token - JWT Access token string
 */
export const setAccessToken = (token) => {
  inMemoryAccessToken = token || null;
  listeners.forEach((listener) => {
    try {
      listener(inMemoryAccessToken);
    } catch (err) {
      console.error('[TOKEN SERVICE] Listener error:', err);
    }
  });
};

/**
 * Clears access token from memory and notifies subscribers.
 */
export const clearAccessToken = () => {
  setAccessToken(null);
};

/**
 * Subscribes to token changes.
 * @param {Function} listener - Callback function receiving new token
 * @returns {Function} Unsubscribe function
 */
export const subscribeToToken = (listener) => {
  if (typeof listener === 'function') {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  return () => {};
};

export const tokenService = {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  subscribe: subscribeToToken
};

export default tokenService;
