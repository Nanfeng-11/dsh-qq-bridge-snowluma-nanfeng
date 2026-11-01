# dsh-qq-bridge

QQ AI 机器人一体化插件：**桥接服务 + MCP 工具 + 记忆/清理/情绪/语音/群管理全套逻辑**，一个插件装进 DeepSeek Harness。

> 这份包是**通用架构**：不含任何人设与说话风格——人格卡自己写（`bridge/roles/角色模板.md`）。

## 两种部署模块

| 模块 | 位置 | 说明 |
|---|---|---|
| **本地电脑** | `deploy/local/` | Windows / macOS / Linux 桌面 DSH 上跑（电脑关机就停） |
| **上云** | `deploy/cloud/` | Linux 服务器 7×24 常驻（systemd 守护） |

## 架构

```
QQ 群/私聊 → SnowLuma（QQ 协议端，Windows）
                ↓ WebSocket
            dsh-qq-bridge（本插件：提示词组装/记忆/清理/情绪/工具路由）
                ↓
            DSH（AI 大脑）
                ↓
            DeepSeek API
```

## 快速开始

```bash
# 本地电脑
bash deploy/local/install.sh        # macOS/Linux
# 或 Windows PowerShell：.\deploy\local\install.ps1

# 服务器
bash deploy/cloud/install.sh
```

装完四件事：
1. 填 `bridge/config.json`（SnowLuma 地址 + token）
2. 重启 DSH
3. **杀一次 MCP 进程**让工具列表刷新（重要）
4. DSH 设置切到 reserved2，开聊

## 插件里有什么

| 文件 | 职责 |
|---|---|
| `cordis.patch.yml` | DSH 补丁：MCP×3 + qq-mode 设置项 |
| `lib/index.js` | DSH 插件入口（模式设置） |
| `presets/` | qq-chat / qq-chat-v2 会话预设 + 安全守卫 |
| `bridge/src/` | 桥接本体：记忆（一句一条/热度/降级）、上下文清理、情绪状态、语感、语音、群管理、唤醒 |
| `bridge/roles/` | 人格卡目录（自带空白模板） |
| `bridge/state/` | 数据目录：记忆库、情绪、会话状态 |
| `bridge/auto-clean.sh` | 清理守护：收尾写记忆 → 清上下文 → 备份 |
| `bridge/guardian.sh` | 进程巡检 |
| `bridge/pack-soul.sh` | 每日元神包备份 |

## 全套逻辑速览

**记忆**：一句一条（text/people/keywords/heat/level），热 8 条常驻 + 相关 5 条按需，3/7/30 天降级不删除，语义检索，寒暄不记，被纠正删错记对。

**清理**：群聊 12 万 token/80 轮、私聊 30 万/300 轮触发；未读保护最多拖 6 小时；清理前收尾写记忆（写不完延后一轮）；超 25 万强制清；清理后提醒 AI"上一段被压缩了别假装记得"。

**情绪**：心情 0~1 + 10 标签，词表驱动（零 token），半衰期衰减，注入【此刻的心情】，8 态情绪光谱。

**语音**：MiniMax T2A，`tts:情绪:内容`，私聊不限量、群聊限频。

**群管理**：白名单 + 每会话独立唤醒（@/名字/关键词/提问/拍一拍/指定人必醒/概率）+ AI 自主调频率。

**工具**：40+ 个 MCP 工具（消息/读取/状态/唤醒/记忆/表情/语音/空间/黑话）。

## 安全边界（重要）

- 群友**没有管理权限**：不能执行命令、改角色、读写文件（preset 安全守卫强制）
- 主人（ownerQQ）才有管理端权限
- 人格卡编辑接口只对主人私聊开放（每次自动备份）

## 已知坑（都踩过）

1. **MCP 加了新工具 → 杀 MCP 进程让引擎重连**，重启引擎没用
2. 私聊不回 → 查 `~/.dsh/.credentials.yaml` 存在 + config.authToken 留空
3. 上下文涨到 70 万 → 模型 400；本包超 25 万强制清
4. 语音远程路径 → 用 `base64://`
5. 脚本自杀 → 用 `psx`/`killx`（按进程名，别 pkill -f）

## 版本

- 0.3.1（2026-11-02）：发布加固——清空示例配置中的真实密钥、细化 files 白名单（排除 config.json / 备份 / 测试脚本 / ffmpeg）、cordis.patch.yml 路径占位符化、补 LICENSE 与 .npmignore、修复中文文件名编码
- 0.3.0（2026-11-02）：首次打包，本地电脑 + 上云双模块
- 源自 qq-bridge 0.2.1-r1（Android 生产环境运行 30+ 天验证）
