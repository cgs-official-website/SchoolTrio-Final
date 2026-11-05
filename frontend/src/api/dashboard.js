import { apiClient } from './client.js';

/**
 * Fetches intelligent, role-tailored daily AI briefing from the backend.
 * Calls POST /api/v1/dashboard/ai-briefing.
 *
 * @param {Object} context - Optional snapshot context { role, userName, permittedModules, stats }
 * @returns {Promise<{
 *   success: boolean,
 *   data: {
 *     greeting: string,
 *     headline: string,
 *     highlights: string[],
 *     quickActions: Array<{ label: string, path: string, type: string }>,
 *     isAiGenerated: boolean,
 *     generatedAt: string
 *   }
 * }>}
 */
export async function getAiBriefing(context = {}) {
  return apiClient('/api/v1/dashboard/ai-briefing', {
    method: 'POST',
    body: JSON.stringify(context)
  });
}

