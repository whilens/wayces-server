const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const OrderItem = sequelize.define('OrderItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'order_id',
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Может быть null если товар удален
    field: 'product_id',
  },
  productName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'product_name',
  },
  productPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'product_price',
  },
  productImage: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'product_image',
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  variants: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  variantString: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'variant_string',
  },
}, {
  tableName: 'order_items',
  timestamps: false,
});

module.exports = OrderItem;

