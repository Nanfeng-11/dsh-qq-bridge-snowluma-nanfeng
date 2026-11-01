#!/usr/bin/env bash
# dsh-qq-bridge 本地电脑部署（macOS / Linux）
# 前提：已装桌面版 DSH（DeepSeek Harness）与 Node.js ≥ 22.12
set -e

PACK_DIR="$(cd "$(dirname "$0")/../.." && pwd)"   # 插件包根目录
PLUGIN_NAME="dsh-qq-bridge"

echo "=== 1. 把插件 link 进 DSH profile ==="
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE_PKG="$DSH_HOME/profiles/web/package.json"
if [ ! -f "$PROFILE_PKG" ]; then
  echo "找不到 DSH profile：$PROFILE_PKG"
  echo "请在 DSH 设置 → 插件市场 → 添加本地插件，选择本目录；或设置 DSH_HOME 后重跑。"
  exit 1
fi
mkdir -p "$(dirname "$PROFILE_PKG")"
# link: 本地目录安装（DSH 支持 link: 源）
node -e "
const fs=require('fs');
const p='$PROFILE_PKG';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
j.dependencies=j.dependencies||{};
j.dependencies['$PLUGIN_NAME']='link:$PACK_DIR';
fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');
console.log('已注册依赖 link:$PACK_DIR');
"

echo "=== 2. 替换 cordis.patch.yml 里的路径占位符 ==="
NODE_BIN="$(command -v node)"
BRIDGE_DIR="$PACK_DIR/bridge"
sed -i.bak \
  -e "s|@@NODE@@|$NODE_BIN|g" \
  -e "s|@@BRIDGE@@|$BRIDGE_DIR|g" \
  "$PACK_DIR/cordis.patch.yml"
rm -f "$PACK_DIR/cordis.patch.yml.bak"

echo "=== 3. 生成配置 ==="
if [ ! -f "$BRIDGE_DIR/config.json" ]; then
  cp "$BRIDGE_DIR/config.example.json" "$BRIDGE_DIR/config.json"
  echo "已生成 config.json，请编辑：snowluma.wsUrl / httpUrl / accessToken（SnowLuma 服务器地址与令牌）"
else
  echo "config.json 已存在，跳过"
fi

echo "=== 4. 安装桥接依赖 ==="
cd "$BRIDGE_DIR"
if [ -f package.json ] && [ ! -d node_modules ]; then
  pnpm install --prod 2>/dev/null || npm install --omit=dev 2>/dev/null || echo "（依赖安装失败也不影响桥接核心运行，仅功能缺失）"
fi

echo "=== 5. 启动桥接 ==="
bash startup.sh || true
sleep 5
node -e "
fetch('http://127.0.0.1:3100/api/status?token='+(require('fs').readFileSync('$BRIDGE_DIR/state/console-token','utf8').trim()))
  .then(r=>r.json()).then(j=>console.log('桥接状态:',j.mode,'dshReady='+j.dshReady,'snowluma='+(j.snowluma&&j.snowluma.connected)))
  .catch(()=>console.log('桥接未就绪，查看 bridge/state/bridge.log'));
"

echo
echo "=== 完成 ==="
echo "下一步："
echo "  1. 重启 DSH（设置 → 重启引擎），插件生效"
echo "  2. 编辑 $BRIDGE_DIR/roles/角色模板.md 为你自己的角色"
echo "  3. 重启后杀一次 MCP 进程让工具列表刷新（重要）"
echo "  4. 在 DSH 设置里把模式切到 reserved2"
