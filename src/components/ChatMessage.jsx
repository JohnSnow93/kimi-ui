import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  User,
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  RotateCcw,
  Edit3,
  CheckCheck,
} from 'lucide-react';

export function ChatMessage({
  message,
  isLast,
  isGenerating,
  onRegenerate,
  onEditAndResend,
}) {
  const isUser = message.role === 'user';
  const hasReasoning = Boolean(message.reasoning_content && message.reasoning_content.trim());
  const isReasoningActive = isGenerating && isLast && hasReasoning && !message.content;

  // 默认展开思维链：若当前正在生成 reasoning 则展开，若已完成可根据习惯展开或折叠
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedThinking, setCopiedThinking] = useState(false);

  // 编辑模式状态（针对用户消息）
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || '');

  useEffect(() => {
    setEditContent(message.content || '');
  }, [message.content]);

  // 如果正在 reasoning，自动展开
  useEffect(() => {
    if (isReasoningActive) {
      setIsThinkingOpen(true);
    }
  }, [isReasoningActive]);

  const copyToClipboard = async (text, setCopied) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  const handleSaveEdit = () => {
    if (!editContent.trim()) return;
    setIsEditing(false);
    if (onEditAndResend) {
      onEditAndResend(message.id, editContent);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content || '');
  };

  return (
    <div className={`message-row ${isUser ? 'user-row' : 'assistant-row'}`}>
      <div className="message-avatar">
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>

      <div className="message-container">
        <div className="message-header">
          <span className="sender-name">{isUser ? 'User' : 'Kimi K3'}</span>
          {message.timestamp && (
            <span className="message-time">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {isUser ? (
          <div className="user-content-wrapper">
            {isEditing ? (
              <div className="edit-box">
                <textarea
                  className="edit-textarea"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={Math.max(3, editContent.split('\n').length)}
                  autoFocus
                />
                <div className="edit-actions">
                  <button className="btn btn-primary btn-xs" onClick={handleSaveEdit} disabled={isGenerating}>
                    保存并重新生成
                  </button>
                  <button className="btn btn-secondary btn-xs" onClick={handleCancelEdit}>
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="user-bubble">
                <div className="text-content">{message.content}</div>
                <div className="bubble-toolbar">
                  <button
                    className="toolbar-btn"
                    onClick={() => copyToClipboard(message.content, setCopiedAnswer)}
                    title="复制内容"
                  >
                    {copiedAnswer ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                  </button>
                  {!isGenerating && onEditAndResend && (
                    <button
                      className="toolbar-btn"
                      onClick={() => setIsEditing(true)}
                      title="编辑消息"
                    >
                      <Edit3 size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="assistant-content-wrapper">
            {/* 1. Reasoning / Thinking 区块 */}
            {(hasReasoning || isReasoningActive) && (
              <div className={`thinking-card ${isReasoningActive ? 'thinking-pulse' : ''}`}>
                <div
                  className="thinking-header"
                  onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                >
                  <div className="thinking-title">
                    <Brain size={16} className={`brain-icon ${isReasoningActive ? 'spinning' : ''}`} />
                    <span>{isReasoningActive ? 'Thinking…' : 'Thinking Process (思考过程)'}</span>
                    <span className="thinking-meta">
                      {message.reasoning_content ? `${message.reasoning_content.length} 字符` : '思考中'}
                    </span>
                  </div>
                  <div className="thinking-actions" onClick={(e) => e.stopPropagation()}>
                    {message.reasoning_content && (
                      <button
                        className="thinking-copy-btn"
                        onClick={() => copyToClipboard(message.reasoning_content, setCopiedThinking)}
                        title="复制 Thinking 思考内容"
                      >
                        {copiedThinking ? (
                          <>
                            <CheckCheck size={13} className="text-success" />
                            <span>已复制思考</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>复制思考</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      className="thinking-toggle-btn"
                      onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                      aria-label="展开或折叠思考"
                    >
                      {isThinkingOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  </div>
                </div>

                {isThinkingOpen && (
                  <div className="thinking-body">
                    <pre className="thinking-text">
                      {message.reasoning_content}
                      {isReasoningActive && <span className="cursor-blink">▍</span>}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* 2. Final Answer 区块 */}
            <div className="answer-card">
              <div className="answer-body markdown-body">
                {message.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                ) : isGenerating && isLast ? (
                  <div className="generating-indicator">
                    {hasReasoning ? '思考完成，正在组织最终回答…' : '正在等待模型响应…'}
                    <span className="cursor-blink">▍</span>
                  </div>
                ) : (
                  <span className="empty-response-hint">(无回答内容)</span>
                )}
                {isGenerating && isLast && message.content && (
                  <span className="cursor-blink">▍</span>
                )}
              </div>

              {/* 底部操作栏 */}
              <div className="answer-footer">
                <div className="footer-left">
                  {message.content && (
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => copyToClipboard(message.content, setCopiedAnswer)}
                      title="复制最终回答"
                    >
                      {copiedAnswer ? (
                        <>
                          <Check size={13} className="text-success" />
                          <span className="text-success">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>复制回答</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="footer-right">
                  {!isGenerating && isLast && onRegenerate && (
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={onRegenerate}
                      title="重新生成当前回答"
                    >
                      <RotateCcw size={13} />
                      <span>重新生成</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
