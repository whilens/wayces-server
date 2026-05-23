const path = require('path');
const fs = require('fs');
const rootEnv = path.join(__dirname, '../.env');
if (fs.existsSync(rootEnv)) {
  require('dotenv').config({ path: rootEnv });
}
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const sequelize = require('./config/sequelize');
const models = require('./models');
const catalogCache = require('./services/catalogCache');

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

// Проверка версии фронта: если версия устарела — 426, клиент перезагрузит страницу (для всех запросов к /api)
app.use('/api', (req, res, next) => {
  const serverVersion = process.env.FRONTEND_VERSION;
  if (!serverVersion) return next();
  const clientVersion = (req.headers['x-client-version'] || '').trim();
  if (!clientVersion || clientVersion === serverVersion) return next();
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

const chatRoutes = require('./routes/chat');
app.use('/api/chat', chatRoutes);

// Централизованная обработка ошибок (должна быть последней)
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Подробный лог при ошибке подключения к PostgreSQL (без пароля)
function logDbConnectionFailure(error) {
  const cfg = sequelize.config || {};
  const host = cfg.host ?? process.env.DB_HOST ?? '(не задан)';
  const port = cfg.port ?? process.env.DB_PORT ?? '5432';
  const database = cfg.database ?? process.env.DB_NAME ?? '(не задан)';
  const username = cfg.username ?? process.env.DB_USER ?? '(не задан)';

  const orig = error.original || error.parent;
  const driverMsg = orig?.message || orig;
  const sqlState = orig?.code || orig?.errno;

  console.error('\n========== Ошибка подключения к PostgreSQL ==========');
  console.error('Параметры из .env / Sequelize (пароль не выводится):');
  console.error(`  DB_HOST     → ${host}`);
  console.error(`  DB_PORT     → ${port}`);
  console.error(`  DB_NAME     → ${database}`);
  console.error(`  DB_USER     → ${username}`);
  console.error('Сообщение Sequelize:', error.message);
  if (driverMsg && String(driverMsg) !== String(error.message)) {
    console.error('Сообщение драйвера / сервера:', driverMsg);
  }
  if (sqlState != null) {
    console.error('Код (ошибка драйвера / SQLSTATE):', sqlState);
  }

  const text = `${error.message} ${driverMsg || ''}`.toLowerCase();
  if (text.includes('pg_hba') || text.includes('no pg_hba')) {
    console.error('Подсказка: сервер отклонил клиента по pg_hba.conf. Для локального ПК задайте DB_HOST=127.0.0.1 или добавьте правило в pg_hba.conf для вашего IP.');
  } else if (text.includes('password') || text.includes('password authentication') || sqlState === '28P01') {
    console.error('Подсказка: неверный пароль или пользователь. Проверьте DB_USER и DB_PASSWORD.');
  } else if (text.includes('econnrefused') || sqlState === 'ECONNREFUSED') {
    console.error('Подсказка: соединение отклонено — нет процесса на host:port. Запустите PostgreSQL и проверьте DB_PORT.');
  } else if (text.includes('does not exist') && text.includes('database')) {
    console.error('Подсказка: база данных не создана. Создайте БД или поправьте DB_NAME.');
  } else if (text.includes('timeout') || text.includes('etimedout')) {
    console.error('Подсказка: таймаут — проверьте сеть, файрвол и что DB_HOST доступен с этой машины.');
  }
  console.error('=======================================================\n');
}

// Подключение к БД и синхронизация
const startServer = async () => {
  try {
    // Проверка подключения
    await sequelize.authenticate();
    console.log('✅ Подключение к БД успешно установлено');

    await catalogCache.connect();

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
    console.error('❌ Ошибка подключения к БД');
    logDbConnectionFailure(error);
    process.exit(1);
  }
};

startServer();
