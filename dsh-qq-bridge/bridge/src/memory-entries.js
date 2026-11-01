// 一句一条的长期记忆库（扁平 entries 结构）。
//
// 设计目标（2026-10-28 改版）：
//  - 一句一条：每条记忆就是一句话，带 people（人名）和 keywords（关键词）。
//  - 热记忆常驻：level=hot 的条目在每次唤醒时注入（最多 maxHot 条）。
//  - 相关才捞：按当前对话内容匹配 people/keywords，最多注入 maxRelated 条；捞不到就空着，不硬凑。
//  - 旧的降级不删：久未命中的条目从 hot → warm → cold，cold 不注入但仍在文件里，可被显式查询。
//  - 寒暄不记：打招呼、晚安、哈哈、嗯哦收到之类不写进记忆。
//
// 纯函数模块：不读文件、不碰全局，方便测试与复用。

const SMALL_TALK_RE = /^(?:在吗|在不在|在么|你好|您好|早安|早上好|午安|晚安|哈+|嗯+|哦+|噢+|好+|收到|谢谢|谢了|拜拜|再见|嗨+|嘿+|在干嘛|在做什么|吃了吗|睡了吗|可以|行|ok|okk|好的|没事|没关系)$/i;

/** 寒暄/空话：返回 true 表示不该记 */
export function isSmallTalk(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return true;
  const stripped = raw.replace(/[\s，。！？!?~～…、，,.·「」【】“”"'']/g, '');
  if (!stripped) return true;
  if (stripped.length > 8) return false;
  return SMALL_TALK_RE.test(stripped);
}

function cleanText(text, max = 300) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function uniq(list, max = 8, each = 20) {
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const v = String(item ?? '').trim().slice(0, each);
    if (!v || out.includes(v)) continue;
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

export function emptyStore() {
  return { entries: [] };
}

/** 生成一个稳定的短 id */
function makeId(now) {
  return `m${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 写入一条记忆（一句话）。命中已有条目时只提升热度与命中时间，不重复堆叠。
 * @returns {object|null} 写入后的条目；寒暄返回 null
 */
export function addEntry(store, { text, people, keywords, level = 'hot', now = Date.now() } = {}) {
  if (!store || !Array.isArray(store.entries)) return null;
  const body = cleanText(text);
  if (!body || isSmallTalk(body)) return null;
  const ppl = uniq(people, 8);
  const kws = uniq(keywords, 10);

  const hit = store.entries.find((e) => e && e.text === body);
  if (hit) {
    hit.heat = Math.min(99, (Number(hit.heat) || 1) + 1);
    hit.lastHitAt = now;
    if (level === 'hot') hit.level = 'hot';
    hit.people = uniq([...(hit.people || []), ...ppl], 8);
    hit.keywords = uniq([...(hit.keywords || []), ...kws], 10);
    return hit;
  }

  const entry = {
    id: makeId(now),
    text: body,
    people: ppl,
    keywords: kws,
    heat: 1,
    createdAt: now,
    lastHitAt: now,
    level
  };
  store.entries.push(entry);
  return entry;
}

/** 中文 n-gram（双字组 + 英文数字整词）：零依赖的轻量语义索引 */
function ngrams(s) {
  const t = String(s ?? '').toLowerCase();
  const out = new Set();
  const clean = t.replace(/[\s，。！？!?~～…、，,.·「」【】“”"''：:；;（）()]/g, '');
  for (let i = 0; i < clean.length - 1; i += 1) out.add(clean.slice(i, i + 2));
  for (const w of t.match(/[a-z0-9]+/g) || []) out.add(w);
  return out;
}

/** 语义重叠系数（overlap / √(|a|·|b|)）：短文本比余弦更好用，0~1 */
function overlapScore(a, b) {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const g of a) if (b.has(g)) hit += 1;
  return hit / Math.sqrt(a.size * b.size);
}

/** 当前对话是否和这条记忆相关（人名/关键词命中） */
export function entryMatches(entry, context) {
  if (!entry) return false;
  const hay = String(context ?? '');
  if (!hay) return false;
  for (const p of entry.people || []) if (p && hay.includes(String(p))) return true;
  for (const k of entry.keywords || []) if (k && hay.includes(String(k))) return true;
  return false;
}

/**
 * 生成注入文本：热记忆常驻 + 与当前话题相关的（最多 maxRelated 条）。
 * 捞不到相关条目时只给热记忆；两者都空则返回 ''。
 */
export function buildInjection(entries, context, {
  maxHot = 8,
  maxRelated = 5,
  boostPeople = [],
  boostWeight = 3,
  hotHitHeat = 0.2,
  relatedHitHeat = 1,
  semanticThreshold = 0.2,
  onHit = null
} = {}) {
  const all = Array.isArray(entries) ? entries : [];
  const boosted = (e) => (Array.isArray(boostPeople) ? boostPeople : []).some((p) => p && (e.people || []).includes(p));
  const score = (e) => (Number(e.heat) || 0) + (boosted(e) ? Number(boostWeight) || 0 : 0);
  const hot = all
    .filter((e) => e && e.level === 'hot')
    .sort((x, y) => score(y) - score(x) || (Number(y.lastHitAt) || 0) - (Number(x.lastHitAt) || 0))
    .slice(0, maxHot);
  const hotIds = new Set(hot.map((e) => e.id));
  // 相关 = 人名/关键词精确命中 或 语义重叠达标（漏写关键词也能捞到）
  const ctxGrams = context ? ngrams(context) : new Set();
  const relatedScore = (e) => {
    if (entryMatches(e, context)) return 1;
    if (!ctxGrams.size) return 0;
    const gs = ngrams(`${e.text} ${(e.people || []).join(' ')} ${(e.keywords || []).join(' ')}`);
    let hits = 0;
    for (const g of ctxGrams) if (gs.has(g)) hits += 1;
    if (!hits) return 0;
    const s = hits / Math.sqrt(gs.size);
    return s >= Number(semanticThreshold) ? s : 0;
  };
  const related = all
    .filter((e) => e && e.level !== 'cold' && !hotIds.has(e.id) && relatedScore(e) > 0)
    .sort((x, y) => (entryMatches(y, context) ? 2 : relatedScore(y)) - (entryMatches(x, context) ? 2 : relatedScore(x)) || score(y) - score(x))
    .slice(0, maxRelated);
  // 被注入/被命中都算「用过」：热区小幅加热，相关命中加热更多
  if (typeof onHit === 'function') {
    for (const e of hot) { try { onHit(e, Number(hotHitHeat) || 0); } catch { /* 忽略 */ } }
    for (const e of related) { try { onHit(e, Number(relatedHitHeat) || 0); } catch { /* 忽略 */ } }
  }

  const lines = [];
  if (hot.length) {
    lines.push('【长期记忆·常驻】');
    for (const e of hot) lines.push(`- ${e.text}${e.people?.length ? `（${e.people.join('、')}）` : ''}`);
  }
  if (related.length) {
    if (lines.length) lines.push('');
    lines.push('【和当前话题有关】');
    for (const e of related) lines.push(`- ${e.text}`);
  }
  return lines.join('\n');
}

/** 按关键词/人名检索（给 qq_memory_query 用） */
export function queryEntries(entries, query, { limit = 5, onHit = null, hitHeat = 1, semanticThreshold = 0.2 } = {}) {
  const q = String(query ?? '').trim();
  const all = Array.isArray(entries) ? entries : [];
  if (!q) {
    return all
      .slice()
      .sort((a, b) => (Number(b.heat) || 0) - (Number(a.heat) || 0))
      .slice(0, limit);
  }
  const lower = q.toLowerCase();
  const qGrams = ngrams(q);
  const exact = (e) => String(e.text || '').toLowerCase().includes(lower)
    || (e.people || []).some((p) => String(p).toLowerCase().includes(lower))
    || (e.keywords || []).some((k) => String(k).toLowerCase().includes(lower));
  const matched = all
    .filter((e) => e && (exact(e) || (qGrams.size && overlapScore(qGrams, ngrams(`${e.text} ${(e.people || []).join(' ')}`)) >= Number(semanticThreshold))))
    .sort((a, b) => (exact(b) ? 2 : 0) - (exact(a) ? 2 : 0) || (Number(b.heat) || 0) - (Number(a.heat) || 0))
    .slice(0, limit);
  if (typeof onHit === 'function') { for (const e of matched) { try { onHit(e, hitHeat); } catch { /* 忽略 */ } } }
  return matched;
}

/**
 * 定期整理：久未命中的条目降级（hot→warm→cold），热区保持在 maxHot 以内。
 * 只改 level，不删除任何条目。
 */
export function degrade(store, { now = Date.now(), hotDays = 3, warmDays = 7, coldDays = 30, maxHot = 8 } = {}) {
  const entries = store && Array.isArray(store.entries) ? store.entries : [];
  const day = 24 * 60 * 60 * 1000;
  for (const e of entries) {
    if (!e) continue;
    const idle = now - (Number(e.lastHitAt) || Number(e.createdAt) || now);
    const heat = Number(e.heat) || 0;
    if (idle > coldDays * day) e.level = 'cold';
    else if (idle > warmDays * day) e.level = 'warm';
    else if (heat >= 3 || idle <= hotDays * day) e.level = 'hot';
    else e.level = e.level || 'warm';
  }
  // 热区上限：热度高的留下，其余降为 warm（不删）
  const hotList = entries.filter((e) => e && e.level === 'hot')
    .sort((a, b) => (Number(b.heat) || 0) - (Number(a.heat) || 0) || (Number(b.lastHitAt) || 0) - (Number(a.lastHitAt) || 0));
  for (const e of hotList.slice(maxHot)) e.level = 'warm';
  return store;
}

/** 旧版记忆（activeTopics / memberImpressions / pendingThoughts）迁移成一句一条 */
export function migrateFromLegacy(shared, now = Date.now()) {
  const store = { entries: [] };
  if (!shared || typeof shared !== 'object') return store;

  for (const t of Array.isArray(shared.activeTopics) ? shared.activeTopics : []) {
    if (!t || !t.text) continue;
    addEntry(store, {
      text: t.text,
      people: Array.isArray(t.participants) ? t.participants : [],
      keywords: [],
      now: Number(t.lastMentionAt) || now
    });
  }
  for (const [name, im] of Object.entries(shared.memberImpressions || {})) {
    if (!name || !im || typeof im !== 'object') continue;
    for (const trait of Array.isArray(im.traits) ? im.traits : []) {
      addEntry(store, {
        text: trait,
        people: [name],
        keywords: [],
        now: Number(im.lastSeenAt) || now
      });
    }
  }
  for (const t of Array.isArray(shared.pendingThoughts) ? shared.pendingThoughts : []) {
    if (!t || !t.text) continue;
    addEntry(store, {
      text: t.text,
      people: [],
      keywords: [t.motivation ? String(t.motivation) : '待办'],
      now: Number(t.createdAt) || now
    });
  }
  return store;
}

/** 兼容旧数据的 store 规范化 */
export function normalizeStore(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return emptyStore();
  if (Array.isArray(raw.entries)) return { entries: raw.entries.filter((e) => e && e.text) };
  // 旧结构（activeTopics/memberImpressions）→ 迁移
  if (Array.isArray(raw.activeTopics) || raw.memberImpressions) return migrateFromLegacy(raw, now);
  return emptyStore();
}

/** 统计：总条数 / 热温冷分布 */
export function stats(store) {
  const entries = store && Array.isArray(store.entries) ? store.entries : [];
  const by = { hot: 0, warm: 0, cold: 0 };
  for (const e of entries) {
    const lvl = e && e.level;
    if (by[lvl] !== undefined) by[lvl] += 1;
    else by.warm += 1;
  }
  return { total: entries.length, ...by };
}
