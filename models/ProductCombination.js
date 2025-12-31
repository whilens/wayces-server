const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const ProductCombination = sequelize.define('ProductCombination', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'product_id',
  },
  combinationKey: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'combination_key',
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  stockQuantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'stock_quantity',
  },
  sku: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
  },
}, {
  tableName: 'product_combinations',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['product_id', 'combination_key'],
    },
  ],
});

module.exports = ProductCombination;

