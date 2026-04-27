const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const ChatConversation = sequelize.define(
  'ChatConversation',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    sessionKey: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
      field: 'session_key',
    },
    messages: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'product_id',
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'category_id',
    },
    lastModel: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'last_model',
    },
  },
  {
    tableName: 'chat_conversations',
    timestamps: true,
  }
);

module.exports = ChatConversation;
