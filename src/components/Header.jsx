import React from 'react';
import {
  MessageSquarePlus,
  Trash2,
  Cpu,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Layers,
} from 'lucide-react';

export function Header({
  health,
  currentModel = 'moonshotai/kimi-k3',
  onSelectModel,
  isGenerating = false,
  onNewChat,
  onClear,
  messageCount,
  onOpenModels,
}) {
  const isK3 = currentModel === 'moonshotai/kimi-k3';
  const isK26 = currentModel === 'moonshotai/kimi-k2.6';
  const isCustomModel = !isK3 && !isK26;

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo-badge">
          <Cpu className="logo-icon" size={20} />
          <span className="logo-title">Kimi</span>
        </div>

        {/* 双模型快捷切换分段控制器 */}
        <div className="model-segmented-control" role="group" aria-label="模型切换">
          <button
            type="button"
            className={`model-segment-btn ${isK3 ? 'active' : ''}`}
            onClick={() => onSelectModel && onSelectModel('moonshotai/kimi-k3')}
            disabled={isGenerating}
            title="Kimi K3 (2.8T MoE 深度思考模型，支持长思考链推理)"
          >
            <Sparkles size={13} className="segment-icon" />
            <span className="segment-title">Kimi K3</span>
            <span className="segment-badge thinking">Thinking</span>
          </button>

          <button
            type="button"
            className={`model-segment-btn ${isK26 ? 'active' : ''}`}
            onClick={() => onSelectModel && onSelectModel('moonshotai/kimi-k2.6')}
            disabled={isGenerating}
            title="Kimi 2.6 (1M 长上下文基座模型，标准聊天响应)"
          >
            <Zap size={13} className="segment-icon" />
            <span className="segment-title">Kimi 2.6</span>
            <span className="segment-badge chat">Chat</span>
          </button>
        </div>

        {/* 若用户从全部模型列表中选择了其它自定义模型 */}
        {isCustomModel && (
          <div className="custom-model-badge" title={`当前生效模型: ${currentModel}`}>
            <span className="custom-model-dot" />
            <span className="custom-model-name">{currentModel}</span>
          </div>
        )}

        <div className="provider-pill">
          <span>NVIDIA Build</span>
        </div>

        {health ? (
          <div className={`status-indicator ${health.hasApiKey ? 'status-ok' : 'status-warn'}`}>
            {health.hasApiKey ? (
              <>
                <span className="status-dot green" />
                <span className="status-text">已连接 ({health.maskedApiKey})</span>
              </>
            ) : (
              <>
                <AlertCircle size={14} className="warn-icon" />
                <span className="status-text">未配置 API Key (.env)</span>
              </>
            )}
          </div>
        ) : (
          <div className="status-indicator status-connecting">
            <span className="status-dot gray" />
            <span className="status-text">检测后端连接中...</span>
          </div>
        )}
      </div>

      <div className="header-right">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onOpenModels}
          title="查看与搜索 NVIDIA Build 全部可用模型列表"
        >
          <Layers size={15} className="text-cyan" />
          <span>模型列表</span>
        </button>
        {messageCount > 0 && (
          <span className="msg-counter">
            {messageCount} 条消息
          </span>
        )}
        <button
          className="btn btn-secondary btn-sm"
          onClick={onNewChat}
          title="开启新会话 (保留当前模型设定与系统 Prompt)"
        >
          <MessageSquarePlus size={16} />
          <span>新建对话</span>
        </button>
        <button
          className="btn btn-ghost btn-sm text-danger"
          onClick={onClear}
          disabled={messageCount === 0}
          title="清空当前所有消息记录"
        >
          <Trash2 size={16} />
          <span>清空</span>
        </button>
      </div>
    </header>
  );
}
