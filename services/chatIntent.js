/**
 * Разбор запроса консультанта: бренд, размер, тип обуви, цвет.
 * Используется для поиска в каталоге, ранжирования и фильтрации комплектаций.
 */

const STOP_WORDS = new Set([
  'а',
  'и',
  'в',
  'на',
  'по',
  'у',
  'с',
  'к',
  'о',
  'же',
  'ли',
  'бы',
  'не',
  'нет',
  'да',
  'есть',
  'это',
  'как',
  'что',
  'где',
  'какой',
  'какая',
  'какие',
  'какое',
  'нужен',
  'нужна',
  'нужно',
  'нужны',
  'хочу',
  'можно',
  'подскажите',
  'скажите',
  'пожалуйста',
  'у вас',
  'в наличии',
  'наличии',
  'размер',
  'размера',
  'размере',
  'размеру',
  'р',
  'разм',
  'size',
  'покажите',
  'найдите',
  'ищу',
  'ищем',
  'мне',
  'нам',
  'вам',
  'меня',
]);

/** canonical brand id → варианты написания (латиница, кириллица, опечатки) */
const BRAND_ALIASES = {
  adidas: ['adidas', 'адидас', 'адidas', 'адидос', 'адиддас'],
  nike: ['nike', 'найк', 'найке', 'наик'],
  puma: ['puma', 'пума', 'пумы'],
  reebok: ['reebok', 'рибок', 'рибок'],
  'new balance': ['new balance', 'нью баланс', 'ньюбаланс', 'нб'],
  demix: ['demix', 'демикс', 'дэмикс', 'демик'],
  asics: ['asics', 'асикс', 'азикс'],
  skechers: ['skechers', 'скечерс', 'скетчерс'],
  vans: ['vans', 'ванс', 'вэнс'],
  converse: ['converse', 'конверс', 'конверсе'],
  fila: ['fila', 'фила'],
  columbia: ['columbia', 'коламбия', 'колумбия'],
  timberland: ['timberland', 'тимберленд', 'тимберлэнд'],
};

const PRODUCT_TYPE_ALIASES = {
  sneakers: [
    'кроссовк',
    'кед',
    'сникерс',
    'sneaker',
    'sneakers',
    'кросс',
    'бегов',
    'running',
  ],
  boots: ['ботинк', 'сапог', 'полубот', 'челси', 'дутик', 'boot'],
  sandals: ['сандал', 'шлеп', 'сланц', 'вьетнамк'],
  shoes: ['туфл', 'лофер', 'мокасин', 'балетк', 'эспадриль'],
};

const COLOR_ALIASES = {
  black: ['черн', 'чёрн', 'black', 'блэк'],
  white: ['бел', 'white', 'вайт'],
  red: ['красн', 'red'],
  blue: ['син', 'голуб', 'blue', 'navy'],
  green: ['зелен', 'зелён', 'green'],
  gray: ['сер', 'grey', 'gray'],
  brown: ['коричн', 'brown', 'беж'],
  yellow: ['желт', 'жёлт', 'yellow'],
  pink: ['розов', 'pink'],
  orange: ['оранж', 'orange'],
};

function normText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[?!.,;:«»""''—–\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @returns {string[]} */
function detectBrands(text) {
  const t = normText(text);
  const found = [];
  for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
    for (const alias of aliases) {
      const re = new RegExp(`(?:^|[\\s,.])${escapeRegex(alias)}(?:$|[\\s,.])`, 'i');
      if (re.test(` ${t} `) || t.includes(alias)) {
        if (!found.includes(canonical)) found.push(canonical);
        break;
      }
    }
  }
  return found;
}

/** @returns {string[]} */
function detectProductTypes(text) {
  const t = normText(text);
  const found = [];
  for (const [type, aliases] of Object.entries(PRODUCT_TYPE_ALIASES)) {
    if (aliases.some((a) => t.includes(a))) found.push(type);
  }
  return found;
}

/** @returns {string[]} */
function detectColors(text) {
  const t = normText(text);
  const found = [];
  for (const [color, aliases] of Object.entries(COLOR_ALIASES)) {
    if (aliases.some((a) => t.includes(a))) found.push(color);
  }
  return found;
}

