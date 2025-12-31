const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const CategoryVariant = sequelize.define('CategoryVariant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'category_id',
  },
  variantKey: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'variant_key',
  },
  variantName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'variant_name',
  },
  variantType: {
    type: DataTypes.ENUM('button', 'select'),
    defaultValue: 'button',
    field: 'variant_type',
  },
  isRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_required',
  },
  displayOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'display_order',
  },
  unit: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'unit',
  },
}, {
  tableName: 'category_variants',
  timestamps: true,
});

module.exports = CategoryVariant;

