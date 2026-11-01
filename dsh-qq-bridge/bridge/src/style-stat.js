// 语感统计：从最近的真人消息里学"这个群的说话节奏"。
// 借鉴五层框架的表达层（从最近 300 条真人消息算中位句长/无标点率/语气词，注入约 130 字）。
// 这里用会话内 recentMessages（!isSelf 的），全部本地计算，零 token 成本。

const TONE_WORDS = ['哈', '啊', '呀', '呢', '嘛', '哦', '嘞', '呗', '诶'];

function splitSentences(text) {
  return String(text ?? '').split(/[，。！？!?、；;\n]/).map((s) => s.trim()).filter(Boolean);
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

/**
 * 统计语感。
 * @param {Array} messages recentMessages 里的 !isSelf 消息（取 text/plain/tail）
 * @param {number} minSamples 少于这个样本量就不注入（避免瞎指导）
 * @returns {string} 注入文本（样本不足返回 ''）
 */
export function buildStyleHint(messages, minSamples = 20) {
  const texts = (Array.isArray(messages) ? messages : [])
    .map((m) => String(m?.plain || m?.text || m?.tail || ''))
    .filter((t) => t.trim())
    .slice(-300);

  if (texts.length < minSamples) return '';

  const sentences = [];
  let noPunctCount = 0;
  const toneCount = new Map();
  let totalChars = 0;

  for (const t of texts) {
    const s = splitSentences(t);
    sentences.push(...s);
    if (!/[，。！？!?、；;\n]/.test(t)) noPunctCount += 1;
    for (const w of TONE_WORDS) {
      const n = t.split(w).length - 1;
      if (n > 0) toneCount.set(w, (toneCount.get(w) || 0) + n);
    }
    totalChars += t.length;
  }

  const medianLen = median(sentences.map((s) => s.length));
  const noPunctRate = Math.round((noPunctCount / texts.length) * 100);
  const topTones = [...toneCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);

  const parts = [`群里最近说话：中位一句约 ${medianLen} 字`];
  if (noPunctRate >= 40) parts.push(`${noPunctRate}% 的消息不打标点`);
  else if (noPunctRate <= 10) parts.push('基本都带标点');
  if (topTones.length) parts.push(`常用语气词：${topTones.join('、')}`);

  return `【语感】${parts.join('；')}。跟着这个节奏说话，别比他们正式，也别更碎。`;
}
