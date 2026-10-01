import { logger } from '../utils/logger.js';
import { AppError } from '../utils/app-error.js';

/**
 * OpenRouter AI Client Service
 * Calls OpenRouter chat completion API with strict JSON structuring.
 */
export async function generateStructuredJson({ prompt, systemPrompt, model = null }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AppError('OpenRouter API key is not configured on the server.', 500, 'OPENROUTER_CONFIG_ERROR');
  }

  const selectedModel = model || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://schooltrio.edu',
        'X-Title': 'SchoolTrio Report Card AI'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, body: errorText }, 'OpenRouter API responded with an error');
      throw new AppError(`OpenRouter AI error (${response.status}): ${errorText}`, response.status, 'OPENROUTER_API_ERROR');
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new AppError('OpenRouter returned an empty response.', 502, 'OPENROUTER_EMPTY_RESPONSE');
    }

    // Robust JSON extraction
    const extractJsonString = (str) => {
      // First, try matching inside markdown code fence ```json ... ``` or ``` ... ```
      const match = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (match && match[1]) {
        return match[1].trim();
      }
      // Second, try matching first { to last }
      const firstBrace = str.indexOf('{');
      const lastBrace = str.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return str.substring(firstBrace, lastBrace + 1).trim();
      }
      return str.trim();
    };

    const targetJsonStr = extractJsonString(rawContent);

    try {
      return JSON.parse(targetJsonStr);
    } catch (_parseErr) {
      try {
        // Strip trailing single-line comments // ... and multi-line comments /* ... */
        let sanitized = targetJsonStr
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,\s*([}\]])/g, '$1') // remove trailing commas
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":'); // ensure quotes around keys
        return JSON.parse(sanitized);
      } catch (finalErr) {
        logger.error({ rawContent, parseError: finalErr.message }, 'Failed to parse JSON from OpenRouter');
        throw new AppError(`Failed to parse AI response as JSON: ${finalErr.message}`, 502, 'OPENROUTER_PARSE_ERROR');
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error({ error: error.message }, 'Failed to communicate with OpenRouter');
    throw new AppError(`Failed to contact OpenRouter AI: ${error.message}`, 502, 'OPENROUTER_NETWORK_ERROR');
  }
}
