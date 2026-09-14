import React from 'react';
import { AlertTriangle, X, ShieldAlert, Clock, RefreshCw } from 'lucide-react';

export function ErrorBanner({ error, onDismiss, onRetry }) {
  if (!error) return null;

  const isTimeout = error.status === 408 || error.type === 'Timeout' || error.message?.includes('timed out');
  const isAuth = error.status === 401 || error.status === 403 || error.type === 'MissingApiKey';

  return (
    <div className="error-banner">
      <div className="error-banner-icon">
        {isTimeout ? (
          <Clock size={20} />
        ) : isAuth ? (
          <ShieldAlert size={20} />
        ) : (
          <AlertTriangle size={20} />
        )}
      </div>

      <div className="error-banner-content">
        <div className="error-banner-title">
          {error.status ? `NVIDIA API Error (HTTP ${error.status} ${error.statusText || ''})` : '请求遇到问题'}
        </div>
        <div className="error-banner-message">{error.message || '未知错误'}</div>
        {error.friendlyTip && (
          <div className="error-banner-tip">💡 提示：{error.friendlyTip}</div>
        )}
        {error.details && typeof error.details === 'object' && Object.keys(error.details).length > 0 && (
          <details className="error-banner-details">
            <summary>查看详细原始响应</summary>
            <pre>{JSON.stringify(error.details, null, 2)}</pre>
          </details>
        )}
      </div>

      <div className="error-banner-actions">
        {onRetry && (
          <button className="btn btn-secondary btn-xs" onClick={onRetry} title="重试上一次发送">
            <RefreshCw size={13} />
            <span>重试</span>
          </button>
        )}
        {onDismiss && (
          <button className="btn-icon" onClick={onDismiss} title="关闭提示">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
