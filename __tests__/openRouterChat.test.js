jest.mock('axios');

const axios = require('axios');
const { completeChat } = require('../services/openRouterChat');

describe('completeChat', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_MODEL: 'test/model',
      OPENROUTER_RETRY_ATTEMPTS: '1',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('бросает 503, если API-ключ не задан', async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      completeChat({ messages: [], systemPrompt: 'test' })
    ).rejects.toMatchObject({
      message: 'OPENROUTER_API_KEY не задан на сервере',
      statusCode: 503,
    });
  });

  it('возвращает текст и модель при успешном ответе', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        model: 'test/model',
        choices: [{ message: { content: '  Здравствуйте!  ' } }],
      },
    });

    const result = await completeChat({
      messages: [{ role: 'user', content: 'Привет' }],
      systemPrompt: 'Ты консультант',
    });

    expect(result).toEqual({
      text: 'Здравствуйте!',
      model: 'test/model',
    });
    expect(axios.post).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        model: 'test/model',
        messages: [
          { role: 'system', content: 'Ты консультант' },
          { role: 'user', content: 'Привет' },
        ],
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      })
    );
  });

  it('бросает 502 при пустом ответе модели', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: { choices: [{ message: { content: '   ' } }] },
    });

    await expect(
      completeChat({ messages: [], systemPrompt: 'test' })
    ).rejects.toMatchObject({
      message: 'Пустой ответ модели',
      statusCode: 502,
    });
  });

  it('пробрасывает ошибку OpenRouter с нужным statusCode', async () => {
    axios.post.mockResolvedValue({
      status: 502,
      data: { error: { message: 'Upstream error' } },
    });

    await expect(
      completeChat({ messages: [], systemPrompt: 'test' })
    ).rejects.toMatchObject({
      message: 'Upstream error',
      statusCode: 502,
    });
  });
});
