// 可移植默认路径（dsh-qq-bridge）：BRIDGE_DIR / DSH_HOME 环境变量优先
const BRIDGE_DIR = process.env.BRIDGE_DIR || __dirname;
const DSH_HOME = process.env.DSH_HOME || (process.env.HOME ? process.env.HOME + "/.dsh" : ".");
// 清理 DSH 会话目录里的孤儿会话文件（archive 只隐藏不删文件，会一直累积）
// 保留：sessions.json 里活跃映射的会话；其他 session-* 目录全部删除。
// 注意：deepseek（工作区）和 wps 等非桥接会话目录不在此脚本处理范围内——
//       只清 qq-bridge 相关的两个 cwd 目录。
const fs = require('fs');
const path = require('path');
const S = (DSH_HOME + '/sessions');
const SJ = (BRIDGE_DIR + '/sessions.json');
const TARGETS = [
  '--data-user-0-app.dsh.mobile-files-dsh-home-qq-bridge-state-agents--',
  '--data-user-0-app.dsh.mobile-files-dsh-home-qq-bridge-state-slang-agent--'
];
// 保护名单 = sessions.json 里的活跃映射 + DSH 当前工作区会话（lead/subagent）
// 绝不能硬编码：硬编码会漏掉「刚创建、还没被清理脚本见过」的会话，删掉活跃会话的文件。
const active = new Set();
try {
  const sj = JSON.parse(fs.readFileSync(SJ, 'utf8'));
  for (const id of Object.values(sj.sessions || {})) active.add(String(id));
} catch {}
// DSH 工作区（deepseek）和 wps 目录不在此脚本处理范围（TARGETS 只含 qq-bridge 两个目录），
// 但保险起见把 sessions.json 之外「最近 1 小时内修改过」的会话也视为活跃，避免误删。
const now = Date.now();
for (const d of TARGETS) {
  const p = path.join(S, d);
  if (!fs.existsSync(p)) continue;
  for (const s of fs.readdirSync(p)) {
    if (!s.startsWith('session-')) continue;
    const fp = path.join(p, s);
    try {
      const st = fs.statSync(fp);
      if (now - st.mtimeMs < 60 * 60 * 1000) active.add(s);   // 1 小时内有活动 → 保护
    } catch {}
  }
}

let removed = 0, bytes = 0;
function dirSize(p) {
  let t = 0;
  for (const f of fs.readdirSync(p)) {
    const fp = path.join(p, f);
    t += fs.statSync(fp).isDirectory() ? dirSize(fp) : fs.statSync(fp).size;
  }
  return t;
}
for (const d of TARGETS) {
  const p = path.join(S, d);
  if (!fs.existsSync(p)) continue;
  for (const s of fs.readdirSync(p)) {
    if (!s.startsWith('session-') || active.has(s)) continue;
    const fp = path.join(p, s);
    try {
      bytes += dirSize(fp);
      fs.rmSync(fp, { recursive: true, force: true });
      removed++;
    } catch {}
  }
}
console.log(`孤儿会话清理：${removed} 个，释放 ${(bytes / 1024 / 1024).toFixed(1)} MB`);
