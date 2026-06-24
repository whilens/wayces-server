const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const ProductImage = sequelize.define('ProductImage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_id',
  },
  combinationId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'combination_id',
  },
  imageUrl: {
    type: DataTypes.STRING(500),
    allowNull: false,
    field: 'image_url',
  },
  displayOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'display_order',
  },
}, {
  tableName: 'product_images',
  timestamps: false,
});

module.exports = ProductImage;

