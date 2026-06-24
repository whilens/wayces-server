const { processProductImage } = require('./imageProcessor');
const { ProductImage } = require('../models');

/**
 * Обрабатывает изображения товара из загруженных файлов
 * @param {Array} productImages - Массив файлов изображений товара
 * @param {Object} options - Опции для обработки
 * @param {string} options.defaultImageFromNew - Флаг использования нового изображения как default
 * @param {string} options.defaultImageNewIndex - Индекс нового изображения для default
 * @param {string} options.defaultImage - Существующий путь к default изображению
 * @returns {Promise<Object>} { processedImages, defaultImagePath }
 */
const processProductImages = async (productImages, options = {}) => {
  const { defaultImageFromNew, defaultImageNewIndex, defaultImage } = options;
  let processedImages = [];
  let defaultImagePath = null;

  if (productImages && productImages.length > 0) {
    processedImages = await Promise.all(
      productImages.map(async (file, index) => {
        const processed = await processProductImage(file.path);
        return {
          ...processed,
          displayOrder: index,
        };
      })
    );

    // Определяем defaultImage
    if (defaultImageFromNew === 'true' && processedImages.length > 0) {
      const newIndex = parseInt(defaultImageNewIndex) || 0;
      if (processedImages[newIndex]) {
        defaultImagePath = processedImages[newIndex].main;
      }
    } else if (defaultImage) {
      defaultImagePath = defaultImage;
    } else {
      defaultImagePath = processedImages[0].main;
    }
  } else if (defaultImage) {
    defaultImagePath = defaultImage;
  }

  return { processedImages, defaultImagePath };
};

/**
 * Сохраняет обработанные изображения товара в БД
 * @param {Array} processedImages - Массив обработанных изображений
 * @param {number} productId - ID товара
 * @param {Object} transaction - Sequelize транзакция
 * @returns {Promise<Array>} Массив созданных ProductImage записей
 */
const saveProductImages = async (processedImages, productId, transaction) => {
  if (!processedImages || processedImages.length === 0) {
    return [];
  }

  return await Promise.all(
    processedImages.map((img, index) =>
      ProductImage.create(
        {
          productId,
          imageUrl: img.main,
          displayOrder: index,
        },
        { transaction }
      )
    )
  );
};

/**
 * Обрабатывает изображения опций вариантов
 * @param {Array} optionImages - Массив файлов изображений опций
 * @param {Array} optionDataImages - Массив данных изображений из optionData
 * @returns {Promise<Array>} Массив путей к обработанным изображениям
 */
const processOptionImages = async (optionImages, optionDataImages) => {
  if (!optionDataImages || !Array.isArray(optionDataImages)) {
    return null;
  }

  const processed = await Promise.all(
    optionDataImages.map(async (img) => {
      // Если это маркер файла, обрабатываем файл
      if (typeof img === 'string' && img.startsWith('__FILE__:')) {
        const fileKey = img.replace('__FILE__:', '');
        const file = optionImages.find(f => f.fieldname === fileKey);
        if (file) {
          const processed = await processProductImage(file.path);
          return processed.main;
        }
        return null;
      }
      // Если это уже путь, оставляем как есть
      return img;
    })
  );

  // Фильтруем null значения
  const filtered = processed.filter(img => img !== null);
  return filtered.length > 0 ? filtered : null;
};

/**
 * Разделяет загруженные файлы на изображения товара и опций
 * @param {Array} files - Массив всех загруженных файлов
 * @returns {Object} { productImages, optionImages }
 */
const separateImageFiles = (files) => {
  const productImages = files?.filter(f => f.fieldname === 'images') || [];
  const optionImages = files?.filter(f => f.fieldname?.startsWith('option-images-')) || [];
  return { productImages, optionImages };
};

module.exports = {
  processProductImages,
  saveProductImages,
  processOptionImages,
  separateImageFiles,
};

