const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Favorite, Product, Category } = require('../models');
const { Op } = require('sequelize');
const { JWT_SECRET } = require('../config/jwt');
const { favoriteLimiter } = require('../middleware/rateLimiting');

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

    req.userId = decoded.id;
    next();
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// GET /api/favorites - Получить избранное пользователя
router.get('/', userAuth, async (req, res) => {
  try {
    const favorites = await Favorite.findAll({
      where: { userId: req.userId },
      include: [
        {
          model: Product,
          as: 'product',
          include: [
            {
              model: Category,
              as: 'category',
              attributes: ['id', 'name'],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      favorites: favorites.map(fav => ({
        id: fav.id,
        productId: fav.productId,
        product: fav.product ? {
          id: fav.product.id,
          name: fav.product.name,
          basePrice: parseFloat(fav.product.basePrice),
          defaultImage: fav.product.defaultImage,
          category: fav.product.category ? {
            id: fav.product.category.id,
            name: fav.product.category.name,
          } : null,
        } : null,
        addedAt: fav.createdAt,
      })),
    });
  } catch (error) {
    console.error('Ошибка получения избранного:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/favorites - Добавить товар в избранное
router.post('/', userAuth, async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'ID товара обязателен' });
    }

    // Проверяем существование товара
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    // Проверяем, не добавлен ли уже товар
    const existing = await Favorite.findOne({
      where: {
        userId: req.userId,
        productId: parseInt(productId),
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'Товар уже в избранном' });
    }

    // Добавляем в избранное
    const favorite = await Favorite.create({
      userId: req.userId,
      productId: parseInt(productId),
    });

    res.status(201).json({
      message: 'Товар добавлен в избранное',
      favorite: {
        id: favorite.id,
        productId: favorite.productId,
      },
    });
  } catch (error) {
    console.error('Ошибка добавления в избранное:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/favorites/:productId - Удалить товар из избранного
router.delete('/:productId', userAuth, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);

    const favorite = await Favorite.findOne({
      where: {
        userId: req.userId,
        productId,
      },
    });

    if (!favorite) {
      return res.status(404).json({ error: 'Товар не найден в избранном' });
    }

    await favorite.destroy();

    res.json({
      message: 'Товар удален из избранного',
    });
  } catch (error) {
    console.error('Ошибка удаления из избранного:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/favorites/check/:productId - Проверить, есть ли товар в избранном
router.get('/check/:productId', userAuth, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);

    const favorite = await Favorite.findOne({
      where: {
        userId: req.userId,
        productId,
      },
    });

    res.json({
      isFavorite: !!favorite,
    });
  } catch (error) {
    console.error('Ошибка проверки избранного:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

