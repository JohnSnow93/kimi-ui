import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  RefreshCw,
  Copy,
  Check,
  Cpu,
  Layers,
  Sparkles,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';

export function ModelListModal({ isOpen, onClose }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedPublisher, setSelectedPublisher] = useState('ALL');
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchModels();
    }
  }, [isOpen]);

  const fetchModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/models');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const list = Array.isArray(data.data) ? data.data : [];
      // 按照 ID 字母排序，将 kimi-k3 置顶
      list.sort((a, b) => {
        if (a.id === 'moonshotai/kimi-k3') return -1;
        if (b.id === 'moonshotai/kimi-k3') return 1;
        return a.id.localeCompare(b.id);
      });
      setModels(list);
    } catch (err) {
      console.error('Fetch models failed:', err);
      setError(err.message || '获取模型列表失败，请检查网络或 API Key');
    } finally {
      setLoading(false);
    }
  };

  // 提取所有的组织 / publisher
  const publishers = useMemo(() => {
    const set = new Set();
    models.forEach((m) => {
      const pub = m.owned_by || m.id.split('/')[0] || 'other';
      set.add(pub);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [models]);

  // 过滤模型
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      const matchesSearch = !q || m.id.toLowerCase().includes(q) || (m.owned_by && m.owned_by.toLowerCase().includes(q));
      const matchesPublisher = selectedPublisher === 'ALL' || (m.owned_by === selectedPublisher) || m.id.startsWith(selectedPublisher + '/');
      return matchesSearch && matchesPublisher;
    });
  }, [models, search, selectedPublisher]);

  const handleCopy = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* 弹窗顶部 */}
        <div className="modal-header">
          <div className="modal-header-left">
            <Layers className="modal-icon text-cyan" size={20} />
            <h3 className="modal-title">NVIDIA Build 模型列表</h3>
            <span className="badge badge-count">
              {models.length > 0 ? `共 ${models.length} 个模型` : '加载中...'}
            </span>
          </div>
          <div className="modal-header-right">
            <button
              type="button"
              className="btn-icon"
              onClick={fetchModels}
              disabled={loading}
              title="刷新模型列表"
            >
              <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={onClose}
              title="关闭窗口"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 搜索与组织分类栏 */}
        <div className="modal-toolbar">
          <div className="modal-search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="搜索模型名称（如 kimi, deepseek, llama, gemma）..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="modal-search-input"
            />
            {search && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearch('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {publishers.length > 1 && (
            <div className="publisher-filter-pills">
              {publishers.map((pub) => {
                const isActive = selectedPublisher === pub;
                return (
                  <button
                    key={pub}
                    type="button"
                    className={`filter-pill ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedPublisher(pub)}
                  >
                    {pub === 'ALL' ? '全部组织' : pub}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 模型卡片列表区域 */}
        <div className="modal-body">
          {loading && models.length === 0 ? (
            <div className="modal-state-box">
              <RefreshCw size={24} className="spinning text-cyan" />
              <span>正在从 integrate.api.nvidia.com 获取模型列表...</span>
            </div>
          ) : error ? (
            <div className="modal-state-box text-danger">
              <AlertTriangle size={24} />
              <span>{error}</span>
              <button className="btn btn-secondary btn-sm" onClick={fetchModels}>
                重试
              </button>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="modal-state-box">
              <span className="text-dim">未找到匹配 "{search}" 的模型</span>
            </div>
          ) : (
            <div className="models-grid">
              {filteredModels.map((m) => {
                const isCurrentK3 = m.id === 'moonshotai/kimi-k3';
                const isCopied = copiedId === m.id;
                const publisher = m.owned_by || m.id.split('/')[0];
                const modelShortName = m.id.includes('/') ? m.id.split('/')[1] : m.id;

                return (
                  <div
                    key={m.id}
                    className={`model-card ${isCurrentK3 ? 'current-model-card' : ''}`}
                  >
                    <div className="model-card-header">
                      <div className="model-id-wrapper">
                        <span className="model-publisher-tag">{publisher}</span>
                        <span className="model-short-name" title={m.id}>
                          {modelShortName}
                        </span>
                      </div>
                      {isCurrentK3 && (
                        <span className="badge badge-active">当前工作台模型</span>
                      )}
                    </div>

                    <div className="model-card-full-id">
                      <code>{m.id}</code>
                    </div>

                    <div className="model-card-footer">
                      <span className="model-type-tag">{m.object || 'model'}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs copy-model-btn"
                        onClick={() => handleCopy(m.id)}
                        title="复制完整模型 ID"
                      >
                        {isCopied ? (
                          <>
                            <Check size={12} className="text-success" />
                            <span className="text-success">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>复制 ID</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 弹窗底部信息 */}
        <div className="modal-footer">
          <span className="modal-footer-tip">
            数据源: <code>https://integrate.api.nvidia.com/v1/models</code> (经由本地后端安全代理)
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
