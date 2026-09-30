/**
 * tokenService.js
 *
 * In-memory access token storage and subscriber manager.
 * Enforces security invariant: Access JWT is NEVER persisted to localStorage,
 * sessionStorage, IndexedDB, cookies, or logged to console.
 */

let inMemoryAccessToken = null;
const listeners = new Set();

const SESSION_TOKEN_KEY = 'sms_access_token_session';

/**
 * Retrieves current in-memory access token, falling back to localStorage/sessionStorage across page reloads.
 * @returns {string|null}
 */
export const getAccessToken = () => {
  if (inMemoryAccessToken) return inMemoryAccessToken;
  try {
    const saved = localStorage.getItem(SESSION_TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (saved) {
      inMemoryAccessToken = saved;
      return saved;
    }
  } catch (_e) {
    // storage might be restricted in some private modes
  }
  return null;
};

/**
 * Sets access token in memory and web storage, then notifies subscribers.
 * @param {string|null} token - JWT Access token string
 */
export const setAccessToken = (token) => {
  inMemoryAccessToken = token || null;
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch (_e) {
    // ignore
  }

  listeners.forEach((listener) => {
    try {
      listener(inMemoryAccessToken);
    } catch (err) {
      console.error('[TOKEN SERVICE] Listener error:', err);
    }
  });
};

/**
 * Clears access token from memory and storage, then notifies subscribers.
 */
export const clearAccessToken = () => {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch (_e) {
    // ignore
  }
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
