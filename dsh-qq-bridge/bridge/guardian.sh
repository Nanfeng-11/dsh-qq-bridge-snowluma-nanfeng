#!/system/bin/sh
# qq-bridge 自动巡检与自愈（每 2 分钟）
# 修复历史：
#  - 旧版 ./is_running.sh 存在"自匹配"bug（关键字在自己的 argv 里），永远返回运行中，
#    于是桥接死了也从不重启。检测脚本已重写。
#  - 旧版只看进程不看端口，进程假活（控制台起不来）时不处理。现在加端口探活。
#  - 桥接改由 run-bridge.sh 托管（node 退出 3 秒自动重启），本脚本只兜底托管进程本身。


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
LOG="$BRIDGE_DIR/state/guardian.log"
INTERVAL=120        # 2 分钟
HEARTBEAT_EVERY=15  # 一切正常时每 15 轮（约 30 分钟）记一次心跳

cd "$BRIDGE_DIR" || exit 1

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"; }

console_ok() {
  node -e '
const http=require("http");
const r=http.request({host:"127.0.0.1",port:3100,path:"/",timeout:3000},res=>{res.resume();process.exit(0)});
r.on("error",()=>process.exit(1));
r.on("timeout",()=>{r.destroy();process.exit(1)});
r.end();' 2>/dev/null
}

start_bridge() {
  rm -f state/bridge.stop 2>/dev/null
  setsid ./run-bridge.sh >> bridge-run.log 2>&1 < /dev/null &
  sleep 12
}

stop_bridge() {
  touch state/bridge.stop 2>/dev/null
  for p in $(./pidof.sh 'src/bridge.js'); do kill $p 2>/dev/null; done
  sleep 3
  for p in $(./pidof.sh 'src/bridge.js'); do kill -9 $p 2>/dev/null; done
  for p in $(./pidof.sh 'run-bridge.sh'); do kill $p 2>/dev/null; done
  sleep 1
  for p in $(./pidof.sh 'run-bridge.sh'); do kill -9 $p 2>/dev/null; done
  rm -f state/bridge.stop 2>/dev/null
}

restart_bridge() {
  stop_bridge
  start_bridge
}

CYCLE=0

check_and_fix() {
  CYCLE=$((CYCLE + 1))
  CHANGED=0

  WRAP=$(./pidof.sh 'run-bridge.sh')
  NODE=$(./pidof.sh 'src/bridge.js')

  if [ -z "$WRAP" ]; then
    log "⚠️ 托管进程未运行，启动桥接..."
    start_bridge
    CHANGED=1
  elif [ -z "$NODE" ]; then
    sleep 6
    if ! ./is_running.sh 'src/bridge.js'; then
      log "⚠️ 托管在但 node 未起来，重启桥接..."
      restart_bridge
      CHANGED=1
    fi
  elif ! console_ok; then
    log "⚠️ 进程在（PID $NODE）但控制台 3100 无响应，重启桥接..."
    restart_bridge
    CHANGED=1
  fi

  if [ "$CHANGED" -eq 1 ]; then
    if ./is_running.sh 'src/bridge.js' && console_ok; then
      log "✅ 桥接已恢复（PID $(./pidof.sh 'src/bridge.js')）"
    else
      log "❌ 桥接恢复失败（详见 bridge-run.log）"
    fi
  fi

  # 清理守护
  if ! ./is_running.sh 'auto-clean.sh'; then
    log "⚠️ 清理守护未运行，正在启动..."
    setsid ./auto-clean.sh > /dev/null 2>&1 < /dev/null &
    sleep 2
    log "✅ 清理守护已启动"
    CHANGED=1
  fi

  # 日志轮转（超过 1MB 截断，每 10 轮做一次省 IO）
  if [ $((CYCLE % 10)) -eq 0 ]; then
    for f in "state/bridge.log" "bridge-run.log" "state/guardian.log" "state/auto-clean.log" "state/qq-activity.log" "state/token-usage.jsonl" "state/tool-calls.jsonl"; do
      if [ -f "$f" ]; then
        SIZE=$(wc -c < "$f" 2>/dev/null || echo 0)
        if [ "$SIZE" -gt 1048576 ]; then
          tail -1000 "$f" > "$f.tmp" && mv "$f.tmp" "$f"
          log "🧹 已轮转 $f (${SIZE}字节 -> 缩减)"
        fi
      fi
    done

    # 备份轮转（只保留最近 10 份 role-memory、5 份 social-v2）
    ls -t state/backup/role-memory-*.json 2>/dev/null | tail -n +11 | xargs -r rm -f
    ls -t state/backup/social-v2-*.json 2>/dev/null | tail -n +6 | xargs -r rm -f
  fi

  # 配置完整性（缺失时从备份恢复）
  if [ ! -f "config.json" ] && [ -f "state/backup/config.json" ]; then
    cp "state/backup/config.json" "config.json"
    log "🔧 已从备份恢复 config.json"
    CHANGED=1
  fi

  if [ "$CHANGED" -eq 0 ] && [ $((CYCLE % HEARTBEAT_EVERY)) -eq 0 ]; then
    log "💚 心跳：桥接正常（PID $(./pidof.sh 'src/bridge.js')），控制台 3100 可达"
  fi
}

while true; do
  check_and_fix
  sleep $INTERVAL
done
