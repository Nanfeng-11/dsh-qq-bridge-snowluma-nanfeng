#!/system/bin/sh
# 打印匹配 cmdline 关键字的进程 PID
# 用法: pidof.sh <cmdline关键字>
# 输出: 每行一个 PID；无匹配输出空
# 注意：不用 $( ) 命令替换，避免 toybox sh 的死锁（见 is_running.sh 注释）。


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
KEY="$1"
[ -z "$KEY" ] && exit 1

SELF=$$

for f in /proc/[0-9]*/cmdline; do
  pid=${f#/proc/}
  pid=${pid%/cmdline}
  [ "$pid" = "$SELF" ] && continue
  [ -r "$f" ] || continue
  grep -qa -- "$KEY" "$f" 2>/dev/null || continue
  grep -qa "is_running.sh" "$f" 2>/dev/null && continue
  grep -qa "pidof.sh" "$f" 2>/dev/null && continue
  grep -qa "bash -c" "$f" 2>/dev/null && continue
  grep -qa "sh -c" "$f" 2>/dev/null && continue
  echo "$pid"
done
