const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { Op, Sequelize } = require('sequelize');
const sequelize = require('../config/sequelize');
const {
  Product,
  Category,
  ProductVariant,
  ProductVariantOption,
  ProductCombination,
  ProductCombinationOption,
  ChatConversation,
} = require('../models');
const { completeChat } = require('../services/openRouterChat');

const router = express.Router();

const consultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CHAT_RATE_LIMIT_MAX) || 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов к консультанту. Попробуйте через несколько минут.' },
});

function truncate(str, max) {
  if (str == null) return '';
  const s = String(str);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function specsForPrompt(spec) {
  if (!spec || typeof spec !== 'object') return '';
  try {
    return truncate(JSON.stringify(spec), 1200);
  } catch {
    return '';
  }
}

function hasActiveCombinations(p) {
  return (p.combinations || []).some((c) => c.isActive !== false);
}

/** Частые ключи вариантов (англ/транслит) → подпись для пользователя */
const VARIANT_KEY_LABELS = {
  size: 'Размер',
  razmer: 'Размер',
  shoe_size: 'Размер',
  foot_size: 'Размер',
  length_size: 'Размер',
  color: 'Цвет',
  colour: 'Цвет',
  cvet: 'Цвет',
  width: 'Ширина',
  shirina: 'Ширина',
  length: 'Длина',
  height: 'Высота',
  material: 'Материал',
  model: 'Модель',
  gender: 'Пол',
  pol: 'Пол',
};

function normKey(k) {
  if (k == null || k === '') return '';
  return String(k)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

function isMostlyNumericString(s) {
  const t = String(s ?? '').trim();
  return t.length > 0 && /^[\d]+([.,][\d]+)?$/.test(t);
}

function looksLikeColorToken(s) {
  const t = String(s ?? '').toLowerCase();
  if (t.length < 2) return false;
  return [
    'черн',
    'бел',
    'красн',
    'син',
    'зелен',
    'желт',
    'розов',
    'сер',
    'коричн',
    'беж',
    'оранж',
    'фиолет',
    'голуб',
  ].some((x) => t.includes(x));
}

/**
 * Строка для ссылки/списка: «Чёрный, 42 размер» — значения опций, без «Характеристика: …»
 * Текстовые значения сначала (цвета вперёд), числа в конце с суффиксом «размер»
 */
function buildNaturalCombinationLine(opts) {
  const raw = [];
  for (const co of opts) {
    const pvo = co.ProductVariantOption || co.productVariantOption;
    if (!pvo) continue;
    const val = String(pvo.optionValue ?? pvo.optionKey ?? '').trim();
    if (val) raw.push(val);
  }
  if (!raw.length) return '';

  const nums = [];
  const nonNums = [];
  for (const v of raw) {
    if (isMostlyNumericString(v)) nums.push(v);
    else nonNums.push(v);
  }

  nonNums.sort((a, b) => {
    const ac = looksLikeColorToken(a) ? 0 : 1;
    const bc = looksLikeColorToken(b) ? 0 : 1;
    return ac - bc;
  });

  const parts = [...nonNums];
  if (nums.length === 1) {
    parts.push(`${nums[0]} размер`);
  } else if (nums.length > 1) {
    parts.push(`${nums.join(', ')} размер`);
  }

  return parts.join(', ');
}

/**
 * Fallback: разбираем combinationKey вида
 * "color-color-Белый_size-size-40" -> "Белый, 40 размер"
 */
function naturalLineFromCombinationKey(combinationKey) {
  const key = String(combinationKey || '').trim();
  if (!key) return '';

  const raw = key
    .split('_')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const i = chunk.indexOf('-');
      if (i < 0) return chunk;
      const variantKey = chunk.slice(0, i).trim();
      let optionPart = chunk.slice(i + 1).trim();
      const pref = `${variantKey}-`;
      if (optionPart.toLowerCase().startsWith(pref.toLowerCase())) {
        optionPart = optionPart.slice(pref.length).trim();
      }
      return optionPart || chunk;
    });

  if (!raw.length) return '';
  return buildNaturalCombinationLine(
    raw.map((v) => ({ ProductVariantOption: { optionValue: v } }))
  );
}

