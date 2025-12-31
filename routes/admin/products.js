const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { authenticateAdmin } = require('../../middleware/authMiddleware');
const upload = require('../../middleware/upload');
const { processProductImage } = require('../../utils/imageProcessor');
const {
  processProductImages,
  saveProductImages,
  processOptionImages,
  saveOptionImages,
  separateImageFiles,
} = require('../../utils/productImageHandler');
const { safeParseJSON, safeParseJSONOrThrow } = require('../../utils/safeParse');
const { safeParseInt } = require('../../utils/validation');
const sequelize = require('../../config/sequelize');
const {
  Product,
  ProductVariant,
  ProductVariantOption,
  ProductCombination,
  ProductCombinationOption,
  ProductImage,
  Category,
} = require('../../models');
const path = require('path');
const fs = require('fs');
const { notifyNewProduct, notifyPriceDrop } = require('../../utils/pushNotifications');

// Генерация slug из названия
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

// GET /api/admin/products - Получить все товары для админа (с поиском и фильтрацией)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    let page, limit;
    try {
      page = req.query.page ? safeParseInt(req.query.page, 'page', { min: 1 }) : 1;
      limit = req.query.limit ? safeParseInt(req.query.limit, 'limit', { min: 1, max: 100 }) : 20;
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const categoryId = req.query.categoryId;
    const isActive = req.query.isActive;

    const where = {};
    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }
    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where,
      include: [
        {
          model: Category,
          as: 'category',
        },
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    res.json({
      products,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    console.error('Ошибка получения товаров:', error);
    res.status(500).json({ error: 'Ошибка получения товаров', message: error.message });
  }
});

// GET /api/admin/products/:id - Получить товар по ID для редактирования
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    const product = await Product.findByPk(productId, {
      include: [
        {
          model: Category,
          as: 'category',
        },
        {
          model: ProductVariant,
          as: 'variants',
          include: [
            {
              model: ProductVariantOption,
              as: 'options',
            },
          ],
        },
        {
          model: ProductImage,
          as: 'images',
        },
        {
          model: ProductCombination,
          as: 'combinations',
        },
      ],
    });

    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    // Формируем комплектации с вариантами
    const formattedCombinations = [];
    if (product.combinations && product.combinations.length > 0) {
      for (const comb of product.combinations) {
        const combVariants = {};
        
        // Получаем опции комплектации с вариантами
        const combOptions = await ProductCombinationOption.findAll({
          where: { combinationId: comb.id },
          include: [
            {
              model: ProductVariantOption,
              include: [
                {
                  model: ProductVariant,
                  as: 'variant',
                },
              ],
            },
          ],
        });
        
        combOptions.forEach((combOpt) => {
          if (combOpt.ProductVariantOption && combOpt.ProductVariantOption.variant) {
            const variant = combOpt.ProductVariantOption.variant;
            combVariants[variant.variantKey] = combOpt.ProductVariantOption.optionKey;
          }
        });
        
        formattedCombinations.push({
          id: comb.id,
          combinationKey: comb.combinationKey,
          price: parseFloat(comb.price),
          stockQuantity: comb.stockQuantity || 0,
          sku: comb.sku || null,
          isActive: comb.isActive !== false,
          variants: combVariants,
        });
      }
    }

    // Формируем ответ с отформатированными комплектациями
    const productData = product.toJSON();
    productData.combinations = formattedCombinations;

    res.json(productData);
  } catch (error) {
    console.error('Ошибка получения товара:', error);
    res.status(500).json({ error: 'Ошибка получения товара', message: error.message });
  }
});

