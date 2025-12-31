const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  firstName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'first_name',
  },
  lastName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'last_name',
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  street: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  house: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  apartment: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  totalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'total_price',
  },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'),
    defaultValue: 'pending',
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Может быть null для анонимных заказов
    field: 'user_id',
  },
}, {
  tableName: 'orders',
  timestamps: true,
});

module.exports = Order;

