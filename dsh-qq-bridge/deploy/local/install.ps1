# dsh-qq-bridge 本地电脑部署（Windows PowerShell）
# 前提：桌面版 DSH + Node.js ≥ 22.12（并确保 node 在 PATH）
$ErrorActionPreference = "Stop"

$PACK_DIR = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # 插件包根目录
$PLUGIN_NAME = "dsh-qq-bridge"

Write-Host "=== 1. 把插件 link 进 DSH profile ==="
$DSH_HOME = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE ".dsh" }
$PROFILE_PKG = Join-Path $DSH_HOME "profiles\web\package.json"
if (-not (Test-Path $PROFILE_PKG)) {
    Write-Host "找不到 DSH profile：$PROFILE_PKG"
    Write-Host "请先在 DSH 设置里确认 profile 位置，或设置环境变量 DSH_HOME 后重跑。"
    exit 1
}
$pkg = Get-Content $PROFILE_PKG -Raw | ConvertFrom-Json
if (-not $pkg.dependencies) { $pkg.dependencies = @{} }
$linkPath = ($PACK_DIR -replace '\\','/')
$pkg.dependencies | Add-Member -NotePropertyName $PLUGIN_NAME -NotePropertyValue "link:$linkPath" -Force
$pkg | ConvertTo-Json -Depth 8 | Set-Content $PROFILE_PKG -Encoding UTF8
Write-Host "已注册依赖 link:$linkPath"

Write-Host "=== 2. 替换 cordis.patch.yml 路径占位符 ==="
$NODE_BIN = (Get-Command node).Source -replace '\\','/'
$BRIDGE_DIR = (Join-Path $PACK_DIR "bridge") -replace '\\','/'
$patch = Join-Path $PACK_DIR "cordis.patch.yml"
$content = Get-Content $patch -Raw
$content = $content -replace '@@NODE@@', $NODE_BIN
$content = $content -replace '@@BRIDGE@@', $BRIDGE_DIR
Set-Content $patch $content -Encoding UTF8 -NoNewline

Write-Host "=== 3. 生成配置 ==="
if (-not (Test-Path (Join-Path $BRIDGE_DIR "config.json"))) {
    Copy-Item (Join-Path $BRIDGE_DIR "config.example.json") (Join-Path $BRIDGE_DIR "config.json")
    Write-Host "已生成 config.json：请填 SnowLuma 地址与 accessToken"
} else { Write-Host "config.json 已存在" }

Write-Host "=== 4. 启动桥接 ==="
Set-Location $BRIDGE_DIR
if (Test-Path "startup.ps1") { powershell -File "startup.ps1" }
else { Write-Host "Windows 下建议手动运行：node src/bridge.js（或把 startup.ps1 从部署包拷到 bridge/）" }

Write-Host ""
Write-Host "=== 完成 ==="
Write-Host "1. 重启 DSH，插件生效"
Write-Host "2. 编辑 bridge\roles\角色模板.md 为你的角色"
Write-Host "3. 重启后杀一次 MCP 进程刷新工具列表"
Write-Host "4. DSH 设置里把模式切到 reserved2"
