// 可移植默认路径（dsh-qq-bridge）：BRIDGE_DIR / DSH_HOME 环境变量优先
const BRIDGE_DIR = process.env.BRIDGE_DIR || __dirname;
const DSH_HOME = process.env.DSH_HOME || (process.env.HOME ? process.env.HOME + "/.dsh" : ".");
// 分类型统计（自上次清理以来）：
// 输出一行 JSON：{"groupToken":N,"groupTurns":N,"privToken":N,"privTurns":N}
// auto-clean 用它做分策略清理：群聊严格（少攒），私聊宽松（可深聊）。
const fs = require('fs');
const usageFile = process.argv[2] || (BRIDGE_DIR + '/token-usage.jsonl');
const lastCleanFile = process.argv[3] || (BRIDGE_DIR + '/.last-clean');

const out = { groupToken: 0, groupTurns: 0, privToken: 0, privTurns: 0 };
try {
  let cutoff = Date.now() - 24 * 3600 * 1000;
  try {
    const ts = Number(fs.readFileSync(lastCleanFile, 'utf8').trim());
    if (Number.isFinite(ts) && ts > 0) cutoff = Math.max(cutoff, ts * 1000);
  } catch {}
  const lines = fs.readFileSync(usageFile, 'utf8').trim().split('\n').slice(-600);
  for (const l of lines) {
    try {
      const j = JSON.parse(l);
      if (j.k !== 'turn') continue;
      const key = String(j.key || '');
      if (!/^(private|group):/.test(key)) continue;
      if (Number(j.t) < cutoff) continue;
      const b = j.b || {};
      const total = (Number(b.cacheMiss) || 0) + (Number(b.cacheHit) || 0);
      const isGroup = key.startsWith('group:');
      if (isGroup) {
        if (total > out.groupToken) out.groupToken = total;
        out.groupTurns += 1;
      } else {
        if (total > out.privToken) out.privToken = total;
        out.privTurns += 1;
      }
    } catch {}
  }
} catch {}
// 输出 shell 可读格式（全数字，auto-clean 直接 eval）
console.log(`GROUP_TOK=${out.groupToken} GROUP_TURNS=${out.groupTurns} PRIV_TOK=${out.privToken} PRIV_TURNS=${out.privTurns}`);
