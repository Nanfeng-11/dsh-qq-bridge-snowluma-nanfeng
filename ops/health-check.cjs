// 小鲸鱼系统 · 任务状态检查
// 用法：node check.cjs
// 输出：每一层链路是否通，不通的给出原因和修复建议
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOME = '/data/user/0/app.dsh.mobile/files/dsh-home';
const BRIDGE = path.join(HOME, 'qq-bridge');
const CT = path.join(BRIDGE, 'state', 'console-token');
const CFG = path.join(BRIDGE, 'config.json');

const results = [];
function ok(name, detail) { results.push({ layer: name, ok: true, detail }); }
function bad(name, detail, fix) { results.push({ layer: name, ok: false, detail, fix }); }

function req(port, pathStr, { method = 'GET', body, headers = {}, timeout = 6000 } = {}) {
  return new Promise((resolve) => {
    const q = http.request({ host: '127.0.0.1', port, path: pathStr, method, headers, timeout }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    q.on('error', (e) => resolve({ status: 0, error: e.message }));
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, error: 'timeout' }); });
    if (body) q.write(body);
    q.end();
  });
}

function procs(pattern) {
  const out = [];
  try {
    for (const p of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(p)) continue;
      let cmd = '';
      try { cmd = fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').replace(/\0/g, ' '); } catch { continue; }
      if (cmd.includes(pattern) && !cmd.includes('check.cjs')) out.push({ pid: p, cmd: cmd.trim() });
    }
  } catch {}
  return out;
}

