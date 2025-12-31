const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Admin = sequelize.define('Admin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  login: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  passwordHash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'password_hash',
  },
  role: {
    type: DataTypes.STRING(50),
    defaultValue: 'admin',
    allowNull: false,
  },
}, {
  tableName: 'admins',
  timestamps: true,
});

module.exports = Admin;

