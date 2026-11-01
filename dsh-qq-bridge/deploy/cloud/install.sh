#!/usr/bin/env bash
# dsh-qq-bridge 上云部署（Linux 服务器）
# 前提：一台 Linux 服务器（Ubuntu/Debian/CentOS，2C4G 够用）、Node.js ≥ 22.12
# 场景：机器人 7×24 在线，不需要电脑一直开着。
set -e

PACK_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BRIDGE_DIR="$PACK_DIR/bridge"

echo "=== 1. 检查 Node ==="
command -v node >/dev/null || { echo "先装 Node.js ≥ 22.12（nvm 或官网二进制）"; exit 1; }
node -v

echo "=== 2. 替换路径占位符 ==="
NODE_BIN="$(command -v node)"
sed -i \
  -e "s|@@NODE@@|$NODE_BIN|g" \
  -e "s|@@BRIDGE@@|$BRIDGE_DIR|g" \
  "$PACK_DIR/cordis.patch.yml"

echo "=== 3. 生成配置 ==="
if [ ! -f "$BRIDGE_DIR/config.json" ]; then
  cp "$BRIDGE_DIR/config.example.json" "$BRIDGE_DIR/config.json"
  echo "已生成 config.json：请填 SnowLuma 地址与 accessToken、DeepSeek 鉴权。"
fi

echo "=== 4. 安装依赖 ==="
cd "$BRIDGE_DIR"
if [ -f package.json ] && [ ! -d node_modules ]; then
  (pnpm install --prod 2>/dev/null || npm install --omit=dev 2>/dev/null) || echo "（依赖安装失败不影响核心，仅功能缺失）"
fi

echo "=== 5. 注册 systemd 常驻服务 ==="
SERVICE_NAME="dsh-qq-bridge"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
if [ -w /etc/systemd/system ]; then
  cat > "$SERVICE_FILE" << EOF
[Unit]
Description=dsh-qq-bridge QQ AI bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$BRIDGE_DIR
ExecStart=/usr/bin/env bash $BRIDGE_DIR/startup.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
  echo "systemd 服务已启动：systemctl status $SERVICE_NAME"
else
  echo "无 systemd 权限：改用 nohup 后台运行"
  nohup bash "$BRIDGE_DIR/startup.sh" >/dev/null 2>&1 &
  echo "已后台启动（PID $!）。持久化请用 supervisor/pm2 或 crontab @reboot。"
fi

sleep 5
node -e "
fetch('http://127.0.0.1:3100/api/status?token='+(require('fs').readFileSync('$BRIDGE_DIR/state/console-token','utf8').trim()))
  .then(r=>r.json()).then(j=>console.log('桥接状态:',j.mode,'dshReady='+j.dshReady,'snowluma='+(j.snowluma&&j.snowluma.connected)))
  .catch(()=>console.log('桥接未就绪，查看 bridge/state/bridge.log'));
"

echo
echo "=== 完成 ==="
echo "服务器上的 DSH："
echo "  A. 已在服务器装了 DSH：把插件同样 link 进服务器 DSH profile（同 deploy/local/install.sh 的 1-2 步）"
echo "  B. 没装 DSH：桥接支持 dsh.allowRemote，可连你电脑/手机上的 DSH（config.json 里配 dsh.baseUrl）"
echo "     —— 推荐 A：全云架构，最省心。"