(async () => {
  // ── 1. 进程层 ──
  const need = [
    ['src/bridge.js', '桥接'],
    ['run-bridge.sh', '托管'],
    ['guardian.sh', '巡检'],
    ['auto-clean.sh', '清理'],
    ['mcp-snowluma-safe.js', 'MCP(snowluma)'],
    ['mcp-host-server.js', 'MCP(host)'],
    ['mcp-web-search-safe.js', 'MCP(web-search)']
  ];
  for (const [pat, name] of need) {
    const list = procs(pat);
    if (list.length === 1) ok(`进程 · ${name}`, `PID ${list[0].pid}`);
    else if (list.length === 0) bad(`进程 · ${name}`, '未运行', 'bash startup.sh');
    else bad(`进程 · ${name}`, `重复 ${list.length} 个（PID ${list.map(x => x.pid).join(',')}）`, '清理重复进程后重启');
  }

  // ── 2. 本地控制台 ──
  let consoleToken = '';
  try { consoleToken = fs.readFileSync(CT, 'utf8').trim(); } catch {}
  if (!consoleToken) bad('控制台 · token', '读不到 state/console-token', '重启桥接生成');
  else ok('控制台 · token', consoleToken.slice(0, 8) + '…');

  const st = await req(3100, `/api/status?token=${encodeURIComponent(consoleToken)}`);
  if (st.status === 200) {
    try {
      const j = JSON.parse(st.body);
      ok('控制台 · 3100', `mode=${j.mode} dshReady=${j.dshReady}`);
      // ── 3. 桥接 ↔ DSH ──
      if (j.dshReady) ok('桥接 → DSH', 'dshReady=true');
      else bad('桥接 → DSH', 'dshReady=false（DSH 不可达）', '检查 3080 是否在跑 / config.dsh.baseUrl');
      // ── 4. 桥接 ↔ SnowLuma ──
      const s = j.snowluma || {};
      if (s.connected && s.good) ok('桥接 → SnowLuma', `connected, 账号在线=${s.accountOnline}, 心跳=${s.lastPacketAgoMs ?? '?'}ms`);
      else if (s.connected) bad('桥接 → SnowLuma', `已连但状态异常（good=${s.good}）`, '看云端 SnowLuma 是否卡死');
      else bad('桥接 → SnowLuma', 'WS 未连接', '检查云端 3001 端口 / SnowLuma 进程');
      // ── 5. 唤醒/会话 ──
      if (j.role) ok('角色 · 人格卡', String(j.role).slice(0, 30));
      else bad('角色 · 人格卡', '未加载', '检查 roles/ 与 config.role');
    } catch (e) {
      bad('控制台 · 3100', '返回无法解析：' + st.body.slice(0, 80));
    }
  } else {
    bad('控制台 · 3100', `不可达（${st.error || st.status}）`, 'bash startup.sh');
  }

  // ── 6. 云端 OneBot HTTP ──
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch {}
  const sl = cfg.snowluma || {};
  const httpUrl = sl.httpUrl || 'http://<你的云服务器IP>:3000';
  const token = sl.accessToken || '';
  const remote = await new Promise((resolve) => {
    try {
      const u = new URL(httpUrl + '/get_status');
      const q = http.request({ host: u.hostname, port: u.port || 3000, path: u.pathname, method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, timeout: 8000 }, (res) => {
        let d = ''; res.on('data', c => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      q.on('error', e => resolve({ status: 0, error: e.message }));
      q.on('timeout', () => { q.destroy(); resolve({ status: 0, error: 'timeout' }); });
      q.write('{}'); q.end();
    } catch (e) { resolve({ status: 0, error: e.message }); }
  });
  if (remote.status === 200) {
    try {
      const j = JSON.parse(remote.body);
      ok('云端 · OneBot HTTP', `online=${j.data?.online} good=${j.data?.good}`);
    } catch { bad('云端 · OneBot HTTP', '返回无法解析'); }
  } else {
    bad('云端 · OneBot HTTP', `不可达（${remote.error || remote.status}）`, '检查云服务器是否开机 / 安全组 3000');
  }

  // ── 7. DSH 引擎 ──
  const dsh = await req(3080, '/', { timeout: 5000 });
  if (dsh.status === 200 || dsh.status === 302 || dsh.status === 401) ok('DSH 引擎 · 3080', `HTTP ${dsh.status}`);
  else bad('DSH 引擎 · 3080', `不可达（${dsh.error || dsh.status}）`, '重启 DSH 引擎');

  // ── 8. 数据层 ──
  try {
    const mem = JSON.parse(fs.readFileSync(path.join(BRIDGE, 'state', 'role-memory.json'), 'utf8'));
    const entries = (mem.memory?.shared?.entries) || [];
    ok('数据 · 记忆库', `${entries.length} 条（热 ${entries.filter(e => e.level === 'hot').length}）`);
  } catch { bad('数据 · 记忆库', '读不到 role-memory.json'); }
  try {
    const mood = JSON.parse(fs.readFileSync(path.join(BRIDGE, 'state', 'mood.json'), 'utf8'));
    ok('数据 · 情绪状态', `mood=${Number(mood.mood).toFixed(2)} tags=${Object.keys(mood.tags || {}).length}`);
  } catch { bad('数据 · 情绪状态', 'mood.json 缺失', '重启桥接自动生成'); }
  try {
    const backups = fs.readdirSync(path.join(BRIDGE, 'backups')).filter(f => f.startsWith('soul-'));
    ok('数据 · 元神包', `${backups.length} 份`);
  } catch { bad('数据 · 元神包', 'backups 目录缺失', './pack-soul.sh'); }

  // ── 8.5 上下文规模（过大 = 回消息变慢） ──
  try {
    const tu = fs.readFileSync(path.join(BRIDGE, "state", "token-usage.jsonl"), "utf8").trim().split("\n").slice(-300);
    // 以「最后一次 auto-clean 清理时间」为界，只看清理之后的对话（否则会统计到清理前的历史峰值）
    let lastClean = 0;
    try {
      const cleanTs = fs.readFileSync(path.join(BRIDGE, "state", ".last-clean"), "utf8").trim();
      lastClean = Number(cleanTs) * 1000 || 0;
    } catch {
      try {
        const logLines = fs.readFileSync(path.join(BRIDGE, "state", "auto-clean.log"), "utf8").trim().split("\n");
        for (let i = logLines.length - 1; i >= 0; i--) {
          const m = logLines[i].match(/=== (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) 清理完成/);
          if (m) { lastClean = new Date(m[1].replace(" ", "T") + "+08:00").getTime(); break; }
        }
      } catch {}
    }
    let gMax = 0, pMax = 0, count = 0;
    const cutoff = Math.max(lastClean, Date.now() - 10 * 60 * 1000);
    for (const l of tu) {
      try { const j = JSON.parse(l); if (j.k !== "turn") continue;
        if (Number(j.t) < cutoff) continue;
        const key = String(j.key || "");
        if (!/^(private|group):/.test(key)) continue;
        count++;
        const b = j.b || {}; const total = (b.cacheMiss || 0) + (b.cacheHit || 0);
        if (key.startsWith("group:")) { if (total > gMax) gMax = total; }
        else { if (total > pMax) pMax = total; }
      } catch {}
    }
    if (count === 0) ok("性能 · 上下文规模", "最近 10 分钟无新对话（上下文已清空）");
    else {
      const gk = Math.round(gMax / 1000), pk = Math.round(pMax / 1000);
      // 分策略阈值：群聊 120k 该清、私聊 300k 才清（与 auto-clean 一致）
      if (gk >= 120 || pk >= 300) bad("性能 · 上下文规模", "群 " + gk + "k / 私聊 " + pk + "k（群>120k 或 私聊>300k 就该清了）", "等待 auto-clean 清理或手动 reset");
      else ok("性能 · 上下文规模", "群 " + gk + "k / 私聊 " + pk + "k（未超分策略阈值）");
    }
  } catch {}

  // ── 9. 最近错误 ──
  try {
    const lines = fs.readFileSync(path.join(BRIDGE, 'state', 'bridge.log'), 'utf8').split('\n').slice(-300);
    // 只统计「最近 10 分钟」的错误：历史残留的错误不代表现在不通
    const now = new Date();
    const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const recent = lines.filter((l) => {
      if (!/错误|失败|error|断线|超限/.test(l)) return false;
      const m = l.match(/\[(\d{2}):(\d{2}):(\d{2})\]/);
      if (!m) return false;
      const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      let diff = nowSec - sec;
      if (diff < -600) diff += 86400;  // 跨天
      return diff >= 0 && diff <= 600;
    });
    if (recent.length === 0) ok('日志 · 近 10 分钟', '无错误');
    else bad('日志 · 近 10 分钟', `${recent.length} 条错误，最后：${recent[recent.length - 1].trim().slice(0, 70)}`);
  } catch {}

  // ── 输出 ──
  const badCount = results.filter(r => !r.ok).length;
  console.log('\n══════ 小鲸鱼系统 · 任务状态 ══════');
  console.log(`检查时间：${new Date().toLocaleString('zh-CN', { hour12: false })}\n`);
  let i = 0;
  for (const r of results) {
    i++;
    const mark = r.ok ? '✅' : '❌';
    console.log(`${mark} [${String(i).padStart(2, '0')}] ${r.layer.padEnd(20)} ${r.detail || ''}`);
    if (!r.ok && r.fix) console.log(`        ↳ 修复：${r.fix}`);
  }
  console.log('\n───────────────────────────────');
  if (badCount === 0) console.log('结论：全链路通畅 ✅');
  else console.log(`结论：${badCount} 处不通 ❌（见上方 ↳ 修复建议）`);
  console.log('═══════════════════════════════\n');
  process.exit(badCount === 0 ? 0 : 1);
})();
