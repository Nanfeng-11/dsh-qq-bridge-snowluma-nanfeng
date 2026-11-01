// MiniMax 语音合成：文字 → 本地音频文件（供 QQ 语音条发送）。
//
// 设计要点：
//  - 与 bridge.js 解耦：不读全局 config，调用方把配置传进来（便于测试与复用）。
//  - 双端点回退：api.minimaxi.com 与 api.minimax.chat 都试，先成功者为准。
//  - 只落盘到调用方指定的语音库目录，文件名由调用方给（避免路径穿越）。
//  - 支持 emotion（语气）：happy / sad / angry / fearful / disgusted / surprised / neutral，
//    speech-02-hd 实测支持，会明显改变语气与节奏（sad 更慢、happy 更轻快）。
//  - 支持 pitch（音调 -12~12 半音）与 speed（0.5~2）。
import fs from 'node:fs';
import path from 'node:path';

const MINIMAX_ENDPOINTS = [
  'https://api.minimaxi.com/v1/t2a_v2',
  'https://api.minimax.chat/v1/t2a_v2'
];

export const EMOTIONS = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'neutral'];

/**
 * 合成语音到文件。
 * @param {string} text 要读的文字
 * @param {object} opts { apiKey, model, voiceId, speed, volume, pitch, emotion, format, sampleRate, maxChars, outDir, fileName }
 * @returns {Promise<{file:string, bytes:number, durationMs:number|null, chars:number, emotion:string}>}
 */
export async function synthesizeToFile(text, opts = {}) {
  const content = String(text ?? '').trim();
  if (!content) throw new Error('text 不能为空');
  const maxChars = Number(opts.maxChars) > 0 ? Number(opts.maxChars) : 300;
  if (content.length > maxChars) {
    throw new Error(`语音文本过长（${content.length} 字，上限 ${maxChars} 字）`);
  }
  const apiKey = String(opts.apiKey ?? '').trim();
  if (!apiKey) throw new Error('未配置 TTS apiKey（config.json → socialV2.voice.tts.apiKey）');
  const format = String(opts.format || 'mp3').toLowerCase();
  const emotion = String(opts.emotion || '').trim().toLowerCase();
  const useEmotion = EMOTIONS.includes(emotion) ? emotion : '';

  // 真人感的两个小手段：
  //  1) 省略号规范化："..." 会被读成停顿，"……" 停顿更自然
  //  2) 语速/音调做微小随机抖动：每句一模一样就是机械感的来源
  const normalized = content.replace(/\.{3,}/g, '……').replace(/。。。/g, '……');
  const jitter = (base, amp, min, max) => {
    const v = base + (Number(amp) > 0 ? (Math.random() * 2 - 1) * Number(amp) : 0);
    return Math.max(min, Math.min(max, v));
  };
  const speedBase = Number(opts.speed) > 0 ? Number(opts.speed) : 1;
  const speed = Number(jitter(speedBase, opts.speedJitter, 0.5, 2).toFixed(3));
  const pitchBase = Number.isFinite(Number(opts.pitch)) ? Number(opts.pitch) : 0;
  // pitch 必须是整数（int64），抖动后四舍五入
  const pitch = Math.round(jitter(pitchBase, opts.pitchJitter, -12, 12));

  const payload = {
    model: String(opts.model || 'speech-02-hd'),
    text: normalized,
    stream: false,
    voice_setting: {
      voice_id: String(opts.voiceId || 'female-shaonv'),
      speed: Number(opts.speed) > 0 ? Number(opts.speed) : 1,
      vol: Number(opts.volume) > 0 ? Number(opts.volume) : 1,
      pitch,
      ...(useEmotion ? { emotion: useEmotion } : {})
    },
    audio_setting: {
      sample_rate: Number(opts.sampleRate) > 0 ? Number(opts.sampleRate) : 32000,
      bitrate: 128000,
      format,
      channel: 1
    }
  };

  let lastError = null;
  for (const url of MINIMAX_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });
      const json = await res.json().catch(() => ({}));
      const hex = json?.data?.audio;
      if (!res.ok || !hex) {
        const brief = JSON.stringify(json?.base_resp ?? json ?? {}).slice(0, 200);
        lastError = new Error(`TTS 接口 ${res.status}：${brief}`);
        continue;
      }
      const buf = Buffer.from(String(hex), 'hex');
      if (!buf.length) { lastError = new Error('TTS 返回空音频'); continue; }
      const dir = opts.outDir || '.';
      fs.mkdirSync(dir, { recursive: true });
      const fileName = String(opts.fileName || `tts-${Date.now()}.${format}`).replace(/[\\/]/g, '_');
      const file = path.join(dir, fileName);
      fs.writeFileSync(file, buf);
      return {
        file,
        bytes: buf.length,
        durationMs: Number(json?.extra_info?.audio_length) || null,
        chars: content.length,
        emotion: useEmotion || 'neutral'
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('TTS 失败');
}
