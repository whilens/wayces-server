/**
 * Централизованная конфигурация категорий
 * Конфиг из файлов (shoes.js и др.) объединяется с настройками категории в БД
 */

/** Генерация ключа опции из ключа варианта и значения: size + "38" → "size-38" */
function generateOptionKey(variantKey, value) {
  if (value == null || value === '') return variantKey;
  const slug = String(value).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || String(value).trim();
  return `${variantKey}-${slug}`;
}

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
    
    return {
      specifications: specifications.map(spec => ({
        key: spec.specKey,
        label: spec.specLabel,
        type: spec.specType,
        options: spec.specOptions || null,
        unit: spec.unit || null,
      })),
      variants: variants.map(variant => {
        const optionValues = variant.optionValues && Array.isArray(variant.optionValues) ? variant.optionValues : [];
        const options = optionValues.map((opt) => ({
          key: generateOptionKey(variant.variantKey, opt.value),
          value: opt.value,
          colorCode: opt.colorCode || null,
        }));
        return {
          key: variant.variantKey,
          name: variant.variantName,
          type: variant.variantType,
          isRequired: variant.isRequired,
          unit: variant.unit || null,
          options,
        };
      }),
    };
  } catch (error) {
    console.error('Ошибка загрузки конфигурации из БД:', error);
    return { specifications: [], variants: [] };
  }
}

function getFileConfigForSlug(slug) {
  if (!slug) return null;
  return categoryConfigs[String(slug).toLowerCase()] || null;
}

function mergeOptions(fileOptions = [], dbOptions = []) {
  const byKey = new Map();
  for (const opt of fileOptions) {
    if (opt?.key) byKey.set(opt.key, { ...opt });
  }
  for (const opt of dbOptions) {
    if (opt?.key) byKey.set(opt.key, { ...(byKey.get(opt.key) || {}), ...opt });
  }
  return Array.from(byKey.values());
}

function mergeSpecifications(fileSpecs = [], dbSpecs = []) {
  const byKey = new Map();
  for (const spec of fileSpecs) {
    if (spec?.key) byKey.set(spec.key, { ...spec });
  }
  for (const spec of dbSpecs) {
    if (!spec?.key) continue;
    const prev = byKey.get(spec.key);
    byKey.set(spec.key, {
      ...(prev || {}),
      ...spec,
      options: spec.options ?? prev?.options ?? null,
    });
  }
  return Array.from(byKey.values());
}

function mergeVariants(fileVariants = [], dbVariants = []) {
  const byKey = new Map();
  for (const variant of fileVariants) {
    if (variant?.key) {
      byKey.set(variant.key, {
        ...variant,
        options: [...(variant.options || [])],
      });
    }
  }
  for (const variant of dbVariants) {
    if (!variant?.key) continue;
    const prev = byKey.get(variant.key);
    byKey.set(variant.key, {
      ...(prev || {}),
      ...variant,
      name: variant.name || prev?.name,
      type: variant.type || prev?.type,
      isRequired: variant.isRequired ?? prev?.isRequired,
      unit: variant.unit ?? prev?.unit,
      options: mergeOptions(prev?.options, variant.options),
    });
  }
  return Array.from(byKey.values());
}

function mergeCategoryConfigs(fileConfig, dbConfig) {
  const file = fileConfig || { specifications: [], variants: [] };
  const db = dbConfig || { specifications: [], variants: [] };
  return {
    specifications: mergeSpecifications(file.specifications, db.specifications),
    variants: mergeVariants(file.variants, db.variants),
  };
}

function isConfigEmpty(config) {
  if (!config) return true;
  return (config.specifications?.length || 0) === 0 && (config.variants?.length || 0) === 0;
}

/**
 * Получить конфигурацию категории по slug или ID (файл + БД)
 */
async function getCategoryConfig(categoryIdentifier, categoryData = null, useDB = true) {
  let categoryId = null;

  if (categoryData) {
    categoryId = categoryData.id;
  } else if (typeof categoryIdentifier === 'number') {
    categoryId = categoryIdentifier;
  }

  const fileConfig = categoryData?.slug ? getFileConfigForSlug(categoryData.slug) : null;
  const dbConfig =
    useDB && categoryId ? await loadCategoryConfigFromDB(categoryId) : { specifications: [], variants: [] };

  let merged = mergeCategoryConfigs(fileConfig, dbConfig);

  if (isConfigEmpty(merged) && categoryData?.parentId && categoryData?.parent) {
    const parentConfig = await getCategoryConfig(categoryData.parent.id, categoryData.parent, useDB);
    if (parentConfig && !isConfigEmpty(parentConfig)) {
      return parentConfig;
    }
  }

  if (isConfigEmpty(merged) && typeof categoryIdentifier === 'string') {
    const slugOnly = getFileConfigForSlug(categoryIdentifier);
    if (slugOnly) return slugOnly;
  }

  return isConfigEmpty(merged) ? null : merged;
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

