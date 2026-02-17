/**
 * Централизованный обработчик ошибок
 */

const errorHandler = (err, req, res, next) => {
  console.error('Ошибка:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ...(process.env.NODE_ENV === 'development' && { body: req.body }),
  });

  // Ошибки валидации
  if (err.name === 'ValidationError' || err.message.includes('валидация') || err.message.includes('обязателен')) {
    return res.status(400).json({
      error: err.message || 'Ошибка валидации данных',
    });
  }

  // Ошибки аутентификации
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Токен невалиден или истек',
    });
  }

  // Ошибки Sequelize
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Ошибка валидации данных',
      details: err.errors?.map(e => e.message),
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Запись с такими данными уже существует',
    });
  }

  if (err.name === 'SequelizeDatabaseError') {
    return res.status(500).json({
      error: 'Ошибка базы данных',
      ...(process.env.NODE_ENV === 'development' && { details: err.message }),
    });
  }

  // Ошибки файловой системы
  if (err.code === 'ENOENT') {
    return res.status(404).json({
      error: 'Файл не найден',
    });
  }

  // Общая ошибка сервера
  res.status(err.status || 500).json({
    error: err.message || 'Внутренняя ошибка сервера',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;

