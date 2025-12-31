const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const CategorySpecification = sequelize.define('CategorySpecification', {
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
  specKey: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'spec_key',
  },
  specLabel: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'spec_label',
  },
  specType: {
    type: DataTypes.ENUM('text', 'number', 'select'),
    defaultValue: 'text',
    field: 'spec_type',
  },
  specOptions: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'spec_options',
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
  tableName: 'category_specifications',
  timestamps: true,
});

module.exports = CategorySpecification;