/** Комбинации — источник истины по остаткам и цене, если склад ведётся в product_combinations */
function combinationsForPrompt(p) {
  const combs = (p.combinations || []).filter((c) => c.isActive !== false);
  if (!combs.length) return '';
  const maxLines = 28;
  const lines = [];
  for (const c of combs) {
    if (lines.length >= maxLines) break;
    const opts =
      c.productCombinationOptions ||
      c.ProductCombinationOptions ||
      [];
    const comboLabel =
      buildNaturalCombinationLine(opts) ||
      naturalLineFromCombinationKey(c.combinationKey) ||
      c.combinationKey ||
      'комбинация';
    const stock = c.stockQuantity ?? 0;
    const price = c.price != null ? parseFloat(c.price) : NaN;
    const priceStr = Number.isFinite(price) ? `, цена ${price}` : '';
    const sku = c.sku ? `, SKU ${c.sku}` : '';
    lines.push(`   • ${truncate(comboLabel, 220)}${priceStr}${sku} — остаток: ${stock}`);
  }
  const extra = combs.length > maxLines ? `\n   … всего комбинаций: ${combs.length}` : '';
  return `   комбинации (наличие и цена по конкретным опциям/комплектациям):\n${lines.join('\n')}${extra}`;
}

function inferVariantRowLabel(v, userQuery) {
  const vn = v.variantName?.trim();
  if (vn) return vn;
  const vk = normKey(v.variantKey);
  if (vk && VARIANT_KEY_LABELS[vk]) return VARIANT_KEY_LABELS[vk];
  if (vk) {
    for (const [key, label] of Object.entries(VARIANT_KEY_LABELS)) {
      if (vk.includes(key) || key.includes(vk)) return label;
    }
  }
  const u = userQuery || '';
  if (/\b(размер|размера|size|обув)\b/i.test(u)) return 'Размер';
  if (/\b(цвет|color)\b/i.test(u)) return 'Цвет';
  return v.variantKey || 'Характеристика';
}

/** Опции товара (размер, цвет и т.д.) — из БД, не из JSON specifications */
function variantsForPrompt(p, userQuery) {
  if (!p.variants?.length) return '';
  const stockByCombinations = hasActiveCombinations(p);
  const variants = [...p.variants].sort(
    (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)
  );
  const parts = [];
  for (const v of variants) {
    const opts = [...(v.options || [])].sort(
      (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)
    );
    const values = opts
      .filter((o) => o.isAvailable !== false)
      .map((o) => {
        if (stockByCombinations) {
          return String(o.optionValue);
        }
        const low = (o.stockQuantity ?? 0) <= 0;
        return low ? `${o.optionValue} (нет в наличии)` : String(o.optionValue);
      });
    if (!values.length) continue;
    const label = inferVariantRowLabel(v, userQuery);
    parts.push(`${label}: ${values.join(', ')}`);
  }
  if (!parts.length) return '';
  const hint = stockByCombinations
    ? ' (значения опций; точное наличие см. в блоке «комбинации» ниже)'
    : '';
  return `   опции (размер, цвет и т.д.)${hint}: ${parts.join('; ')}`;
}

const productIncludeForChat = [
  { model: Category, as: 'category', attributes: ['id', 'name'] },
  {
    model: ProductVariant,
    as: 'variants',
    attributes: ['variantKey', 'variantName', 'variantType', 'displayOrder'],
    include: [
      {
        model: ProductVariantOption,
        as: 'options',
        attributes: [
          'optionKey',
          'optionValue',
          'isAvailable',
          'stockQuantity',
          'displayOrder',
        ],
      },
    ],
  },
  {
    model: ProductCombination,
    as: 'combinations',
    required: false,
    attributes: ['id', 'combinationKey', 'price', 'stockQuantity', 'sku', 'isActive'],
    include: [
      {
        model: ProductCombinationOption,
        include: [
          {
            model: ProductVariantOption,
            attributes: ['optionKey', 'optionValue'],
            include: [
              {
                model: ProductVariant,
                as: 'variant',
                attributes: ['variantKey', 'variantName'],
              },
            ],
          },
        ],
      },
    ],
  },
];

