import React from 'react';
import { MessageSquarePlus, Trash2, Cpu, CheckCircle2, AlertCircle, Layers } from 'lucide-react';

export function Header({ health, onNewChat, onClear, messageCount, onOpenModels }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo-badge">
          <Cpu className="logo-icon" size={20} />
          <span className="logo-title">Kimi K3</span>
        </div>
        <div className="model-tag">
          <span className="model-name">moonshotai/kimi-k3</span>
          <span className="provider-tag">NVIDIA Build</span>
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
          title="查看 NVIDIA Build 全部可用模型列表"
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
          title="开启新会话 (保留系统设定与参数)"
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
