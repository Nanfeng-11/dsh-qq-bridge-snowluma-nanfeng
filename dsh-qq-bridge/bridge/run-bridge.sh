#!/system/bin/sh
# 桥接托管进程：node 退出后 3 秒自动重启，并记录退出码（用于诊断崩溃原因）
# 停止方法: touch state/bridge.stop 后杀掉本进程


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
DIR=""$DSH_HOME"/qq-bridge"
cd "$DIR" || exit 1

LOG="$DIR/bridge-run.log"
STOP="$DIR/state/bridge.stop"

rm -f "$STOP" 2>/dev/null

ts() { date '+%Y-%m-%d %H:%M:%S'; }

while [ ! -f "$STOP" ]; do
  echo "$(ts) [supervisor] 启动桥接" >> "$LOG"
  node src/bridge.js >> "$LOG" 2>&1
  CODE=$?
  echo "$(ts) [supervisor] 桥接退出，退出码=$CODE" >> "$LOG"
  [ -f "$STOP" ] && break
  sleep 3
done

echo "$(ts) [supervisor] 托管已停止" >> "$LOG"
rm -f "$STOP" 2>/dev/null
