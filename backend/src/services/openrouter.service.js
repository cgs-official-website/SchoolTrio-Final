import { logger } from '../utils/logger.js';
import { AppError } from '../utils/app-error.js';

/**
 * Extracts and cleans JSON string from AI responses.
 */
function extractJsonString(str) {
  if (!str) return '{}';
  const match = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return str.substring(firstBrace, lastBrace + 1).trim();
  }
  return str.trim();
}

/**
 * Parses JSON safely with fallback cleaning for trailing commas and unquoted keys.
 */
function parseJsonSafely(rawContent) {
  const targetJsonStr = extractJsonString(rawContent);
  try {
    return JSON.parse(targetJsonStr);
  } catch (_parseErr) {
    try {
      const sanitized = targetJsonStr
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
      return JSON.parse(sanitized);
    } catch (finalErr) {
      logger.error({ rawContent, parseError: finalErr.message }, 'Failed to parse JSON from AI model');
      throw new AppError(`Failed to parse AI response as JSON: ${finalErr.message}`, 502, 'AI_PARSE_ERROR');
    }
  }
}

/**
 * Directly invokes Google Gemini Generative Language API.
 */
async function callGeminiDirect({ apiKey, prompt, systemPrompt, model = null }) {
  const candidateModels = [
    model || 'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest'
  ];

  let lastError = null;
  for (const m of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 2500
        }
      };
      if (systemPrompt) {
        payload.systemInstruction = {
          parts: [{ text: systemPrompt }]
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(`Gemini API (${m}) responded with status ${response.status}: ${errorText}`);
        logger.warn({ model: m, status: response.status, body: errorText }, 'Gemini model attempt failed, trying fallback model');
        continue;
      }

      const data = await response.json();
      const rawContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawContent) {
        lastError = new Error(`Gemini model ${m} returned empty response`);
        continue;
      }

      logger.info({ model: m }, 'Direct Google Gemini generation succeeded');
      return parseJsonSafely(rawContent);
    } catch (err) {
      lastError = err;
      logger.warn({ model: m, error: err.message }, 'Gemini model attempt caught exception');
    }
  }

  throw lastError || new Error('All Gemini candidate models failed');
}

/**
 * Invokes OpenRouter Chat Completions API.
 */
async function callOpenRouter({ apiKey, prompt, systemPrompt, model = null }) {
  const selectedModel = model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

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

  return parseJsonSafely(rawContent);
}

/**
 * Universal AI Structured JSON Service
 * Priority:
 * 1. Direct Google Gemini API (if GEMINI_API_KEY is configured)
 * 2. OpenRouter API (if OPENROUTER_API_KEY is configured)
 */
export async function generateStructuredJson({ prompt, systemPrompt, model = null }) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  if (geminiApiKey) {
    try {
      return await callGeminiDirect({ apiKey: geminiApiKey, prompt, systemPrompt, model });
    } catch (geminiErr) {
      logger.warn({ error: geminiErr.message }, 'Direct Gemini failed; attempting OpenRouter fallback if available');
      if (!openRouterApiKey) {
        throw new AppError(`Google Gemini AI failed: ${geminiErr.message}`, 502, 'GEMINI_API_ERROR');
      }
    }
  }

  if (openRouterApiKey) {
    try {
      return await callOpenRouter({ apiKey: openRouterApiKey, prompt, systemPrompt, model });
    } catch (openRouterErr) {
      if (openRouterErr instanceof AppError) throw openRouterErr;
      logger.error({ error: openRouterErr.message }, 'Failed to communicate with OpenRouter');
      throw new AppError(`Failed to contact OpenRouter AI: ${openRouterErr.message}`, 502, 'OPENROUTER_NETWORK_ERROR');
    }
  }

  throw new AppError('No AI API key configured on server. Please set GEMINI_API_KEY or OPENROUTER_API_KEY in .env.', 500, 'AI_CONFIG_ERROR');
}