/** Размеры обуви EU 35–52 */
function detectSizes(text) {
  const t = normText(text);
  const sizes = new Set();
  const explicit = t.matchAll(
    /(?:размер(?:а|у|е)?|р\.?|size)\s*[:.]?\s*(\d{2})/gi
  );
  for (const m of explicit) {
    if (m[1]) sizes.add(m[1]);
  }
  const loose = t.matchAll(/\b(3[5-9]|4\d|5[0-2])\b/g);
  for (const m of loose) {
    if (m[1]) sizes.add(m[1]);
  }
  return [...sizes];
}

function detectMaxPrice(text) {
  const t = normText(text);
  const m = t.match(/(?:до|не\s+более|макс(?:имум)?|budget)\s*(\d[\d\s]{2,6})/i);
  if (!m) return null;
  const n = parseInt(String(m[1]).replace(/\s/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {string} text
 * @returns {{
 *   brands: string[],
 *   productTypes: string[],
 *   colors: string[],
 *   sizes: string[],
 *   maxPrice: number|null,
 *   searchWords: string[],
 *   brandAliases: string[],
 * }}
 */
function parseConsultIntent(text) {
  const raw = String(text || '').trim();
  const normalized = normText(raw);
  const brands = detectBrands(raw);
  const productTypes = detectProductTypes(raw);
  const colors = detectColors(raw);
  const sizes = detectSizes(raw);
  const maxPrice = detectMaxPrice(raw);

  const brandAliases = brands.flatMap((b) => BRAND_ALIASES[b] || [b]);

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const searchWords = tokens.filter((w) => {
    if (STOP_WORDS.has(w)) return false;
    if (/^\d{1,2}$/.test(w)) return false;
    if (w.length < 2) return false;
    if (brandAliases.some((a) => w.includes(a) || a.includes(w))) return false;
    if (sizes.includes(w)) return false;
    return true;
  });

  return {
    brands,
    productTypes,
    colors,
    sizes,
    maxPrice,
    searchWords: [...new Set(searchWords)],
    brandAliases,
  };
}

function normalizeSizeValue(val) {
  const s = String(val ?? '').trim();
  const m = s.match(/\b(3[5-9]|4\d|5[0-2])\b/);
  return m ? m[1] : null;
}

function variantKeyIsSize(vk) {
  const k = String(vk ?? '')
    .toLowerCase()
    .replace(/\s+/g, '_');
  return /size|razmer|shoe|foot|length_size|размер/.test(k);
}

function getCombinationOptionValues(c) {
  const opts = c.productCombinationOptions || c.ProductCombinationOptions || [];
  const values = [];
  for (const co of opts) {
    const pvo = co.ProductVariantOption || co.productVariantOption;
    if (!pvo) continue;
    const variant = pvo.variant;
    const vk = variant?.variantKey;
    const ov = pvo.optionValue;
    if (ov != null) {
      values.push({
        value: String(ov),
        variantKey: vk,
        isSize: variantKeyIsSize(vk),
      });
    }
  }
  return values;
}

function combinationMatchesSize(c, size) {
  const want = String(size);
  for (const { value } of getCombinationOptionValues(c)) {
    const n = normalizeSizeValue(value);
    if (n === want) return true;
    if (value.trim() === want) return true;
  }
  const key = String(c.combinationKey || '');
  if (key && new RegExp(`(?:^|[^0-9])${want}(?:[^0-9]|$)`).test(key)) return true;
  return false;
}

function combinationMatchesColor(c, colorId) {
  const aliases = COLOR_ALIASES[colorId];
  if (!aliases?.length) return true;
  const blob = getCombinationOptionValues(c)
    .map((x) => x.value)
    .join(' ')
    .toLowerCase();
  return aliases.some((a) => blob.includes(a));
}

function productNameHasBrand(p, brandCanonical) {
  const aliases = BRAND_ALIASES[brandCanonical] || [brandCanonical];
  const name = normText(p.name);
  return aliases.some((a) => name.includes(a));
}

function productMatchesIntent(p, intent) {
  if (intent.brands.length) {
    const ok = intent.brands.some((b) => productNameHasBrand(p, b));
    if (!ok) return false;
  }
  if (intent.maxPrice != null) {
    const combs = (p.combinations || []).filter((c) => c.isActive !== false);
    const prices = combs
      .map((c) => parseFloat(c.price))
      .filter((x) => Number.isFinite(x));
    const base = parseFloat(p.basePrice);
    const minPrice = prices.length
      ? Math.min(...prices)
      : Number.isFinite(base)
        ? base
        : Infinity;
    if (minPrice > intent.maxPrice) return false;
  }
  return true;
}

function scoreProduct(p, intent) {
  let score = 0;
  const name = normText(p.name);
  const cat = normText(p.category?.name || '');

  if (intent.brands.length) {
    for (const b of intent.brands) {
      if (productNameHasBrand(p, b)) score += 40;
      else score -= 50;
    }
  }

  for (const type of intent.productTypes) {
    const aliases = PRODUCT_TYPE_ALIASES[type] || [];
    if (aliases.some((a) => name.includes(a) || cat.includes(a))) score += 12;
  }

  for (const w of intent.searchWords) {
    if (name.includes(w) || cat.includes(w)) score += 4;
  }

  const combs = (p.combinations || []).filter((c) => c.isActive !== false);
  if (intent.sizes.length) {
    for (const size of intent.sizes) {
      const matching = combs.filter((c) => combinationMatchesSize(c, size));
      if (matching.some((c) => (c.stockQuantity ?? 0) > 0)) score += 35;
      else if (matching.length) score += 8;
      else score -= 15;
    }
  }

  if (intent.colors.length) {
    for (const color of intent.colors) {
      if (combs.some((c) => combinationMatchesColor(c, color))) score += 6;
    }
  }

  return score;
}

function productHasMatchingCombinations(p, intent) {
  if (!intent.sizes.length && !intent.colors.length) return true;
  const combs = (p.combinations || []).filter((c) => c.isActive !== false);
  return filterCombinationsByIntent(combs, intent).length > 0;
}

function rankAndFilterProducts(products, intent, limit = 6) {
  const filtered = products.filter(
    (p) => productMatchesIntent(p, intent) && productHasMatchingCombinations(p, intent)
  );
  const pool =
    filtered.length > 0
      ? filtered
      : intent.brands.length > 0
        ? []
        : products.filter((p) => productHasMatchingCombinations(p, intent));
  return [...pool]
    .map((p) => ({ p, score: scoreProduct(p, intent) }))
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score > -20)
    .slice(0, limit)
    .map((x) => x.p);
}

function filterCombinationsByIntent(combinations, intent) {
  let list = combinations.filter((c) => c.isActive !== false);
  if (intent.sizes.length) {
    list = list.filter((c) =>
      intent.sizes.some((size) => combinationMatchesSize(c, size))
    );
  }
  if (intent.colors.length) {
    list = list.filter((c) =>
      intent.colors.some((color) => combinationMatchesColor(c, color))
    );
  }
  return list;
}

function intentSummaryForPrompt(intent) {
  const parts = [];
  if (intent.brands.length) {
    parts.push(
      `бренд: ${intent.brands.join(', ')} (в ответе и подборке — только эти бренды, не подменяй другими)`
    );
  }
  if (intent.productTypes.length) {
    parts.push(`тип обуви: ${intent.productTypes.join(', ')}`);
  }
  if (intent.sizes.length) {
    parts.push(
      `размер(ы): ${intent.sizes.join(', ')} (цены и наличие — только по этим размерам; не перечисляй остальные размеры)`
    );
  }
  if (intent.colors.length) {
    parts.push(`цвет: ${intent.colors.join(', ')}`);
  }
  if (intent.maxPrice != null) {
    parts.push(`бюджет до: ${intent.maxPrice}`);
  }
  if (!parts.length) return '';
  return `Параметры текущего запроса пользователя (строго соблюдай):\n- ${parts.join('\n- ')}`;
}

function pickLinkCombination(p, intent) {
  const combs = filterCombinationsByIntent(
    (p.combinations || []).filter((c) => c.isActive !== false),
    intent
  );
  const pool = combs.length
    ? combs
    : (p.combinations || []).filter((c) => c.isActive !== false);
  if (!pool.length) return null;
  const inStock = pool.filter((c) => (c.stockQuantity ?? 0) > 0);
  const candidates = inStock.length ? inStock : pool;
  let best = candidates[0];
  let minPrice = parseFloat(best.price);
  if (Number.isNaN(minPrice)) minPrice = Infinity;
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const pr = parseFloat(c.price);
    const priceVal = Number.isNaN(pr) ? Infinity : pr;
    if (priceVal < minPrice) {
      minPrice = priceVal;
      best = c;
    }
  }
  return best;
}

module.exports = {
  parseConsultIntent,
  rankAndFilterProducts,
  filterCombinationsByIntent,
  combinationMatchesSize,
  intentSummaryForPrompt,
  pickLinkCombination,
  BRAND_ALIASES,
  PRODUCT_TYPE_ALIASES,
};
