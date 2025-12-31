const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Admin, RefreshToken } = require('../models');
const { JWT_SECRET } = require('../config/jwt');
const rateLimit = require('express-rate-limit');

// Rate limiting для защиты от брутфорса
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // максимум 5 попыток за 15 минут
  message: {
    error: 'Слишком много попыток входа. Попробуйте позже.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Генерация refresh token
const generateRefreshToken = () => {
  return require('crypto').randomBytes(64).toString('hex');
};

// POST /api/auth/login - Авторизация
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { login, password } = req.body;

    // Валидация
    if (!login || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    // Поиск админа
    const admin = await Admin.findOne({ where: { login } });

    if (!admin) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Проверка пароля
    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Генерация access token (15 минут)
    const accessToken = jwt.sign(
      {
        id: admin.id,
        login: admin.login,
        role: admin.role,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Генерация refresh token (30 дней)
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Удаляем старые refresh токены этого админа
    await RefreshToken.destroy({ where: { adminId: admin.id } });

    // Сохраняем новый refresh token в БД
    await RefreshToken.create({
      adminId: admin.id,
      token: refreshToken,
      expiresAt,
    });

    // Устанавливаем refresh token в httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
    });

    res.json({
      message: 'Авторизация успешна',
      accessToken,
      admin: {
        id: admin.id,
        login: admin.login,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    res.status(500).json({ error: 'Ошибка сервера при авторизации' });
  }
});

// POST /api/auth/refresh - Обновление access token
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh токен отсутствует' });
    }

    // Проверяем refresh token в БД
    const tokenRecord = await RefreshToken.findOne({
      where: { token: refreshToken },
      include: [{ model: Admin, as: 'admin' }],
    });

    if (!tokenRecord || !tokenRecord.admin) {
      return res.status(401).json({ error: 'Refresh токен невалиден' });
    }

    // Проверяем срок действия
    if (new Date() > tokenRecord.expiresAt) {
      await tokenRecord.destroy();
      return res.status(401).json({ error: 'Refresh токен истек' });
    }

    // Генерируем новый access token
    const newAccessToken = jwt.sign(
      {
        id: tokenRecord.admin.id,
        login: tokenRecord.admin.login,
        role: tokenRecord.admin.role,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      accessToken: newAccessToken,
      admin: {
        id: tokenRecord.admin.id,
        login: tokenRecord.admin.login,
        role: tokenRecord.admin.role,
      },
    });
  } catch (error) {
    console.error('Ошибка обновления токена:', error);
    res.status(500).json({ error: 'Ошибка сервера при обновлении токена' });
  }
});

// POST /api/auth/logout - Выход
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      // Удаляем refresh token из БД
      await RefreshToken.destroy({ where: { token: refreshToken } });
    }

    // Очищаем cookie
    res.clearCookie('refreshToken');

    res.json({ message: 'Выход выполнен успешно' });
  } catch (error) {
    console.error('Ошибка выхода:', error);
    res.status(500).json({ error: 'Ошибка сервера при выходе' });
  }
});

module.exports = router;

