const {
  parseConsultIntent,
  rankAndFilterProducts,
  filterCombinationsByIntent,
  combinationMatchesSize,
  intentSummaryForPrompt,
  pickLinkCombination,
} = require('../services/chatIntent');

describe('parseConsultIntent', () => {
  it('распознаёт бренд, тип, размер, цвет и бюджет', () => {
    const intent = parseConsultIntent(
      'Подскажите, есть ли Nike кроссовки чёрные размер 42 до 15000?'
    );

    expect(intent.brands).toContain('nike');
    expect(intent.productTypes).toContain('sneakers');
    expect(intent.colors).toContain('black');
    expect(intent.sizes).toContain('42');
    expect(intent.maxPrice).toBe(15000);
  });

  it('понимает кириллические синонимы брендов', () => {
    const intent = parseConsultIntent('Хочу адидас кеды');
    expect(intent.brands).toContain('adidas');
  });

  it('отфильтровывает стоп-слова из searchWords', () => {
    const intent = parseConsultIntent('пожалуйста покажите ultraboost');
    expect(intent.searchWords).not.toContain('пожалуйста');
    expect(intent.searchWords).not.toContain('покажите');
  });
});

describe('combinationMatchesSize', () => {
  it('сопоставляет размер из опции комплектации', () => {
    const combo = {
      combinationKey: 'size-size-42',
      productCombinationOptions: [
        {
          ProductVariantOption: {
            optionValue: '42',
            variant: { variantKey: 'size' },
          },
        },
      ],
    };
    expect(combinationMatchesSize(combo, '42')).toBe(true);
    expect(combinationMatchesSize(combo, '43')).toBe(false);
  });
});

describe('filterCombinationsByIntent', () => {
  const combos = [
    {
      isActive: true,
      combinationKey: 'size-42_color-black',
      productCombinationOptions: [
        {
          ProductVariantOption: {
            optionValue: '42',
            variant: { variantKey: 'size' },
          },
        },
        {
          ProductVariantOption: {
            optionValue: 'Чёрный',
            variant: { variantKey: 'color' },
          },
        },
      ],
    },
    {
      isActive: true,
      combinationKey: 'size-43_color-white',
      productCombinationOptions: [
        {
          ProductVariantOption: {
            optionValue: '43',
            variant: { variantKey: 'size' },
          },
        },
      ],
    },
  ];

  it('фильтрует по размеру и цвету', () => {
    const intent = parseConsultIntent('Nike 42 чёрные');
    const filtered = filterCombinationsByIntent(combos, intent);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].combinationKey).toContain('42');
  });
});

describe('rankAndFilterProducts', () => {
  const products = [
    {
      name: 'Nike Air Zoom 42',
      basePrice: 12000,
      category: { name: 'Кроссовки' },
      combinations: [
        {
          isActive: true,
          price: 12000,
          stockQuantity: 3,
          combinationKey: 'size-42',
          productCombinationOptions: [
            {
              ProductVariantOption: {
                optionValue: '42',
                variant: { variantKey: 'size' },
              },
            },
          ],
        },
      ],
    },
    {
      name: 'Puma Classic',
      basePrice: 8000,
      category: { name: 'Кроссовки' },
      combinations: [{ isActive: true, price: 8000, stockQuantity: 1, combinationKey: 'size-41' }],
    },
  ];

  it('ставит подходящий бренд выше остальных', () => {
    const intent = parseConsultIntent('Nike размер 42');
    const ranked = rankAndFilterProducts(products, intent, 2);
    expect(ranked[0].name).toMatch(/Nike/i);
  });
});

describe('intentSummaryForPrompt', () => {
  it('формирует блок параметров для system prompt', () => {
    const intent = parseConsultIntent('Adidas кроссовки 43 до 10000');
    const summary = intentSummaryForPrompt(intent);
    expect(summary).toContain('бренд: adidas');
    expect(summary).toContain('размер(ы): 43');
    expect(summary).toContain('бюджет до: 10000');
  });
});

describe('pickLinkCombination', () => {
  it('выбирает самую дешёвую комплектацию в наличии', () => {
    const product = {
      combinations: [
        { isActive: true, price: '9000', stockQuantity: 2, combinationKey: 'a' },
        { isActive: true, price: '7500', stockQuantity: 1, combinationKey: 'b' },
        { isActive: false, price: '5000', stockQuantity: 10, combinationKey: 'c' },
      ],
    };
    const intent = parseConsultIntent('кроссовки');
    const best = pickLinkCombination(product, intent);
    expect(best.combinationKey).toBe('b');
  });
});
