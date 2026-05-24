const axios = require('axios');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {{ messages: { role: string, content: string }[], systemPrompt: string }} opts
 * @returns {Promise<{ text: string, model: string }>}
 */
async function completeChat({ messages, systemPrompt }) {
  if (process.env.CHAT_MOCK_RESPONSES === 'true') {
    const delay = Number(process.env.CHAT_MOCK_DELAY_MS) || 300;
    if (delay > 0) await sleep(delay);
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const hint = lastUser ? String(lastUser.content).slice(0, 80) : '';
    return {
      text: `Тестовый ответ консультанта (mock).${hint ? ` Запрос: «${hint}»` : ''}`,
      model: 'mock',
    };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const err = new Error('OPENROUTER_API_KEY не задан на сервере');
    err.statusCode = 503;
    throw err;
  }

  const model = process.env.OPENROUTER_MODEL || 'openrouter/free';
  const referer =
    process.env.OPENROUTER_HTTP_REFERER ||
    process.env.CORS_ORIGIN ||
    'http://localhost:5173';

  const body = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: (() => {
      const t = Number(process.env.OPENROUTER_TEMPERATURE);
      return Number.isFinite(t) ? t : 0.4;
    })(),
    max_tokens: Math.min(Number(process.env.OPENROUTER_MAX_TOKENS) || 900, 4096),
  };

  const maxAttempts = Number(process.env.OPENROUTER_RETRY_ATTEMPTS) || 3;
  const baseDelayMs = Number(process.env.OPENROUTER_RETRY_DELAY_MS) || 2500;
  const timeout = Number(process.env.OPENROUTER_TIMEOUT_MS) || 90000;

  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await axios.post(OPENROUTER_URL, body, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-OpenRouter-Title': process.env.OPENROUTER_APP_TITLE || 'Waycess',
        },
        timeout,
        validateStatus: () => true,
      });

      if (res.status === 200) {
        const text = res.data?.choices?.[0]?.message?.content;
        if (text == null || String(text).trim() === '') {
          const err = new Error('Пустой ответ модели');
          err.statusCode = 502;
          throw err;
        }
        return {
          text: String(text).trim(),
          model: res.data?.model || model,
        };
      }

      if (res.status === 429 && attempt < maxAttempts) {
        await sleep(baseDelayMs * attempt);
        continue;
      }

      const msg =
        res.data?.error?.message ||
        res.data?.error ||
        `OpenRouter HTTP ${res.status}`;
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      err.statusCode = res.status === 429 ? 429 : 502;
      throw err;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status === 429 && attempt < maxAttempts) {
        await sleep(baseDelayMs * attempt);
        continue;
      }
      if (err.statusCode && !axios.isAxiosError(err)) throw err;
      if (axios.isAxiosError(err) && err.response?.data) {
        const msg =
          err.response.data?.error?.message ||
          err.response.data?.error ||
          err.message;
        const e = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        e.statusCode = status === 429 ? 429 : 502;
        throw e;
      }
      throw err;
    }
  }

  if (lastErr?.statusCode === 429 || lastErr?.response?.status === 429) {
    const e = new Error('Сервис консультанта временно перегружен. Попробуйте через минуту.');
    e.statusCode = 429;
    throw e;
  }
  throw lastErr;
}

module.exports = { completeChat };
