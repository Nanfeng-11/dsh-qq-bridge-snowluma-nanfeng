# 本地电脑部署（Windows / macOS / Linux 桌面版 DSH）

把 QQ AI 机器人整套跑在**你自己的电脑**上：DSH 桌面版 + 桥接插件，全部本机，不依赖手机。

## 架构
```
QQ 群/私聊 → SnowLuma 网关（云 Windows，QQ 协议端）
                ↓ WebSocket
            电脑上的 dsh-qq-bridge（本插件）
                ↓ HTTP/事件流
            电脑上的 DSH 桌面版（AI 大脑 + 工具）
                ↓
            DeepSeek API
```

> SnowLuma 只支持 Windows。如果你电脑就是 Windows，SnowLuma 也可以装在本机；
> Mac/Linux 用户把 SnowLuma 放在云 Windows 或另一台 Windows 机器上。

## 安装（三步）

### 1. 装好 SnowLuma（QQ 协议端）
- Windows：本机装
- Mac/Linux：云 Windows 或局域网 Windows 装
- 开启 OneBot：HTTP 3000 / WS 3001，设 accessToken，防火墙放行

### 2. 安装本插件
```bash
# Windows（PowerShell）
.\deploy\local\install.ps1

# macOS / Linux
bash deploy/local/install.sh
```
脚本会：link 插件进 DSH → 替换路径 → 生成 config.json → 启动桥接。

### 3. 配置 + 重启
```bash
# 编辑 config.json（必填）
{
  "snowluma": {
    "wsUrl": "ws://你的SnowLuma地址:3001",
    "httpUrl": "http://你的SnowLuma地址:3000",
    "accessToken": "你在SnowLuma设的token"
  }
}
```
1. 重启 DSH（插件生效）
2. 重启后**杀一次 MCP 进程**（工具列表才会刷新，光重启引擎不够）
3. DSH 设置 → 把桥接模式切到 **reserved2**
4. 编辑 `bridge/roles/角色模板.md` 成你的角色

## 常驻运行
```bash
# 手动启动（关机会停）
bash bridge/startup.sh

# 开机自启（macOS/Linux）
crontab -e   # 加一行：
@reboot bash /path/to/dsh-qq-bridge/bridge/startup.sh

# 开机自启（Windows）
# 任务计划程序 → 新建任务 → 触发器"登录时" → 操作运行 startup.ps1
```

## 目录说明
```
dsh-qq-bridge/
├── cordis.patch.yml       插件补丁（MCP×3 + 模式开关）
├── lib/                   DSH 插件代码
├── presets/               qq-chat / qq-chat-v2 会话预设
├── bridge/                桥接本体（独立 Node 服务）
│   ├── src/               记忆/清理/情绪/语音/群管理全套逻辑
│   ├── roles/             人格卡放这里
│   ├── config.json        配置
│   └── state/             记忆库/情绪/会话状态（数据目录）
└── deploy/                本目录（部署脚本）
```

## 常见问题
| 问题 | 处理 |
|---|---|
| MCP 工具没出现 | 杀 MCP 进程让引擎重连（不是重启引擎） |
| 私聊不回 | 检查 DSH 鉴权：`~/.dsh/.credentials.yaml` 存在、config.authToken 留空 |
| 上下文 400 | 上下文超限：auto-clean 会自动清（超 25 万强制） |
| 图片/语音功能缺失 | 装 ffmpeg（`brew install ffmpeg` / `apt install ffmpeg` / Windows 下载二进制） |
