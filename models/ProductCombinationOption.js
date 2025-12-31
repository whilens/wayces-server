const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const ProductCombinationOption = sequelize.define('ProductCombinationOption', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  combinationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'combination_id',
  },
  optionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'option_id',
  },
}, {
  tableName: 'product_combination_options',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['combination_id', 'option_id'],
    },
  ],
});

module.exports = ProductCombinationOption;

