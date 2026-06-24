const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User, UserRefreshToken } = require('../models');
const { JWT_SECRET } = require('../config/jwt');
const rateLimit = require('express-rate-limit');

// Rate limiting
const codeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 3, // максимум 3 запроса за минуту
  message: { error: 'Слишком много запросов. Подождите минуту.' },
});

// Временное хранилище кодов (в продакшене использовать Redis или БД)
const pendingCodes = new Map();

// Периодическая очистка устаревших кодов (каждые 5 минут)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [phone, data] of pendingCodes.entries()) {
    if (data.expiresAt < now) {
      pendingCodes.delete(phone);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`Очищено ${cleaned} устаревших кодов верификации`);
  }
}, 5 * 60 * 1000); // Каждые 5 минут

// Генерация refresh token
const generateRefreshToken = () => {
  return require('crypto').randomBytes(64).toString('hex');
};

// Нормализация телефона
const normalizePhone = (phone) => {
  return phone.replace(/\D/g, '');
};

// POST /api/user-auth/send-code - Отправить код на телефон
router.post('/send-code', codeLimiter, async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Номер телефона обязателен' });
    }

    const normalizedPhone = normalizePhone(phone);
    
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return res.status(400).json({ error: 'Неверный формат номера телефона' });
    }

    // Имитация отправки SMS (в продакшене подключить SMS-шлюз)
    // Код всегда 0000 для тестирования
    const code = '0000';
    
    // Сохраняем код на 5 минут
    // Автоматическая очистка происходит через setInterval выше
    pendingCodes.set(normalizedPhone, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.json({ 
      message: 'Код отправлен',
      // В продакшене не возвращать код!
      hint: 'Для тестирования используйте код: 0000',
    });
  } catch (error) {
    console.error('Ошибка отправки кода:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/user-auth/verify-code - Проверить код
router.post('/verify-code', async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: 'Телефон и код обязательны' });
    }

    const normalizedPhone = normalizePhone(phone);
    const stored = pendingCodes.get(normalizedPhone);

    // Проверяем код (0000 всегда работает для тестирования)
    if (code !== '0000' && (!stored || stored.code !== code)) {
      return res.status(400).json({ error: 'Неверный код' });
    }

    if (stored && stored.expiresAt < Date.now()) {
      pendingCodes.delete(normalizedPhone);
      return res.status(400).json({ error: 'Код истек' });
    }

    // Удаляем использованный код
    pendingCodes.delete(normalizedPhone);

    // Проверяем, есть ли пользователь
    const user = await User.findOne({ where: { phone: normalizedPhone } });

    if (user) {
      // Пользователь существует - авторизуем
      const tokens = await generateTokens(user);
      
      res.cookie('userRefreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        status: 'authenticated',
        accessToken: tokens.accessToken,
        user: {
          id: user.id,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    }

    // Пользователя нет - нужна регистрация
    // Создаем временный токен для регистрации
    const registrationToken = jwt.sign(
      { phone: normalizedPhone, purpose: 'registration' },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({
      status: 'needs_registration',
      registrationToken,
      phone: normalizedPhone,
    });
  } catch (error) {
    console.error('Ошибка проверки кода:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/user-auth/auto-register - Автоматическая регистрация при оформлении заказа
router.post('/auto-register', async (req, res) => {
  try {
    const { phone, firstName, lastName, email } = req.body;

    if (!phone || !firstName || !lastName) {
      return res.status(400).json({ error: 'Телефон, имя и фамилия обязательны' });
    }

    const normalizedPhone = normalizePhone(phone);
    
    // Проверяем, не существует ли уже пользователь
    let user = await User.findOne({ where: { phone: normalizedPhone } });
    
    if (!user) {
      // Создаем пользователя
      user = await User.create({
        phone: normalizedPhone,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email ? email.trim() : null,
      });
    } else {
      // Обновляем данные, если они изменились
      const updateData = {};
      if (firstName.trim() !== user.firstName) updateData.firstName = firstName.trim();
      if (lastName.trim() !== user.lastName) updateData.lastName = lastName.trim();
      if (email && email.trim() !== user.email) updateData.email = email.trim();
      
      if (Object.keys(updateData).length > 0) {
        await user.update(updateData);
      }
    }

    // Генерируем токены
    const tokens = await generateTokens(user);

    res.cookie('userRefreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Пользователь зарегистрирован и авторизован',
      accessToken: tokens.accessToken,
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email || '',
      },
    });
  } catch (error) {
    console.error('Ошибка автоматической регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера при регистрации' });
  }
});

// POST /api/user-auth/register - Регистрация
router.post('/register', async (req, res) => {
  try {
    const { registrationToken, firstName, lastName } = req.body;

    if (!registrationToken || !firstName || !lastName) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    if (firstName.length < 2 || firstName.length > 100) {
      return res.status(400).json({ error: 'Имя должно содержать от 2 до 100 символов' });
    }

    if (lastName.length < 2 || lastName.length > 100) {
      return res.status(400).json({ error: 'Фамилия должна содержать от 2 до 100 символов' });
    }

    // Проверяем токен регистрации
    let decoded;
    try {
      decoded = jwt.verify(registrationToken, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ error: 'Токен регистрации истек или невалиден' });
    }

    if (decoded.purpose !== 'registration') {
      return res.status(400).json({ error: 'Невалидный токен' });
    }

    // Проверяем, не существует ли уже пользователь
    const existingUser = await User.findOne({ where: { phone: decoded.phone } });
    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь уже зарегистрирован' });
    }

    // Создаем пользователя
    const user = await User.create({
      phone: decoded.phone,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });

    // Генерируем токены
    const tokens = await generateTokens(user);

    res.cookie('userRefreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Регистрация успешна',
      accessToken: tokens.accessToken,
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера при регистрации' });
  }
});

