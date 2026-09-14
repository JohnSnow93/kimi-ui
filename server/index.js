import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const DEFAULT_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '1800000', 10); // 默认 30 分钟
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL_NAME = 'moonshotai/kimi-k3';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 辅助函数：安全脱敏 API Key 用于日志
function maskApiKey(key) {
  if (!key) return '(未配置)';
  if (key.length <= 10) return '***';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

// 1. 健康检查与配置状态接口
app.get('/api/health', (req, res) => {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  res.json({
    status: 'ok',
    model: MODEL_NAME,
    hasApiKey: Boolean(apiKey && apiKey.startsWith('nvapi-')),
    maskedApiKey: maskApiKey(apiKey),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
});

// 2. Kimi K3 专用流式聊天接口
app.post('/api/chat', async (req, res) => {
  const startTime = Date.now();
  const apiKey = process.env.NVIDIA_API_KEY?.trim();

  // 校验 API Key
  if (!apiKey) {
    console.error(`[ERROR] [${new Date().toLocaleTimeString()}] NVIDIA_API_KEY 未在后端 .env 中配置`);
    return res.status(401).json({
      error: {
        status: 401,
        type: 'MissingApiKey',
        message: 'NVIDIA API Key 未配置。请在项目根目录 .env 中配置 NVIDIA_API_KEY=nvapi-xxxx 并重启后端。',
      },
    });
  }

  const {
    messages = [],
    systemPrompt = '',
    reasoning_effort = 'high',
    max_tokens = 16384,
    temperature = 1.0,
  } = req.body;

  // 校验与规范 reasoning_effort (仅支持 low, high, max)
  const validEfforts = ['low', 'high', 'max'];
  const safeEffort = validEfforts.includes(reasoning_effort) ? reasoning_effort : 'high';

  // 构建符合 Kimi K3 规范的完整 messages 数组
  const formattedMessages = [];

  // 1. 若配置了 System Prompt，确保作为第一条 system message
  if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
    formattedMessages.push({
      role: 'system',
      content: systemPrompt.trim(),
    });
  }

  // 2. 遍历并保留历史对话（跳过历史中多余的 system 消息，使用最新的 System Prompt）
  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'assistant') {
      const assistantMsg = {
        role: 'assistant',
        content: msg.content || '',
      };
      // 官方 K3 规范：若上一轮保留了 reasoning_content，必须完整回传，以维持思考上下文连贯
      if (msg.reasoning_content && typeof msg.reasoning_content === 'string') {
        assistantMsg.reasoning_content = msg.reasoning_content;
      }
      formattedMessages.push(assistantMsg);
    } else if (msg.role === 'user') {
      formattedMessages.push({
        role: 'user',
        content: msg.content || '',
      });
    }
  }

  // 请求体构建
  const requestPayload = {
    model: MODEL_NAME,
    messages: formattedMessages,
    max_tokens: Number(max_tokens) || 16384,
    temperature: typeof temperature === 'number' ? temperature : 1.0,
    stream: true,
    reasoning_effort: safeEffort,
  };

  console.log(`\n================== [REQUEST START] ==================`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Model: ${MODEL_NAME}`);
  console.log(`Reasoning Effort: ${safeEffort}`);
  console.log(`Max Tokens: ${requestPayload.max_tokens}, Temperature: ${requestPayload.temperature}`);
  console.log(`Total Messages: ${formattedMessages.length}`);
  console.log(`API Key: ${maskApiKey(apiKey)}`);
  console.log(`Timeout: ${DEFAULT_TIMEOUT_MS}ms (${DEFAULT_TIMEOUT_MS / 60000} minutes)`);
  console.log(`=====================================================\n`);

  // 创建 AbortController 用于长时间超时和客户端断开同步
  const abortController = new AbortController();
  let isClientDisconnected = false;

  const timeoutId = setTimeout(() => {
    console.warn(`[TIMEOUT] 请求超过预设超时时间 (${DEFAULT_TIMEOUT_MS}ms)，正在终止上游连接...`);
    abortController.abort(new Error(`Request timed out after ${DEFAULT_TIMEOUT_MS}ms`));
  }, DEFAULT_TIMEOUT_MS);

  // 监听客户端连接断开（例如用户点击 Stop 或关闭网页）
  req.on('close', () => {
    if (!res.writableEnded) {
      isClientDisconnected = true;
      console.log(`[CLIENT ABORT] 客户端主动断开连接，同步终止 NVIDIA 上游请求`);
      abortController.abort();
    }
  });

  let heartbeatInterval = null;

  try {
    const upstreamResponse = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(requestPayload),
      signal: abortController.signal,
    });

    // 如果上游返回非 200 响应
    if (!upstreamResponse.ok) {
      clearTimeout(timeoutId);
      const errorText = await upstreamResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { message: errorText };
      }

      console.error(`[NVIDIA ERROR] HTTP ${upstreamResponse.status} ${upstreamResponse.statusText}`);
      console.error('Details:', errorData);

      let friendlyTip = '';
      if (upstreamResponse.status === 401 || upstreamResponse.status === 403) {
        friendlyTip = 'NVIDIA API Key 鉴权失败，请检查 .env 中的 NVIDIA_API_KEY 是否正确且未过期。';
      } else if (upstreamResponse.status === 404) {
        friendlyTip = `模型 ${MODEL_NAME} 不存在或当前端点不可用。`;
      } else if (upstreamResponse.status === 422) {
        friendlyTip = '请求参数校验失败，请检查 reasoning_effort、max_tokens 等参数范围。';
      }

      return res.status(upstreamResponse.status).json({
        error: {
          status: upstreamResponse.status,
          statusText: upstreamResponse.statusText,
          message: errorData.message || errorData.detail || errorText || '上游接口请求失败',
          friendlyTip,
          details: errorData,
        },
      });
    }

    // 设置 SSE 响应头并立即刷新
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    // 开启心跳保活定时器：Kimi K3 进行长时间 reasoning 时，若长时间无 token 产出，
    // 定期发送 SSE 注释行防止代理或浏览器由于静默超时断开连接
    heartbeatInterval = setInterval(() => {
      if (!res.writableEnded && !isClientDisconnected) {
        res.write(': keep-alive\n\n');
      }
    }, 15000);

    // 读取流式响应
    const decoder = new TextDecoder('utf-8');
    let lineBuffer = '';
    let reasoningTokenCount = 0;
    let contentTokenCount = 0;

    for await (const chunk of upstreamResponse.body) {
      if (isClientDisconnected) break;

      const textChunk = decoder.decode(chunk, { stream: true });
      lineBuffer += textChunk;

      const lines = lineBuffer.split('\n');
      // 保留最后一个可能未完整的行
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 处理 SSE data 行
        if (trimmed.startsWith('data:')) {
          const rawData = trimmed.replace(/^data:\s*/, '');

          // 流结束标记
          if (rawData === '[DONE]') {
            res.write(`event: done\ndata: {}\n\n`);
            continue;
          }

          try {
            const parsed = JSON.parse(rawData);
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta || {};

            // 1. 提取 reasoning 内容
            const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
            if (reasoningDelta) {
              reasoningTokenCount += reasoningDelta.length;
              res.write(`event: reasoning\ndata: ${JSON.stringify({ delta: reasoningDelta })}\n\n`);
            }

            // 2. 提取正文内容
            const contentDelta = delta.content;
            if (contentDelta) {
              contentTokenCount += contentDelta.length;
              res.write(`event: content\ndata: ${JSON.stringify({ delta: contentDelta })}\n\n`);
            }
          } catch (jsonErr) {
            // 忽略非 JSON 数据行
          }
        }
      }
    }

    // 处理残余 buffer
    if (lineBuffer.trim().startsWith('data:')) {
      const rawData = lineBuffer.trim().replace(/^data:\s*/, '');
      if (rawData === '[DONE]') {
        res.write(`event: done\ndata: {}\n\n`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[REQUEST FINISHED] 耗时: ${duration}ms, reasoning 字符数: ${reasoningTokenCount}, answer 字符数: ${contentTokenCount}`);

    clearInterval(heartbeatInterval);
    clearTimeout(timeoutId);
    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    clearInterval(heartbeatInterval);
    clearTimeout(timeoutId);

    const isAbort = error.name === 'AbortError' || isClientDisconnected;
    const duration = Date.now() - startTime;

    if (isAbort) {
      console.log(`[REQUEST ABORTED] 请求在 ${duration}ms 后终止`);
      if (!res.writableEnded) {
        res.write(`event: abort\ndata: ${JSON.stringify({ message: '请求已中断' })}\n\n`);
        res.end();
      }
    } else {
      console.error(`[STREAM ERROR] 请求发生异常 (${duration}ms):`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            status: 500,
            type: 'StreamProcessingError',
            message: error.message || '后端与 NVIDIA API 通信发生未知错误',
          },
        });
      } else if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({
          status: 500,
          message: error.message || '网络流式传输发生异常中断',
        })}\n\n`);
        res.end();
      }
    }
  }
});

// 启动后端服务
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  Kimi K3 本地后端已启动`);
  console.log(`  服务地址: http://localhost:${PORT}`);
  console.log(`  目标模型: ${MODEL_NAME}`);
  console.log(`  默认超时: ${DEFAULT_TIMEOUT_MS}ms (${DEFAULT_TIMEOUT_MS / 60000} 分钟)`);
  console.log(`  API Key:  ${maskApiKey(process.env.NVIDIA_API_KEY)}`);
  console.log(`======================================================\n`);
});