async function loadCatalogContext({ productId, categoryId, lastUserText, userQueryForLabels }) {
  const uq = (userQueryForLabels || lastUserText || '').trim();
  const out = { block: '', products: [] };

  if (productId) {
    const id = parseInt(String(productId), 10);
    if (!Number.isFinite(id) || id <= 0) {
      out.block = 'Товар по переданному id не найден (некорректный id).';
      return out;
    }
    const p = await Product.findByPk(id, {
      include: productIncludeForChat,
      attributes: [
        'id',
        'name',
        'basePrice',
        'description',
        'specifications',
        'categoryId',
        'defaultImage',
        'isActive',
      ],
    });
    if (!p || !p.isActive) {
      out.block = 'Товар не найден или снят с продажи.';
      return out;
    }
    out.products = [p];
  } else {
    const q = (lastUserText || '').trim();
    const cidRaw = categoryId ? parseInt(String(categoryId), 10) : null;
    const hasCategory = Number.isFinite(cidRaw) && cidRaw > 0;

    if (q.length < 2 && !hasCategory) {
      out.block =
        'Контекст каталога не передан (нет открытой карточки товара, категории и короткого поискового запроса). Отвечай общими советами как консультант, не выдумывай конкретные товары и цены; предложи сформулировать запрос или открыть каталог.';
      return out;
    }

    const where = { isActive: true };
    if (hasCategory) {
      where.categoryId = cidRaw;
    }
    if (q.length >= 2) {
      const safe = q.slice(0, 120).replace(/%/g, '');
      const normalized = safe
        .replace(/[?!.,;:«»""''—–\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const words = normalized.split(/\s+/).filter((w) => w.length >= 3);
      const needles =
        words.length > 0 ? words : normalized.length >= 2 ? [normalized] : [];

      const orForWord = (word) => {
        const w = word.slice(0, 80);
        if (w.length < 2) return [];
        const like = { [Op.iLike]: `%${w}%` };
        return [
          { name: like },
          { description: like },
          { '$category.name$': like },
          Sequelize.where(
            Sequelize.literal(`COALESCE("Product".specifications::text, '')`),
            like
          ),
        ];
      };

      if (needles.length === 1) {
        const clause = orForWord(needles[0]);
        if (clause.length) where[Op.or] = clause;
      } else if (needles.length > 1) {
        where[Op.or] = needles.flatMap(orForWord);
      }
    }

    const rows = await Product.findAll({
      where,
      include: [
        { model: Category, as: 'category', attributes: ['name'], required: false },
      ],
      subQuery: false,
      attributes: [
        'id',
        'name',
        'basePrice',
        'description',
        'specifications',
        'categoryId',
        'defaultImage',
      ],
      limit: 12,
      order: [['createdAt', 'DESC']],
    });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      out.products = [];
    } else {
      out.products = await Promise.all(
        ids.map((id) =>
          Product.findByPk(id, {
            include: productIncludeForChat,
            attributes: [
              'id',
              'name',
              'basePrice',
              'description',
              'specifications',
              'categoryId',
              'defaultImage',
            ],
          })
        )
      );
      out.products = out.products.filter(Boolean);
    }
  }

  if (!out.products.length) {
    out.block =
      'В каталоге по текущему запросу не найдено подходящих товаров. Отвечай как консультант общими советами по выбору, без выдуманных названий и цен. Предложи посмотреть каталог на сайте.';
    return out;
  }

  const lines = out.products.map((p, i) => {
    const cat = p.category?.name || '—';
    const spec = specsForPrompt(p.specifications);
    const vars = variantsForPrompt(p, uq);
    const combs = combinationsForPrompt(p);
    return [
      `${i + 1}) id=${p.id}, название: ${p.name}`,
      `   категория: ${cat}; базовая цена: ${parseFloat(p.basePrice)} (валюта как в магазине)`,
      p.description ? `   описание: ${truncate(p.description, 400)}` : '',
      spec ? `   характеристики (из карточки, JSON): ${spec}` : '',
      vars || '',
      combs || '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  out.block = `Данные из каталога магазина (используй только их; цены и наличие не выдумывай):\n${lines.join('\n')}`;
  return out;
}

/** Ссылка на карточку с предвыбранной комплектацией (как в каталоге: сначала с остатком, затем мин. цена) */
function pickChatProductLink(p) {
  const combs = (p.combinations || []).filter((c) => c.isActive !== false);
  if (!combs.length) return {};
  const inStock = combs.filter((c) => (c.stockQuantity ?? 0) > 0);
  const pool = inStock.length ? inStock : combs;
  let best = pool[0];
  let minPrice = parseFloat(best.price);
  if (Number.isNaN(minPrice)) minPrice = Infinity;
  for (let i = 1; i < pool.length; i++) {
    const c = pool[i];
    const pr = parseFloat(c.price);
    const priceVal = Number.isNaN(pr) ? Infinity : pr;
    if (priceVal < minPrice) {
      minPrice = priceVal;
      best = c;
    }
  }
  return {
    linkCombinationId: best.id,
    linkCombinationKey: best.combinationKey || null,
  };
}

const CHAT_COMBINATIONS_LIMIT = 32;
const CHAT_HISTORY_LIMIT = 40;

/** Комплектации для клиента (чат, подборка): цена, остаток, подпись, ссылка по combinationId */
function mapCombinationsForClient(p) {
  const raw = (p.combinations || []).filter((c) => c.isActive !== false);
  if (!raw.length) return [];
  const sorted = [...raw].sort(
    (a, b) => parseFloat(a.price ?? 0) - parseFloat(b.price ?? 0)
  );
  const out = [];
  for (const c of sorted.slice(0, CHAT_COMBINATIONS_LIMIT)) {
    const opts = c.productCombinationOptions || c.ProductCombinationOptions || [];
    const variants = {};
    for (const co of opts) {
      const pvo = co.ProductVariantOption || co.productVariantOption;
      if (!pvo) continue;
      const variant = pvo.variant;
      const vk = variant?.variantKey;
      const ov = pvo.optionValue;
      if (vk && ov != null) variants[vk] = ov;
    }
    const label =
      buildNaturalCombinationLine(opts) ||
      naturalLineFromCombinationKey(c.combinationKey) ||
      c.combinationKey ||
      '';
    out.push({
      id: c.id,
      combinationKey: c.combinationKey || null,
      price: c.price != null ? parseFloat(c.price) : null,
      stockQuantity: c.stockQuantity ?? 0,
      sku: c.sku || null,
      label,
      variants: Object.keys(variants).length ? variants : undefined,
    });
  }
  return out;
}

function mapProductCard(p) {
  const link = pickChatProductLink(p);
  const combinations = mapCombinationsForClient(p);
  return {
    id: p.id,
    name: p.name,
    basePrice: parseFloat(p.basePrice),
    defaultImage: p.defaultImage || null,
    categoryName: p.category?.name || null,
    ...link,
    combinations: combinations.length ? combinations : undefined,
  };
}

function normalizeMessagesForHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role,
      content: String(m.content || '').slice(0, 8000),
    }))
    .filter((m) => m.content.trim().length > 0)
    .slice(-CHAT_HISTORY_LIMIT);
}

