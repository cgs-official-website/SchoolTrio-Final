import { logger } from '../utils/logger.js';
import { AppError } from '../utils/app-error.js';

/**
 * Google Gemini AI Client Service
 * Calls official Google Gemini REST API with strict JSON structuring and resilient fallbacks.
 */
export async function generateGeminiContent({ prompt, systemInstruction = null, model = null }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AppError('Gemini API key is not configured on the server.', 500, 'GEMINI_CONFIG_ERROR');
  }

  const selectedModel = model || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

  const bodyPayload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1000,
      responseMimeType: 'application/json'
    }
  };

  if (systemInstruction) {
    bodyPayload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  try {
    // 8-second timeout controller so API never hangs user requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn({ status: response.status, body: errorText }, 'Gemini API responded with an error, attempting fallback model');
      
      // Fallback model if primary model fails
      if (selectedModel !== 'gemini-flash-latest') {
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
        const fallbackRes = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const text = fallbackData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return JSON.parse(text);
        }
      }
      throw new AppError(`Gemini AI error (${response.status}): ${errorText}`, response.status, 'GEMINI_API_ERROR');
    }

    const data = await response.json();
    const rawContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      throw new AppError('Gemini returned an empty response.', 502, 'GEMINI_EMPTY_RESPONSE');
    }

    return JSON.parse(rawContent);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to communicate with Gemini API');
    throw error;
  }
}

