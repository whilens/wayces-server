const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const ProductVariant = sequelize.define('ProductVariant', {
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
  variantKey: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'variant_key',
  },
  variantName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'variant_name',
  },
  variantType: {
    type: DataTypes.ENUM('color', 'button', 'select'),
    allowNull: false,
    field: 'variant_type',
  },
  displayOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'display_order',
  },
  isRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_required',
  },
}, {
  tableName: 'product_variants',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['product_id', 'variant_key'],
    },
  ],
});

module.exports = ProductVariant;

