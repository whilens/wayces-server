const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const ProductVariantOption = sequelize.define('ProductVariantOption', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  variantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'variant_id',
  },
  optionKey: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'option_key',
  },
  optionValue: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'option_value',
  },
  colorCode: {
    type: DataTypes.STRING(7),
    allowNull: true,
    field: 'color_code',
  },
  priceModifier: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    field: 'price_modifier',
  },
  images: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_default',
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_available',
  },
  stockQuantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'stock_quantity',
  },
  displayOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'display_order',
  },
}, {
  tableName: 'product_variant_options',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['variant_id', 'option_key'],
    },
  ],
});

module.exports = ProductVariantOption;

