#!/system/bin/sh
# 自动清理 qq-bridge 会话上下文（保留记忆）
# 分策略守护：群聊严格（单独守护，直接介入），私聊宽松（可深聊）
# 由常驻脚本 + 循环实现


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
# BRIDGE_DIR 已由上方可移植探测自动推导
LOG="$BRIDGE_DIR/state/auto-clean.log"
INTERVAL=7200       # 兜底：最长 2 小时全清一次
CHECK=1800          # 每 30 分钟检查一次
# 群聊守护（严格，直接介入）：群聊人多人杂、上下文没私聊重要，攒一点就清
GROUP_TOKEN_LIMIT=120000   # 群聊上下文超 12 万 token 才清（放宽，少打扰）
GROUP_TURN_LIMIT=80        # 群聊累积 80 回合才清
GROUP_MIN_GAP=900          # 群聊最小间隔 15 分钟
# 私聊（宽松，可深聊）：和爸爸的对话连续性重要，多攒一些
PRIV_TOKEN_LIMIT=300000    # 私聊上下文 30 万 token 才清
PRIV_TURN_LIMIT=300        # 私聊 300 回合才清
PRIV_MIN_GAP=3600          # 私聊最小间隔 1 小时
OVER_FORCE=250000          # 超过 25 万时无视未读保护（离 400 边界仍有 3 倍安全距离）
UNREAD_MAX_HOLD=21600      # 未读保护最长持续 6 小时：半夜堆一堆未读也不能让上下文无限涨

cd "$BRIDGE_DIR" || exit 1

LAST_FILE="$BRIDGE_DIR/state/.last-clean"

