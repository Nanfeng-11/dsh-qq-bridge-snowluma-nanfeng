// 可移植默认路径（dsh-qq-bridge）：BRIDGE_DIR / DSH_HOME 环境变量优先
const BRIDGE_DIR = process.env.BRIDGE_DIR || __dirname;
const DSH_HOME = process.env.DSH_HOME || (process.env.HOME ? process.env.HOME + "/.dsh" : ".");
// 统计「自上次清理以来」各 QQ 会话的回合数（turn 数），输出最大值
// auto-clean 用它做「按轮数触发清理」：轮数攒太多就清，不等 token 超限。
const fs = require('fs');
const file = process.argv[2] || (BRIDGE_DIR + '/token-usage.jsonl');
const lastCleanFile = process.argv[3] || (BRIDGE_DIR + '/.last-clean');
let maxTurns = 0;
try {
  let cutoff = Date.now() - 24 * 3600 * 1000;   // 兜底：最多看最近 24 小时
  try {
    const ts = Number(fs.readFileSync(lastCleanFile, 'utf8').trim());
    if (Number.isFinite(ts) && ts > 0) cutoff = Math.max(cutoff, ts * 1000);
  } catch {}
  const counts = new Map();
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').slice(-600);
  for (const l of lines) {
    try {
      const j = JSON.parse(l);
      if (j.k !== 'turn') continue;
      if (!/^(private|group):/.test(String(j.key || ''))) continue;
      if (Number(j.t) < cutoff) continue;
      counts.set(j.key, (counts.get(j.key) || 0) + 1);
    } catch {}
  }
  for (const n of counts.values()) if (n > maxTurns) maxTurns = n;
} catch {}
console.log(maxTurns);
