// 清理前「记忆收尾」：让指定会话在上下文被重置前，把重要的事写进长期记忆
// 用法：node wrapup.cjs <console-token> [key...]（不传 key 默认私聊）
const token = process.argv[2] || '';
const keys = process.argv.slice(3).filter(Boolean);
if (!keys.length) keys.push('private:<主人QQ号>');

(async () => {
  let okCount = 0;
  for (const key of keys) {
    try {
      const res = await fetch(`http://127.0.0.1:3100/api/socialV2/wrapup?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
        signal: AbortSignal.timeout(20000)
      });
      const j = await res.json().catch(() => ({}));
      if (j.ok) {
        okCount++;
        if (j.completed === false) console.log(`  ${key} 收尾未完成（回合仍在跑）`);
        else if (j.skipped) console.log(`  ${key} 无需收尾`);
        else console.log(`  ${key} 收尾提示已投递`);
      }
      else console.log(`  ${key} 收尾失败: ${j.error || res.status}`);
    } catch (e) {
      console.log(`  ${key} 收尾异常: ${e.message}`);
    }
  }
  console.log(`收尾完成：${okCount}/${keys.length}`);
})();
