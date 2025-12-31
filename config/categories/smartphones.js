/**
 * Конфигурация для категории "Смартфоны"
 * Характеристики и варианты для товаров этой категории
 */

module.exports = {
  // Характеристики товара (specifications)
  specifications: [
    {
      key: 'battery',
      label: 'Батарея',
      type: 'text', // text, number, select
    },
    {
      key: 'camera',
      label: 'Камера',
      type: 'text',
    },
    {
      key: 'bodyMaterial',
      label: 'Материал корпуса',
      type: 'text',
    },
    {
      key: 'screen',
      label: 'Экран',
      type: 'text',
    },
    {
      key: 'processor',
      label: 'Процессор',
      type: 'text',
    },
    {
      key: 'ram',
      label: 'Оперативная память',
      type: 'text',
    },
    {
      key: 'storage',
      label: 'Встроенная память',
      type: 'text',
    },
    {
      key: 'support5g',
      label: 'Поддержка 5G',
      type: 'select',
      options: ['Да', 'Нет'],
    },
    {
      key: 'os',
      label: 'Операционная система',
      type: 'text',
    },
    {
      key: 'weight',
      label: 'Вес',
      type: 'text',
    },
    {
      key: 'display',
      label: 'Дисплей',
      type: 'text',
    },
  ],

  // Варианты для комплектаций (variants)
  variants: [
    {
      key: 'color',
      name: 'Цвет',
      type: 'button', // button, select
      isRequired: true,
    },
    {
      key: 'memory',
      name: 'Память',
      type: 'button',
      isRequired: true,
    },
  ],
};

