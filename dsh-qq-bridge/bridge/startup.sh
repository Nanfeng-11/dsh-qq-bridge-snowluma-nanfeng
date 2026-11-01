#!/system/bin/sh
# qq-bridge 启动器：幂等启动所有服务


# ── 可移植路径探测（dsh-qq-bridge 插件生成，勿删）──────────────────
# 电脑 / 服务器 / 安卓通用：桥接目录按脚本自身位置推导，node 走 PATH，
# DSH_HOME 优先取环境变量，其次桌面 DSH 约定目录。
if [ -z "$PORTABLE_PATHS_LOADED" ]; then
  PORTABLE_PATHS_LOADED=1
  SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
  BRIDGE_DIR="${BRIDGE_DIR:-$SCRIPT_DIR}"
  NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || echo node)}"
  DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
  export BRIDGE_DIR NODE_BIN DSH_HOME
fi
# ────────────────────────────────────────────────────────────────────
# BRIDGE_DIR 已由上方可移植探测自动推导
LOG="$BRIDGE_DIR/state/startup.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"; }

cd "$BRIDGE_DIR" 2>/dev/null || { log "❌ 目录不存在"; exit 1; }

log "=== 启动检查 ==="

# 控制台 3100 是否响应
console_ok() {
  node -e '
const http=require("http");
const r=http.request({host:"127.0.0.1",port:3100,path:"/",timeout:3000},res=>{res.resume();process.exit(0)});
r.on("error",()=>process.exit(1));r.on("timeout",()=>{r.destroy();process.exit(1)});r.end();' 2>/dev/null
}

start_bridge() {
  rm -f state/bridge.stop 2>/dev/null
  setsid ./run-bridge.sh >> bridge-run.log 2>&1 < /dev/null &
  sleep 12
}

# 1. 桥接（托管进程 + node + 控制台端口 三重校验）
if ./is_running.sh 'run-bridge.sh' && ./is_running.sh 'src/bridge.js' && console_ok; then
  log "✅ 桥接已在运行（PID $(./pidof.sh 'src/bridge.js')，控制台正常）"
else
  if ./is_running.sh 'src/bridge.js' || ./is_running.sh 'run-bridge.sh'; then
    log "⚠️ 桥接状态异常，清理后重启..."
    touch state/bridge.stop 2>/dev/null
    for p in $(./pidof.sh 'src/bridge.js'); do kill $p 2>/dev/null; done
    sleep 3
    for p in $(./pidof.sh 'src/bridge.js') $(./pidof.sh 'run-bridge.sh'); do kill -9 $p 2>/dev/null; done
    rm -f state/bridge.stop 2>/dev/null
    sleep 1
  fi
  start_bridge
  if ./is_running.sh 'src/bridge.js'; then
    log "✅ 桥接已启动（PID $(./pidof.sh 'src/bridge.js')）"
  else
    log "❌ 桥接启动失败（详见 bridge-run.log）"
  fi
fi

# 2. 清理守护
if ./is_running.sh 'auto-clean.sh'; then
  log "✅ 清理守护已在运行"
else
  setsid ./auto-clean.sh > /dev/null 2>&1 < /dev/null &
  sleep 2
  log "✅ 清理守护已启动"
fi

# 3. 巡检守护
if ./is_running.sh 'guardian.sh'; then
  log "✅ 巡检守护已在运行"
else
  setsid ./guardian.sh > /dev/null 2>&1 < /dev/null &
  sleep 2
  log "✅ 巡检守护已启动"
fi

log "=== 启动检查完成 ==="
