/**
 * Безопасный парсинг JSON с обработкой ошибок
 * @param {string} jsonString - Строка для парсинга
 * @param {*} defaultValue - Значение по умолчанию при ошибке
 * @returns {*} Распарсенный объект или defaultValue
 */
const safeParseJSON = (jsonString, defaultValue = null) => {
  if (!jsonString || typeof jsonString !== 'string') {
    return defaultValue;
  }
  
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Ошибка парсинга JSON:', error.message, 'Строка:', jsonString.substring(0, 100));
    return defaultValue;
  }
};

/**
 * Безопасный парсинг JSON с выбрасыванием ошибки
 * @param {string} jsonString - Строка для парсинга
 * @param {string} fieldName - Имя поля для сообщения об ошибке
 * @returns {*} Распарсенный объект
 * @throws {Error} Если парсинг не удался
 */
const safeParseJSONOrThrow = (jsonString, fieldName = 'JSON') => {
  if (!jsonString || typeof jsonString !== 'string') {
    throw new Error(`Поле ${fieldName} должно быть валидной JSON строкой`);
  }
  
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Неверный формат JSON для поля ${fieldName}: ${error.message}`);
  }
};

module.exports = {
  safeParseJSON,
  safeParseJSONOrThrow,
};

