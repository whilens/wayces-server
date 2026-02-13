require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const sequelize = require('./config/sequelize');
const models = require('./models');

const app = express();

// CORS настройка
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true,
  exposedHeaders: ['X-New-Access-Token', 'X-New-Version'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Статические файлы для загруженных изображений
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Проверка версии фронта (только для залогиненных): если версия устарела — 426, клиент перезагрузит страницу
app.use('/api', (req, res, next) => {
  const serverVersion = process.env.FRONTEND_VERSION;
  if (!serverVersion || !req.headers.authorization?.startsWith('Bearer ')) return next();
  const clientVersion = (req.headers['x-client-version'] || '').trim();
  if (clientVersion === serverVersion) return next();
  res.setHeader('X-New-Version', serverVersion);
  return res.status(426).json({ error: { message: 'Вышло обновление приложения. Перезагрузка страницы…' } });
});

// Роуты
app.get('/', (req, res) => {
  res.json({ message: 'Сервер работает!' });
});

// API роуты
const productsRoutes = require('./routes/products');
app.use('/api/products', productsRoutes);

const ordersRoutes = require('./routes/orders');
app.use('/api/orders', ordersRoutes);

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const userAuthRoutes = require('./routes/userAuth');
app.use('/api/user-auth', userAuthRoutes);

const reviewsRoutes = require('./routes/reviews');
app.use('/api/reviews', reviewsRoutes);

const favoritesRoutes = require('./routes/favorites');
app.use('/api/favorites', favoritesRoutes);

const accountRoutes = require('./routes/account');
app.use('/api/account', accountRoutes);

const searchRoutes = require('./routes/search');
app.use('/api/search', searchRoutes);

const adminProductsRoutes = require('./routes/admin/products');
app.use('/api/admin/products', adminProductsRoutes);

const adminCategoryConfigRoutes = require('./routes/admin/categoryConfig');
app.use('/api/admin/category-config', adminCategoryConfigRoutes);

const adminCategoriesRoutes = require('./routes/admin/categories');
app.use('/api/admin/categories', adminCategoriesRoutes);

const adminReviewsRoutes = require('./routes/admin/reviews');
app.use('/api/admin/reviews', adminReviewsRoutes);

const pushSubscriptionsRoutes = require('./routes/pushSubscriptions');
app.use('/api/push-subscriptions', pushSubscriptionsRoutes);

// Централизованная обработка ошибок (должна быть последней)
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Подключение к БД и синхронизация
const startServer = async () => {
  try {
    // Проверка подключения
    await sequelize.authenticate();
    console.log('✅ Подключение к БД успешно установлено');

    // Синхронизация моделей с БД
    // В продакшене использовать миграции, а не alter: true
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ Модели синхронизированы с БД (development режим)');
    } else {
      // В продакшене только проверяем подключение
      // Миграции должны выполняться отдельно через Sequelize CLI
      await sequelize.sync({ alter: true });
      console.log('✅ Подключение к БД установлено (production режим - используйте миграции)');
    }

    // Запуск сервера
    // Слушаем на 0.0.0.0 чтобы быть доступным извне (для Docker и проксирования)
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Сервер запущен на порту ${PORT}`);
      console.log(`🌐 API доступен: http://0.0.0.0:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Ошибка подключения к БД:', error.message);
    process.exit(1);
  }
};

startServer();
