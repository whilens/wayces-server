/**
 * Конфигурация для категории "Обувь"
 */

module.exports = {
  // Характеристики товара (specifications)
  specifications: [
    {
      key: 'material',
      label: 'Материал',
      type: 'text',
    },
    {
      key: 'sole',
      label: 'Подошва',
      type: 'text',
    },
    {
      key: 'weight',
      label: 'Вес',
      type: 'text',
    },
    {
      key: 'season',
      label: 'Сезонность',
      type: 'select',
      options: ['Лето', 'Зима', 'Демисезон', 'Всесезонная'],
    },
    {
      key: 'hasExtraLaces',
      label: 'Дополнительные шнурки в комплекте',
      type: 'select',
      options: ['Да', 'Нет'],
    },
    {
      key: 'waterproof',
      label: 'Водонепроницаемость',
      type: 'select',
      options: ['Да', 'Нет'],
    },
    {
      key: 'country',
      label: 'Страна производства',
      type: 'text',
    },
  ],

  variants: [
    {
      key: 'size',
      name: 'Размер',
      type: 'select',
      isRequired: true,
    },
    {
      key: 'color',
      name: 'Цвет',
      type: 'button',
      isRequired: true,
    },
  ],
};

