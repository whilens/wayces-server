const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const models = require('../models');
const { Product, ProductVariant, ProductVariantOption, ProductCombination, ProductCombinationOption, ProductImage, Category } = models;
const { safeParseJSON } = require('../utils/safeParse');
const { safeParseInt, safeParseFloat } = require('../utils/validation');
const { getCategoryConfig } = require('../config/categories');
const { 
  formatProductName, 
  formatVariantsForFrontend, 
  getCombinationImage,
  generateCombinationKey,
  calculatePriceWithModifiers 
} = require('../utils/productHelpers');

/**
 * Рекурсивно получить все ID дочерних категорий для заданной категории
 * @param {number} parentCategoryId - ID родительской категории
 * @returns {Promise<number[]>} Массив ID категорий (включая саму родительскую и все дочерние)
 */
async function getAllChildCategoryIds(parentCategoryId) {
  const categoryIds = [parentCategoryId];
  
  // Получаем прямых потомков
  const children = await Category.findAll({
    where: { parentId: parentCategoryId },
  });
  
  // Рекурсивно получаем потомков для каждой дочерней категории
  for (const child of children) {
    const childIds = await getAllChildCategoryIds(child.id);
    categoryIds.push(...childIds);
  }
  
  return categoryIds;
}

// GET /api/products/categories - Получить все категории (должен быть ПЕРЕД /:id)
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.findAll({
      order: [['displayOrder', 'ASC'], ['name', 'ASC']],
    });
    res.json(categories);
  } catch (error) {
    console.error('Ошибка получения категорий:', error);
    res.status(500).json({ error: 'Ошибка получения категорий', message: error.message });
  }
});

