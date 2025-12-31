/**
 * Утилиты для работы с товарами
 */

/**
 * Форматирует название товара с вариантами
 * @param {string} productName - Название товара
 * @param {Object} selectedVariants - Выбранные варианты { variantKey: optionKey }
 * @param {Array|Object} variants - Варианты товара (массив на сервере, объект на клиенте)
 * @returns {string} Отформатированное название
 */
function formatProductName(productName, selectedVariants, variants) {
  if (!selectedVariants || Object.keys(selectedVariants).length === 0) {
    return productName;
  }

  const parts = [];
  
  // Порядок приоритета для отображения вариантов
  const variantOrder = ['storage', 'memory', 'ram', 'size', 'color'];
  
  // Обрабатываем варианты в порядке приоритета
  variantOrder.forEach((key) => {
    if (selectedVariants[key]) {
      const optionValue = getOptionValue(key, selectedVariants[key], variants);
      if (optionValue) {
        if (key === 'size') {
          parts.push(`размер ${optionValue}`);
        } else {
          parts.push(optionValue);
        }
      }
    }
  });

  // Добавляем остальные варианты, которые не в списке приоритета
  Object.keys(selectedVariants).forEach((key) => {
    if (!variantOrder.includes(key)) {
      const optionValue = getOptionValue(key, selectedVariants[key], variants);
      if (optionValue) {
        parts.push(optionValue);
      }
    }
  });

  return parts.length > 0 ? `${productName}, ${parts.join(', ')}` : productName;
}

/**
 * Получает значение опции варианта
 * @param {string} variantKey - Ключ варианта
 * @param {string} optionKey - Ключ опции
 * @param {Array|Object} variants - Варианты товара
 * @returns {string|null} Значение опции
 */
function getOptionValue(variantKey, optionKey, variants) {
  if (!variants) return null;

  // Если variants - массив (серверная структура)
  if (Array.isArray(variants)) {
    const variant = variants.find(v => v.variantKey === variantKey);
    if (!variant || !variant.options) return null;
    
    const option = variant.options.find(opt => opt.optionKey === optionKey);
    return option ? option.optionValue : null;
  }

  // Если variants - объект (клиентская структура)
  if (typeof variants === 'object') {
    const variant = variants[variantKey];
    if (!variant || !variant.options) return null;
    
    const option = variant.options.find(opt => opt.id === optionKey);
    return option ? option.value : null;
  }

  return null;
}

/**
 * Формирует структуру вариантов для фронтенда из серверной структуры
 * @param {Array} serverVariants - Варианты в формате сервера (массив ProductVariant)
 * @returns {Object} Варианты в формате фронтенда
 */
function formatVariantsForFrontend(serverVariants) {
  if (!serverVariants || !Array.isArray(serverVariants) || serverVariants.length === 0) {
    return {};
  }

  const variantsForFrontend = {};
  
  serverVariants.forEach(variant => {
    variantsForFrontend[variant.variantKey] = {
      name: variant.variantName,
      type: variant.variantType,
      default: variant.options?.find(opt => opt.isDefault)?.optionKey || variant.options?.[0]?.optionKey,
      options: variant.options?.map(opt => ({
        id: opt.optionKey,
        value: opt.optionValue,
        color: opt.colorCode,
        priceModifier: parseFloat(opt.priceModifier || 0),
        images: (opt.images && Array.isArray(opt.images)) ? opt.images : (opt.images ? [opt.images] : []),
        available: opt.isAvailable !== false,
      })) || [],
    };
  });

  return variantsForFrontend;
}

/**
 * Получает изображение для комбинации вариантов
 * @param {Object} product - Товар
 * @param {Object} selectedVariants - Выбранные варианты { variantKey: optionKey }
 * @param {Array|Object} variants - Варианты товара
 * @returns {string|null} URL изображения или null
 */
function getCombinationImage(product, selectedVariants, variants) {
  if (!selectedVariants || !variants) {
    return product?.defaultImage || null;
  }

  // Ищем изображение по цвету (приоритет)
  if (selectedVariants.color) {
    const colorOption = findOption('color', selectedVariants.color, variants);
    if (colorOption?.images) {
      const images = Array.isArray(colorOption.images) ? colorOption.images : [colorOption.images];
      if (images.length > 0) {
        return images[0];
      }
    }
  }

  return product?.defaultImage || null;
}

/**
 * Находит опцию варианта
 * @param {string} variantKey - Ключ варианта
 * @param {string} optionKey - Ключ опции
 * @param {Array|Object} variants - Варианты товара
 * @returns {Object|null} Опция или null
 */
function findOption(variantKey, optionKey, variants) {
  if (!variants) return null;

  // Если variants - массив (серверная структура)
  if (Array.isArray(variants)) {
    const variant = variants.find(v => v.variantKey === variantKey);
    if (!variant || !variant.options) return null;
    return variant.options.find(opt => opt.optionKey === optionKey) || null;
  }

  // Если variants - объект (клиентская структура)
  if (typeof variants === 'object') {
    const variant = variants[variantKey];
    if (!variant || !variant.options) return null;
    return variant.options.find(opt => opt.id === optionKey) || null;
  }

  return null;
}

/**
 * Генерирует ключ комбинации из вариантов
 * @param {Object} variants - Объект с вариантами { variantKey: optionKey }
 * @returns {string} Ключ комбинации вида "color-black_storage-256"
 */
function generateCombinationKey(variants) {
  if (!variants || Object.keys(variants).length === 0) {
    return '';
  }

  return Object.keys(variants)
    .sort()
    .map(key => `${key}-${variants[key]}`)
    .join('_');
}

/**
 * Вычисляет итоговую цену с учетом модификаторов вариантов
 * @param {number} basePrice - Базовая цена товара
 * @param {Object} selectedVariants - Выбранные варианты { variantKey: optionKey }
 * @param {Array|Object} variants - Варианты товара
 * @returns {number} Итоговая цена
 */
function calculatePriceWithModifiers(basePrice, selectedVariants, variants) {
  if (!selectedVariants || !variants || Object.keys(selectedVariants).length === 0) {
    return basePrice || 0;
  }

  let finalPrice = basePrice || 0;

  Object.keys(selectedVariants).forEach((variantKey) => {
    const option = findOption(variantKey, selectedVariants[variantKey], variants);
    if (option) {
      // Для серверной структуры (массив) priceModifier уже число или строка
      // Для клиентской структуры (объект) priceModifier уже число
      const priceModifier = parseFloat(option.priceModifier || 0);
      if (priceModifier) {
        finalPrice += priceModifier;
      }
    }
  });

  return finalPrice;
}

module.exports = {
  formatProductName,
  formatVariantsForFrontend,
  getCombinationImage,
  generateCombinationKey,
  calculatePriceWithModifiers,
};

