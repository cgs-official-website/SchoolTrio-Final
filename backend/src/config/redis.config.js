import { env } from './env.js';

export const redisConfig = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    // Retry up to 5 times with exponential backoff before returning null
    if (times > 5) {
      return null;
    }
    return Math.min(times * 200, 2000);
  },
  connectTimeout: 5000,
  lazyConnect: true
};