// GET /api/products - Получить все товары с пагинацией и фильтрацией
router.get('/', async (req, res) => {
  try {
    // Валидация параметров пагинации
    let page, limit, offset;
    try {
      page = req.query.page ? safeParseInt(req.query.page, 'page', { min: 1 }) : 1;
      limit = req.query.limit ? safeParseInt(req.query.limit, 'limit', { min: 1, max: 100 }) : 10;
      offset = (page - 1) * limit;
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    // Валидация фильтров
    let categoryId = null;
    let minPrice = null;
    let maxPrice = null;
    
    try {
      categoryId = req.query.categoryId ? safeParseInt(req.query.categoryId, 'categoryId', { min: 1 }) : null;
      minPrice = req.query.minPrice ? safeParseFloat(req.query.minPrice, 'minPrice', { min: 0 }) : null;
      maxPrice = req.query.maxPrice ? safeParseFloat(req.query.maxPrice, 'maxPrice', { min: 0 }) : null;
      
      if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
        return res.status(400).json({ error: 'Минимальная цена не может быть больше максимальной' });
      }
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const search = req.query.search || null;
    const specifications = safeParseJSON(req.query.specifications, null);
    const variantFilters = safeParseJSON(req.query.variantFilters, null);

    // Формируем условия where (базовая фильтрация на уровне БД)
    const whereConditions = { isActive: true };

    if (categoryId) {
      // Получаем все дочерние категории (рекурсивно)
      const allCategoryIds = await getAllChildCategoryIds(categoryId);
      // Используем Op.in для фильтрации по всем категориям (родитель + дочерние)
      whereConditions.categoryId = {
        [Op.in]: allCategoryIds,
      };
    }

    if (search) {
      whereConditions.name = {
        [Op.iLike]: `%${search}%`,
      };
    }

    // Базовая фильтрация по цене на уровне БД (только если нет фильтров по вариантам)
    // Если есть фильтры по вариантам, финальная цена может отличаться от базовой
    const hasVariantFilters = variantFilters && Object.keys(variantFilters).length > 0;
    if (!hasVariantFilters && (minPrice !== null || maxPrice !== null)) {
      whereConditions.basePrice = {};
      if (minPrice !== null) {
        whereConditions.basePrice[Op.gte] = minPrice;
      }
      if (maxPrice !== null) {
        whereConditions.basePrice[Op.lte] = maxPrice;
      }
    }

    // ОПТИМИЗАЦИЯ: Получаем только отфильтрованные товары (не все!)
    const products = await Product.findAll({
      where: whereConditions,
      include: [
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
          model: ProductCombination,
          as: 'combinations',
          include: [
            {
              model: ProductCombinationOption,
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
            },
          ],
          required: false, // LEFT JOIN - комбинации могут отсутствовать
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    // ОПТИМИЗАЦИЯ: Фильтруем по specifications только для отфильтрованных товаров
    let filteredProducts = products;
    if (specifications && Object.keys(specifications).length > 0) {
      filteredProducts = products.filter((product) => {
        if (!product.specifications) return false;
        
        return Object.entries(specifications).every(([key, selectedValues]) => {
          if (!selectedValues || (Array.isArray(selectedValues) && selectedValues.length === 0)) {
            return true;
          }
          
          const specValue = product.specifications[key];
          if (!specValue) return false;
          
          const valuesArray = Array.isArray(selectedValues) ? selectedValues : [selectedValues];
          const specValueStr = String(specValue).toLowerCase();
          return valuesArray.some(selectedValue => 
            specValueStr === String(selectedValue).toLowerCase() ||
            specValueStr.includes(String(selectedValue).toLowerCase())
          );
        });
      });
    }

    // Загружаем настройки категорий (одна карточка на товар vs каждая комплектация отдельно)
    const categoryIds = [...new Set(filteredProducts.map((p) => p.categoryId).filter(Boolean))];
    const categoriesMap = new Map();
    if (categoryIds.length > 0) {
      const cats = await Category.findAll({
        where: { id: categoryIds },
        attributes: ['id', 'listCombinationsSeparately'],
      });
      cats.forEach((c) => categoriesMap.set(c.id, c));
    }

    // ОПТИМИЗАЦИЯ: Генерируем комбинации только для отфильтрованных товаров
    const productsWithCombinations = [];

    // ОПТИМИЗАЦИЯ: Собираем все ID комбинаций для массовой загрузки опций
    const allCombinationIds = [];
    filteredProducts.forEach(product => {
      if (product.combinations && product.combinations.length > 0) {
        product.combinations.forEach(comb => {
          if (comb.isActive !== false) {
            allCombinationIds.push(comb.id);
          }
        });
      }
    });
    
    // ОПТИМИЗАЦИЯ: Загружаем все опции комбинаций одним запросом
    const allCombinationOptions = allCombinationIds.length > 0
      ? await ProductCombinationOption.findAll({
          where: { combinationId: { [Op.in]: allCombinationIds } },
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
        })
      : [];
    
    // Создаем Map для быстрого доступа к опциям по ID комбинации
    const combinationOptionsMap = new Map();
    allCombinationOptions.forEach(opt => {
      const combId = opt.combinationId;
      if (!combinationOptionsMap.has(combId)) {
        combinationOptionsMap.set(combId, []);
      }
      combinationOptionsMap.get(combId).push(opt);
    });

    for (const product of filteredProducts) {
      if (product.variants && product.variants.length > 0) {
        const category = product.categoryId ? categoriesMap.get(product.categoryId) : null;
        const listSeparately = category ? category.listCombinationsSeparately === true : true;
        const productCombinationItems = [];

        // ОПТИМИЗАЦИЯ: Используем комбинации из БД, если они есть
        if (product.combinations && product.combinations.length > 0) {
          // Используем комбинации из БД
          for (const dbCombination of product.combinations) {
            if (dbCombination.isActive === false) continue;
            if ((dbCombination.stockQuantity ?? 0) <= 0) continue; // не показывать в каталоге комплектации без остатка

            // Получаем варианты комбинации из загруженных опций (оптимизация: один запрос для всех)
            const combVariants = {};
            const combOptions = combinationOptionsMap.get(dbCombination.id) || [];
            if (combOptions.length > 0) {
              combOptions.forEach((combOpt) => {
                if (combOpt.ProductVariantOption && combOpt.ProductVariantOption.variant) {
                  const variant = combOpt.ProductVariantOption.variant;
                  combVariants[variant.variantKey] = combOpt.ProductVariantOption.optionKey;
                }
              });
            }

            // ОПТИМИЗАЦИЯ: Применяем фильтры по вариантам во время обработки
            if (variantFilters && Object.keys(variantFilters).length > 0) {
              const matchesFilter = Object.entries(variantFilters).every(([variantKey, optionValue]) => {
                return combVariants[variantKey] === optionValue;
              });
              if (!matchesFilter) continue; // Пропускаем эту комбинацию
            }

            // ОПТИМИЗАЦИЯ: Проверяем цену во время обработки
            const finalPrice = parseFloat(dbCombination.price);
            if (minPrice !== null && finalPrice < minPrice) continue;
            if (maxPrice !== null && finalPrice > maxPrice) continue;

            // Формируем структуру вариантов для фронтенда
            const variantsForFrontend = formatVariantsForFrontend(product.variants);

            const combinationImage = getCombinationImage(product, combVariants, product.variants);
            productCombinationItems.push({
              id: `${product.id}-${dbCombination.combinationKey}`,
              productId: product.id,
              name: product.name,
              fullName: formatProductName(product.name, combVariants, product.variants),
              price: finalPrice,
              basePrice: parseFloat(product.basePrice),
              image: combinationImage || product.defaultImage || null,
              defaultImage: product.defaultImage || null,
              combinationKey: dbCombination.combinationKey,
              combinationId: dbCombination.id,
              variants: combVariants,
              discountType: product.discountType,
              discountValue: product.discountValue ? parseFloat(product.discountValue) : null,
              baseProduct: {
                id: product.id,
                name: product.name,
                specifications: product.specifications,
                variants: Object.keys(variantsForFrontend).length > 0 ? variantsForFrontend : null,
              },
            });
          }
        } else {
          // Если комбинаций в БД нет, генерируем их (но только для отфильтрованных товаров!)
          const generateCombinations = (variants, current = {}, index = 0) => {
            if (index === variants.length) {
              const combinationKey = Object.keys(current)
                .sort()
                .map(key => `${key}-${current[key]}`)
                .join('_');

              // ОПТИМИЗАЦИЯ: Применяем фильтры по вариантам во время генерации
              if (variantFilters && Object.keys(variantFilters).length > 0) {
                const matchesFilter = Object.entries(variantFilters).every(([variantKey, optionValue]) => {
                  return current[variantKey] === optionValue;
                });
                if (!matchesFilter) return; // Пропускаем эту комбинацию
              }

              // Вычисляем цену на основе модификаторов
              const finalPrice = calculatePriceWithModifiers(parseFloat(product.basePrice), current, product.variants);

              // ОПТИМИЗАЦИЯ: Проверяем цену во время генерации
              if (minPrice !== null && finalPrice < minPrice) return;
              if (maxPrice !== null && finalPrice > maxPrice) return;

              // Формируем структуру вариантов для фронтенда
              const variantsForFrontend = formatVariantsForFrontend(product.variants);

              const combinationImage = getCombinationImage(product, current, product.variants);
              productCombinationItems.push({
                id: `${product.id}-${combinationKey}`,
                productId: product.id,
                name: product.name,
                fullName: formatProductName(product.name, current, product.variants),
                price: finalPrice,
                basePrice: parseFloat(product.basePrice),
                image: combinationImage || product.defaultImage || null,
                defaultImage: product.defaultImage || null,
                combinationKey: combinationKey,
                combinationId: null,
                variants: current,
                discountType: product.discountType,
                discountValue: product.discountValue ? parseFloat(product.discountValue) : null,
                baseProduct: {
                  id: product.id,
                  name: product.name,
                  specifications: product.specifications,
                  variants: Object.keys(variantsForFrontend).length > 0 ? variantsForFrontend : null,
                },
              });
              return;
          }

          const variant = variants[index];
          if (variant.options) {
            variant.options.forEach(option => {
              if (option.isAvailable !== false) {
                generateCombinations(
                  variants,
                  { ...current, [variant.variantKey]: option.optionKey },
                  index + 1
                );
              }
            });
          }
        };

        generateCombinations(product.variants);
        }

        // Одна карточка на товар (категория: listCombinationsSeparately = false) или все комбинации
        if (!listSeparately && productCombinationItems.length > 0) {
          const prices = productCombinationItems.map((item) => item.price);
          const priceMin = Math.min(...prices);
          const priceMax = Math.max(...prices);
          const firstItem = productCombinationItems[0];
          const linkItem =
            productCombinationItems.find(
              (i) => Math.abs(Number(i.price) - priceMin) < 1e-6
            ) || firstItem;
          const variantsForFrontend = formatVariantsForFrontend(product.variants);
          productsWithCombinations.push({
            id: `product-${product.id}`,
            productId: product.id,
            name: product.name,
            fullName: product.name,
            price: priceMin,
            priceMax: priceMax,
            basePrice: parseFloat(product.basePrice),
            image: product.defaultImage || firstItem.image || null,
            defaultImage: product.defaultImage || null,
            displayAsProduct: true,
            // Ссылка на карточку: комплектация с минимальной ценой среди показанных в каталоге
            linkCombinationKey: linkItem.combinationKey,
            linkCombinationId: linkItem.combinationId ?? null,
            discountType: product.discountType,
            discountValue: product.discountValue ? parseFloat(product.discountValue) : null,
            baseProduct: {
              id: product.id,
              name: product.name,
              specifications: product.specifications,
              variants: Object.keys(variantsForFrontend).length > 0 ? variantsForFrontend : null,
            },
          });
        } else {
          productsWithCombinations.push(...productCombinationItems);
        }
      } else {
        // Товар без вариантов
        // ОПТИМИЗАЦИЯ: Проверяем цену во время обработки
        const price = parseFloat(product.basePrice);
        if (minPrice !== null && price < minPrice) continue;
        if (maxPrice !== null && price > maxPrice) continue;
        
        productsWithCombinations.push({
          id: product.id,
          productId: product.id,
          name: product.name,
          fullName: product.name,
          price: price,
          basePrice: price,
          image: product.defaultImage || null,
          defaultImage: product.defaultImage || null,
          discountType: product.discountType,
          discountValue: product.discountValue ? parseFloat(product.discountValue) : null,
          baseProduct: {
            id: product.id,
            name: product.name,
            specifications: product.specifications,
            variants: null,
          },
        });
      }
    }

    // ОПТИМИЗАЦИЯ: Фильтры уже применены во время генерации комбинаций
    // Фильтрация по вариантам и цене выполняется во время генерации/обработки комбинаций
    // Фильтрация по specifications применена к товарам до генерации комбинаций
    
    // Считаем total ДО пагинации - это общее количество комбинаций после фильтрации
    const total = productsWithCombinations.length;
    
    // Применяем пагинацию к финальному списку комбинаций
    const paginatedProducts = productsWithCombinations.slice(offset, offset + limit);
    
    // Вычисляем, есть ли ещё товары для загрузки
    const hasMore = offset + paginatedProducts.length < total;

    res.json({
      products: paginatedProducts,
      total,
      page,
      limit,
      hasMore,
    });
  } catch (error) {
    console.error('Ошибка получения товаров:', error);
    res.status(500).json({ error: 'Ошибка получения товаров', message: error.message });
  }
});

// GET /api/products/:id - Получить товар по ID
router.get('/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    // Валидация ID
    if (isNaN(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Неверный ID товара' });
    }
    
    const product = await Product.findByPk(productId, {
      include: [
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
          include: [
            {
              model: ProductCombinationOption,
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
            },
          ],
        },
      ],
    });

    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    // Загружаем категорию и конфигурацию для маппинга названий характеристик
    let categoryConfig = null;
    if (product.categoryId) {
      try {
        const category = await Category.findByPk(product.categoryId, {
          include: [
            {
              model: Category,
              as: 'parent',
            },
          ],
        });
        if (category) {
          const config = await getCategoryConfig(category.slug, category, true);
          if (config && config.specifications) {
            // Создаем маппинг ключей на labels и units
            const specLabelsMap = {};
            const specUnitsMap = {};
            config.specifications.forEach(spec => {
              if (spec.key && spec.label) {
                specLabelsMap[spec.key] = spec.label;
              }
              if (spec.key && spec.unit) {
                specUnitsMap[spec.key] = spec.unit;
              }
            });
            categoryConfig = {
              specifications: config.specifications || [],
              variants: config.variants || [],
              specLabelsMap, // Добавляем готовый маппинг
              specUnitsMap, // Добавляем маппинг единиц измерения
            };
          }
        }
      } catch (error) {
        console.error('Ошибка загрузки конфигурации категории:', error);
        // Продолжаем без конфигурации
      }
    }

    // Формируем структуру вариантов для фронтенда
    const variants = formatVariantsForFrontend(product.variants);

    // Формируем массив всех изображений товара
    const productImages = product.images && product.images.length > 0
      ? product.images
          .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
          .map(img => img.imageUrl)
      : [];

    // Формируем информацию о комплектациях для фронтенда
    const combinations = [];
    if (product.combinations && product.combinations.length > 0) {
      for (const comb of product.combinations) {
        if (comb.isActive !== false) {
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
          
          combinations.push({
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
    }

    res.json({
      id: product.id,
      name: product.name,
      basePrice: parseFloat(product.basePrice),
      categoryId: product.categoryId,
      description: product.description,
      specifications: product.specifications,
      defaultImage: product.defaultImage,
      images: productImages, // Все изображения товара
      rating: parseFloat(product.rating || 0),
      reviews: product.reviewsCount || 0,
      variants: Object.keys(variants).length > 0 ? variants : null,
      combinations: combinations.length > 0 ? combinations : null, // Комплектации товара
      discountType: product.discountType,
      discountValue: product.discountValue ? parseFloat(product.discountValue) : null,
      categoryConfig: categoryConfig, // Конфигурация категории с маппингом labels
    });
  } catch (error) {
    console.error('Ошибка получения товара:', error);
    res.status(500).json({ error: 'Ошибка получения товара', message: error.message });
  }
});

// Вспомогательные функции теперь в server/utils/productHelpers.js

module.exports = router;
