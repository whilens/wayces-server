/**
 * Генерация SKU в формате: код категории (2 цифры) + счётчик (4 цифры) = 6 цифр.
 * Пример: категория с кодом 1, счётчик 42 → "010042".
 */

const { Category } = require('../models');

const CODE_LENGTH = 2;
const COUNTER_LENGTH = 4;

/**
 * Сгенерировать следующий SKU для категории.
 * Атомарно увеличивает счётчик категории и возвращает строку из 6 цифр.
 * @param {number} categoryId - ID категории
 * @param {Object} transaction - Транзакция Sequelize (для блокировки строки)
 * @returns {Promise<string|null>} SKU (например "010042") или null, если у категории отключена автогенерация
 */
async function generateNextSku(categoryId, transaction) {
  if (!categoryId || !transaction) {
    return null;
  }

  const category = await Category.findByPk(categoryId, {
    lock: transaction.LOCK.UPDATE,
    transaction,
  });

  if (!category) return null;
  if (!category.skuAutoGenerate || category.skuCode == null) return null;

  const code = Number(category.skuCode);
  if (code < 1 || code > 99) return null;

  const nextNumber = (category.skuLastNumber || 0) + 1;
  category.skuLastNumber = nextNumber;
  await category.save({ transaction });

  const codeStr = String(code).padStart(CODE_LENGTH, '0');
  const numberStr = String(nextNumber).padStart(COUNTER_LENGTH, '0');
  return codeStr + numberStr;
}

module.exports = {
  generateNextSku,
};
