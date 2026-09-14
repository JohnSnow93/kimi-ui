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

  // 监听客户端连接断开（必须监听 res 上的 close，不能监听 req 的 close，因 req 读取完 body 后即会触发 close）
  res.on('close', () => {
    if (!res.writableEnded && !res.writableFinished) {
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

    // 处理 202 异步排队响应 (NVIDIA Cloud Functions 机制)
    if (upstreamResponse.status === 202) {
      const requestId = upstreamResponse.headers.get('nvcf-reqid');
      console.log(`[NVIDIA 202] 请求进入排队队列，requestId: ${requestId}，启动异步轮询...`);

      // 设置 SSE 响应头
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (res.flushHeaders) res.flushHeaders();

      res.write(`event: reasoning\ndata: ${JSON.stringify({ delta: '[NVIDIA 正在分配 GPU 算力排队中，请稍候...]\n' })}\n\n`);

      // 轮询 /v1/status/{requestId}
      let pollSuccess = false;
      const pollStart = Date.now();
      const pollMaxTime = DEFAULT_TIMEOUT_MS;

      while (!isClientDisconnected && Date.now() - pollStart < pollMaxTime) {
        await new Promise((r) => setTimeout(r, 2500));
        if (isClientDisconnected) break;

        try {
          const pollRes = await fetch(`https://integrate.api.nvidia.com/v1/status/${requestId}`, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Accept': 'application/json',
            },
            signal: abortController.signal,
          });

          if (pollRes.status === 200) {
            const resultJson = await pollRes.json();
            const choice = resultJson.choices?.[0];
            const msg = choice?.message || {};
            const reasoning = msg.reasoning_content;
            const content = msg.content;

            if (reasoning) {
              res.write(`event: reasoning\ndata: ${JSON.stringify({ delta: reasoning })}\n\n`);
            }
            if (content) {
              res.write(`event: content\ndata: ${JSON.stringify({ delta: content })}\n\n`);
            }
            res.write(`event: done\ndata: {}\n\n`);
            pollSuccess = true;
            break;
          } else if (pollRes.status === 202) {
            res.write(`: keep-alive\n\n`);
            continue;
          } else {
            const errBody = await pollRes.text();
            res.write(`event: error\ndata: ${JSON.stringify({
              status: pollRes.status,
              message: `轮询推理结果失败: ${errBody}`,
            })}\n\n`);
            pollSuccess = true;
            break;
          }
        } catch (pollErr) {
          if (pollErr.name === 'AbortError') break;
        }
      }

      clearTimeout(timeoutId);
      if (!res.writableEnded) res.end();
      return;
    }

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
      } else if (upstreamResponse.status === 429) {
        friendlyTip = '触发了 NVIDIA Build API 对 Kimi K3 的频次限制 (Rate Limit) 或并发配额上限。NVIDIA 免费测试服务限制了每分钟调用频率，请等待 1~2 分钟冷却后再试。';
      } else if (upstreamResponse.status === 503 || upstreamResponse.status === 504) {
        friendlyTip = 'NVIDIA 端 moonshotai/kimi-k3 推理服务当前算力满载 (ResourceExhausted / Gateway Timeout)。请稍候片刻再试。';
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

      const isSocketClosed =
        error.cause?.code === 'UND_ERR_SOCKET' ||
        error.cause?.message?.includes('other side closed') ||
        error.message?.includes('fetch failed');
      const isGatewayTimeout = isSocketClosed && duration >= 45000;

      let status = 500;
      let statusText = 'Internal Server Error';
      let message = error.message || '后端与 NVIDIA API 通信发生未知错误';
      let friendlyTip = '';

      if (isGatewayTimeout) {
        status = 504;
        statusText = 'Gateway Timeout';
        message = `NVIDIA API 网关在等待约 ${Math.round(duration / 1000)} 秒后关闭了连接 (Socket closed by upstream gateway: other side closed)`;
        friendlyTip =
          'NVIDIA Build 托管的 moonshotai/kimi-k3 为 2.8T MoE 超大模型，当前官方 GPU 集群排队严重或正在冷启动，未能在 60 秒网关超时前产出首个 Token。建议稍等 1~2 分钟重试，或在输入框上方将 Reasoning 深度切换为 Low 以减少推理时间。';
      } else if (isSocketClosed) {
        status = 502;
        statusText = 'Bad Gateway';
        message = `与 NVIDIA API 的网络通信连接意外中断 (${error.cause?.message || error.message})`;
        friendlyTip = '请检查本机是否能正常连接 integrate.api.nvidia.com，或网络代理/梯子是否保持连接存活。';
      }

      if (!res.headersSent) {
        res.status(status).json({
          error: {
            status,
            statusText,
            message,
            friendlyTip,
            details: error.cause ? { code: error.cause.code, message: error.cause.message } : undefined,
          },
        });
      } else if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({
          status,
          statusText,
          message,
          friendlyTip,
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
