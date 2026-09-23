import { env } from './env.js';

export const databaseConfig = {
  url: env.DATABASE_URL,
  logLevels: env.isDevelopment ? ['warn', 'error'] : ['error']
};
