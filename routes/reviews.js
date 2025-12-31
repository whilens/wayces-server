const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Review, User, Product } = require('../models');
const { Op } = require('sequelize');
const { formatReviewResponse, calculateReviewStats } = require('../utils/reviewHelpers');
const { JWT_SECRET } = require('../config/jwt');
const { safeParseInt } = require('../utils/validation');
const { reviewCreateLimiter } = require('../middleware/rateLimiting');

// Настройка multer для загрузки фото
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/reviews');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('Создана директория для фото отзывов:', uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = 'review-' + uniqueSuffix + path.extname(file.originalname);
    console.log('Сохранение файла отзыва:', filename, 'Оригинальное имя:', file.originalname);
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Разрешены только изображения (jpeg, jpg, png, webp)'));
  },
});

// Middleware для проверки авторизации пользователя
const userAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    const token = authHeader.split(' ')[1];
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Токен невалиден или истек' });
    }

    if (decoded.type !== 'user') {
      return res.status(401).json({ error: 'Невалидный токен' });
    }

    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// GET /api/reviews/product/:productId - Получить отзывы товара
router.get('/product/:productId', async (req, res) => {
  try {
    // Валидация параметров
    let productId, page, limit, offset, rating;
    
    try {
      productId = safeParseInt(req.params.productId, 'productId', { min: 1, required: true });
      page = req.query.page ? safeParseInt(req.query.page, 'page', { min: 1 }) : 1;
      limit = req.query.limit ? safeParseInt(req.query.limit, 'limit', { min: 1, max: 50 }) : 5;
      offset = (page - 1) * limit;
      rating = req.query.rating ? safeParseInt(req.query.rating, 'rating', { min: 1, max: 5 }) : null;
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const withPhoto = req.query.withPhoto === 'true';
    const withText = req.query.withText === 'true';
    const sort = req.query.sort || 'newest'; // newest, oldest, highest, lowest

    // Условия фильтрации
    const whereConditions = {
      productId,
      status: 'approved', // Только одобренные отзывы
    };

    if (rating) {
      whereConditions.rating = rating;
    }

    if (withPhoto) {
      whereConditions.photos = {
        [Op.not]: null,
        [Op.ne]: '[]',
      };
    }

    if (withText) {
      whereConditions.text = {
        [Op.not]: null,
        [Op.ne]: '',
      };
    }

    // Сортировка
    let order = [];
    // Закрепленные всегда вверху
    order.push(['isPinned', 'DESC']);
    
    switch (sort) {
      case 'oldest':
        order.push(['createdAt', 'ASC']);
        break;
      case 'highest':
        order.push(['rating', 'DESC']);
        break;
      case 'lowest':
        order.push(['rating', 'ASC']);
        break;
      case 'newest':
      default:
        order.push(['createdAt', 'DESC']);
    }

    const { count, rows: reviews } = await Review.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'avatar'],
        },
      ],
      order,
      limit,
      offset,
    });

    // Получаем статистику рейтинга
    const stats = await calculateReviewStats(productId);

    res.json({
      reviews: reviews.map(formatReviewResponse),
      total: count,
      page,
      limit,
      hasMore: offset + reviews.length < count,
      stats,
    });
  } catch (error) {
    console.error('Ошибка получения отзывов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/reviews/my - Получить отзывы текущего пользователя
router.get('/my', userAuth, async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: { userId: req.user.id },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'defaultImage'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      reviews: reviews.map(r => ({
        id: r.id,
        productId: r.productId,
        product: r.product ? {
          id: r.product.id,
          name: r.product.name,
          image: r.product.defaultImage,
        } : null,
        rating: r.rating,
        text: r.text,
        pros: r.pros,
        cons: r.cons,
        photos: r.photos || [],
        status: r.status,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Ошибка получения отзывов пользователя:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/reviews/check/:productId - Проверить, оставлял ли пользователь отзыв
router.get('/check/:productId', userAuth, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    
    const existingReview = await Review.findOne({
      where: {
        userId: req.user.id,
        productId,
      },
    });

    res.json({
      hasReview: !!existingReview,
      review: existingReview ? {
        id: existingReview.id,
        status: existingReview.status,
      } : null,
    });
  } catch (error) {
    console.error('Ошибка проверки отзыва:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/reviews - Создать отзыв
router.post('/', reviewCreateLimiter, userAuth, upload.array('photos', 5), async (req, res) => {
  try {
    const { productId, rating, text, pros, cons } = req.body;

    // Валидация
    if (!productId || !rating || !text) {
      return res.status(400).json({ error: 'Товар, рейтинг и текст обязательны' });
    }

    const ratingNum = parseInt(rating);
    if (ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Рейтинг должен быть от 1 до 5' });
    }

    if (text.length < 10 || text.length > 2000) {
      return res.status(400).json({ error: 'Текст отзыва должен содержать от 10 до 2000 символов' });
    }

    // Проверяем существование товара
    const product = await Product.findByPk(productIdNum);
    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    // Проверяем, не оставлял ли пользователь уже отзыв
    const existingReview = await Review.findOne({
      where: {
        userId: req.user.id,
        productId: productIdNum,
      },
    });

    if (existingReview) {
      return res.status(400).json({ error: 'Вы уже оставили отзыв на этот товар' });
    }

    // Обрабатываем загруженные фото
    console.log('Загруженные файлы:', req.files);
    console.log('Тело запроса:', req.body);
    
    const photos = req.files && req.files.length > 0 
      ? req.files.map(f => `/uploads/reviews/${f.filename}`) 
      : [];
    
    console.log('Обработанные пути к фото:', photos);

    // Создаем отзыв
    const review = await Review.create({
      userId: req.user.id,
      productId: productIdNum,
      rating: ratingNum,
      text: text.trim(),
      pros: pros ? pros.trim() : null,
      cons: cons ? cons.trim() : null,
      photos: photos.length > 0 ? photos : null, // Сохраняем как JSON массив или null
      status: 'pending', // На модерацию
    });
    
    console.log('Создан отзыв с фото:', review.photos);

    res.status(201).json({
      message: 'Отзыв отправлен на модерацию',
      review: {
        id: review.id,
        rating: review.rating,
        text: review.text,
        status: review.status,
      },
    });
  } catch (error) {
    console.error('Ошибка создания отзыва:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

