const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const OrderCancellation = sequelize.define('OrderCancellation', {
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
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id',
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
  },
  adminComment: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'admin_comment',
  },
}, {
  tableName: 'order_cancellations',
  timestamps: true,
});

module.exports = OrderCancellation;

