import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';
import { databaseConfig } from '../config/database.config.js';
import { createTenantExtension } from './tenant-extension.js';

/**
 * AsyncLocalStorage container for tenant context propagation across asynchronous execution.
 */
const tenantStorage = new AsyncLocalStorage();

/**
 * Runs a function within a specified tenant context.
 * @param {Object} context - Context object containing { schoolId, userId, role, bypassTenant }
 * @param {Function} callback - Asynchronous function to execute
 */
export const runWithTenantContext = (context, callback) => {
  return tenantStorage.run(context, callback);
};

/**
 * Retrieves the current tenant context from the async execution chain.
 * @returns {Object|undefined} Current tenant context
 */
export const getTenantContext = () => {
  return tenantStorage.getStore();
};

/**
 * Base PrismaClient instance configured with database connection parameters.
 */
export const basePrisma = new PrismaClient({
  datasourceUrl: databaseConfig.url,
  log: databaseConfig.logLevels
});

/**
 * Tenant-extended Prisma client enforcing strict multi-tenant isolation.
 */
export const prisma = basePrisma.$extends(createTenantExtension(getTenantContext));

/**
 * Gracefully disconnects Prisma client.
 */
export const disconnectPrisma = async () => {
  try {
    await basePrisma.$disconnect();
  } catch (error) {
    console.error('Error disconnecting Prisma client:', error);
  }
};
