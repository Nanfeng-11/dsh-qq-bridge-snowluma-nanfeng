#!/system/bin/sh
# 元神包：把「她」打包成一个可移植文件
#   人格卡 + 记忆库 + 会话状态 + 黑话/表情库 + 配置 + 打补丁后的代码 + 运维脚本
# 只要这几样还在，换手机、换服务器、换模型都能把她重新加载出来。
#
# 用法：./pack-soul.sh            手动打一份
#       ./pack-soul.sh --daily    每天最多一份（给 auto-clean 用）


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
OUT="$DIR/backups"
TS=$(date +%Y%m%d-%H%M%S)
DAY=$(date +%Y%m%d)

cd "$DIR" || exit 1
mkdir -p "$OUT"

# --daily：同一天已经打过就不再重复
if [ "$1" = "--daily" ]; then
  if ls "$OUT"/soul-"$DAY"-*.tar.gz >/dev/null 2>&1; then
    exit 0
  fi
fi

cat > "$DIR/README-soul.txt" <<'EOF'
【元神包 · 怎么把她接回来】

这个包里是她的全部：人格卡、记忆库、脾气配置、打补丁后的桥接代码、运维脚本。

一、准备新环境
  1) 装 DSH（手机 App 或桌面版都行），确认 node 可用
  2) 把 qq-bridge 插件装到 DSH_HOME/qq-bridge（或直接用本包 src/ 覆盖）
  3) 在插件目录执行依赖安装（pnpm install / npm install），得到 node_modules

二、把包里的东西放回去
  tar -xzf soul-YYYYMMDD-HHMMSS.tar.gz -C <qq-bridge 目录>
  会覆盖：roles/（人格）、state/（记忆+会话状态+黑话+表情）、config.json（配置）、src/（代码）、*.sh（脚本）

三、改三处就能跑
  config.json 里：
    · snowluma.wsUrl / httpUrl —— 指向新的 SnowLuma（云端 Windows）
    · snowluma.accessToken      —— 新网关的令牌
    · dsh.baseUrl               —— 新的 DSH 地址（本机默认 http://127.0.0.1:3080）
    · socialV2.voice.tts.apiKey —— 语音合成 key（没有就把 voice.enabled 设 false）

四、启动
  ./startup.sh
  然后查：curl "http://127.0.0.1:3100/api/status?token=$(cat state/console-token)"
  看到 mode=reserved2、dshReady=true、snowluma.connected=true 就是活了。

五、如果换了模型
  人格卡 roles/你的角色.md 和记忆库 state/role-memory.json 是她的"元神"，
  模型换了这两样不用动。行为若漂移，对照记忆库里的雷区/偏好逐条校正即可。

【注意】包里的 config.json 含明文密钥（MiniMax key / SnowLuma token），
只放本地或私有位置，别发到公开地方。
EOF

PKG="$OUT/soul-$TS.tar.gz"
rm -f "$PKG"

tar -czf "$PKG" \
  -C "$DIR" \
  README-soul.txt \
  roles \
  config.json \
  src \
  state/role-memory.json \
  state/social-v2.json \
  state/initial-prompts.json \
  state/slang.json \
  state/stickers.json \
  state/sessions.json \
  state/current-role.json \
  state/console-token \
  pack-soul.sh \
  startup.sh \
  guardian.sh \
  auto-clean.sh \
  run-bridge.sh \
  is_running.sh \
  pidof.sh \
  recover.sh \
  2>/dev/null

if [ ! -f "$PKG" ]; then
  echo "打包失败：$PKG" >&2
  exit 1
fi

# 只保留最近 5 份
ls -t "$OUT"/soul-*.tar.gz 2>/dev/null | tail -n +6 | while read -r f; do rm -f "$f"; done

SIZE=$(wc -c < "$PKG" 2>/dev/null)
COUNT=$(tar -tzf "$PKG" 2>/dev/null | wc -l)
echo "元神包已生成：$PKG"
echo "  大小：${SIZE} 字节 / ${COUNT} 个文件"
echo "  保留：$(ls "$OUT"/soul-*.tar.gz 2>/dev/null | wc -l) 份"
