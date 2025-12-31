const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../../middleware/authMiddleware');
const { Category, CategorySpecification, CategoryVariant } = require('../../models');
const { getCategoryConfig } = require('../../config/categories');

// Публичный endpoint для получения конфигурации категории (без аутентификации)
// GET /api/admin/category-config/public/:categoryId
router.get('/public/:categoryId', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Неверный ID категории' });
    }

    // Получаем категорию с родителем (для наследования)
    const category = await Category.findByPk(categoryId, {
      include: [
        {
          model: Category,
          as: 'parent',
        },
      ],
    });

    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    // Получаем конфигурацию (сначала БД, потом файлы)
    const config = await getCategoryConfig(category.slug, category, true);
    
    if (!config) {
      return res.json({
        specifications: [],
        variants: [],
        message: 'Для этой категории нет предопределенной конфигурации',
      });
    }

    // Создаем маппинг ключей на labels и units для характеристик
    const specLabelsMap = {};
    const specUnitsMap = {};
    if (config.specifications) {
      config.specifications.forEach(spec => {
        if (spec.key && spec.label) {
          specLabelsMap[spec.key] = spec.label;
        }
        if (spec.key && spec.unit) {
          specUnitsMap[spec.key] = spec.unit;
        }
      });
    }

    // Возвращаем конфигурацию
    res.json({
      specifications: config.specifications || [],
      variants: config.variants || [],
      specLabelsMap, // Добавляем готовый маппинг
      specUnitsMap, // Добавляем маппинг единиц измерения
    });
  } catch (error) {
    console.error('Ошибка получения конфигурации категории:', error);
    res.status(500).json({ error: 'Ошибка сервера', message: error.message });
  }
});

// GET /api/admin/category-config/:categoryId - Получить конфигурацию категории (требует аутентификации админа)
router.get('/:categoryId', authenticateAdmin, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Неверный ID категории' });
    }

    // Получаем категорию с родителем (для наследования)
    const category = await Category.findByPk(categoryId, {
      include: [
        {
          model: Category,
          as: 'parent',
        },
      ],
    });

    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    // Получаем конфигурацию (сначала БД, потом файлы)
    const config = await getCategoryConfig(category.slug, category, true);
    
    if (!config) {
      return res.json({
        specifications: [],
        variants: [],
        message: 'Для этой категории нет предопределенной конфигурации',
      });
    }

    // Создаем маппинг ключей на labels и units для характеристик
    const specLabelsMap = {};
    const specUnitsMap = {};
    if (config.specifications) {
      config.specifications.forEach(spec => {
        if (spec.key && spec.label) {
          specLabelsMap[spec.key] = spec.label;
        }
        if (spec.key && spec.unit) {
          specUnitsMap[spec.key] = spec.unit;
        }
      });
    }

    // Возвращаем конфигурацию
    res.json({
      specifications: config.specifications || [],
      variants: config.variants || [],
      specLabelsMap, // Добавляем готовый маппинг
      specUnitsMap, // Добавляем маппинг единиц измерения
    });
  } catch (error) {
    console.error('Ошибка получения конфигурации категории:', error);
    res.status(500).json({ error: 'Ошибка сервера', message: error.message });
  }
});

// GET /api/admin/category-config/:categoryId/full - Получить полную конфигурацию с данными из БД
router.get('/:categoryId/full', authenticateAdmin, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Неверный ID категории' });
    }

    // Получаем категорию
    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    // Получаем характеристики из БД
    const dbSpecifications = await CategorySpecification.findAll({
      where: { categoryId },
      order: [['displayOrder', 'ASC']],
    });

    // Получаем варианты из БД
    const dbVariants = await CategoryVariant.findAll({
      where: { categoryId },
      order: [['displayOrder', 'ASC']],
    });

    // Получаем конфигурацию из файлов (fallback)
    const fileConfig = await getCategoryConfig(category.slug, category, false);

    res.json({
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      specifications: dbSpecifications.map(spec => ({
        id: spec.id,
        key: spec.specKey,
        label: spec.specLabel,
        type: spec.specType,
        options: spec.specOptions,
        displayOrder: spec.displayOrder,
        unit: spec.unit || null,
      })),
      variants: dbVariants.map(variant => ({
        id: variant.id,
        key: variant.variantKey,
        name: variant.variantName,
        type: variant.variantType,
        isRequired: variant.isRequired,
        displayOrder: variant.displayOrder,
        unit: variant.unit || null,
      })),
      fileConfig: fileConfig ? {
        specifications: fileConfig.specifications || [],
        variants: fileConfig.variants || [],
      } : null,
    });
  } catch (error) {
    console.error('Ошибка получения полной конфигурации:', error);
    res.status(500).json({ error: 'Ошибка сервера', message: error.message });
  }
});

