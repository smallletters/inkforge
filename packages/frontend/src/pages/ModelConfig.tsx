/**
 * 灵砚 InkForge - 模型配置页面
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-29
 * 
 * 功能描述：管理LLM提供商配置，支持添加、编辑、测试模型
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import StyledSelect from '../components/StyledSelect';
import { api } from '../lib/api';
import { useSubscription } from '../hooks/useSubscription';

const providerLogos: Record<string, string> = {
  openai: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#10b981"/><path d="M12 6C8.686 6 6 8.686 6 12s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="white"/></svg>`,
  anthropic: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#8b5cf6"/><path d="M12 7l2 4h-4l2-4zm-1 5v4l3 2" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  google: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#f59e0b"/><path d="M12 8v8M8 12h8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`,
  moonshot: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#60a5fa"/><path d="M12 6l1.5 3 3.5.5-2.5 2.5.5 3.5L12 14l-3 1.5.5-3.5L7 9.5l3.5-.5L12 6z" fill="white"/></svg>`,
  deepseek: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#a78bfa"/><circle cx="12" cy="12" r="4" fill="white"/></svg>`,
  zhipu: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#ef4444"/><path d="M8 12l4-4 4 4-4 4-4-4z" fill="white"/></svg>`,
  bailian: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#3b82f6"/><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" fill="white"/></svg>`,
  minimax: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#22d3ee"/><path d="M12 8l2 4-2 4-2-4 2-4z" fill="white"/><path d="M8 12h8" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  ollama: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path d="M12 6l-2 3h4l-2 3 2 6 2-3h-4l2-3-2-6z" fill="white"/></svg>`,
  custom: '',
};

const encodeSvg = (svg: string) => {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const providerTypes: Record<string, { label: string; color: string; defaultName: string; defaultUrl: string; defaultModels: string[] }> = {
  openai: { label: 'OpenAI', color: '#10b981', defaultName: 'OpenAI', defaultUrl: 'https://api.openai.com/v1', defaultModels: ['gpt-5.5', 'gpt-5.4', 'gpt-5.3', 'gpt-5.2', 'gpt-5.1-pro', 'gpt-5', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o1', 'o1-mini'] },
  anthropic: { label: 'Anthropic', color: '#8b5cf6', defaultName: 'Anthropic', defaultUrl: 'https://api.anthropic.com', defaultModels: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4', 'claude-sonnet-4', 'claude-haiku-4'] },
  google: { label: 'Google', color: '#f59e0b', defaultName: 'Google Gemini', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModels: ['gemini-3-1-pro', 'gemini-3-1-flash', 'gemini-3-1-flash-lite', 'gemini-3-pro', 'gemini-3-flash', 'gemini-2-5-pro', 'gemini-2-5-flash'] },
  moonshot: { label: 'Moonshot', color: '#60a5fa', defaultName: 'Moonshot AI', defaultUrl: 'https://api.moonshot.cn/v1', defaultModels: ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2-thinking', 'kimi-k2-thinking-turbo', 'kimi-k2', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'] },
  deepseek: { label: 'DeepSeek', color: '#a78bfa', defaultName: 'DeepSeek', defaultUrl: 'https://api.deepseek.com/v1', defaultModels: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v3.2', 'deepseek-chat', 'deepseek-reasoner', 'deepseek-coder'] },
  zhipu: { label: '智谱AI', color: '#ef4444', defaultName: '智谱AI', defaultUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModels: ['glm-5', 'glm-5-turbo', 'glm-4.6', 'glm-4-plus', 'glm-4-flash', 'glm-4'] },
  bailian: { label: '百度文心', color: '#3b82f6', defaultName: '百度文心', defaultUrl: 'https://qianfan.baidubce.com/v2', defaultModels: ['ernie-4.0-8k', 'ernie-4.0-4k', 'ernie-3.5-8k', 'ernie-3.5-4k'] },
  minimax: { label: 'MiniMax', color: '#22d3ee', defaultName: 'MiniMax', defaultUrl: 'https://api.minimax.chat/v1', defaultModels: ['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M2', 'abab6-chat', 'abab5.5-chat'] },
  ollama: { label: 'Ollama', color: '#22c55e', defaultName: 'Ollama', defaultUrl: 'http://localhost:11434/v1', defaultModels: ['llama4', 'llama3.3', 'llama3.2', 'llama3.1', 'mistral', 'mixtral', 'codellama', 'qwen2.5', 'phi4'] },
  custom: { label: '自定义', color: '#94a3b8', defaultName: '自定义服务商', defaultUrl: '', defaultModels: [] },
};

export default function ModelConfig() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<any>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [showCustomModelInput, setShowCustomModelInput] = useState(false);
  const [showDeleteButtons, setShowDeleteButtons] = useState(false);

  const { features } = useSubscription();

  const { data: providers, isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: api.providers.list,
  });

  const canAddProviders = features.multi_model_routing;

  const addProviderMutation = useMutation({
    mutationFn: (data: any) => api.providers.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      setShowAddModal(false);
    },
  });

  const updateProviderMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.providers.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      setEditingProvider(null);
    },
  });

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const deleteProviderMutation = useMutation({
    mutationFn: (id: string) => api.providers.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      setPendingDelete(null);
    },
    onError: () => {
      setPendingDelete(null);
    },
  });

  const handleEditProvider = async (providerId: string) => {
    try {
      const provider = await api.providers.get(providerId);
      setEditingProvider(provider);
      const config = providerTypes[provider.provider_type];
      const currentModel = provider.models?.[0] || '';
      setShowCustomModelInput(currentModel && !config.defaultModels.includes(currentModel));
      setShowAddModal(true);
    } catch (error) {
      alert(`获取服务商信息失败: ${(error as Error).message}`);
    }
  };

  const testProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    try {
      await api.providers.test(providerId);
      alert('连接测试成功！');
    } catch (error) {
      alert(`连接测试失败: ${(error as Error).message}`);
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveProvider = () => {
    if (!editingProvider) return;
    if (editingProvider.id) {
      updateProviderMutation.mutate({ id: editingProvider.id, data: editingProvider });
    } else {
      addProviderMutation.mutate(editingProvider);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <i className="fa-solid fa-spinner animate-spin text-2xl" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
      </div>
    );
  }

  return (
    <div className="min-h-screen noise-overlay">
      <div className="ambient-glow" aria-hidden="true"></div>
      
      <Header currentPage="models" />

      <main 
        className="relative z-[1]"
        style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          padding: '28px 24px'
        }}
        role="main"
      >
        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' }}>模型配置</h1>
            <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '4px' }}>管理LLM提供商和模型配置</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowDeleteButtons(!showDeleteButtons);
              }}
              className={`btn-ghost ${showDeleteButtons ? 'bg-red-500/20 border-red-500/50' : ''}`}
            >
              <i className="fa-solid fa-gear" aria-hidden="true"></i>
              {showDeleteButtons ? '完成管理' : '管理模型'}
            </button>
            {canAddProviders ? (
              <button
                onClick={() => { setEditingProvider({ name: '', provider_type: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', models: [], is_active: true }); setShowAddModal(true); }}
                className="btn-accent"
                aria-label="添加提供商"
              >
                <i className="fa-solid fa-plus mr-2" aria-hidden="true"></i>添加提供商
              </button>
            ) : (
              <button
                disabled
                className="btn-accent opacity-50 cursor-not-allowed"
                aria-label="添加提供商（专业版功能）"
                title="多模型路由是专业版功能"
              >
                <i className="fa-solid fa-lock mr-2" aria-hidden="true"></i>添加提供商
              </button>
            )}
          </div>
        </div>

        {/* 提供商列表 */}
        <div className="animate-fade-in-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
          {(providers || []).map((provider: any, index: number) => (
            <div
              key={provider.id}
              className="agent-card"
              onClick={() => handleEditProvider(provider.id)}
              role="button"
              tabIndex={0}
              aria-label={`编辑${provider.name}`}
              style={{
                background: 'rgba(24, 24, 27, 0.6)',
                border: '1px solid rgba(63, 63, 70, 0.4)',
                borderRadius: '16px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.25s',
                animationDelay: `${100 + index * 50}ms`,
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: `${providerTypes[provider.provider_type]?.color || '#60a5fa'}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                  }}>
                    {providerLogos[provider.provider_type] ? (
                      <img
                        src={encodeSvg(providerLogos[provider.provider_type])}
                        alt={providerTypes[provider.provider_type]?.label}
                        style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                      />
                    ) : (
                      <i
                        className="fa-solid fa-circle"
                        style={{ color: providerTypes[provider.provider_type]?.color || '#60a5fa', fontSize: '16px' }}
                        aria-hidden="true"
                      ></i>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{provider.name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{providerTypes[provider.provider_type]?.label || provider.provider_type}</p>
                  </div>
                </div>
                <span className={`status-dot ${provider.is_active ? 'online' : 'offline'}`} role="status" aria-label={provider.is_active ? '已启用' : '已禁用'}></span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>API地址</span>
                  <span style={{ color: 'var(--text-secondary)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{provider.base_url}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>模型数</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{provider.models?.length || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>状态</span>
                  <span style={{ color: provider.is_active ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    {provider.is_active ? '已启用' : '已禁用'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(63, 63, 70, 0.2)' }}>
                <span className="btn-ghost" style={{ flex: 1, padding: '6px', fontSize: '11px', textAlign: 'center', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); testProvider(provider.id); }}>
                  <i className="fa-solid fa-wifi" aria-hidden="true"></i> 测试
                </span>
                <span className="btn-ghost" style={{ flex: 1, padding: '6px', fontSize: '11px', textAlign: 'center', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleEditProvider(provider.id); }}>
                  <i className="fa-solid fa-pencil" aria-hidden="true"></i> 编辑
                </span>
                {showDeleteButtons && (
                  <span
                    className="btn-ghost"
                    style={{ padding: '6px 8px', cursor: 'pointer', borderRadius: '6px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(provider.id);
                    }}
                    title="删除"
                  >
                    <span style={{ color: '#ef4444', fontSize: '11px' }}>×</span>
                  </span>
                )}
              </div>
            </div>
          ))}
          
          {providers?.length === 0 && (
            <div className="col-span-2 text-center py-16">
              <i className="fa-solid fa-brain text-4xl mb-4" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true"></i>
              <p style={{ color: 'var(--text-secondary)' }}>暂无模型提供商</p>
            </div>
          )}
        </div>

        {/* 删除确认对话框 */}
        {pendingDelete && (
          <>
            <div
              className="fixed inset-0 z-50 animate-fade-in"
              style={{
                background: 'rgba(0,0,0,0.8)',
                backdropFilter: 'blur(8px)',
              }}
              onClick={() => setPendingDelete(null)}
            />
            <div
              className="fixed top-1/2 left-1/2 z-50 animate-scale-in"
              style={{
                transform: 'translate(-50%, -50%)',
                background: 'linear-gradient(180deg, #1a1a1f 0%, #12121a 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '24px',
                width: '420px',
                maxWidth: '90vw',
                boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03) inset',
                overflow: 'hidden',
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
            >
              <div style={{
                height: '3px',
                background: 'linear-gradient(90deg, transparent 0%, #ef4444 50%, transparent 100%)',
              }} />

              <div style={{ padding: '32px 28px 28px' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.08) 100%)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 8px 24px rgba(239,68,68,0.2)',
                  }}>
                    <i className="fa-solid fa-trash-can" style={{ color: '#ef4444', fontSize: '20px' }} aria-hidden="true"></i>
                  </div>

                  <div style={{ flex: 1, paddingTop: '4px' }}>
                    <h3 id="confirm-title" style={{
                      fontSize: '20px',
                      fontWeight: '600',
                      color: '#ffffff',
                      margin: '0 0 8px 0',
                      letterSpacing: '-0.01em',
                    }}>
                      删除服务商
                    </h3>
                    <p style={{
                      fontSize: '14px',
                      color: 'rgba(255,255,255,0.5)',
                      margin: 0,
                      lineHeight: '1.6',
                    }}>
                      确定要删除该服务商吗？此操作不可恢复。
                    </p>
                  </div>
                </div>

                <div style={{
                  height: '1px',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
                  margin: '28px 0',
                }} />

                <div style={{
                  display: 'flex',
                  gap: '16px',
                  justifyContent: 'center',
                }}>
                  <button
                    onClick={() => setPendingDelete(null)}
                    style={{
                      padding: '14px 36px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: '500',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.7)',
                      cursor: 'pointer',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      letterSpacing: '0.01em',
                      minWidth: '120px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                    }}
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      deleteProviderMutation.mutate(pendingDelete);
                      setPendingDelete(null);
                    }}
                    style={{
                      padding: '14px 36px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: '600',
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      border: 'none',
                      color: '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: '0 8px 24px rgba(239,68,68,0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
                      letterSpacing: '0.01em',
                      minWidth: '120px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 12px 32px rgba(239,68,68,0.45), inset 0 1px 0 rgba(255,255,255,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(239,68,68,0.35), inset 0 1px 0 rgba(255,255,255,0.1)';
                    }}
                  >
                    确认删除
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 添加/编辑提供商弹窗 */}
        {showAddModal && editingProvider && (
          <>
            <div
              className="fixed inset-0 z-50 animate-fade-in"
              style={{ background: 'rgba(0,0,0,0.7)' }}
              onClick={() => { setShowAddModal(false); setEditingProvider(undefined); }}
            ></div>
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in-up"
              style={{ pointerEvents: 'none' }}
              role="dialog"
              aria-label={editingProvider?.id ? '编辑提供商' : '添加新提供商'}
            >
              <div
                className="glass-card w-full max-w-lg"
                style={{
                  pointerEvents: 'auto',
                  borderRadius: '16px',
                  animation: 'fadeInUp .4s ease-out'
                }}
              >
                <div className="p-6 border-b" style={{ borderColor: 'rgba(63,63,70,0.4)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden"
                        style={{ background: `${providerTypes[editingProvider?.provider_type]?.color || '#60a5fa'}20` }}
                      >
                        {providerLogos[editingProvider?.provider_type] ? (
                          <img
                            src={encodeSvg(providerLogos[editingProvider?.provider_type])}
                            alt={providerTypes[editingProvider?.provider_type]?.label}
                            style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                          />
                        ) : (
                          <i
                            className="fa-solid fa-circle"
                            style={{ color: providerTypes[editingProvider?.provider_type]?.color || '#60a5fa', fontSize: '18px' }}
                            aria-hidden="true"
                          ></i>
                        )}
                      </div>
                      <div>
                        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {editingProvider?.id ? '编辑' : '添加'}服务商
                        </h2>
                        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                          {editingProvider?.provider_type ? providerTypes[editingProvider.provider_type]?.label : 'OpenAI'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setShowAddModal(false); setEditingProvider(undefined); }}
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:bg-white/10"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                      aria-label="关闭"
                    >
                      <span style={{ color: 'var(--text-secondary)', fontSize: '16px', fontWeight: '300', lineHeight: 1 }}>×</span>
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-4" style={{ fontSize: '12px' }}>
                  <div className="flex items-center gap-4">
                    <span className="w-20 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>名称</span>
                    <input
                      type="text"
                      value={editingProvider?.name || ''}
                      onChange={(e) => setEditingProvider((prev: any) => ({ ...prev, name: e.target.value }))}
                      className="input-field flex-1"
                      placeholder="输入服务商名称"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="w-20 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>类型</span>
                    <StyledSelect
                      value={editingProvider?.provider_type || 'openai'}
                      onChange={(v) => {
                        const config = providerTypes[v];
                        setShowCustomModelInput(false);
                        setEditingProvider((prev: any) => ({
                          ...prev,
                          provider_type: v,
                          name: config.defaultName,
                          base_url: config.defaultUrl,
                          models: config.defaultModels,
                        }));
                      }}
                      options={Object.entries(providerTypes).map(([key, t]) => ({ value: key, label: t.label, color: t.color }))}
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="w-20 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>API URL</span>
                    <input
                      type="text"
                      value={editingProvider?.base_url || ''}
                      onChange={(e) => setEditingProvider((prev: any) => ({ ...prev, base_url: e.target.value }))}
                      className="input-field flex-1"
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="w-20 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>API Key</span>
                    <input
                      type="password"
                      value={editingProvider?.api_key || ''}
                      onChange={(e) => setEditingProvider((prev: any) => ({ ...prev, api_key: e.target.value }))}
                      className="input-field flex-1"
                      placeholder="sk-xxxxxxxxxxxx"
                    />
                  </div>

                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex items-center gap-4">
                      <span className="w-20 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>模型</span>
                      <div className="flex-1">
                        <StyledSelect
                          value={showCustomModelInput ? '__custom__' : (editingProvider?.models?.[0] || '')}
                          onChange={(model) => {
                            if (model === '__custom__') {
                              setShowCustomModelInput(true);
                              setEditingProvider((prev: any) => ({ ...prev, models: [''] }));
                            } else {
                              setShowCustomModelInput(false);
                              setEditingProvider((prev: any) => ({ ...prev, models: [model] }));
                            }
                          }}
                          options={(() => {
                            const type = editingProvider?.provider_type || 'openai';
                            const config = providerTypes[type];
                            return [
                              ...config.defaultModels.map((model) => ({
                                value: model,
                                label: model,
                                color: config.color,
                              })),
                              { value: '__custom__', label: '其他...', color: config.color },
                            ];
                          })()}
                          placeholder="选择模型"
                        />
                      </div>
                    </div>
                    {showCustomModelInput && (
                      <div className="flex items-center gap-4 ml-24">
                        <input
                          type="text"
                          value={editingProvider?.models?.[0] || ''}
                          onChange={(e) => setEditingProvider((prev: any) => ({ ...prev, models: [e.target.value] }))}
                          className="input-field flex-1"
                          placeholder="输入自定义模型名称"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="w-20 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>状态</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        id="is_active"
                        checked={editingProvider?.is_active ?? true}
                        onChange={(e) => setEditingProvider((prev: any) => ({ ...prev, is_active: e.target.checked }))}
                        className="w-4 h-4 rounded"
                      />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {editingProvider?.is_active ? '已启用' : '已禁用'}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 px-6 pb-6" style={{ paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    className="btn-ghost flex-1 py-2.5 text-sm"
                    onClick={() => { setShowAddModal(false); setEditingProvider(undefined); }}
                  >
                    取消
                  </button>
                  <button
                    className="btn-accent flex-1 py-2.5 text-sm"
                    onClick={handleSaveProvider}
                  >
                    {editingProvider?.id ? '保存' : '添加'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '未知';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}