// POST /api/admin/products - Создать новый товар
// Используем any() для обработки всех файлов, затем разделяем их
router.post('/', authenticateAdmin, upload.any(), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      name,
      basePrice,
      categoryId,
      description,
      specifications,
      variants,
      combinations, // Комплектации, созданные админом
      isActive = true,
      discountType,
      discountValue,
      defaultImage,
      defaultImageFromNew,
      defaultImageNewIndex,
    } = req.body;

    // Валидация обязательных полей
    if (!name || !basePrice) {
      return res.status(400).json({ error: 'Название и цена обязательны' });
    }

    // Парсим JSON поля
    let parsedSpecifications = null;
    let parsedVariants = [];
    
    try {
      parsedSpecifications = specifications ? safeParseJSONOrThrow(specifications, 'specifications') : null;
      parsedVariants = variants ? safeParseJSONOrThrow(variants, 'variants') : [];
    } catch (error) {
      await transaction.rollback();
      return res.status(400).json({ error: error.message });
    }

    // Генерируем slug
    let slug = generateSlug(name);
    let slugExists = await Product.findOne({ where: { slug }, transaction });
    let counter = 1;
    while (slugExists) {
      slug = `${generateSlug(name)}-${counter}`;
      slugExists = await Product.findOne({ where: { slug }, transaction });
      counter++;
    }

    // Разделяем и обрабатываем файлы изображений
    const { productImages, optionImages } = separateImageFiles(req.files);
    
    const { processedImages, defaultImagePath } = await processProductImages(
      productImages,
      { defaultImageFromNew, defaultImageNewIndex, defaultImage }
    );

    // Валидация скидки
    let finalDiscountType = null;
    let finalDiscountValue = 0;
    if (discountType && (discountType === 'percentage' || discountType === 'fixed')) {
      const discountVal = parseFloat(discountValue || 0);
      if (discountVal > 0) {
        if (discountType === 'percentage' && discountVal > 100) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Процент скидки не может быть больше 100%' });
        }
        finalDiscountType = discountType;
        finalDiscountValue = discountVal;
      }
    }

    // Создаем товар
    const product = await Product.create(
      {
        name,
        slug,
        basePrice: parseFloat(basePrice),
        categoryId: categoryId ? parseInt(categoryId) : null,
        description: description || null,
        specifications: parsedSpecifications,
        defaultImage: defaultImagePath,
        isActive: isActive === true || isActive === 'true',
        discountType: finalDiscountType,
        discountValue: finalDiscountValue,
      },
      { transaction }
    );

    // Сохраняем изображения товара
    await saveProductImages(processedImages, product.id, transaction);

    // Создаем варианты и опции
    if (parsedVariants && parsedVariants.length > 0) {
      for (const variantData of parsedVariants) {
        const variant = await ProductVariant.create(
          {
            productId: product.id,
            variantKey: variantData.key,
            variantName: variantData.name,
            variantType: variantData.type,
            displayOrder: variantData.displayOrder || 0,
            isRequired: variantData.isRequired !== false,
          },
          { transaction }
        );

        // Создаем опции для варианта
        if (variantData.options && variantData.options.length > 0) {
          for (let oIndex = 0; oIndex < variantData.options.length; oIndex++) {
            const optionData = variantData.options[oIndex];
            
            // Обрабатываем изображения опции
            const processedOptionImages = await processOptionImages(
              optionImages,
              optionData.images
            );
            
            const createdOption = await ProductVariantOption.create(
              {
                variantId: variant.id,
                optionKey: optionData.key,
                optionValue: optionData.value,
                colorCode: optionData.colorCode || null,
                priceModifier: parseFloat(optionData.priceModifier || 0),
                images: processedOptionImages,
                isDefault: optionData.isDefault || false,
                isAvailable: optionData.isAvailable !== false,
                stockQuantity: parseInt(optionData.stockQuantity || 0),
                displayOrder: optionData.displayOrder || 0,
              },
              { transaction }
            );
            
            // Сохраняем изображения опции в ProductImage
            if (processedOptionImages) {
              await saveOptionImages(processedOptionImages, createdOption.id, transaction);
            }
          }
        }
      }
    }

    // Создаем комплектации, переданные админом (вместо автоматической генерации)
    if (combinations && parsedVariants.length > 0) {
      let parsedCombinations;
      try {
        parsedCombinations = safeParseJSONOrThrow(combinations, 'combinations');
      } catch (error) {
        await transaction.rollback();
        return res.status(400).json({ error: error.message });
      }
      
      // Получаем варианты с опциями для создания связей
      const dbVariants = await ProductVariant.findAll({
        where: { productId: product.id },
        include: [{ model: ProductVariantOption, as: 'options' }],
        transaction,
      });

      const variantMap = {};
      dbVariants.forEach((v) => {
        variantMap[v.variantKey] = v;
      });

      for (const combData of parsedCombinations) {
        // Формируем ключ комбинации
        const combinationKey = Object.keys(combData.variants || {})
          .sort()
          .map((key) => `${key}-${combData.variants[key]}`)
          .join('_');

        if (!combinationKey) continue; // Пропускаем пустые комбинации

        // Создаем комбинацию
        const combination = await ProductCombination.create(
          {
            productId: product.id,
            combinationKey,
            price: parseFloat(combData.price || basePrice),
            stockQuantity: parseInt(combData.stockQuantity || 0),
            sku: combData.sku || null,
            isActive: true,
          },
          { transaction }
        );

        // Создаем связи комбинации с опциями
        for (const [variantKey, optionKey] of Object.entries(combData.variants || {})) {
          const variant = variantMap[variantKey];
          if (variant) {
            const option = variant.options?.find((opt) => opt.optionKey === optionKey);
            if (option) {
              await ProductCombinationOption.create(
                {
                  combinationId: combination.id,
                  optionId: option.id,
                },
                { transaction }
              );
            }
          }
        }
      }
    }

    await transaction.commit();

    // Отправляем push-уведомление о новом товаре
    try {
      await notifyNewProduct(product);
    } catch (pushError) {
      console.error('Ошибка отправки push-уведомления о новом товаре:', pushError);
      // Не прерываем выполнение, если push не отправился
    }

    // Получаем созданный товар с полными данными
    const createdProduct = await Product.findByPk(product.id, {
      include: [
        {
          model: Category,
          as: 'category',
        },
        {
          model: ProductVariant,
          as: 'variants',
          include: [
            {
              model: ProductVariantOption,
              as: 'options',
            },
          ],
        },
        {
          model: ProductImage,
          as: 'images',
        },
      ],
    });

    res.status(201).json({
      message: 'Товар успешно создан',
      product: createdProduct,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Ошибка создания товара:', error);
    res.status(500).json({ error: 'Ошибка создания товара', message: error.message });
  }
});