// POST /api/admin/category-config/:categoryId/specifications - Добавить характеристику
router.post('/:categoryId/specifications', authenticateAdmin, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const { key, label, type, options, displayOrder, unit } = req.body;
    
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Неверный ID категории' });
    }
    
    if (!key || !label || !type) {
      return res.status(400).json({ error: 'Поля key, label и type обязательны' });
    }
    
    // Проверяем, что категория существует
    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    
    // Проверяем, что характеристика с таким key еще не существует
    const existing = await CategorySpecification.findOne({
      where: { categoryId, specKey: key },
    });
    
    if (existing) {
      return res.status(400).json({ error: 'Характеристика с таким ключом уже существует' });
    }
    
    // Создаем характеристику
    const specification = await CategorySpecification.create({
      categoryId,
      specKey: key,
      specLabel: label,
      specType: type,
      specOptions: options || null,
      displayOrder: displayOrder || 0,
      unit: unit || null,
    });
    
    res.status(201).json(specification);
  } catch (error) {
    console.error('Ошибка создания характеристики:', error);
    res.status(500).json({ error: 'Ошибка сервера', message: error.message });
  }
});

// PUT /api/admin/category-config/:categoryId/specifications/:id - Обновить характеристику
router.put('/:categoryId/specifications/:id', authenticateAdmin, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const id = parseInt(req.params.id);
    const { key, label, type, options, displayOrder, unit } = req.body;
    
    if (isNaN(categoryId) || isNaN(id)) {
      return res.status(400).json({ error: 'Неверный ID' });
    }
    
    const specification = await CategorySpecification.findOne({
      where: { id, categoryId },
    });
    
    if (!specification) {
      return res.status(404).json({ error: 'Характеристика не найдена' });
    }
    
    // Если меняется key, проверяем уникальность
    if (key && key !== specification.specKey) {
      const existing = await CategorySpecification.findOne({
        where: { categoryId, specKey: key },
      });
      
      if (existing) {
        return res.status(400).json({ error: 'Характеристика с таким ключом уже существует' });
      }
    }
    
    // Обновляем характеристику
    await specification.update({
      specKey: key || specification.specKey,
      specLabel: label || specification.specLabel,
      specType: type || specification.specType,
      specOptions: options !== undefined ? options : specification.specOptions,
      displayOrder: displayOrder !== undefined ? displayOrder : specification.displayOrder,
      unit: unit !== undefined ? unit : specification.unit,
    });
    
    res.json(specification);
  } catch (error) {
    console.error('Ошибка обновления характеристики:', error);
    res.status(500).json({ error: 'Ошибка сервера', message: error.message });
  }
});

// DELETE /api/admin/category-config/:categoryId/specifications/:id - Удалить характеристику
router.delete('/:categoryId/specifications/:id', authenticateAdmin, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const id = parseInt(req.params.id);
    
    if (isNaN(categoryId) || isNaN(id)) {
      return res.status(400).json({ error: 'Неверный ID' });
    }
    
    const specification = await CategorySpecification.findOne({
      where: { id, categoryId },
    });
    
    if (!specification) {
      return res.status(404).json({ error: 'Характеристика не найдена' });
    }
    
    await specification.destroy();
    
    res.json({ message: 'Характеристика удалена' });
  } catch (error) {
    console.error('Ошибка удаления характеристики:', error);
    res.status(500).json({ error: 'Ошибка сервера', message: error.message });
  }
});

