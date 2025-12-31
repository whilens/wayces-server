/**
 * Утилиты для валидации входных данных
 */

/**
 * Безопасный парсинг целого числа с валидацией
 * @param {string|number} value - Значение для парсинга
 * @param {string} fieldName - Имя поля для сообщения об ошибке
 * @param {Object} options - Опции валидации
 * @param {number} options.min - Минимальное значение
 * @param {number} options.max - Максимальное значение
 * @param {boolean} options.required - Обязательное поле
 * @returns {number} Распарсенное число
 * @throws {Error} Если валидация не прошла
 */
const safeParseInt = (value, fieldName = 'число', options = {}) => {
  const { min, max, required = false } = options;
  
  if (value === null || value === undefined || value === '') {
    if (required) {
      throw new Error(`Поле ${fieldName} обязательно для заполнения`);
    }
    return null;
  }
  
  const parsed = parseInt(value, 10);
  
  if (isNaN(parsed)) {
    throw new Error(`Поле ${fieldName} должно быть целым числом`);
  }
  
  if (min !== undefined && parsed < min) {
    throw new Error(`Поле ${fieldName} должно быть не меньше ${min}`);
  }
  
  if (max !== undefined && parsed > max) {
    throw new Error(`Поле ${fieldName} должно быть не больше ${max}`);
  }
  
  return parsed;
};

/**
 * Безопасный парсинг числа с плавающей точкой с валидацией
 * @param {string|number} value - Значение для парсинга
 * @param {string} fieldName - Имя поля для сообщения об ошибке
 * @param {Object} options - Опции валидации
 * @param {number} options.min - Минимальное значение
 * @param {number} options.max - Максимальное значение
 * @param {boolean} options.required - Обязательное поле
 * @returns {number} Распарсенное число
 * @throws {Error} Если валидация не прошла
 */
const safeParseFloat = (value, fieldName = 'число', options = {}) => {
  const { min, max, required = false } = options;
  
  if (value === null || value === undefined || value === '') {
    if (required) {
      throw new Error(`Поле ${fieldName} обязательно для заполнения`);
    }
    return null;
  }
  
  const parsed = parseFloat(value);
  
  if (isNaN(parsed)) {
    throw new Error(`Поле ${fieldName} должно быть числом`);
  }
  
  if (min !== undefined && parsed < min) {
    throw new Error(`Поле ${fieldName} должно быть не меньше ${min}`);
  }
  
  if (max !== undefined && parsed > max) {
    throw new Error(`Поле ${fieldName} должно быть не больше ${max}`);
  }
  
  return parsed;
};

module.exports = {
  safeParseInt,
  safeParseFloat,
};

