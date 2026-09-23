import crypto from 'node:crypto';

/**
 * Request ID Correlation Middleware
 * Extracts X-Request-Id from incoming request headers or generates a new UUID v4.
 * Attaches ID to req.id and sets X-Request-Id response header.
 */
export const requestIdMiddleware = (req, res, next) => {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim()
    ? incomingId.trim()
    : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};
