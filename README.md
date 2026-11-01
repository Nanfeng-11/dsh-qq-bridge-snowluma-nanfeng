# dsh-qq-bridge

> 把 QQ AI 机器人做成一个 DeepSeek Harness 插件。
> 记忆、上下文清理、情绪、语音、群管理——全套逻辑，一个包。
> **不带人设**：人格卡自己写，这包只管"像活的"。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522.12-brightgreen)]()

## 这是什么

基于开源项目 [Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge) 的一体化封装，
在一台安卓设备上以 **7×24 生产环境运行 30+ 天** 验证后打包成 DSH 插件。

对话效果：不是"客服式"的机器人——有长期记忆（聊过的记得）、有情绪（被夸会开心，被骂会别扭）、
有自己的主动（想你就找你）、有分寸（该睡的觉劝一句就停）、有底线（不越权、不泄露）。

## 双部署模块

| 模块 | 目录 | 场景 |
|---|---|---|
| 本地电脑 | `deploy/local/` | Windows/macOS/Linux 桌面 DSH，电脑开着就陪聊 |
| 上云 | `deploy/cloud/` | Linux 服务器 7×24 常驻，systemd 守护 |

```bash
# 本地电脑（macOS/Linux）
bash deploy/local/install.sh
# 本地电脑（Windows PowerShell）
.\deploy\local\install.ps1
# 服务器上云
bash deploy/cloud/install.sh
```

## 架构

```
QQ 群/私聊 → SnowLuma（OneBot 协议端，Windows）
                ↓ WebSocket
            dsh-qq-bridge（提示词组装 · 记忆 · 清理 · 情绪 · 工具路由）
                ↓
            DeepSeek Harness（AI 大脑 + 40+ MCP 工具）
                ↓
            DeepSeek API
```

## 核心逻辑（这包的"含金量"）

### 记忆系统
- **一句一条**：每条记忆 = 一句话事实 + 人名 + 关键词，不是聊天记录存档
- **三级分层**：hot（3 天内，常驻注入 8 条）/ warm（7 天内，相关话题捞 5 条）/ cold（30 天，归档不删）
- **检索**：人名/关键词精确匹配 + 中文 2-gram 语义匹配，捞不到就是没有，**不编造**
- **寒暄过滤**：你好/晚安/哈哈哈 不记；流水账比不记更糟
- **被纠正**：删错记对，错误记忆会"越错越热"，必须当场清掉

### 上下文清理
- **分策略触发**：群聊 12 万 token/80 轮；私聊 30 万/300 轮；2 小时兜底
- **三道保护**：未读不清（最多拖 6 小时）→ 清理前收尾写记忆（写不完延后一轮，绝不硬清）→ 超 25 万强制清
- **清理后提醒**：注入"上一段被压缩了，别假装记得"——防 AI 编造被清掉的细节
- 背景：涨到 70 万 token 时 DeepSeek 会直接 400 拒收（实测踩过）

### 情绪系统
- 心情 0~1 + 10 个情绪标签，**词表驱动**（零 token 成本），半衰期衰减
- 8 态情绪光谱（闲散/雀跃/蔫/炸毛/别扭/酸/认真/蔫坏）
- "情绪不能靠形容词说，要藏在语气和长度里"——反 AI 味的核心

### 语音 / 表情 / 群管理
- 语音：MiniMax T2A，`tts:情绪:内容`，私聊不限量、群聊限频
- 表情：收藏库检索、斗图节奏（2~3 轮收）、看图后选择
- 唤醒：@/名字/关键词/提问/拍一拍/指定人必醒/概率抽样，AI 可自主调

### 安全边界
- 群友无管理权限：不能执行命令、改角色、读写文件（安全守卫强制）
- 人格卡编辑只对主人私聊开放，每次自动备份（10 份）

## 快速开始

1. 准备：SnowLuma（QQ 协议端）+ DSH + DeepSeek 账号
2. 装插件（见双部署模块）
3. 填 `bridge/config.json`
4. 重启 DSH → **杀一次 MCP 进程**（工具列表刷新，重启引擎没用）
5. DSH 设置切 `reserved2` → 编辑 `bridge/roles/角色模板.md` → 开聊

## 已知坑（全部实测）

| 坑 | 原因 | 解法 |
|---|---|---|
| MCP 新工具不出现 | 引擎只拉一次工具列表 | 杀 MCP 进程重连 |
| 私聊不回 | 引擎重启后鉴权断 | 检查 `~/.dsh/.credentials.yaml` + authToken 留空 |
| 上下文 400 | 70 万 token 超窗口 | 超 25 万强制清 |
| 语音 ENOENT | 远程路径跨机失效 | `base64://` |
| 脚本自杀 | pkill -f 匹配自己 | `psx`/`killx` 按进程名 |

## 目录

```
dsh-qq-bridge/
├── cordis.patch.yml       MCP×3 + 模式设置
├── lib/                   DSH 插件入口
├── presets/               qq-chat / qq-chat-v2 会话预设 + 安全守卫
├── bridge/
│   ├── src/               核心逻辑（12k 行）
│   ├── roles/             人格卡（自带空白模板）
│   ├── config.example.json
│   ├── auto-clean.sh      清理守护
│   ├── guardian.sh        巡检守护
│   └── pack-soul.sh       元神包备份
└── deploy/
    ├── local/             本地电脑部署
    └── cloud/             上云部署
```

## 文档与运维

除了插件包，仓库还带全套设计文档与运维工具：

```
docs/
├── 流水线运维手册.md                  从零搭建与接管维护
├── 记忆系统设计文档.md                记忆库设计 + 提示词可追溯
├── 记忆系统完整资料与DSH提示词.md      记忆系统专册
├── 自动清理缓存系统与记忆系统合并版.md 清理系统 + 合并提示词
├── 情绪系统自动化文件.md              情绪系统 + 自动化提示词
├── 通用部署包-不含人格.md             给别人部署的完整指南
├── 运维手册.md / 阿里云部署清单.md
ops/
├── health-check.cjs                  19 项全链路健康检查
└── md2word.cjs                       Markdown → Word 转换
```

## 致谢

- [Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge)：上游桥接框架（MIT）
- [SnowLuma](https://github.com/snowluma/snowluma)：OneBot 协议端
- [DeepSeek Harness](https://github.com/deepseek-ai)：AI 运行平台

## License

MIT（见 [LICENSE](./LICENSE)）。上游 qq-bridge 同为 MIT。