router.get('/history', async (req, res) => {
  try {
    const clientSessionId = String(req.query.clientSessionId || '').trim();
    if (!clientSessionId) return res.json({ messages: [] });
    const row = await ChatConversation.findOne({
      where: { sessionKey: clientSessionId },
      attributes: ['messages', 'updatedAt'],
    });
    if (!row) return res.json({ messages: [] });
    return res.json({
      messages: normalizeMessagesForHistory(row.messages),
      updatedAt: row.updatedAt,
    });
  } catch (e) {
    console.error('chat /history:', e.message);
    return res.status(500).json({ error: 'Не удалось получить историю чата' });
  }
});

router.post(
  '/consult',
  consultLimiter,
  [
    body('messages')
      .isArray({ min: 1, max: 24 })
      .withMessage('messages: массив 1–24 элементов'),
    body('messages.*.role').isIn(['user', 'assistant']).withMessage('role: user или assistant'),
    body('messages.*.content').isString().isLength({ min: 1, max: 8000 }),
    body('productId').optional().isInt({ min: 1 }),
    body('categoryId').optional().isInt({ min: 1 }),
    body('clientSessionId').optional().isString().isLength({ min: 6, max: 120 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Некорректные данные', details: errors.array() });
      }

      const { messages, productId, categoryId, clientSessionId } = req.body;
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const lastUserText = lastUser ? lastUser.content : '';
      const userQueryForLabels = messages
        .filter((m) => m.role === 'user')
        .slice(-8)
        .map((m) => String(m.content || ''))
        .join(' ')
        .slice(0, 1500);

      const { block: catalogBlock, products } = await loadCatalogContext({
        productId,
        categoryId,
        lastUserText,
        userQueryForLabels,
      });

      if (process.env.CHAT_LOG_PRODUCTS !== '0') {
        const list = products.length
          ? products.map((p) => `id=${p.id} "${p.name}"`).join(' | ')
          : '—';
        const preview = truncate(lastUserText.replace(/\s+/g, ' '), 120);
        console.log(
          `[chat/consult] productId=${productId ?? '—'} categoryId=${categoryId ?? '—'} · последнее: "${preview}" · товаров в контексте: ${products.length} → ${list}`
        );
      }

      const systemPrompt = `Ты вежливый консультант интернет-магазина. Помогаешь с выбором товара и отвечаешь на вопросы о товарах из контекста ниже.
Правила:
- Опирайся только на переданный контекст каталога (характеристики JSON, блок «комбинации» с остатками и ценами по SKU, блок «опции» — размер, цвет и т.д.). Если есть «комбинации», наличие и цену по конкретной комплектации бери только оттуда. Не придумывай цены, артикулы и наличие.
- Если данных не хватает, так и скажи и предложи уточнить или посмотреть карточку товара на сайте.
- Не оформляй заказы, не списывай деньги, не запрашивай банковские данные. Ты только консультант.
- Отвечай по-русски, кратко и по делу, 2–6 предложений, если пользователь не просит иначе.
- Не перечисляй в ответе полные URL сайта — подборка товаров показывается в интерфейсе чата отдельно.

${catalogBlock}`;

      const convo = messages.slice(-14).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { text, model } = await completeChat({
        messages: convo,
        systemPrompt,
      });

      const responsePayload = {
        message: text,
        model,
        products: products.length ? products.map(mapProductCard) : undefined,
      };

      if (clientSessionId) {
        const history = normalizeMessagesForHistory([
          ...messages,
          { role: 'assistant', content: text },
        ]);
        await ChatConversation.upsert({
          sessionKey: String(clientSessionId).trim(),
          messages: history,
          productId: productId || null,
          categoryId: categoryId || null,
          lastModel: model || null,
        });
      }

      res.json(responsePayload);
    } catch (e) {
      console.error('chat /consult:', e.message);
      const code = e.statusCode || 500;
      res.status(code).json({
        error: e.message || 'Ошибка консультанта',
      });
    }
  }
);

module.exports = router;
