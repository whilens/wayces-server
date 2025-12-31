const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { User, Order, OrderItem, Review, Favorite, OrderCancellation } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/sequelize');
const nodemailer = require('nodemailer');
const { JWT_SECRET } = require('../config/jwt');

// Middleware для проверки авторизации пользователя
const userAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    const token = authHeader.split(' ')[1];
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Токен невалиден или истек' });
    }

    if (decoded.type !== 'user') {
      return res.status(401).json({ error: 'Невалидный токен' });
    }

    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    req.user = user;
    req.userId = decoded.id;
    next();
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Настройка multer для загрузки аватара
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('Создана директория для аватаров:', uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = `avatar-${req.userId}-${uniqueSuffix}${path.extname(file.originalname)}`;
    console.log('Сохранение аватара:', filename, 'Оригинальное имя:', file.originalname);
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Разрешены только изображения (jpeg, jpg, png, webp)'));
  },
});

// GET /api/account/profile - Получить профиль пользователя
router.get('/profile', userAuth, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user.id,
        phone: req.user.phone,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email || '',
        avatar: req.user.avatar || null,
        createdAt: req.user.createdAt,
      },
    });
  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/account/profile - Обновить профиль
router.put('/profile', userAuth, upload.single('avatar'), async (req, res) => {
  try {
    console.log('Обновление профиля. Файл:', req.file);
    console.log('Тело запроса:', req.body);
    
    const { firstName, lastName, email } = req.body;

    const updateData = {};

    if (firstName !== undefined) {
      if (firstName.trim().length < 2 || firstName.trim().length > 100) {
        return res.status(400).json({ error: 'Имя должно содержать от 2 до 100 символов' });
      }
      updateData.firstName = firstName.trim();
    }

    if (lastName !== undefined) {
      if (lastName.trim().length < 2 || lastName.trim().length > 100) {
        return res.status(400).json({ error: 'Фамилия должна содержать от 2 до 100 символов' });
      }
      updateData.lastName = lastName.trim();
    }

    if (email !== undefined) {
      if (email && email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          return res.status(400).json({ error: 'Некорректный email' });
        }
        updateData.email = email.trim();
      } else {
        updateData.email = null;
      }
    }

    // Обработка аватара
    if (req.file) {
      console.log('Загружен файл аватара:', req.file.filename, 'Путь:', req.file.path);
      // Удаляем старый аватар, если есть
      if (req.user.avatar) {
        const oldAvatarPath = path.join(__dirname, '../uploads/avatars', path.basename(req.user.avatar));
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
          console.log('Удален старый аватар:', oldAvatarPath);
        }
      }
      updateData.avatar = `/uploads/avatars/${req.file.filename}`;
      console.log('Новый путь к аватару:', updateData.avatar);
    } else {
      console.log('Файл аватара не получен');
    }

    await req.user.update(updateData);
    
    // Перезагружаем пользователя, чтобы получить обновленные данные
    await req.user.reload();

    console.log('Профиль обновлен. Новый аватар:', req.user.avatar);

    res.json({
      message: 'Профиль обновлен',
      user: {
        id: req.user.id,
        phone: req.user.phone,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email || '',
        avatar: req.user.avatar || null,
      },
    });
  } catch (error) {
    console.error('Ошибка обновления профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/account/orders - Получить заказы пользователя
router.get('/orders', userAuth, async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: { userId: req.userId },
      include: [
        {
          model: OrderItem,
          as: 'items',
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      orders: orders.map(order => ({
        id: order.id,
        firstName: order.firstName,
        lastName: order.lastName,
        phone: order.phone,
        email: order.email,
        city: order.city,
        street: order.street,
        house: order.house,
        apartment: order.apartment,
        comment: order.comment,
        totalPrice: parseFloat(order.totalPrice),
        status: order.status,
        items: order.items.map(item => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          productPrice: parseFloat(item.productPrice),
          productImage: item.productImage,
          quantity: item.quantity,
          variants: item.variants,
          variantString: item.variantString,
        })),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Ошибка получения заказов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/account/orders/:id - Получить заказ по ID
router.get('/orders/:id', userAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const order = await Order.findOne({
      where: {
        id: orderId,
        userId: req.userId, // Проверяем, что заказ принадлежит пользователю
      },
      include: [
        {
          model: OrderItem,
          as: 'items',
        },
      ],
    });

    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    res.json({
      id: order.id,
      firstName: order.firstName,
      lastName: order.lastName,
      phone: order.phone,
      email: order.email,
      city: order.city,
      street: order.street,
      house: order.house,
      apartment: order.apartment,
      comment: order.comment,
      totalPrice: parseFloat(order.totalPrice),
      status: order.status,
      items: order.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productPrice: parseFloat(item.productPrice),
        productImage: item.productImage,
        quantity: item.quantity,
        variants: item.variants,
        variantString: item.variantString,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });
  } catch (error) {
    console.error('Ошибка получения заказа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/account/reviews - Получить отзывы пользователя
router.get('/reviews', userAuth, async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: { userId: req.userId },
      include: [
        {
          model: require('../models').Product,
          as: 'product',
          attributes: ['id', 'name', 'defaultImage'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      reviews: reviews.map(r => ({
        id: r.id,
        productId: r.productId,
        product: r.product ? {
          id: r.product.id,
          name: r.product.name,
          image: r.product.defaultImage,
        } : null,
        rating: r.rating,
        text: r.text,
        pros: r.pros,
        cons: r.cons,
        photos: r.photos || [],
        status: r.status,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Ошибка получения отзывов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/account/statistics - Получить статистику пользователя
router.get('/statistics', userAuth, async (req, res) => {
  try {
    // Общая сумма покупок
    const totalSpentResult = await Order.findAll({
      where: {
        userId: req.userId,
        status: {
          [Op.notIn]: ['cancelled'],
        },
      },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('total_price')), 'total'],
      ],
      raw: true,
    });

    const totalSpent = parseFloat(totalSpentResult[0]?.total || 0);

    // Количество заказов
    const totalOrders = await Order.count({
      where: {
        userId: req.userId,
        status: {
          [Op.notIn]: ['cancelled'],
        },
      },
    });

    // Средний чек
    const averageOrder = totalOrders > 0 ? totalSpent / totalOrders : 0;

    // Количество отзывов
    const totalReviews = await Review.count({
      where: {
        userId: req.userId,
        status: 'approved',
      },
    });

    // Количество товаров в избранном
    const totalFavorites = await Favorite.count({
      where: { userId: req.userId },
    });

    res.json({
      totalSpent: Math.round(totalSpent * 100) / 100,
      totalOrders,
      averageOrder: Math.round(averageOrder * 100) / 100,
      totalReviews,
      totalFavorites,
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/account/orders/:id/cancel - Заявка на отмену заказа
router.post('/orders/:id/cancel', userAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'Причина отмены должна содержать минимум 10 символов' });
    }

    // Проверяем заказ
    const order = await Order.findOne({
      where: {
        id: orderId,
        userId: req.userId,
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Отменить можно только заказы со статусом "Новый"' });
    }

    // Проверяем, не подана ли уже заявка
    const existingCancellation = await OrderCancellation.findOne({
      where: {
        orderId,
        userId: req.userId,
        status: 'pending',
      },
    });

    if (existingCancellation) {
      return res.status(400).json({ error: 'Заявка на отмену уже подана' });
    }

    // Создаем заявку на отмену
    const cancellation = await OrderCancellation.create({
      orderId,
      userId: req.userId,
      reason: reason.trim(),
      status: 'pending',
    });

    // Отправляем email админу
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.SMTP_USER || 'artem.ger134@gmail.com',
          pass: process.env.SMTP_PASSWORD,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_USER || 'artem.ger134@gmail.com',
        to: process.env.ORDER_EMAIL || 'artem.ger134@gmail.com',
        subject: `Заявка на отмену заказа #${orderId}`,
        html: `
          <h2>Заявка на отмену заказа</h2>
          <p><strong>Номер заказа:</strong> #${orderId}</p>
          <p><strong>Пользователь:</strong> ${req.user.firstName} ${req.user.lastName}</p>
          <p><strong>Телефон:</strong> ${req.user.phone}</p>
          <p><strong>Причина:</strong> ${reason.trim()}</p>
          <p><a href="${process.env.ADMIN_URL || 'http://localhost:3001'}/admin/orders/${orderId}">Перейти к заказу</a></p>
        `,
      });
    } catch (emailError) {
      console.error('Ошибка отправки email:', emailError);
      // Не прерываем выполнение, заявка уже создана
    }

    res.json({
      message: 'Заявка на отмену заказа подана',
      cancellation: {
        id: cancellation.id,
        orderId: cancellation.orderId,
        status: cancellation.status,
      },
    });
  } catch (error) {
    console.error('Ошибка создания заявки на отмену:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

