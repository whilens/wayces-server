const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const escapeHtml = require('escape-html');
const sequelize = require('../config/sequelize');
const { Order, OrderItem, ProductCombination } = require('../models');
const { authenticateAdmin } = require('../middleware/authMiddleware');

// Rate limiting для защиты от спама
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 3, // максимум 3 запроса за 15 минут
  message: {
    error: 'Слишком много запросов. Попробуйте позже.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Настройка SMTP транспорта
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD, // Пароль приложения или API-ключ
    },
  });
};

// Функция для форматирования HTML письма
const formatOrderEmail = (orderData) => {
  const itemsHtml = orderData.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 0.75rem; border-bottom: 0.0625rem solid #e2e8f0;">
        ${item.name}${item.variantString ? ` (${item.variantString})` : ''}
      </td>
      <td style="padding: 0.75rem; border-bottom: 0.0625rem solid #e2e8f0; text-align: center;">
        ${item.quantity}
      </td>
      <td style="padding: 0.75rem; border-bottom: 0.0625rem solid #e2e8f0; text-align: right;">
        ${item.price.toLocaleString('ru-RU')} ₽
      </td>
      <td style="padding: 0.75rem; border-bottom: 0.0625rem solid #e2e8f0; text-align: right;">
        ${(item.price * item.quantity).toLocaleString('ru-RU')} ₽
      </td>
    </tr>
  `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #2d3748;
        }
        .container {
          max-width: 37.5rem;
          margin: 0 auto;
          padding: 1.25rem;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #ffffff;
          padding: 1.5rem;
          border-radius: 0.5rem 0.5rem 0 0;
        }
        .content {
          background: #ffffff;
          padding: 1.5rem;
          border: 0.0625rem solid #e2e8f0;
        }
        .section {
          margin-bottom: 1.5rem;
        }
        .section-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: #2d3748;
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 0.125rem solid #e2e8f0;
        }
        .info-row {
          margin-bottom: 0.5rem;
        }
        .info-label {
          font-weight: 600;
          color: #4a5568;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }
        th {
          background: #f7fafc;
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
          color: #2d3748;
          border-bottom: 0.125rem solid #e2e8f0;
        }
        .total {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 0.125rem solid #e2e8f0;
          text-align: right;
        }
        .total-label {
          font-size: 1.125rem;
          font-weight: 600;
          color: #2d3748;
        }
        .total-price {
          font-size: 1.5rem;
          font-weight: 700;
          color: #667eea;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Новый заказ</h1>
        </div>
        <div class="content">
          <div class="section">
            <h2 class="section-title">Контактная информация</h2>
            <div class="info-row">
              <span class="info-label">Имя:</span> ${escapeHtml(orderData.firstName)} ${escapeHtml(orderData.lastName)}
            </div>
            <div class="info-row">
              <span class="info-label">Телефон:</span> ${escapeHtml(orderData.phone)}
            </div>
            <div class="info-row">
              <span class="info-label">Email:</span> ${escapeHtml(orderData.email)}
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Адрес доставки</h2>
            <div class="info-row">
              ${escapeHtml(orderData.city)}, ${escapeHtml(orderData.street)}, д. ${escapeHtml(orderData.house)}, кв. ${escapeHtml(orderData.apartment)}
            </div>
          </div>

          ${orderData.comment ? `
          <div class="section">
            <h2 class="section-title">Комментарий</h2>
            <p>${escapeHtml(orderData.comment)}</p>
          </div>
          ` : ''}

          <div class="section">
            <h2 class="section-title">Товары</h2>
            <table>
              <thead>
                <tr>
                  <th>Товар</th>
                  <th style="text-align: center;">Количество</th>
                  <th style="text-align: right;">Цена</th>
                  <th style="text-align: right;">Сумма</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
            <div class="total">
              <div class="total-label">Итого:</div>
              <div class="total-price">${orderData.totalPrice.toLocaleString('ru-RU')} ₽</div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

// POST /api/orders - Создание заказа и отправка email
router.post('/', orderLimiter, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      email,
      city,
      street,
      house,
      apartment,
      comment,
      items,
      totalPrice,
      userId, // ID пользователя, если авторизован
    } = req.body;

    // Валидация обязательных полей
    if (!firstName || !lastName || !phone || !email || !city || !street || !house || !apartment) {
      return res.status(400).json({
        error: 'Все обязательные поля должны быть заполнены',
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Корзина пуста',
      });
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Некорректный email',
      });
    }

    // Валидация телефона РФ
    // Нормализуем телефон: убираем все нецифры
    const normalizedPhone = phone.replace(/\D/g, '');
    
    // Проверяем, что это 11 цифр, начинающихся с 7
    if (normalizedPhone.length !== 11 || normalizedPhone[0] !== '7') {
      return res.status(400).json({
        error: 'Некорректный номер телефона РФ. Ожидается 11 цифр, начинающихся с 7',
      });
    }
    
    // Сохраняем нормализованный телефон
    const finalPhone = normalizedPhone;

    // Пересчитываем итоговую сумму на сервере (не доверяем totalPrice из клиента)
    const calculatedTotal = items.reduce((sum, item) => {
      const price = Number(item.price) || 0;
      const qty = Number(item.quantity) || 0;
      return sum + price * qty;
    }, 0);

    // Формируем данные заказа
    const orderData = {
      firstName,
      lastName,
      phone: finalPhone, // Используем нормализованный телефон
      email,
      city,
      street,
      house,
      apartment,
      comment: comment || '',
      items,
      totalPrice: calculatedTotal,
    };

    // Используем транзакцию для атомарности операций
    const transaction = await sequelize.transaction();

    try {
      // Проверка остатков и блокировка комплектаций (для товаров с вариантами)
      const combinationKeyFromVariants = (variants) =>
        Object.keys(variants || {})
          .sort()
          .map((k) => `${k}-${variants[k]}`)
          .join('_');

      for (const item of items) {
        if (item.variants && Object.keys(item.variants).length > 0) {
          const combinationKey = combinationKeyFromVariants(item.variants);
          const comb = await ProductCombination.findOne({
            where: { productId: item.id, combinationKey },
            lock: transaction.LOCK.UPDATE,
            transaction,
          });
          if (!comb) {
            await transaction.rollback();
            return res.status(400).json({
              error: 'Ошибка при оформлении заказа',
              message: `Комплектация для товара «${item.name}» не найдена или недоступна.`,
            });
          }
          const stock = comb.stockQuantity ?? 0;
          if (stock < item.quantity) {
            await transaction.rollback();
            return res.status(400).json({
              error: 'Недостаточно товара в наличии',
              message: `По позиции «${item.name}» доступно ${stock} шт., запрошено ${item.quantity}. Обновите корзину.`,
            });
          }
        }
      }

      // Создаем заказ в БД
      const order = await Order.create(
        {
          firstName,
          lastName,
          phone: finalPhone, // Используем нормализованный телефон
          email,
          city,
          street,
          house,
          apartment,
          comment: comment || '',
          totalPrice: calculatedTotal,
          status: 'pending',
          userId: userId || null, // Связываем с пользователем, если авторизован
        },
        { transaction }
      );

      // Создаем товары заказа
      const orderItems = await Promise.all(
        items.map((item) =>
          OrderItem.create(
            {
              orderId: order.id,
              productId: item.id,
              productName: item.name,
              productPrice: item.price,
              productImage: item.image || null,
              quantity: item.quantity,
              variants: item.variants || null,
              variantString: item.variantString || null,
            },
            { transaction }
          )
        )
      );

      // Списываем остаток по комплектациям
      for (const item of items) {
        if (item.variants && Object.keys(item.variants).length > 0) {
          const combinationKey = combinationKeyFromVariants(item.variants);
          await ProductCombination.decrement(
            'stockQuantity',
            { by: item.quantity, where: { productId: item.id, combinationKey }, transaction }
          );
        }
      }

      // Отправляем email
      const transporter = createTransporter();
      const mailOptions = {
        from: process.env.SMTP_USER,
        to: process.env.ORDER_EMAIL || process.env.SMTP_USER,
        subject: `Новый заказ от ${firstName} ${lastName}`,
        html: formatOrderEmail(orderData),
      };

      await transporter.sendMail(mailOptions);

      // Если всё успешно, коммитим транзакцию
      await transaction.commit();

      res.json({
        message: 'Заказ успешно оформлен',
        order: {
          id: order.id,
          ...orderData,
          createdAt: order.createdAt,
        },
      });
    } catch (error) {
      // Откатываем транзакцию при ошибке
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Ошибка отправки заказа:', error);
    res.status(500).json({
      error: 'Ошибка при оформлении заказа',
      message: error.message,
    });
  }
});

// GET /api/orders - Получить список заказов (только для админа)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'DESC';
    const status = req.query.status;

    const where = {};
    if (status) {
      where.status = status;
    }

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      include: [
        {
          model: OrderItem,
          as: 'items',
        },
      ],
      limit,
      offset,
      order: [[sortBy, sortOrder]],
    });

    res.json({
      orders,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    console.error('Ошибка получения заказов:', error);
    res.status(500).json({ error: 'Ошибка получения заказов', message: error.message });
  }
});

// GET /api/orders/:id - Получить заказ по ID (только для админа)
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const order = await Order.findByPk(orderId, {
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

    res.json(order);
  } catch (error) {
    console.error('Ошибка получения заказа:', error);
    res.status(500).json({ error: 'Ошибка получения заказа', message: error.message });
  }
});

// PATCH /api/orders/:id/status - Изменить статус заказа (только для админа)
router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;

    const validStatuses = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус' });
    }

    const order = await Order.findByPk(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    order.status = status;
    await order.save();

    res.json({
      message: 'Статус заказа обновлен',
      order,
    });
  } catch (error) {
    console.error('Ошибка обновления статуса заказа:', error);
    res.status(500).json({ error: 'Ошибка обновления статуса заказа', message: error.message });
  }
});

module.exports = router;

