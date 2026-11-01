// dsh-qq-bridge 插件入口（Cordis 插件）
// 职责：注册 qq-mode 设置命名空间（供桥接把模式写穿进 DSH 设置）。
// 桥接本体是独立 Node 服务（bridge/ 目录），由部署脚本拉起；
// MCP 服务与 agent presets 通过 cordis.patch.yml / presets/*.patch.yml 注册。
import { Context, Schema } from 'cordis';

export const name = 'qq-mode-console';
export const QQMODE_NAMESPACE = 'qq-mode';

export const inject = {};

export function apply(ctx) {
  const schema = Schema.object({
    mode: Schema.union('chat', 'closed-agent', 'reserved', 'reserved2').default('chat')
      .description('QQ 桥接模式：chat=普通助手 / closed-agent=封闭代理 / reserved=保守 / reserved2=二代仿真（记忆·情绪·唤醒）'),
  });
  ctx.setting('qq-mode', schema, {});
}

export const Config = Schema.intersect([
  Schema.object({ mode: Schema.string().default('chat') }),
]);
