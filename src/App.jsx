import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { ErrorBanner } from './components/ErrorBanner';
import { ModelListModal } from './components/ModelListModal';
import {
  loadStoredMessages,
  saveStoredMessages,
  loadStoredSystemPrompt,
  saveStoredSystemPrompt,
  loadStoredSettings,
  saveStoredSettings,
  clearStoredMessages,
} from './utils/storage';
import { MessageSquare, Sparkles, ShieldAlert } from 'lucide-react';

export function App() {
  const [messages, setMessages] = useState(() => loadStoredMessages());
  const [systemPrompt, setSystemPrompt] = useState(() => loadStoredSystemPrompt());
  const [settings, setSettings] = useState(() => loadStoredSettings());
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState(null);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);

  const abortControllerRef = useRef(null);
  const chatBottomRef = useRef(null);
  const isAutoScrollEnabledRef = useRef(true);

  // 1. 启动检查后端状态
  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else {
        setHealth({ hasApiKey: false, status: 'error' });
      }
    } catch (e) {
      console.warn('后端尚未就绪或连接失败', e);
      setHealth(null);
    }
  };

  // 2. 状态持久化到 localStorage
  useEffect(() => {
    saveStoredMessages(messages);
  }, [messages]);

  useEffect(() => {
    saveStoredSystemPrompt(systemPrompt);
  }, [systemPrompt]);

  useEffect(() => {
    saveStoredSettings(settings);
  }, [settings]);

  // 3. 自动平滑滚动到底部
  const scrollToBottom = (behavior = 'smooth') => {
    if (isAutoScrollEnabledRef.current && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // 监听用户手动滚动行为
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - (scrollTop + clientHeight) < 80;
    isAutoScrollEnabledRef.current = isAtBottom;
  };

  // 4. 发送消息逻辑
  const executeGeneration = async (historyToSend) => {
    setError(null);
    setIsGenerating(true);
    isAutoScrollEnabledRef.current = true;

    const assistantMsgId = crypto.randomUUID();
    const newAssistantMsg = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning_content: '',
      timestamp: Date.now(),
    };

    // 将 assistant 占位消息加入列表
    setMessages([...historyToSend, newAssistantMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: historyToSend.map((m) => ({
            role: m.role,
            content: m.content,
            reasoning_content: m.reasoning_content,
          })),
          systemPrompt,
          reasoning_effort: settings.reasoning_effort,
          max_tokens: settings.max_tokens,
          temperature: settings.temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errData;
        try {
          errData = await response.json();
        } catch (e) {
          errData = { message: `HTTP ${response.status} ${response.statusText}` };
        }

        const parsedError = errData.error || errData;
        setError({
          status: response.status,
          statusText: response.statusText,
          message: parsedError.message || '请求 NVIDIA API 失败',
          friendlyTip: parsedError.friendlyTip,
          details: parsedError.details,
        });

        // 移除未完成的空白 assistant 消息
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
        setIsGenerating(false);
        return;
      }

      // 处理 SSE 流
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let currentEvent = 'message';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            currentEvent = 'message';
            continue;
          }

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.replace(/^event:\s*/, '');
            continue;
          }

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.replace(/^data:\s*/, '');

            if (currentEvent === 'done' || dataStr === '[DONE]') {
              break;
            }

            try {
              const data = JSON.parse(dataStr);

              if (currentEvent === 'reasoning') {
                const delta = data.delta || '';
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, reasoning_content: (msg.reasoning_content || '') + delta }
                      : msg
                  )
                );
              } else if (currentEvent === 'content') {
                const delta = data.delta || '';
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: (msg.content || '') + delta }
                      : msg
                  )
                );
              } else if (currentEvent === 'error') {
                setError({
                  status: data.status || 500,
                  statusText: data.statusText || '',
                  message: data.message || '流传输中断',
                  friendlyTip: data.friendlyTip,
                  details: data.details,
                });
                setMessages((prev) =>
                  prev.filter((m) => m.id !== assistantMsgId || m.content || m.reasoning_content)
                );
              } else if (currentEvent === 'abort') {
                console.log('生成已被客户端终止');
              }
            } catch (e) {
              // 忽略个别非 JSON 行
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('用户终止了生成');
      } else {
        console.error('Fetch error:', err);
        setError({
          status: 0,
          message: err.message || '网络连接失败，请确认后端服务正常运行',
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleSend = () => {
    if (!input.trim() || isGenerating) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    const nextHistory = [...messages, userMessage];
    setInput('');
    executeGeneration(nextHistory);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  };

  // 重新生成上一次回答
  const handleRegenerate = () => {
    if (isGenerating || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    let history = messages;

    if (lastMsg.role === 'assistant') {
      history = messages.slice(0, -1);
    }
    if (history.length === 0) return;

    executeGeneration(history);
  };

  // 编辑用户某条消息并重新发送
  const handleEditAndResend = (userMsgId, newContent) => {
    if (isGenerating) return;
    const targetIdx = messages.findIndex((m) => m.id === userMsgId);
    if (targetIdx === -1) return;

    const updatedUserMsg = {
      ...messages[targetIdx],
      content: newContent,
      timestamp: Date.now(),
    };

    // 截断该消息之后的所有后续历史，重新开始生成
    const truncatedHistory = [...messages.slice(0, targetIdx), updatedUserMsg];
    executeGeneration(truncatedHistory);
  };

  const handleNewChat = () => {
    if (isGenerating) handleStop();
    setMessages([]);
    clearStoredMessages();
    setError(null);
  };

  const handleClear = () => {
    if (window.confirm('确定要清空当前所有聊天记录吗？')) {
      handleNewChat();
    }
  };

  return (
    <div className="app-layout">
      {/* 顶部导航 */}
      <Header
        health={health}
        onNewChat={handleNewChat}
        onClear={handleClear}
        messageCount={messages.length}
        onOpenModels={() => setIsModelModalOpen(true)}
      />

      {/* 错误提示栏 */}
      {error && (
        <ErrorBanner
          error={error}
          onDismiss={() => setError(null)}
          onRetry={messages.length > 0 ? handleRegenerate : undefined}
        />
      )}

      {/* 聊天主界面 */}
      <main className="chat-viewport" onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Sparkles size={40} />
            </div>
            <h2>Kimi K3 本地工作台</h2>
            <p className="empty-subtitle">
              专为 <code>moonshotai/kimi-k3</code> 打造，支持深度推理、完整 Reasoning 流式展示与长等待保障
            </p>

            <div className="feature-grid">
              <div className="feature-card">
                <div className="feature-title">🧠 深度推理 Reasoning</div>
                <div className="feature-desc">支持 Low / High / Max 三档思考深度，完整呈现思考链</div>
              </div>
              <div className="feature-card">
                <div className="feature-title">⚡ 长时间思考防掉线</div>
                <div className="feature-desc">默认支持 30 分钟推理超时，配备心跳保活机制，避免中断</div>
              </div>
              <div className="feature-card">
                <div className="feature-title">📝 随时编辑 System Prompt</div>
                <div className="feature-desc">直接修改设定，下一次请求即时生效，绝不注入隐式指令</div>
              </div>
              <div className="feature-card">
                <div className="feature-title">🔒 密钥本地隔离</div>
                <div className="feature-desc">API Key 仅存放于本地 .env，前端绝不暴露密钥</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-messages-container">
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id || index}
                message={message}
                isLast={index === messages.length - 1}
                isGenerating={isGenerating}
                onRegenerate={handleRegenerate}
                onEditAndResend={handleEditAndResend}
              />
            ))}
            <div ref={chatBottomRef} style={{ height: 1 }} />
          </div>
        )}
      </main>

      {/* 底部控制与输入区域 */}
      <footer className="footer-controls">
        <ChatInput
          input={input}
          setInput={setInput}
          systemPrompt={systemPrompt}
          setSystemPrompt={setSystemPrompt}
          settings={settings}
          setSettings={setSettings}
          isGenerating={isGenerating}
          onSend={handleSend}
          onStop={handleStop}
        />
      </footer>

      {/* NVIDIA Build 模型列表查看弹窗 */}
      <ModelListModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
      />
    </div>
  );
}
export default App;
