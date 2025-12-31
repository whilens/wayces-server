const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
  },
  basePrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'base_price',
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'category_id',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  specifications: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  defaultImage: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'default_image',
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0,
  },
  reviewsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'reviews_count',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
  },
  discountType: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    allowNull: true,
    field: 'discount_type',
  },
  discountValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    field: 'discount_value',
  },
}, {
  tableName: 'products',
  timestamps: true,
});

module.exports = Product;

