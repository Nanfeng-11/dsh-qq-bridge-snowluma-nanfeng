#!/system/bin/sh
# 通过 /proc 精确检测进程
# 用法: is_running.sh <cmdline关键字>
# 返回 0=运行中, 1=未运行
#
# 修复历史：
#  - 旧版把 KEY 放在自己的 argv 里，自匹配导致永远返回 0
#  - 旧版用 $( ) 命令替换取 cmdline，在 toybox sh 下偶发父子 shell 互相等待死锁
#    （父等管道、子等孙进程，整条启动链卡住）。现在直接 grep /proc/*/cmdline，不用命令替换。


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
  # 排除检测脚本自身与 shell 包装（它们的命令行里会带上关键字）
  grep -qa "is_running.sh" "$f" 2>/dev/null && continue
  grep -qa "pidof.sh" "$f" 2>/dev/null && continue
  grep -qa "bash -c" "$f" 2>/dev/null && continue
  grep -qa "sh -c" "$f" 2>/dev/null && continue
  exit 0
done
exit 1
