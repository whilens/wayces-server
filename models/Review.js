const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Review = sequelize.define('Review', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id',
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'product_id',
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 5,
    },
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [10, 2000], // минимум 10, максимум 2000 символов
    },
  },
  pros: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  cons: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  photos: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
  },
  isPinned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_pinned',
  },
  rejectReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'reject_reason',
  },
}, {
  tableName: 'reviews',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'product_id'], // один отзыв на товар от пользователя
    },
  ],
});

module.exports = Review;

