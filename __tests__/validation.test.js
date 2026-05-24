const { safeParseInt, safeParseFloat } = require('../utils/validation');

describe('safeParseInt', () => {
  it('возвращает число для валидной строки', () => {
    expect(safeParseInt('42', 'размер')).toBe(42);
  });

  it('возвращает null для пустого необязательного поля', () => {
    expect(safeParseInt('', 'id')).toBeNull();
    expect(safeParseInt(null, 'id')).toBeNull();
  });

  it('бросает ошибку для обязательного пустого поля', () => {
    expect(() => safeParseInt('', 'id', { required: true })).toThrow(
      'Поле id обязательно для заполнения'
    );
  });

  it('бросает ошибку для нечислового значения', () => {
    expect(() => safeParseInt('abc', 'страница')).toThrow(
      'Поле страница должно быть целым числом'
    );
  });

  it('проверяет min и max', () => {
    expect(() => safeParseInt('0', 'id', { min: 1 })).toThrow(
      'Поле id должно быть не меньше 1'
    );
    expect(() => safeParseInt('100', 'limit', { max: 50 })).toThrow(
      'Поле limit должно быть не больше 50'
    );
  });
});

describe('safeParseFloat', () => {
  it('парсит дробные числа', () => {
    expect(safeParseFloat('19.99', 'цена')).toBe(19.99);
  });

  it('бросает ошибку для нечислового значения', () => {
    expect(() => safeParseFloat('free', 'цена')).toThrow(
      'Поле цена должно быть числом'
    );
  });
});
