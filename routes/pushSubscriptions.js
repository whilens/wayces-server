const express = require('express');
const router = express.Router();
const { PushSubscription } = require('../models');
const { authenticateUser } = require('../middleware/userAuth');

// POST /api/push-subscriptions - Сохранить push-подписку
// Подписка доступна как для авторизованных, так и для неавторизованных пользователей
router.post('/', async (req, res) => {
  try {
    // Пытаемся получить пользователя, если есть токен
    let userId = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../config/jwt');
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type === 'user') {
          const { User } = require('../models');
          const user = await User.findByPk(decoded.id);
          if (user && user.isActive) {
            userId = user.id;
          }
        }
      }
    } catch (error) {
      // Игнорируем ошибки авторизации - подписка доступна и без неё
    }

    const { endpoint, keys, userAgent } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Необходимы endpoint и keys (p256dh, auth)' });
    }

    // Проверяем, существует ли уже такая подписка
    const existing = await PushSubscription.findOne({
      where: { endpoint },
    });

    if (existing) {
      // Обновляем существующую подписку
      existing.userId = userId;
      existing.keys = keys;
      existing.userAgent = userAgent || req.headers['user-agent'];
      await existing.save();
      return res.json({ message: 'Подписка обновлена', subscription: existing });
    }

    // Создаем новую подписку
    const subscription = await PushSubscription.create({
      userId,
      endpoint,
      keys,
      userAgent: userAgent || req.headers['user-agent'],
    });

    res.status(201).json({ message: 'Подписка сохранена', subscription });
  } catch (error) {
    console.error('Ошибка сохранения push-подписки:', error);
    res.status(500).json({ error: 'Ошибка сохранения подписки' });
  }
});

// GET /api/push-subscriptions - Получить все подписки (для админа)
router.get('/', authenticateUser, async (req, res) => {
  try {
    // Пока возвращаем только подписки текущего пользователя
    // В будущем можно добавить проверку на админа
    const userId = req.user?.id;
    
    if (!userId) {
      return res.json({ subscriptions: [] });
    }

    const subscriptions = await PushSubscription.findAll({
      where: { userId },
    });

    res.json({ subscriptions });
  } catch (error) {
    console.error('Ошибка получения подписок:', error);
    res.status(500).json({ error: 'Ошибка получения подписок' });
  }
});

// GET /api/push-subscriptions/status - Получить статус подписки текущего пользователя
router.get('/status', async (req, res) => {
  try {
    // Пытаемся получить пользователя, если есть токен
    let userId = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../config/jwt');
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type === 'user') {
          const { User } = require('../models');
          const user = await User.findByPk(decoded.id);
          if (user && user.isActive) {
            userId = user.id;
          }
        }
      }
    } catch (error) {
      // Игнорируем ошибки авторизации
    }

    // Если пользователь авторизован, проверяем его подписки
    if (userId) {
      const subscriptions = await PushSubscription.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']], // Сортируем по дате создания (самая свежая первая)
      });
      return res.json({ isSubscribed: subscriptions.length > 0, subscriptions });
    }

    // Если не авторизован, возвращаем false
    res.json({ isSubscribed: false, subscriptions: [] });
  } catch (error) {
    console.error('Ошибка получения статуса подписки:', error);
    res.status(500).json({ error: 'Ошибка получения статуса' });
  }
});

// POST /api/push-subscriptions/link - Привязать существующую подписку к пользователю
router.post('/link', async (req, res) => {
  try {
    // Пытаемся получить пользователя
    let userId = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../config/jwt');
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type === 'user') {
          const { User } = require('../models');
          const user = await User.findByPk(decoded.id);
          if (user && user.isActive) {
            userId = user.id;
          }
        }
      }
    } catch (error) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    // Получаем endpoint из запроса (если есть активная подписка)
    const { endpoint } = req.body;

    if (endpoint) {
      // Ищем подписку по endpoint (самую свежую, если их несколько)
      const subscription = await PushSubscription.findOne({
        where: { endpoint },
        order: [['createdAt', 'DESC']],
      });

      if (subscription) {
        // Если подписка уже привязана к другому пользователю, не меняем
        // Если подписка без userId или привязана к текущему пользователю - обновляем
        if (subscription.userId === null || subscription.userId === userId) {
          subscription.userId = userId;
          await subscription.save();
          return res.json({ message: 'Подписка привязана', subscription });
        }
      }
    }

    // Если endpoint не передан или не найден, ищем самую свежую подписку без userId
    // Это может быть полезно, если endpoint изменился или не был передан
    const anonymousSubscription = await PushSubscription.findOne({
      where: { userId: null },
      order: [['createdAt', 'DESC']],
    });

    if (anonymousSubscription) {
      anonymousSubscription.userId = userId;
      await anonymousSubscription.save();
      return res.json({ message: 'Подписка привязана', subscription: anonymousSubscription });
    }

    res.json({ message: 'Нет подписок для привязки' });
  } catch (error) {
    console.error('Ошибка привязки подписки:', error);
    res.status(500).json({ error: 'Ошибка привязки подписки' });
  }
});

// GET /api/push-subscriptions/vapid-public-key - Получить VAPID public key
router.get('/vapid-public-key', async (req, res) => {
  try {
    const { vapidPublicKey } = require('../utils/pushNotifications');
    if (!vapidPublicKey) {
      return res.status(503).json({ error: 'VAPID ключи не настроены' });
    }
    res.json({ publicKey: vapidPublicKey });
  } catch (error) {
    console.error('Ошибка получения VAPID ключа:', error);
    res.status(500).json({ error: 'Ошибка получения ключа' });
  }
});

// DELETE /api/push-subscriptions/:id - Удалить подписку
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id);
    const userId = req.user?.id;

    const subscription = await PushSubscription.findByPk(subscriptionId);

    if (!subscription) {
      return res.status(404).json({ error: 'Подписка не найдена' });
    }

    // Проверяем, что подписка принадлежит пользователю
    if (subscription.userId !== userId) {
      return res.status(403).json({ error: 'Нет доступа к этой подписке' });
    }

    await subscription.destroy();
    res.json({ message: 'Подписка удалена' });
  } catch (error) {
    console.error('Ошибка удаления подписки:', error);
    res.status(500).json({ error: 'Ошибка удаления подписки' });
  }
});

module.exports = router;

