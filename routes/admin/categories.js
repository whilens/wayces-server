const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../../middleware/authMiddleware');
const { Category, CategorySpecification, CategoryVariant, Product } = require('../../models');
const sequelize = require('../../config/sequelize');
const catalogCache = require('../../services/catalogCache');

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

// GET /api/admin/categories/:id - Получить категорию по ID
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID категории' });
    }
    const category = await Category.findByPk(id, {
      include: [
        { model: Category, as: 'parent' },
        { model: Category, as: 'children' },
      ],
    });
    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    res.json(category);
  } catch (error) {
    console.error('Ошибка получения категории:', error);
    res.status(500).json({ error: 'Ошибка получения категории', message: error.message });
  }
});

// POST /api/admin/categories - Создать категорию
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { name, slug, parentId, description, imageUrl, displayOrder, skuCode, skuAutoGenerate, listCombinationsSeparately } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Название и slug обязательны' });
    }

    const category = await Category.create({
      name,
      slug,
      parentId: parentId || null,
      description: description || null,
      imageUrl: imageUrl || null,
      displayOrder: displayOrder ?? 0,
      skuCode: skuCode != null && skuCode !== '' ? parseInt(skuCode, 10) : null,
      skuAutoGenerate: skuAutoGenerate === true || skuAutoGenerate === 'true',
      listCombinationsSeparately: listCombinationsSeparately === true || listCombinationsSeparately === 'true',
    });

    await catalogCache.invalidateCatalog();
    res.status(201).json({
      message: 'Категория успешно создана',
      category,
    });
  } catch (error) {
    console.error('Ошибка создания категории:', error);
    res.status(500).json({ error: 'Ошибка создания категории', message: error.message });
  }
});

// PUT /api/admin/categories/:id - Обновить категорию
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID категории' });
    }
    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    const { name, slug, parentId, description, imageUrl, displayOrder, skuCode, skuAutoGenerate, listCombinationsSeparately } = req.body;

    if (name !== undefined) category.name = name;
    if (slug !== undefined) category.slug = slug;
    if (parentId !== undefined) category.parentId = parentId || null;
    if (description !== undefined) category.description = description;
    if (imageUrl !== undefined) category.imageUrl = imageUrl;
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    if (skuCode !== undefined) {
      category.skuCode = skuCode !== '' && skuCode != null ? parseInt(skuCode, 10) : null;
      if (category.skuCode != null && (category.skuCode < 1 || category.skuCode > 99)) {
        return res.status(400).json({ error: 'Код SKU должен быть от 1 до 99' });
      }
    }
    if (skuAutoGenerate !== undefined) category.skuAutoGenerate = skuAutoGenerate === true || skuAutoGenerate === 'true';
    if (listCombinationsSeparately !== undefined) category.listCombinationsSeparately = listCombinationsSeparately === true || listCombinationsSeparately === 'true';

    await category.save();
    await catalogCache.invalidateCatalog();

    res.json({
      message: 'Категория успешно обновлена',
      category,
    });
  } catch (error) {
    console.error('Ошибка обновления категории:', error);
    res.status(500).json({ error: 'Ошибка обновления категории', message: error.message });
  }
});

// DELETE /api/admin/categories/:id - Удалить категорию
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID категории' });
    }
    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    const childrenCount = await Category.count({ where: { parentId: id } });
    if (childrenCount > 0) {
      return res.status(400).json({
        error: 'Нельзя удалить категорию, у которой есть подкатегории. Сначала удалите или переназначьте подкатегории.',
      });
    }

    const productsCount = await Product.count({ where: { categoryId: id } });
    if (productsCount > 0) {
      return res.status(400).json({
        error: 'Нельзя удалить категорию, к которой привязаны товары. Сначала смените категорию у товаров или удалите их.',
      });
    }

    const transaction = await sequelize.transaction();
    try {
      await CategorySpecification.destroy({ where: { categoryId: id }, transaction });
      await CategoryVariant.destroy({ where: { categoryId: id }, transaction });
      await category.destroy({ transaction });
      await transaction.commit();
    } catch (txError) {
      await transaction.rollback();
      throw txError;
    }

    await catalogCache.invalidateCatalog();
    res.json({
      message: 'Категория успешно удалена',
      id,
    });
  } catch (error) {
    console.error('Ошибка удаления категории:', error);
    res.status(500).json({ error: 'Ошибка удаления категории', message: error.message });
  }
});

module.exports = router;

