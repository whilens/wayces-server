/**
 * Централизованная конфигурация категорий
 * Загружает конфигурации для всех категорий
 * Приоритет: сначала БД, потом файлы
 */

const smartphones = require('./smartphones');
const shoes = require('./shoes');

// Маппинг slug категории на конфигурацию (fallback из файлов)
const categoryConfigs = {
  'smartphones': smartphones,
  'telefony': smartphones,
  'smartfony': smartphones,
  'electronics': smartphones, // Электроника использует конфигурацию смартфонов
  'электроника': smartphones,
  'shoes': shoes,
  'obuv': shoes,
  'обувь': shoes,
  'sports': shoes, // Спортивная обувь использует конфигурацию обуви
  'sport': shoes,
  'спорт': shoes,
};

/**
 * Загрузить конфигурацию категории из БД
 * @param {number} categoryId - ID категории
 * @returns {Promise<Object|null>} конфигурация из БД или null
 */
async function loadCategoryConfigFromDB(categoryId) {
  try {
    const { CategorySpecification, CategoryVariant } = require('../../models');
    
    const specifications = await CategorySpecification.findAll({
      where: { categoryId },
      order: [['displayOrder', 'ASC']],
    });
    
    const variants = await CategoryVariant.findAll({
      where: { categoryId },
      order: [['displayOrder', 'ASC']],
    });
    
    if (specifications.length === 0 && variants.length === 0) {
      return null;
    }
    
    return {
      specifications: specifications.map(spec => ({
        key: spec.specKey,
        label: spec.specLabel,
        type: spec.specType,
        options: spec.specOptions || null,
        unit: spec.unit || null,
      })),
      variants: variants.map(variant => ({
        key: variant.variantKey,
        name: variant.variantName,
        type: variant.variantType,
        isRequired: variant.isRequired,
        unit: variant.unit || null,
      })),
    };
  } catch (error) {
    console.error('Ошибка загрузки конфигурации из БД:', error);
    return null;
  }
}

/**
 * Получить конфигурацию категории по slug или ID
 * Приоритет: сначала БД, потом файлы
 * @param {string|number} categoryIdentifier - slug или ID категории
 * @param {Object} categoryData - данные категории (для наследования от родителя)
 * @param {boolean} useDB - использовать БД (по умолчанию true)
 * @returns {Promise<Object>} конфигурация категории
 */
async function getCategoryConfig(categoryIdentifier, categoryData = null, useDB = true) {
  let categoryId = null;
  let slug = null;
  
  // Определяем categoryId и slug
  if (categoryData) {
    categoryId = categoryData.id;
    slug = categoryData.slug;
  } else if (typeof categoryIdentifier === 'number') {
    categoryId = categoryIdentifier;
  } else if (typeof categoryIdentifier === 'string') {
    slug = categoryIdentifier;
  }
  
  // Сначала пытаемся загрузить из БД
  if (useDB && categoryId) {
    const dbConfig = await loadCategoryConfigFromDB(categoryId);
    if (dbConfig) {
      return dbConfig;
    }
    
    // Если в БД нет, но есть родитель - пробуем наследовать от родителя
    if (categoryData?.parentId && categoryData?.parent) {
      const parentConfig = await getCategoryConfig(categoryData.parent.id, categoryData.parent, useDB);
      if (parentConfig) {
        return parentConfig;
      }
    }
  }
  
  // Fallback: загружаем из файлов
  if (categoryData && categoryData.slug) {
    const config = categoryConfigs[categoryData.slug.toLowerCase()];
    if (config) {
      return config;
    }
    
    // Если конфигурации нет, но есть родитель - наследуем от родителя
    if (categoryData.parentId && categoryData.parent) {
      return await getCategoryConfig(categoryData.parent.slug, categoryData.parent, false);
    }
  }
  
  // Если передан slug напрямую
  if (typeof categoryIdentifier === 'string') {
    return categoryConfigs[categoryIdentifier.toLowerCase()] || null;
  }
  
  return null;
}

/**
 * Получить все доступные конфигурации
 */
function getAllConfigs() {
  return categoryConfigs;
}

module.exports = {
  getCategoryConfig,
  getAllConfigs,
  categoryConfigs,
};

