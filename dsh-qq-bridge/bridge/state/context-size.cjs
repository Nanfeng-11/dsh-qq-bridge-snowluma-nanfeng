// 可移植默认路径（dsh-qq-bridge）：BRIDGE_DIR / DSH_HOME 环境变量优先
const BRIDGE_DIR = process.env.BRIDGE_DIR || __dirname;
const DSH_HOME = process.env.DSH_HOME || (process.env.HOME ? process.env.HOME + "/.dsh" : ".");
// 读取当前最大 QQ 会话上下文（token 数）——给 auto-clean 做动态清理判断用
// 输出：一个整数（最后一次清理之后的 turn 里，最大的 cacheHit+cacheMiss 合计）
// 只统计 private:/group: 会话；黑话学习 internal: 与清理无关，不算。
const fs = require('fs');
const file = process.argv[2] || (BRIDGE_DIR + '/token-usage.jsonl');
const lastCleanFile = process.argv[3] || (BRIDGE_DIR + '/.last-clean');
let max = 0;
try {
  // 以「最后一次清理时间」为界（和健康检查一致，避免统计到清理前的历史峰值）
  let cutoff = Date.now() - 30 * 60 * 1000;   // 默认只看最近 30 分钟
  try {
    const ts = Number(fs.readFileSync(lastCleanFile, 'utf8').trim());
    if (Number.isFinite(ts) && ts > 0) cutoff = Math.max(cutoff, ts * 1000);
  } catch {}
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').slice(-300);
  for (const l of lines) {
    try {
      const j = JSON.parse(l);
      if (j.k !== 'turn') continue;
      if (!/^(private|group):/.test(String(j.key || ''))) continue;
      if (Number(j.t) < cutoff) continue;
      const b = j.b || {};
      const total = (Number(b.cacheMiss) || 0) + (Number(b.cacheHit) || 0);
      if (total > max) max = total;
    } catch {}
  }
} catch {}
console.log(max);
