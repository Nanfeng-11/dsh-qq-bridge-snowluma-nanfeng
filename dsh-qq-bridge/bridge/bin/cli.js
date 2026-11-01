#!/usr/bin/env node
// dsh-qq-bridge CLI：start / status / backup / clean
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const BRIDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...args] = process.argv.slice(2);

function run(c, opts = {}) {
  try { return execSync(c, { cwd: BRIDGE_DIR, stdio: opts.silent ? 'pipe' : 'inherit', ...opts }); }
  catch { return null; }
}

switch (cmd || 'status') {
  case 'start':
    console.log('启动桥接（守护 + 清理 + 桥接本体）…');
    spawn('sh', [path.join(BRIDGE_DIR, 'startup.sh')], { cwd: BRIDGE_DIR, stdio: 'inherit', detached: true }).unref();
    console.log('已启动。查看状态：npx dsh-qq-bridge status');
    break;
  case 'status':
    run('bash pidof.sh', { silent: true });
    try {
      const ct = fs.readFileSync(path.join(BRIDGE_DIR, 'state/console-token'), 'utf8').trim();
      const out = execSync(`node -e "fetch('http://127.0.0.1:3100/api/status?token='+process.argv[1]).then(r=>r.json()).then(j=>console.log(JSON.stringify({mode:j.mode,dshReady:j.dshReady,snowluma:j.snowluma&&j.snowluma.connected})))" ${ct}`, { cwd: BRIDGE_DIR }).toString();
      console.log(out.trim());
    } catch (e) {
      console.log('桥接未运行（先 npx dsh-qq-bridge start）');
    }
    break;
  case 'backup':
    run('bash pack-soul.sh');
    break;
  case 'clean':
    console.log('清理上下文由 auto-clean.sh 自动执行；手动清单个会话请用控制台 /api/session/reset。');
    break;
  default:
    console.log(`用法: dsh-qq-bridge <start|status|backup|clean>`);
}
