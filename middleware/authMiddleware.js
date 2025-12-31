const jwt = require('jsonwebtoken');
const { Admin, RefreshToken } = require('../models');
const { JWT_SECRET } = require('../config/jwt');

// Middleware для проверки и автообновления токенов
const authenticateAdmin = async (req, res, next) => {
  try {
    // Получаем access token из заголовка
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    // Получаем refresh token из cookies
    const refreshToken = req.cookies?.refreshToken;

    // Если нет ни одного токена
    if (!accessToken && !refreshToken) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    let decoded = null;
    let tokenExpired = false;

    // Проверяем access token
    if (accessToken) {
      try {
        decoded = jwt.verify(accessToken, JWT_SECRET);
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          tokenExpired = true;
        } else {
          // Токен невалиден
          if (!refreshToken) {
            return res.status(401).json({ error: 'Токен невалиден' });
          }
        }
      }
    }

    // Если access token истек или отсутствует, пытаемся обновить через refresh token
    if (tokenExpired || !decoded) {
      if (!refreshToken) {
        return res.status(401).json({ error: 'Токен истек, требуется повторная авторизация' });
      }

      try {
        // Проверяем refresh token в БД
        const tokenRecord = await RefreshToken.findOne({
          where: { token: refreshToken },
          include: [{ model: Admin, as: 'admin' }],
        });

        if (!tokenRecord || !tokenRecord.admin) {
          return res.status(401).json({ error: 'Refresh токен невалиден' });
        }

        // Проверяем срок действия refresh token
        if (new Date() > tokenRecord.expiresAt) {
          // Удаляем истекший токен
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

        // Устанавливаем новый access token в заголовок ответа
        res.setHeader('X-New-Access-Token', newAccessToken);

        // Устанавливаем decoded для дальнейшего использования
        decoded = {
          id: tokenRecord.admin.id,
          login: tokenRecord.admin.login,
          role: tokenRecord.admin.role,
        };
      } catch (error) {
        console.error('Ошибка обновления токена:', error);
        return res.status(401).json({ error: 'Ошибка обновления токена' });
      }
    }

    // Проверяем роль админа
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    // Добавляем информацию о пользователе в запрос
    req.admin = {
      id: decoded.id,
      login: decoded.login,
      role: decoded.role,
    };

    next();
  } catch (error) {
    console.error('Ошибка аутентификации:', error);
    res.status(500).json({ error: 'Ошибка сервера при аутентификации' });
  }
};

module.exports = { authenticateAdmin };

