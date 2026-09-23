import { prisma } from '../../database/prisma.client.js';

/**
 * Retrieve a platform setting row by unique key.
 *
 * @param {string} key - Unique identifier key
 * @param {Object} [tx] - Optional Prisma client/transaction
 * @returns {Promise<Object|null>}
 */
export async function getPlatformSettingByKey(key, tx = prisma) {
  return tx.platformSetting.findUnique({
    where: { key }
  });
}

/**
 * Upsert a platform setting record.
 *
 * @param {string} key - Unique identifier key
 * @param {Object} data - Arbitrary structured JSON data payload
 * @param {Object} [tx] - Optional Prisma client/transaction
 * @returns {Promise<Object>}
 */
export async function upsertPlatformSetting(key, data, tx = prisma) {
  return tx.platformSetting.upsert({
    where: { key },
    create: {
      key,
      data
    },
    update: {
      data
    }
  });
}

/**
 * Delete a platform setting record by key.
 *
 * @param {string} key - Unique identifier key
 * @param {Object} [tx] - Optional Prisma client/transaction
 * @returns {Promise<Object>}
 */
export async function deletePlatformSettingByKey(key, tx = prisma) {
  return tx.platformSetting.deleteMany({
    where: { key }
  });
}
