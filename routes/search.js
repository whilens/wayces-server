const express = require('express');
const router = express.Router();
const { Product, Category } = require('../models');
const { Op } = require('sequelize');

// GET /api/search/suggestions - Автодополнение поиска
router.get('/suggestions', async (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit) || 5;

    if (!query || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    // Поиск товаров по названию
    const products = await Product.findAll({
      where: {
        isActive: true,
        name: {
          [Op.iLike]: `%${query}%`,
        },
      },
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name'],
        },
      ],
      limit,
      attributes: ['id', 'name', 'basePrice', 'defaultImage', 'discountType', 'discountValue'],
      order: [['name', 'ASC']],
    });

    // Поиск категорий
    const categories = await Category.findAll({
      where: {
        name: {
          [Op.iLike]: `%${query}%`,
        },
      },
      limit: 3,
      attributes: ['id', 'name'],
    });

    // Формируем подсказки
    const suggestions = [
      ...products.map(p => ({
        type: 'product',
        id: p.id,
        name: p.name,
        price: parseFloat(p.basePrice),
        image: p.defaultImage || null, // Явно указываем null если нет изображения
        category: p.category ? p.category.name : null,
        url: `/products/${p.id}`,
        discountType: p.discountType,
        discountValue: p.discountValue ? parseFloat(p.discountValue) : null,
      })),
      ...categories.map(c => ({
        type: 'category',
        id: c.id,
        name: c.name,
        url: `/products?categoryId=${c.id}`,
      })),
    ];

    res.json({ suggestions: suggestions.slice(0, limit) });
  } catch (error) {
    console.error('Ошибка автодополнения:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/search/similar - Похожие товары
router.get('/similar/:productId', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const limit = parseInt(req.query.limit) || 6;

    // Получаем текущий товар
    const currentProduct = await Product.findByPk(productId, {
      include: [
        {
          model: Category,
          as: 'category',
        },
      ],
    });

    if (!currentProduct) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    // Поиск похожих товаров
    // 1. По категории
    // 2. По цене (в диапазоне ±30%)
    // 3. По названию (похожие слова)
    const priceRange = {
      min: currentProduct.basePrice * 0.7,
      max: currentProduct.basePrice * 1.3,
    };

    // Извлекаем ключевые слова из названия
    const keywords = currentProduct.name
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 3);

    const whereConditions = {
      isActive: true,
      id: { [Op.ne]: productId }, // Исключаем текущий товар
    };

    // Если есть категория, ищем в той же категории
    if (currentProduct.categoryId) {
      whereConditions.categoryId = currentProduct.categoryId;
    }

    // Поиск товаров
    let similarProducts = await Product.findAll({
      where: whereConditions,
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name'],
        },
      ],
      limit: limit * 2, // Берем больше, чтобы потом отсортировать
      attributes: ['id', 'name', 'basePrice', 'defaultImage', 'description', 'discountType', 'discountValue'],
    });

    // Фильтруем по цене и сортируем по релевантности
    similarProducts = similarProducts
      .filter(p => {
        const price = parseFloat(p.basePrice);
        return price >= priceRange.min && price <= priceRange.max;
      })
      .map(p => {
        // Вычисляем релевантность
        let relevance = 0;
        
        // Бонус за ту же категорию
        if (p.categoryId === currentProduct.categoryId) {
          relevance += 10;
        }

        // Бонус за похожее название
        const productNameLower = p.name.toLowerCase();
        keywords.forEach(keyword => {
          if (productNameLower.includes(keyword)) {
            relevance += 5;
          }
        });

        // Бонус за близкую цену
        const priceDiff = Math.abs(parseFloat(p.basePrice) - parseFloat(currentProduct.basePrice));
        const pricePercent = (priceDiff / parseFloat(currentProduct.basePrice)) * 100;
        relevance += Math.max(0, 10 - pricePercent / 3);

        return { ...p.toJSON(), relevance };
      })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
      .map(({ relevance, ...product }) => ({
        id: product.id,
        name: product.name,
        basePrice: parseFloat(product.basePrice),
        defaultImage: product.defaultImage,
        description: product.description,
        discountType: product.discountType,
        discountValue: product.discountValue ? parseFloat(product.discountValue) : null,
        category: product.category ? {
          id: product.category.id,
          name: product.category.name,
        } : null,
      }));

    res.json({ products: similarProducts });
  } catch (error) {
    console.error('Ошибка поиска похожих товаров:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

