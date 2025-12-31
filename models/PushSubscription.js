const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const PushSubscription = sequelize.define('PushSubscription', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Может быть null для анонимных пользователей
    field: 'user_id',
  },
  endpoint: {
    type: DataTypes.TEXT,
    allowNull: false,
    unique: true,
  },
  keys: {
    type: DataTypes.JSON,
    allowNull: false, // { p256dh: string, auth: string }
  },
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'user_agent',
  },
}, {
  tableName: 'push_subscriptions',
  timestamps: true,
});

module.exports = PushSubscription;

