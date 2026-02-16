const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Category = sequelize.define('Category', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  parentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'parent_id',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  imageUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'image_url',
  },
  displayOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'display_order',
  },
  // SKU: код категории (1–99) + счётчик в категории → цифровой SKU 6 символов
  skuCode: {
    type: DataTypes.SMALLINT,
    allowNull: true,
    field: 'sku_code',
    comment: 'Код категории для SKU (1-99), null = не используется',
  },
  skuLastNumber: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'sku_last_number',
    comment: 'Последний выданный номер в рамках категории',
  },
  skuAutoGenerate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'sku_auto_generate',
    comment: 'Включить автогенерацию SKU для комплектаций товаров этой категории',
  },
  // В каталоге: false = одна карточка на товар, true = отдельная карточка на каждую комплектацию
  listCombinationsSeparately: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'list_combinations_separately',
    comment: 'В каталоге показывать каждую комплектацию отдельно (иначе одна карточка на товар)',
  },
}, {
  tableName: 'categories',
  timestamps: true,
});

module.exports = Category;

