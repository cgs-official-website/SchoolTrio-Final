import { HTTP_STATUS, ERROR_CODES } from '../config/constants.js';

/**
 * Express middleware enforcing HTTP request-level timeout behavior.
 * Prevents API requests from hanging indefinitely when backend or database I/O stalls.
 *
 * @param {number} [timeoutMs=30000] - Request timeout in milliseconds (default 30 seconds)
 */
export const requestTimeoutMiddleware = (timeoutMs = 30000) => {
  return (req, res, next) => {
    // Allow bypassing timeout during standard unit tests unless explicitly enabled
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-timeout']) {
      return next();
    }

    const timer = setTimeout(() => {
      if (!res.headersSent) {
        req.timedOut = true;
        const responsePayload = {
          success: false,
          error: {
            code: ERROR_CODES.GATEWAY_TIMEOUT || 'GATEWAY_TIMEOUT',
            message: 'Request processing timed out',
            details: null,
            requestId: req.id || null,
            timestamp: new Date().toISOString()
          }
        };
        res.status(HTTP_STATUS.GATEWAY_TIMEOUT || 504).json(responsePayload);
      }
    }, timeoutMs);

    if (timer.unref) {
      timer.unref();
    }

    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);

    next();
  };
};