while true; do
  NOW=$(date +%s)
  LAST_TS=$(cat "$LAST_FILE" 2>/dev/null || echo 0)
  case "$LAST_TS" in
    ''|*[!0-9]*) LAST_TS=0 ;;
  esac
  ELAPSED=$((NOW - LAST_TS))

  # 未到兜底间隔时，每 30 分钟分类型检查：群聊严格、私聊宽松
  CLEAN_MODE="none"
  if [ "$ELAPSED" -lt "$INTERVAL" ]; then
    eval "$(node "$BRIDGE_DIR/state/stats-by-type.cjs" "$BRIDGE_DIR/state/token-usage.jsonl" "$LAST_FILE" 2>/dev/null)"
    case "$GROUP_TOK" in ''|*[!0-9]*) GROUP_TOK=0 ;; esac
    case "$GROUP_TURNS" in ''|*[!0-9]*) GROUP_TURNS=0 ;; esac
    case "$PRIV_TOK" in ''|*[!0-9]*) PRIV_TOK=0 ;; esac
    case "$PRIV_TURNS" in ''|*[!0-9]*) PRIV_TURNS=0 ;; esac

    # 群聊守护优先判断（直接介入，阈值低）
    if [ "$GROUP_TOK" -ge "$GROUP_TOKEN_LIMIT" ] || [ "$GROUP_TURNS" -ge "$GROUP_TURN_LIMIT" ]; then
      CLEAN_MODE="groups"
    elif [ "$PRIV_TOK" -ge "$PRIV_TOKEN_LIMIT" ] || [ "$PRIV_TURNS" -ge "$PRIV_TURN_LIMIT" ]; then
      CLEAN_MODE="private"
    fi

    if [ "$CLEAN_MODE" = "none" ]; then
      echo "=== $(date '+%Y-%m-%d %H:%M:%S') 群 $((GROUP_TOK/1000))k/$GROUP_TURNS 轮 | 私聊 $((PRIV_TOK/1000))k/$PRIV_TURNS 轮，都未超限，30 分钟后再查 ===" >> "$LOG"
      sleep $CHECK
      continue
    fi

    # 最小间隔只对群聊生效（15 分钟）；私聊只算回合数，不算时间
    if [ "$CLEAN_MODE" = "groups" ] && [ "$ELAPSED" -lt "$GROUP_MIN_GAP" ]; then
      echo "=== $(date '+%Y-%m-%d %H:%M:%S') groups 超标，但距上次清理仅 $((ELAPSED/60)) 分钟（<15min），再等 ===" >> "$LOG"
      sleep $CHECK
      continue
    fi

    # 未读保护：有未处理消息就不清（超过 300k 除外——会 400）
    UNREAD=$(node "$BRIDGE_DIR/state/unread-count.cjs" "$BRIDGE_DIR/state/social-v2.json" 2>/dev/null)
    case "$UNREAD" in ''|*[!0-9]*) UNREAD=0 ;; esac
    PEAK_TOK=$PRIV_TOK
    [ "$GROUP_TOK" -gt "$PEAK_TOK" ] && PEAK_TOK=$GROUP_TOK
    if [ "$UNREAD" -gt 0 ] && [ "$PEAK_TOK" -lt "$OVER_FORCE" ] && [ "$ELAPSED" -lt "$UNREAD_MAX_HOLD" ]; then
      echo "=== $(date '+%Y-%m-%d %H:%M:%S') $CLEAN_MODE 超标，但有 $UNREAD 条未读，推迟（已等 $((ELAPSED/60)) 分钟，上限 $((UNREAD_MAX_HOLD/3600)) 小时） ===" >> "$LOG"
      sleep $CHECK
      continue
    fi
    if [ "$UNREAD" -gt 0 ] && [ "$PEAK_TOK" -lt "$OVER_FORCE" ] && [ "$ELAPSED" -ge "$UNREAD_MAX_HOLD" ]; then
      echo "=== $(date '+%Y-%m-%d %H:%M:%S') ⚠️ 未读 $UNREAD 条持续超 $((UNREAD_MAX_HOLD/3600)) 小时，保护到期，强制清理 ===" >> "$LOG"
    fi
    if [ "$UNREAD" -gt 0 ] && [ "$PEAK_TOK" -ge "$OVER_FORCE" ]; then
      echo "=== $(date '+%Y-%m-%d %H:%M:%S') ⚠️ 上下文 $((PEAK_TOK/1000))k 逼近模型窗口（400 风险），无视 $UNREAD 条未读强制清 ===" >> "$LOG"
    fi
    echo "=== $(date '+%Y-%m-%d %H:%M:%S') $CLEAN_MODE 触发清理（群 $((GROUP_TOK/1000))k/$GROUP_TURNS 轮，私聊 $((PRIV_TOK/1000))k/$PRIV_TURNS 轮）===" >> "$LOG"
  fi

  # 清理前「记忆收尾」：每次清理前都让 AI 把重要记忆写入记忆库
  CT_EARLY=$(cat "$BRIDGE_DIR/state/console-token" 2>/dev/null)
  # 收尾范围 = 本次要清理的会话：私聊和群聊的重要记忆都要写进记忆库
  if [ -n "$CT_EARLY" ]; then
    if [ "$CLEAN_MODE" = "groups" ]; then
      WRAP_KEYS="group:<群号1> group:<群号3> group:<群号2> group:<群号4>"
    elif [ "$CLEAN_MODE" = "private" ]; then
      WRAP_KEYS="private:<主人QQ号>"
    else
      WRAP_KEYS="private:<主人QQ号> group:<群号1> group:<群号3> group:<群号2> group:<群号4>"
    fi
    WRAPUP_OUT=$(node "$BRIDGE_DIR/state/wrapup.cjs" "$CT_EARLY" $WRAP_KEYS 2>&1)
    echo "$WRAPUP_OUT" >> "$LOG"
    # 收尾没写完（回合还在跑）→ 延后一轮，不硬清
    case "$WRAPUP_OUT" in
      *未完成*)
        echo "  ⏳ 收尾未完成（她还在写记忆），本轮延后，30 分钟后再试" >> "$LOG"
        sleep $CHECK
        continue
        ;;
    esac
    case "$WRAPUP_OUT" in
      *无需收尾*|*不存在*)
        echo "  私聊无活动会话，跳过收尾等待" >> "$LOG"
        ;;
      *)
        echo "  ⏳ 收尾完成（回合已结束），3 秒后开始清理" >> "$LOG"
        sleep 3
        ;;
    esac
  fi

  echo "=== $(date '+%Y-%m-%d %H:%M:%S') 开始清理（模式=$CLEAN_MODE） ===" >> "$LOG"

  # 0. 备份记忆文件（每次清理前先备份，保留最近 10 份）
  BACKUP_DIR="$BRIDGE_DIR/state/backup"
  mkdir -p "$BACKUP_DIR"
  STAMP=$(date +%Y%m%d-%H%M%S)
  if [ -f "$BRIDGE_DIR/state/role-memory.json" ]; then
    cp "$BRIDGE_DIR/state/role-memory.json" "$BACKUP_DIR/role-memory-$STAMP.json" 2>/dev/null && echo "  💾 已备份 role-memory.json" >> "$LOG"
  fi
  if [ -f "$BRIDGE_DIR/state/social-v2.json" ]; then
    cp "$BRIDGE_DIR/state/social-v2.json" "$BACKUP_DIR/social-v2-$STAMP.json" 2>/dev/null && echo "  💾 已备份 social-v2.json" >> "$LOG"
  fi
  ls -t "$BACKUP_DIR"/role-memory-*.json 2>/dev/null | tail -n +11 | xargs -r rm -f
  ls -t "$BACKUP_DIR"/social-v2-*.json 2>/dev/null | tail -n +6 | xargs -r rm -f

  # 1. 同步记忆（从 social-v2.json 并入共享记忆库 memory.shared）
  node -e "
