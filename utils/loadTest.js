/** Заголовок k6 и других нагрузочных прогонов — включает упрощённый чат без OpenRouter */
const LOAD_TEST_HEADER = 'x-load-test';

/** Имитация задержки ответа LLM при нагрузочном тесте (мс) */
const LOAD_TEST_CHAT_DELAY_MS = 3000;

function isLoadTestRequest(req) {
  const h = req.headers[LOAD_TEST_HEADER];
  if (h === '1' || h === 'true') return true;
  const sid = req.body?.clientSessionId;
  return typeof sid === 'string' && sid.startsWith('k6-');
}

module.exports = {
  LOAD_TEST_HEADER,
  LOAD_TEST_CHAT_DELAY_MS,
  isLoadTestRequest,
};
