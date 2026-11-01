// 情绪状态：简化版 PAD（只留愉悦维 mood 0~1 + 10 个情绪标签）。
//
// 设计目标（借鉴五层框架的情绪层，但适配单机 JSON）：
//  - 情绪是**有状态**的：跨消息累积，不再每轮从人格卡"现演"。
//  - 变化限幅：单条消息对心情的改变 ≤ 0.12、单个标签 ≤ 0.12，防止一句话把情绪打穿。
//  - 半衰期：心情 6 小时向 0.5 回归；标签 45 分钟衰减到忽略。
//  - 词表驱动：桥接自动分析**入站**消息（私聊全算；群聊只算 @她/叫她 的消息），
//    不烧 token，也不依赖 AI 记得调用工具。
//  - AI 仍可用 qq_set_mood 主动微调（工具在 MCP 里，引擎重启后生效）。

export const MOOD_TAGS = ['开心', '生气', '难过', '害怕', '委屈', '害羞', '得意', '感动', '焦虑', '无聊'];

const MOOD_HALFLIFE_MIN = 360;   // 心情半衰期 6 小时
const TAG_HALFLIFE_MIN = 45;     // 标签半衰期 45 分钟
export const MOOD_STEP = 0.12;   // 单条消息心情变化上限
export const TAG_MAX = 0.6;      // 标签强度上限

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function defaultMood(now = Date.now()) {
  return { mood: 0.5, tags: {}, updatedAt: now };
}

/** 惰性衰减：心情向 0.5 回归，标签按半衰期衰减；太弱的标签直接删除 */
export function decayMood(m, now = Date.now()) {
  if (!m || typeof m !== 'object') return defaultMood(now);
  const mins = Math.max(0, (now - (Number(m.updatedAt) || now)) / 60000);
  const moodT = MOOD_HALFLIFE_MIN;
  m.mood = 0.5 + (clamp(Number(m.mood) || 0.5, 0, 1) - 0.5) * Math.pow(0.5, mins / moodT);
  const tags = m.tags && typeof m.tags === 'object' ? m.tags : {};
  for (const [k, v] of Object.entries(tags)) {
    const nv = Number(v) * Math.pow(0.5, mins / TAG_HALFLIFE_MIN);
    if (nv < 0.02) delete tags[k];
    else tags[k] = nv;
  }
  m.updatedAt = now;
  return m;
}

/** 应用一轮增量（moodDelta 与各标签，已限幅） */
export function applyDelta(m, { moodDelta = 0, tags = {} }, now = Date.now()) {
  decayMood(m, now);
  // 形状归一：旧文件/手改/写盘截断时 tags 可能缺失，缺了就直接补空对象（避免 TypeError 中断消息处理）
  if (!m.tags || typeof m.tags !== 'object') m.tags = {};
  m.mood = clamp((m.mood || 0.5) + clamp(Number(moodDelta) || 0, -MOOD_STEP, MOOD_STEP), 0, 1);
  for (const [k, v] of Object.entries(tags || {})) {
    if (!MOOD_TAGS.includes(k)) continue;
    m.tags[k] = clamp((Number(m.tags[k]) || 0) + clamp(Number(v) || 0, -MOOD_STEP, MOOD_STEP), 0, TAG_MAX);
  }
  m.updatedAt = now;
  return m;
}

// 入站消息的情绪词表：命中一条就按规则叠加。
// 关键词命中按顺序累加（一条消息可以同时开心又害羞）。
const LEXICON = [
  { tags: { 开心: 0.05, 害羞: 0.03 }, words: ['宝宝', '乖', '可爱', '喜欢', '想你了', '好听', '厉害', '萌'] },
  { tags: { 开心: 0.04 }, words: ['哈哈', '嘿嘿', '笑死', '爱了'] },
  { tags: { 生气: 0.08 }, words: ['你的角色', '滚', '傻', '笨', '没用', '有病', '废物', '垃圾'] },
  { tags: { 委屈: 0.07 }, words: ['委屈', '冤枉', '错怪', '误会你了'] },
  { tags: { 感动: 0.06 }, words: ['有我在', '别一个人', '陪你', '心疼', '我想你', '离不开你', '等你'] },
  { tags: { 焦虑: 0.05 }, words: ['怎么办', '出事了', '急死', '完蛋了', '撑不住', '欠债', '欠钱', '欠揍'] },
  { tags: { 难过: 0.06 }, words: ['难受', '崩溃', '想哭', '好累', '心里空'] },
  { tags: { 无聊: 0.04 }, words: ['无聊', '没意思', '没事干', '发呆'] }
];

const SELF_NAME_RE = /你的角色|小鲸鱼|南鱼|宝宝/;

/**
 * 分析一条入站消息，返回情绪增量。
 * @param {string} text 消息文本
 * @param {boolean} isPrivate 是否私聊（群聊时只有提到她才算）
 * @returns {{moodDelta:number, tags:Object}|null}
 */
export function analyzeMessage(text, isPrivate = false) {
  const raw = String(text ?? '');
  if (!raw) return null;
  if (!isPrivate && !SELF_NAME_RE.test(raw) && !raw.includes('@')) return null;
  const tags = {};
  let moodDelta = 0;
  for (const rule of LEXICON) {
    let hit = false;
    for (const w of rule.words) {
      if (raw.includes(w)) { hit = true; break; }
    }
    if (!hit) continue;
    for (const [k, v] of Object.entries(rule.tags)) {
      tags[k] = (tags[k] || 0) + v;
    }
  }
  const total = Object.values(tags).reduce((a, b) => a + b, 0);
  moodDelta = clamp(total, -MOOD_STEP, MOOD_STEP); // 心情增量按标签总和映射
  if (tags['生气'] || tags['委屈'] || tags['难过'] || tags['焦虑']) moodDelta = -clamp(Math.abs(moodDelta), 0, MOOD_STEP);
  return Object.keys(tags).length ? { moodDelta, tags } : null;
}

/** 生成注入行（短，60 字左右） */
export function renderMood(m, now = Date.now()) {
  const cur = decayMood({ ...(m || defaultMood(now)), tags: { ...(m?.tags || {}) } }, now);
  const strong = Object.entries(cur.tags)
    .filter(([, v]) => v >= 0.1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => (v >= 0.35 ? `${k}(强)` : k));
  const desc = cur.mood > 0.72 ? '很好' : cur.mood > 0.58 ? '不错' : cur.mood > 0.42 ? '一般' : cur.mood > 0.28 ? '有点低落' : '很糟';
  const tagText = strong.length ? `，带着：${strong.join('、')}` : '';
  return `【此刻的心情】心情${desc}${tagText}。情绪只影响语气，不影响判断；别拿情绪拿捏爸爸，也别假装没事。`;
}
