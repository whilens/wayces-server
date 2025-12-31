const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Размеры для обработки изображений
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 1200;
const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 400;

/**
 * Обработка изображения: изменение размера и сохранение
 * @param {string} inputPath - путь к исходному файлу
 * @param {string} outputPath - путь для сохранения обработанного файла
 * @param {number} width - ширина
 * @param {number} height - высота
 */
const processImage = async (inputPath, outputPath, width, height) => {
  try {
    await sharp(inputPath)
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error('Ошибка обработки изображения:', error);
    throw error;
  }
};

/**
 * Обработка изображения товара: создание основного и миниатюры
 * @param {string} filePath - путь к загруженному файлу
 * @returns {Object} объект с путями к обработанным изображениям
 */
const processProductImage = async (filePath) => {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  // Путь для основного изображения
  const mainImagePath = path.join(dir, `${baseName}_main${ext}`);
  // Путь для миниатюры
  const thumbnailPath = path.join(dir, `${baseName}_thumb${ext}`);

  // Обрабатываем основное изображение
  await processImage(filePath, mainImagePath, IMAGE_WIDTH, IMAGE_HEIGHT);

  // Обрабатываем миниатюру
  await processImage(filePath, thumbnailPath, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

  // Удаляем исходный файл
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  return {
    main: mainImagePath.replace(path.join(__dirname, '../'), '/'),
    thumbnail: thumbnailPath.replace(path.join(__dirname, '../'), '/'),
  };
};

module.exports = {
  processProductImage,
  processImage,
};

