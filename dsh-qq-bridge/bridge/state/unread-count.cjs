// 可移植默认路径（dsh-qq-bridge）：BRIDGE_DIR / DSH_HOME 环境变量优先
const BRIDGE_DIR = process.env.BRIDGE_DIR || __dirname;
const DSH_HOME = process.env.DSH_HOME || (process.env.HOME ? process.env.HOME + "/.dsh" : ".");
// 统计所有 QQ 会话的未读消息数（未处理的消息 = 还没写进记忆的上下文）
// 输出：整数。auto-clean 用它决定「现在能不能清上下文」。
const fs = require('fs');
const p = process.argv[2] || (BRIDGE_DIR + '/social-v2.json');
let total = 0;
try {
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const [key, v] of Object.entries(s.conversations || {})) {
    if (!/^(private|group):/.test(key)) continue;
    const n = (v && Array.isArray(v.unread)) ? v.unread.length : 0;
    total += n;
  }
} catch {}
console.log(total);
