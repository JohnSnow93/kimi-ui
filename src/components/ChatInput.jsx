import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Square,
  Sliders,
  ChevronDown,
  ChevronUp,
  FileText,
  RotateCcw,
} from 'lucide-react';

export function ChatInput({
  input,
  setInput,
  systemPrompt,
  setSystemPrompt,
  settings,
  setSettings,
  isGenerating,
  onSend,
  onStop,
  disabled,
}) {
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const textareaRef = useRef(null);

  // 自动调整输入框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 48), 240)}px`;
    }
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating && input.trim() && !disabled) {
        onSend();
      }
    }
  };

  const handleReasoningEffortChange = (effort) => {
    setSettings((prev) => ({ ...prev, reasoning_effort: effort }));
  };

  return (
    <div className="input-panel">
      {/* 1. 可折叠 System Prompt 编辑区 */}
      <div className="collapsible-section system-prompt-section">
        <button
          type="button"
          className="section-toggle"
          onClick={() => setIsSystemPromptOpen(!isSystemPromptOpen)}
        >
          <div className="toggle-left">
            <FileText size={15} />
            <span className="toggle-title">System Prompt (系统人设/指令)</span>
            {systemPrompt.trim() ? (
              <span className="badge badge-active">已设定 ({systemPrompt.length}字)</span>
            ) : (
              <span className="badge">未设定</span>
            )}
          </div>
          <div className="toggle-right">
            {isSystemPromptOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </button>

        {isSystemPromptOpen && (
          <div className="section-content">
            <textarea
              className="system-prompt-textarea"
              placeholder="直接输入给 Kimi K3 的 System Prompt，例如：你是一名资深的技术架构师……（修改后立即对下一次请求生效）"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
            />
            <div className="section-footer">
              <span className="hint-text">
                注：每次请求将严格作为第一条 system 消息发送，不隐式注入任何额外前缀。
              </span>
              {systemPrompt && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-danger"
                  onClick={() => setSystemPrompt('')}
                >
                  清空 Prompt
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. 参数调节栏 (Reasoning Effort, Max Tokens, Temperature) */}
      <div className="control-bar">
        <div className="control-group reasoning-group">
          <span className="control-label">Reasoning:</span>
          <div className="pill-group">
            {['low', 'high', 'max'].map((effort) => {
              const label = effort.charAt(0).toUpperCase() + effort.slice(1);
              const isActive = settings.reasoning_effort === effort;
              return (
                <button
                  key={effort}
                  type="button"
                  className={`pill-btn ${isActive ? 'active' : ''}`}
                  onClick={() => handleReasoningEffortChange(effort)}
                  disabled={isGenerating}
                  title={`设置 reasoning_effort 为 ${effort}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="control-group">
          <button
            type="button"
            className={`btn-settings-toggle ${isSettingsOpen ? 'active' : ''}`}
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            title="更多推理与采样参数"
          >
            <Sliders size={14} />
            <span>参数: MaxTokens({settings.max_tokens}) / Temp({settings.temperature})</span>
            {isSettingsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* 展开的高级参数滑块 */}
      {isSettingsOpen && (
        <div className="advanced-settings-drawer">
          <div className="param-item">
            <div className="param-label-row">
              <label>Max Tokens</label>
              <input
                type="number"
                min="100"
                max="65536"
                step="256"
                className="number-input"
                value={settings.max_tokens}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    max_tokens: Math.min(65536, Math.max(1, parseInt(e.target.value, 10) || 16384)),
                  }))
                }
              />
            </div>
            <span className="param-tip">默认 16384 (上限 65536)</span>
          </div>

          <div className="param-item">
            <div className="param-label-row">
              <label>Temperature (温度)</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                className="number-input"
                value={settings.temperature}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    temperature: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)),
                  }))
                }
              />
            </div>
            <span className="param-tip">Kimi K3 推荐默认 1.0 (范围 0.0 ~ 1.0)</span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-xs text-muted"
            onClick={() =>
              setSettings({
                reasoning_effort: 'high',
                max_tokens: 16384,
                temperature: 1.0,
              })
            }
          >
            <RotateCcw size={12} />
            <span>恢复默认参数</span>
          </button>
        </div>
      )}

      {/* 3. 消息输入文本框与 发送/Stop 按钮 */}
      <div className="input-box-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder="输入消息…… (Enter 发送，Shift + Enter 换行)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
        />

        <div className="input-box-actions">
          {isGenerating ? (
            <button
              type="button"
              className="btn btn-danger btn-send"
              onClick={onStop}
              title="停止生成 (Stop)"
            >
              <Square size={16} fill="currentColor" />
              <span>停止</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-send"
              onClick={onSend}
              disabled={!input.trim() || disabled}
              title="发送消息 (Enter)"
            >
              <Send size={16} />
              <span>发送</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