// POST /api/admin/category-config/:categoryId/variants - Добавить вариант
router.post('/:categoryId/variants', authenticateAdmin, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const { key, name, type, isRequired, displayOrder, unit } = req.body;
    
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Неверный ID категории' });
    }
    
    if (!key || !name || !type) {
      return res.status(400).json({ error: 'Поля key, name и type обязательны' });
    }
    
    // Проверяем, что категория существует
    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    
    // Проверяем, что вариант с таким key еще не существует
    const existing = await CategoryVariant.findOne({
      where: { categoryId, variantKey: key },
    });
    
    if (existing) {
      return res.status(400).json({ error: 'Вариант с таким ключом уже существует' });
    }
    
    // Создаем вариант
    const variant = await CategoryVariant.create({
      categoryId,
      variantKey: key,
      variantName: name,
      variantType: type,
      isRequired: isRequired !== undefined ? isRequired : true,
      displayOrder: displayOrder || 0,
      unit: unit || null,
    });
    
    res.status(201).json(variant);
  } catch (error) {
    console.error('Ошибка создания варианта:', error);
    res.status(500).json({ error: 'Ошибка сервера', message: error.message });
  }
});

// PUT /api/admin/category-config/:categoryId/variants/:id - Обновить вариант
router.put('/:categoryId/variants/:id', authenticateAdmin, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const id = parseInt(req.params.id);
    const { key, name, type, isRequired, displayOrder, unit } = req.body;
    
    if (isNaN(categoryId) || isNaN(id)) {
      return res.status(400).json({ error: 'Неверный ID' });
    }
    
    const variant = await CategoryVariant.findOne({
      where: { id, categoryId },
    });
    
    if (!variant) {
      return res.status(404).json({ error: 'Вариант не найден' });
    }
    
    // Если меняется key, проверяем уникальность
    if (key && key !== variant.variantKey) {
      const existing = await CategoryVariant.findOne({
        where: { categoryId, variantKey: key },
      });
      
      if (existing) {
        return res.status(400).json({ error: 'Вариант с таким ключом уже существует' });
      }
    }
    
    // Обновляем вариант
    await variant.update({
      variantKey: key || variant.variantKey,
      variantName: name || variant.variantName,
      variantType: type || variant.variantType,
      isRequired: isRequired !== undefined ? isRequired : variant.isRequired,
      displayOrder: displayOrder !== undefined ? displayOrder : variant.displayOrder,
      unit: unit !== undefined ? unit : variant.unit,
    });
    
    res.json(variant);
  } catch (error) {
    console.error('Ошибка обновления варианта:', error);
    res.status(500).json({ error: 'Ошибка сервера', message: error.message });
  }
});

// DELETE /api/admin/category-config/:categoryId/variants/:id - Удалить вариант
router.delete('/:categoryId/variants/:id', authenticateAdmin, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const id = parseInt(req.params.id);
    
    if (isNaN(categoryId) || isNaN(id)) {
      return res.status(400).json({ error: 'Неверный ID' });
    }
    
    const variant = await CategoryVariant.findOne({
      where: { id, categoryId },
    });
    
    if (!variant) {
      return res.status(404).json({ error: 'Вариант не найден' });
    }
    
    await variant.destroy();
    
    res.json({ message: 'Вариант удален' });
  } catch (error) {
    console.error('Ошибка удаления варианта:', error);
    res.status(500).json({ error: 'Ошибка сервера', message: error.message });
  }
});

// GET /api/admin/category-config - Получить все доступные конфигурации
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { getAllConfigs } = require('../../config/categories');
    const configs = getAllConfigs();
    
    res.json({
      configs: Object.keys(configs).map(slug => ({
        slug,
        specifications: configs[slug].specifications || [],
        variants: configs[slug].variants || [],
      })),
    });
  } catch (error) {
    console.error('Ошибка получения конфигураций:', error);
    res.status(500).json({ error: 'Ошибка сервера', message: error.message });
  }
});

module.exports = router;