// PUT /api/admin/products/:id - Обновить товар
// Используем any() для обработки всех файлов, затем разделяем их
router.put('/:id', authenticateAdmin, upload.any(), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const productId = parseInt(req.params.id);
    const {
      name,
      basePrice,
      categoryId,
      description,
      specifications,
      variants,
      combinations, // Комплектации, созданные админом
      isActive,
      discountType,
      discountValue,
      removeImages,
      defaultImage,
      defaultImageFromNew,
      defaultImageNewIndex,
    } = req.body;

    const product = await Product.findByPk(productId, { transaction });

    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Товар не найден' });
    }

    // Сохраняем старую цену для проверки снижения
    const oldPrice = parseFloat(product.basePrice);

    // Обновляем основные поля
    if (name) product.name = name;
    if (basePrice !== undefined) product.basePrice = parseFloat(basePrice);
    if (categoryId !== undefined) product.categoryId = categoryId ? parseInt(categoryId) : null;
    if (description !== undefined) product.description = description || null;
    if (specifications !== undefined) {
      try {
        product.specifications = specifications ? safeParseJSONOrThrow(specifications, 'specifications') : null;
      } catch (error) {
        await transaction.rollback();
        return res.status(400).json({ error: error.message });
      }
    }
    if (isActive !== undefined) product.isActive = isActive === true || isActive === 'true';
    
    // Обновляем скидку
    if (discountType !== undefined) {
      let finalDiscountType = null;
      let finalDiscountValue = 0;
      if (discountType && (discountType === 'percentage' || discountType === 'fixed')) {
        const discountVal = parseFloat(discountValue || 0);
        if (discountVal > 0) {
          if (discountType === 'percentage' && discountVal > 100) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Процент скидки не может быть больше 100%' });
          }
          finalDiscountType = discountType;
          finalDiscountValue = discountVal;
        }
      }
      product.discountType = finalDiscountType;
      product.discountValue = finalDiscountValue;
    }

    // Обновляем slug если изменилось название
    if (name && name !== product.name) {
      let slug = generateSlug(name);
      let slugExists = await Product.findOne({
        where: { slug, id: { [Op.ne]: productId } },
        transaction,
      });
      let counter = 1;
      while (slugExists) {
        slug = `${generateSlug(name)}-${counter}`;
        slugExists = await Product.findOne({
          where: { slug, id: { [sequelize.Op.ne]: productId } },
          transaction,
        });
        counter++;
      }
      product.slug = slug;
    }

    // Разделяем и обрабатываем файлы изображений
    const { productImages, optionImages } = separateImageFiles(req.files);
    
    let processedImages = [];
    if (productImages.length > 0) {
      const result = await processProductImages(
        productImages,
        { defaultImageFromNew, defaultImageNewIndex, defaultImage }
      );
      processedImages = result.processedImages;
      
      // Находим максимальный displayOrder
      const maxOrder = await ProductImage.max('displayOrder', {
        where: { productId: product.id },
        transaction,
      });

      // Сохраняем новые изображения
      await Promise.all(
        processedImages.map((img, index) =>
          ProductImage.create(
            {
              productId: product.id,
              imageUrl: img.main,
              displayOrder: (maxOrder || 0) + index + 1,
            },
            { transaction }
          )
        )
      );

      // Обновляем defaultImage
      if (result.defaultImagePath) {
        product.defaultImage = result.defaultImagePath;
      }
    } else if (defaultImage) {
      // Если нет новых изображений, но указан defaultImage из существующих
      product.defaultImage = defaultImage;
    }

    // Удаляем указанные изображения
    if (removeImages) {
      let imageIds;
      try {
        imageIds = safeParseJSONOrThrow(removeImages, 'removeImages');
      } catch (error) {
        await transaction.rollback();
        return res.status(400).json({ error: error.message });
      }
      
      // Получаем информацию об изображениях перед удалением
      const imagesToDelete = await ProductImage.findAll({
        where: { id: imageIds, productId: product.id },
        transaction,
      });
      
      // Удаляем файлы с диска
      for (const image of imagesToDelete) {
        try {
          // image.imageUrl содержит путь вида "/uploads/product-123_main.jpg"
          // Нужно преобразовать в абсолютный путь
          let imagePath = image.imageUrl;
          if (imagePath.startsWith('/')) {
            imagePath = imagePath.substring(1); // Убираем ведущий слэш
          }
          const mainImagePath = path.join(__dirname, '..', imagePath);
          
          if (fs.existsSync(mainImagePath)) {
            fs.unlinkSync(mainImagePath);
          }
          
          // Удаляем миниатюру (если есть)
          // Путь может быть с _main или без, нужно проверить оба варианта
          const thumbnailPath1 = mainImagePath.replace('_main.', '_thumb.');
          const thumbnailPath2 = mainImagePath.replace(/\.(jpg|jpeg|png|webp)$/i, '_thumb.$1');
          
          if (fs.existsSync(thumbnailPath1)) {
            fs.unlinkSync(thumbnailPath1);
          } else if (fs.existsSync(thumbnailPath2)) {
            fs.unlinkSync(thumbnailPath2);
          }
        } catch (fileError) {
          console.error(`Ошибка удаления файла ${image.imageUrl}:`, fileError);
          // Продолжаем удаление даже если файл не найден
        }
      }
      
      // Сохраняем URL удаляемых изображений для проверки defaultImage
      const deletedImageUrls = imagesToDelete.map(img => img.imageUrl);
      const wasDefaultImageDeleted = product.defaultImage && deletedImageUrls.includes(product.defaultImage);
      
      // Удаляем записи из БД
      await ProductImage.destroy({
        where: { id: imageIds, productId: product.id },
        transaction,
      });
      
      // Если удаленное изображение было defaultImage, обновляем defaultImage
      if (wasDefaultImageDeleted) {
        // Ищем первое оставшееся изображение (после удаления)
        const remainingImages = await ProductImage.findAll({
          where: { productId: product.id },
          order: [['displayOrder', 'ASC']],
          limit: 1,
          transaction,
        });
        
        if (remainingImages.length > 0) {
          product.defaultImage = remainingImages[0].imageUrl;
        } else {
          // Если нет оставшихся изображений, проверяем новые загруженные
          if (processedImages && processedImages.length > 0) {
            product.defaultImage = processedImages[0].main;
          } else {
            product.defaultImage = null;
          }
        }
      }
    }

    await product.save({ transaction });

    // Сначала удаляем старые комплектации и их связи (если будут обновляться варианты или комплектации)
    const willUpdateVariants = !!variants;
    // Комплектации обновляются, если они переданы (даже если это пустой массив - значит все удалены)
    const willUpdateCombinations = !!(combinations && typeof combinations === 'string' && combinations.trim() !== '');
    if (willUpdateVariants || willUpdateCombinations) {
      const oldCombinations = await ProductCombination.findAll({
        where: { productId: product.id },
        transaction,
      });
      if (oldCombinations.length > 0) {
        const oldCombinationIds = oldCombinations.map(c => c.id);
        await ProductCombinationOption.destroy({
          where: { combinationId: { [Op.in]: oldCombinationIds } },
          transaction,
        });
        await ProductCombination.destroy({ where: { productId: product.id }, transaction });
      }
    }

    // Обновляем варианты ПЕРВЫМИ (упрощенная версия - удаляем старые и создаем новые)
    if (variants) {
      let parsedVariants;
      try {
        parsedVariants = safeParseJSONOrThrow(variants, 'variants');
      } catch (error) {
        await transaction.rollback();
        return res.status(400).json({ error: error.message });
      }

      // Удаляем старые варианты и комбинации
      // Сначала удаляем связи комбинаций с опциями
      const oldCombinations = await ProductCombination.findAll({
        where: { productId: product.id },
        transaction,
      });
      if (oldCombinations.length > 0) {
        const oldCombinationIds = oldCombinations.map(c => c.id);
        await ProductCombinationOption.destroy({
          where: { combinationId: { [Op.in]: oldCombinationIds } },
          transaction,
        });
      }
      // Затем удаляем комбинации
      await ProductCombination.destroy({ where: { productId: product.id }, transaction });
      // Затем удаляем варианты (каскадно удалятся опции)
      await ProductVariant.destroy({ where: { productId: product.id }, transaction });

      // Создаем новые варианты (аналогично POST)
      if (parsedVariants.length > 0) {
        for (const variantData of parsedVariants) {
          const variant = await ProductVariant.create(
            {
              productId: product.id,
              variantKey: variantData.key,
              variantName: variantData.name,
              variantType: variantData.type,
              displayOrder: variantData.displayOrder || 0,
              isRequired: variantData.isRequired !== false,
            },
            { transaction }
          );

          if (variantData.options && variantData.options.length > 0) {
            for (const optionData of variantData.options) {
              await ProductVariantOption.create(
                {
                  variantId: variant.id,
                  optionKey: optionData.key,
                  optionValue: optionData.value,
                  colorCode: optionData.colorCode || null,
                  priceModifier: parseFloat(optionData.priceModifier || 0),
                  images: optionData.images ? (Array.isArray(optionData.images) ? optionData.images : [optionData.images]) : null,
                  isDefault: optionData.isDefault || false,
                  isAvailable: optionData.isAvailable !== false,
                  stockQuantity: parseInt(optionData.stockQuantity || 0),
                  displayOrder: optionData.displayOrder || 0,
                },
                { transaction }
              );
            }
          }
        }

        // Регенерируем комбинации ТОЛЬКО если комплектации не переданы из формы
        // Проверяем, что combinations не переданы или пусты
        if (!combinations || (typeof combinations === 'string' && combinations.trim() === '') || (Array.isArray(combinations) && combinations.length === 0)) {
          const dbVariants = await ProductVariant.findAll({
            where: { productId: product.id },
            include: [{ model: ProductVariantOption, as: 'options' }],
            transaction,
          });

          const variantMap = {};
          dbVariants.forEach((v) => {
            variantMap[v.variantKey] = {
              key: v.variantKey,
              options: v.options.map((opt) => ({
                key: opt.optionKey,
                priceModifier: parseFloat(opt.priceModifier || 0),
                isAvailable: opt.isAvailable !== false,
              })),
            };
          });

          const generateCombinations = (variants, current = {}, index = 0) => {
            if (index === variants.length) {
              return [current];
            }
            const variant = variants[index];
            const combinations = [];
            variant.options.forEach((option) => {
              if (option.isAvailable !== false) {
                const newCurrent = { ...current, [variant.key]: option.key };
                combinations.push(...generateCombinations(variants, newCurrent, index + 1));
              }
            });
            return combinations;
          };

          const generatedCombinations = generateCombinations(Object.values(variantMap));

          for (const combination of generatedCombinations) {
            const combinationKey = Object.keys(combination)
              .sort()
              .map((key) => `${key}-${combination[key]}`)
              .join('_');

            let combinationPrice = parseFloat(product.basePrice);
            for (const [variantKey, optionKey] of Object.entries(combination)) {
              const variant = variantMap[variantKey];
              const option = variant.options.find((opt) => opt.key === optionKey);
              if (option) {
                combinationPrice += option.priceModifier;
              }
            }

            // Создаем комплектацию
            const createdCombination = await ProductCombination.create(
              {
                productId: product.id,
                combinationKey,
                price: combinationPrice,
                stockQuantity: 0,
                isActive: true,
              },
              { transaction }
            );

            // Создаем связи комплектации с опциями вариантов
            for (const [variantKey, optionKey] of Object.entries(combination)) {
              const variant = dbVariants.find(v => v.variantKey === variantKey);
              if (variant) {
                const option = variant.options?.find(opt => opt.optionKey === optionKey);
                if (option) {
                  await ProductCombinationOption.create(
                    {
                      combinationId: createdCombination.id,
                      optionId: option.id,
                    },
                    { transaction }
                  );
                }
              }
            }
          }
        }
      }
    }

    // Обрабатываем комплектации, переданные админом (ПОСЛЕ создания вариантов)
    // Проверяем, что combinations переданы (даже если это пустой массив - значит все удалены)
    if (combinations && typeof combinations === 'string' && combinations.trim() !== '') {
      let parsedCombinations;
      try {
        parsedCombinations = safeParseJSONOrThrow(combinations, 'combinations');
      } catch (error) {
        await transaction.rollback();
        return res.status(400).json({ error: error.message });
      }

      // Создаем новые комплектации, если они есть (если массив пуст, просто не создаем ничего)
      if (parsedCombinations && Array.isArray(parsedCombinations) && parsedCombinations.length > 0) {
        // Получаем варианты с опциями для создания связей
        const dbVariants = await ProductVariant.findAll({
          where: { productId: product.id },
          include: [{ model: ProductVariantOption, as: 'options' }],
          transaction,
        });

        const variantMap = {};
        dbVariants.forEach((v) => {
          variantMap[v.variantKey] = v;
        });

        for (const combData of parsedCombinations) {
          // Формируем ключ комбинации
          const combinationKey = Object.keys(combData.variants || {})
            .sort()
            .map((key) => `${key}-${combData.variants[key]}`)
            .join('_');

          if (!combinationKey) continue; // Пропускаем пустые комбинации

          // Создаем комбинацию
          const combination = await ProductCombination.create(
            {
              productId: product.id,
              combinationKey,
              price: parseFloat(combData.price || product.basePrice || 0),
              stockQuantity: parseInt(combData.stockQuantity || 0),
              sku: combData.sku || null,
              isActive: true,
            },
            { transaction }
          );

          // Создаем связи комбинации с опциями
          for (const [variantKey, optionKey] of Object.entries(combData.variants || {})) {
            const variant = variantMap[variantKey];
            if (variant) {
              const option = variant.options?.find((opt) => opt.optionKey === optionKey);
              if (option) {
                await ProductCombinationOption.create(
                  {
                    combinationId: combination.id,
                    optionId: option.id,
                  },
                  { transaction }
                );
              }
            }
          }
        }
      }
    }

    await transaction.commit();

    // Проверяем снижение цены и отправляем push-уведомление
    const newPrice = parseFloat(product.basePrice);
    if (oldPrice > newPrice) {
      try {
        await notifyPriceDrop(product, oldPrice, newPrice);
      } catch (pushError) {
        console.error('Ошибка отправки push-уведомления о снижении цены:', pushError);
        // Не прерываем выполнение, если push не отправился
      }
    }

    // Получаем обновленный товар
    const updatedProduct = await Product.findByPk(productId, {
      include: [
        {
          model: Category,
          as: 'category',
        },
        {
          model: ProductVariant,
          as: 'variants',
          include: [
            {
              model: ProductVariantOption,
              as: 'options',
            },
          ],
        },
        {
          model: ProductImage,
          as: 'images',
        },
      ],
    });

    res.json({
      message: 'Товар успешно обновлен',
      product: updatedProduct,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Ошибка обновления товара:', error);
    res.status(500).json({ error: 'Ошибка обновления товара', message: error.message });
  }
});

// DELETE /api/admin/products/:id - Удалить товар
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    const product = await Product.findByPk(productId);

    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    await product.destroy();

    res.json({ message: 'Товар успешно удален' });
  } catch (error) {
    console.error('Ошибка удаления товара:', error);
    res.status(500).json({ error: 'Ошибка удаления товара', message: error.message });
  }
});

module.exports = router;

