/**
 * Утилита для безопасной работы с транзакциями
 * Гарантирует откат транзакции при любой ошибке
 */

/**
 * Выполняет функцию внутри транзакции с гарантированным откатом при ошибке
 * @param {Function} callback - Функция, которая будет выполнена внутри транзакции
 * @param {Object} sequelize - Экземпляр Sequelize
 * @returns {Promise} Результат выполнения callback
 */
const withTransaction = async (callback, sequelize) => {
  const transaction = await sequelize.transaction();
  let committed = false;
  
  try {
    const result = await callback(transaction);
    await transaction.commit();
    committed = true;
    return result;
  } catch (error) {
    if (!committed) {
      await transaction.rollback();
    }
    throw error;
  }
};

module.exports = {
  withTransaction,
};