// POST /api/user-auth/refresh - Обновление токена
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.userRefreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Токен отсутствует' });
    }

    const tokenRecord = await UserRefreshToken.findOne({
      where: { token: refreshToken },
      include: [{ model: User, as: 'user' }],
    });

    if (!tokenRecord || !tokenRecord.user) {
      return res.status(401).json({ error: 'Токен невалиден' });
    }

    if (new Date() > tokenRecord.expiresAt) {
      await tokenRecord.destroy();
      return res.status(401).json({ error: 'Токен истек' });
    }

    if (!tokenRecord.user.isActive) {
      return res.status(401).json({ error: 'Аккаунт заблокирован' });
    }

    const newAccessToken = jwt.sign(
      {
        id: tokenRecord.user.id,
        phone: tokenRecord.user.phone,
        type: 'user',
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      accessToken: newAccessToken,
      user: {
        id: tokenRecord.user.id,
        phone: tokenRecord.user.phone,
        firstName: tokenRecord.user.firstName,
        lastName: tokenRecord.user.lastName,
      },
    });
  } catch (error) {
    console.error('Ошибка обновления токена:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/user-auth/logout - Выход
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.userRefreshToken;

    if (refreshToken) {
      await UserRefreshToken.destroy({ where: { token: refreshToken } });
    }

    res.clearCookie('userRefreshToken');
    res.json({ message: 'Выход выполнен' });
  } catch (error) {
    console.error('Ошибка выхода:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/user-auth/me - Получить текущего пользователя
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Токен отсутствует' });
    }

    const token = authHeader.split(' ')[1];
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Токен невалиден' });
    }

    if (decoded.type !== 'user') {
      return res.status(401).json({ error: 'Невалидный токен' });
    }

    const user = await User.findByPk(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    res.json({
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email || '',
        avatar: user.avatar || null,
      },
    });
  } catch (error) {
    console.error('Ошибка получения пользователя:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вспомогательная функция генерации токенов
async function generateTokens(user) {
  const accessToken = jwt.sign(
    {
      id: user.id,
      phone: user.phone,
      type: 'user',
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = generateRefreshToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  // Удаляем старые токены
  await UserRefreshToken.destroy({ where: { userId: user.id } });

  // Создаем новый
  await UserRefreshToken.create({
    userId: user.id,
    token: refreshToken,
    expiresAt,
  });

  return { accessToken, refreshToken };
}

module.exports = router;

