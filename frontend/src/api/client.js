/**
 * src/api/client.js
 *
 * Centralized HTTP Fetch client for the School Management System backend.
 * Features:
 * - Base URL configuration (VITE_API_BASE_URL)
 * - Automatic credentials: 'include' for HttpOnly refresh cookie exchange
 * - In-memory JWT access-token injection
 * - Single-flight concurrent 401 refresh queue & retry (max 1 retry)
 * - Infinite refresh loop prevention
 */

import { getAccessToken, setAccessToken, clearAccessToken } from '../services/tokenService.js';

let refreshPromise = null;

export class ApiError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Returns configured API base URL.
 * @returns {string}
 */
export const getApiBaseUrl = () => {
  return import.meta.env.VITE_API_BASE_URL || '';
};

/**
 * Executes token refresh via backend /api/v1/auth/refresh.
 * Single-flight: only one refresh request runs at a time.
 * Returns the raw JSON response object from backend.
 * @returns {Promise<any>} Response object containing new accessToken & user
 */
export const refreshTokenSingleFlight = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const baseUrl = getApiBaseUrl();
      const endpoint = '/api/v1/auth/refresh';
      const refreshUrl = endpoint.startsWith('http')
        ? endpoint
        : baseUrl
        ? `${baseUrl}${endpoint}`
        : typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}${endpoint}`
        : endpoint;

      try {
        const res = await fetch(refreshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new ApiError(
            errData.error?.message || 'Session expired. Please log in again.',
            res.status,
            errData.error?.code || 'REFRESH_FAILED'
          );
        }

        const data = await res.json();
        const newAccessToken = data.data?.accessToken;
        if (!newAccessToken) {
          throw new ApiError('No access token returned from refresh', 500, 'INVALID_REFRESH_RESPONSE');
        }

        setAccessToken(newAccessToken);
        return data;
      } catch (err) {
        clearAccessToken();
        throw err;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
};

/**
 * Main HTTP request function.
 *
 * @param {string} endpoint - Relative path (e.g. '/api/v1/auth/me') or full URL
 * @param {Object} [options] - Standard Fetch options
 * @returns {Promise<any>} Parsed JSON response body
 */
export const apiClient = async (endpoint, options = {}) => {
  const baseUrl = getApiBaseUrl();
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  if (fullUrl.includes('/api/v1/auth/refresh') && options.method === 'POST') {
    return refreshTokenSingleFlight();
  }

  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Inject in-memory access token if available
  const currentToken = getAccessToken();
  if (currentToken && !defaultHeaders['Authorization']) {
    defaultHeaders['Authorization'] = `Bearer ${currentToken}`;
  }

  const fetchOptions = {
    ...options,
    headers: defaultHeaders,
    credentials: options.credentials || 'include'
  };

  // Endpoints exempt from automatic 401 refresh handling (auth endpoints themselves)
  const isAuthEndpoint =
    fullUrl.includes('/api/v1/auth/login') ||
    fullUrl.includes('/api/v1/auth/admission-login') ||
    fullUrl.includes('/api/v1/auth/firebase-exchange') ||
    fullUrl.includes('/api/v1/auth/refresh') ||
    fullUrl.includes('/api/v1/auth/logout') ||
    fullUrl.includes('/api/v1/auth/password-reset') ||
    fullUrl.includes('/api/v1/auth/password-setup');

  let response;
  try {
    response = await fetch(fullUrl, fetchOptions);
  } catch (networkErr) {
    throw new ApiError(
      networkErr.message || 'Network request failed',
      0,
      'NETWORK_ERROR'
    );
  }

  // Handle 401 Unauthorized with Single-Flight Refresh
  if (response.status === 401 && !options._retry && !isAuthEndpoint) {
    try {
      const refreshData = await refreshTokenSingleFlight();
      const newAccessToken = refreshData?.data?.accessToken;
      
      // Retry original request exactly once with new access token
      const retryHeaders = {
        ...fetchOptions.headers,
        'Authorization': `Bearer ${newAccessToken}`
      };

      const retryResponse = await fetch(fullUrl, {
        ...fetchOptions,
        headers: retryHeaders,
        _retry: true
      });

      if (!retryResponse.ok) {
        const errorBody = await retryResponse.json().catch(() => ({}));
        throw new ApiError(
          errorBody.error?.message || retryResponse.statusText,
          retryResponse.status,
          errorBody.error?.code || 'UNAUTHORIZED',
          errorBody.error?.details || null
        );
      }

      if (retryResponse.status === 204) {
        return null;
      }

      return retryResponse.json();
    } catch (refreshErr) {
      clearAccessToken();
      throw refreshErr;
    }
  }

  // Handle other error statuses
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      errorBody.error?.message || response.statusText || 'Request failed',
      response.status,
      errorBody.error?.code || 'REQUEST_FAILED',
      errorBody.error?.details || null
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

export default apiClient;
