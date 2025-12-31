const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../../middleware/authMiddleware');
const { Category } = require('../../models');

// GET /api/admin/categories - Получить все категории
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const categories = await Category.findAll({
      include: [
        {
          model: Category,
          as: 'children',
        },
        {
          model: Category,
          as: 'parent',
        },
      ],
      order: [['displayOrder', 'ASC'], ['name', 'ASC']],
    });

    res.json(categories);
  } catch (error) {
    console.error('Ошибка получения категорий:', error);
    res.status(500).json({ error: 'Ошибка получения категорий', message: error.message });
  }
});

// POST /api/admin/categories - Создать категорию
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { name, slug, parentId, description, imageUrl, displayOrder } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Название и slug обязательны' });
    }

    const category = await Category.create({
      name,
      slug,
      parentId: parentId || null,
      description: description || null,
      imageUrl: imageUrl || null,
      displayOrder: displayOrder || 0,
    });

    res.status(201).json({
      message: 'Категория успешно создана',
      category,
    });
  } catch (error) {
    console.error('Ошибка создания категории:', error);
    res.status(500).json({ error: 'Ошибка создания категории', message: error.message });
  }
});

module.exports = router;

