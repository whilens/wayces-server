/**
 * Конфигурация JWT
 * Проверяет наличие JWT_SECRET при загрузке модуля
 */

if (!process.env.JWT_SECRET) {
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_SECRET не установлен в переменных окружения!');
  console.error('Установите JWT_SECRET в .env файле перед запуском сервера.');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = {
  JWT_SECRET,
};