const fs=require('fs');
const MB='$BRIDGE_DIR/state/';
const s=JSON.parse(fs.readFileSync(MB+'social-v2.json','utf8'));
const mem=JSON.parse(fs.readFileSync(MB+'role-memory.json','utf8'));
mem.memory=mem.memory||{};
const shared=mem.memory.shared||(mem.memory.shared={activeTopics:[],pendingThoughts:[],memberImpressions:{}});
shared.activeTopics=shared.activeTopics||[]; shared.pendingThoughts=shared.pendingThoughts||[]; shared.memberImpressions=shared.memberImpressions||{};
let n=0;
for(const [key,conv] of Object.entries(s.conversations||{})){
  if(!conv||typeof conv!=='object') continue;
  for(const t of (conv.activeTopics||[])){
    if(!t||!t.text) continue;
    const hit=shared.activeTopics.find(x=>x&&x.text===t.text);
    if(!hit){ shared.activeTopics.push(t); n++; }
    else { hit.lastMentionAt=Math.max(hit.lastMentionAt||0,t.lastMentionAt||0); }
  }
  for(const t of (conv.pendingThoughts||[])){
    if(!t||!t.text) continue;
    if(!shared.pendingThoughts.some(x=>x&&x.text===t.text)){ shared.pendingThoughts.push(t); n++; }
  }
  for(const [name,im] of Object.entries(conv.memberImpressions||{})){
    if(!name||!im||typeof im!=='object') continue;
    const prev=shared.memberImpressions[name];
    if(!prev){ shared.memberImpressions[name]=im; n++; }
    else {
      const traits=[...new Set([...(prev.traits||[]),...(im.traits||[])])];
      shared.memberImpressions[name]={traits,interactionCount:Math.max(prev.interactionCount||0,im.interactionCount||0),lastSeenAt:Math.max(prev.lastSeenAt||0,im.lastSeenAt||0)};
    }
  }
}
for(const k of Object.keys(mem.memory)) if(k!=='shared') delete mem.memory[k];
shared.activeTopics=shared.activeTopics.slice(-100);
shared.pendingThoughts=shared.pendingThoughts.slice(-100);
mem.updatedAt=Date.now();
fs.writeFileSync(MB+'role-memory.json',JSON.stringify(mem,null,2)+'\n');
console.log('共享记忆库同步完成（新增 '+n+' 条）');
" >> "$LOG" 2>&1

  # 2. 按模式重置会话（连续 3 次失败后下一轮带 force）
  CT=$(cat "$BRIDGE_DIR/state/console-token" 2>/dev/null)
  if [ -z "$CT" ]; then
    echo "❌ 控制台令牌不存在，跳过重置" >> "$LOG"
  else
    PREV_FAILS=$(cat "$BRIDGE_DIR/state/.reset-fails" 2>/dev/null || echo 0)
    case "$PREV_FAILS" in ''|*[!0-9]*) PREV_FAILS=0 ;; esac
    FORCE_FLAG="false"
    [ "$PREV_FAILS" -ge 3 ] && FORCE_FLAG="true"
    CUR_FAILS=0
    if [ "$CLEAN_MODE" = "groups" ]; then
      RESET_KEYS="group:<群号1> group:<群号3> group:<群号2> group:<群号4>"
    elif [ "$CLEAN_MODE" = "private" ]; then
      RESET_KEYS="private:<主人QQ号>"
    else
      RESET_KEYS="private:<主人QQ号> group:<群号1> group:<群号3> group:<群号2> group:<群号4>"
    fi
    for key in $RESET_KEYS; do
      RES=$(node -e "
fetch('http://127.0.0.1:3100/api/session/reset?token=$CT',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({key:'$key',force:$FORCE_FLAG}),signal:AbortSignal.timeout(30000)
}).then(r=>r.json()).then(j=>console.log(j.ok?'ok':'fail')).catch(e=>console.log('err:'+e.message));
" 2>&1)
      echo "  $key -> $RES" >> "$LOG"
      case "$RES" in *fail*) CUR_FAILS=$((CUR_FAILS+1)) ;; esac
    done
    echo "$CUR_FAILS" > "$BRIDGE_DIR/state/.reset-fails" 2>/dev/null
  fi

  # 3. 清理日志（超过 500 行时截断）
  if [ -f "$LOG" ] && [ $(wc -l < "$LOG") -gt 500 ]; then
    tail -300 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi

  # 每天最多打一份元神包
  "$BRIDGE_DIR/pack-soul.sh" --daily >> "$LOG" 2>&1

  # 孤儿会话文件清理
  node "$BRIDGE_DIR/state/orphan-clean.cjs" >> "$LOG" 2>&1

  # 黑话学习会话重置
  CT_DONE=$(cat "$BRIDGE_DIR/state/console-token" 2>/dev/null)
  if [ -n "$CT_DONE" ]; then
    node -e "
fetch('http://127.0.0.1:3100/api/socialV2/slang-reset?token='+process.argv[1],{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(15000)})
 .then(r=>r.json()).then(j=>console.log('  黑话学习会话重置: '+(j.ok?'ok':j.error))).catch(e=>console.log('  黑话学习会话重置失败: '+e.message));
" "$CT_DONE" >> "$LOG" 2>&1
  fi

  echo "=== $(date '+%Y-%m-%d %H:%M:%S') 清理完成（模式=$CLEAN_MODE） ===" >> "$LOG"
  date +%s > "$LAST_FILE" 2>/dev/null
  sleep 60
done
