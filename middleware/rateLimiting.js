const rateLimit = require('express-rate-limit');

/**
 * Общие настройки rate limiting для разных типов эндпоинтов
 */

// Стандартный rate limiter (100 запросов за 15 минут)
const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Строгий rate limiter для критичных операций (10 запросов за 15 минут)
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter для создания отзывов (5 запросов за час)
const reviewCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 5,
  message: { error: 'Слишком много попыток создания отзывов. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter для избранного (50 запросов за 15 минут)
const favoriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 50,
  message: { error: 'Слишком много запросов к избранному. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter для профиля (30 запросов за 15 минут)
const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 30,
  message: { error: 'Слишком много запросов к профилю. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  standardLimiter,
  strictLimiter,
  reviewCreateLimiter,
  favoriteLimiter,
  profileLimiter,
};

