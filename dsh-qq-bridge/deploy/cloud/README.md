# 上云部署（Linux 服务器，7×24 在线）

把整套机器人放服务器上跑：不需要电脑一直开机，手机随时和它聊。

## 架构（全云版，推荐）
```
QQ 群/私聊 → SnowLuma（云 Windows）
                ↓
            dsh-qq-bridge（Linux 服务器，systemd 常驻）
                ↓
            DSH（服务器上，headless / ACP 模式）
                ↓
            DeepSeek API
```

## 两种云端形态

| 形态 | 说明 | 适合 |
|---|---|---|
| **全云**（推荐） | SnowLuma + 桥接 + DSH 全在云上 | 正式 7×24 运营 |
| **混合** | SnowLuma 云 + 桥接云 + DSH 留在本地电脑 | 不想把 AI 大脑放服务器 |

## 安装

### 1. 准备服务器
```bash
# 任意 Linux（Ubuntu 20.04+ / Debian / CentOS），2C4G 起
# 装 Node ≥ 22.12
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
# 上传插件包（本地打包好的 dsh-qq-bridge.tgz）
scp dsh-qq-bridge.tgz root@你的服务器:/opt/
ssh root@你的服务器
cd /opt && tar -xzf dsh-qq-bridge.tgz
```

### 2. 一键安装
```bash
bash /opt/package/deploy/cloud/install.sh
```
脚本会：替换路径 → 生成 config → 装依赖 → 注册 systemd 常驻服务 → 启动并自检。

### 3. 配置
```bash
vi /opt/package/bridge/config.json
```
```json
{
  "snowluma": {
    "wsUrl": "ws://你的SnowLuma服务器:3001",
    "httpUrl": "http://你的SnowLuma服务器:3000",
    "accessToken": "你的token"
  },
  "dsh": { "authToken": "" }
}
```

### 4. 服务器上的 DSH（二选一）
**A. 服务器跑 DSH（全云）**
```bash
# 服务器装 DSH CLI/headless，把插件 link 进它的 profile（同本地部署流程）
# 桥接 config.json 里 dsh.baseUrl 指向本机 3080
```

**B. DSH 留在电脑（混合）**
```bash
# 桥接 config.json：
"dsh": { "baseUrl": "http://你的电脑公网IP或内网穿透:3080", "allowRemote": true }
```
> ⚠️ allowRemote 会把 DSH 启动凭据发往对端——务必用 SSH 隧道/内网穿透加密链路，
> 不要裸奔公网。

## 常驻与运维

```bash
systemctl status dsh-qq-bridge     # 状态
systemctl restart dsh-qq-bridge    # 重启
journalctl -u dsh-qq-bridge -f     # 日志
bash /opt/package/bridge/pack-soul.sh   # 手动备份（元神包）
```

## 守护体系（装好即带）
| 组件 | 职责 |
|---|---|
| systemd | 进程挂了自动拉起 |
| guardian.sh | 2 分钟巡检控制台，异常自动恢复 |
| auto-clean.sh | 上下文动态清理（记忆收尾 → 清理 → 备份） |
| pack-soul.sh | 每日元神包备份 |

## 成本参考
```
服务器：2C4G 轻量约 ¥30-60/月（腾讯/阿里轻量）
SnowLuma 云 Windows：约 ¥100/月（2C4G）或与桥接同机（若用 Windows 服务器）
DeepSeek：约 ¥38-50/天（按 3200 轮/天）
语音：约 ¥10-30/月
```
省钱：上下文清理已内置（每轮重放量决定成本）+ 推理档用 low。
