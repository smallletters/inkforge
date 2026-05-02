/**
 * 灵砚 InkForge - Agent配置页面
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-29
 *
 * 功能描述：自定义每个Agent的模型、提示词和行为参数
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import { api } from '../lib/api';
import { useSubscription } from '../hooks/useSubscription';

const MAIN_AGENTS = [
  { name: 'writer', label: '写手', desc: '负责章节正文生成', icon: 'fa-pen', color: '#a78bfa', bg: 'rgba(139,92,246,0.15)', model: 'Claude 3.5 Sonnet', temp: 0.8 },
  { name: 'auditor', label: '审计员', desc: '33维度章节审计', icon: 'fa-shield-halved', color: '#34d399', bg: 'rgba(16,185,129,0.15)', model: 'GPT-4o-mini', temp: 0.3 },
  { name: 'planner', label: '大纲师', desc: '章节规划与情节设计', icon: 'fa-compass', color: '#60a5fa', bg: 'rgba(59,130,246,0.15)', model: 'Claude 3.5 Haiku', temp: 0.7 },
  { name: 'reviser', label: '修订者', desc: '修复审计发现的问题', icon: 'fa-wrench', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', model: 'GPT-4o', temp: 0.5 },
];

const OTHER_AGENTS = [
  { name: 'orchestrator', label: '编剧', desc: '上下文构建与连贯性保证', icon: 'fa-network-wired', color: '#60a5fa', bg: 'rgba(59,130,246,0.15)', model: 'GPT-4o-mini', temp: 0.2 },
  { name: 'architect', label: '架构师', desc: '章节结构规划', icon: 'fa-building-2', color: '#a78bfa', bg: 'rgba(139,92,246,0.15)', model: 'Claude 3.5 Sonnet', temp: 0.4 },
  { name: 'observer', label: '资料员', desc: '事实提取与记录', icon: 'fa-eye', color: '#34d399', bg: 'rgba(16,185,129,0.15)', model: 'GPT-4o-mini', temp: 0.1 },
  { name: 'reflector', label: '审核员', desc: '自我反思与质量检查', icon: 'fa-reflection', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', model: 'GPT-4o-mini', temp: 0.3 },
  { name: 'normalizer', label: '校对员', desc: '文本格式标准化', icon: 'fa-align-center', color: '#60a5fa', bg: 'rgba(59,130,246,0.15)', model: 'GPT-4o-mini', temp: 0.1 },
  { name: 'radar', label: '策划', desc: '需求理解与意图识别', icon: 'fa-radar', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', model: 'Gemini 2.5 Flash', temp: 0.2 },
];

const MODELS = [
  { id: 'claude-sonnet', name: 'Claude 3.5 Sonnet', icon: 'fa-brands fa-anthropic', color: '#a78bfa' },
  { id: 'claude-haiku', name: 'Claude 3.5 Haiku', icon: 'fa-brands fa-anthropic', color: '#a78bfa' },
  { id: 'gpt-4o', name: 'GPT-4o', icon: 'fa-brands fa-openai', color: '#34d399' },
  { id: 'kimi', name: 'Kimi k2.5', icon: 'fa-solid fa-moon', color: '#f59e0b' },
];

const AGENT_MODEL_MAP: Record<string, string> = {
  'claude-sonnet': 'claude-3-5-sonnet-20241022',
  'claude-haiku': 'claude-3-5-haiku-20241022',
  'gpt-4o': 'gpt-4o',
  'kimi': 'moonshot-v1-8k',
};

export default function AgentConfig() {
  const queryClient = useQueryClient();
  const [drawer, setDrawer] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet');
  const [temperature, setTemperature] = useState(0.8);
  const [systemPrompt, setSystemPrompt] = useState(`你是《{{book_title}}》的专职写手，一部{{genre}}题材的长篇小说。

核心规则：
1. 每章字数控制在 {{word_count_target}} 字左右（允许 ±10% 浮动）
2. 保持与已发布章节的文风一致——叙事性描述为主，对话占比不超过 30%
3. 严格遵循当前真相文件中的所有设定（角色、物品、关系、位置）
4. 每章至少推进一条主线或支线，避免纯过渡章节

输出格式：
- 正文内容
- 本章涉及的角色、位置、关键物品列表`);

  const { isPro, features, isLoading: subLoading } = useSubscription();

  const { data: agentConfigs } = useQuery({
    queryKey: ['agent-configs'],
    queryFn: api.agents.configs,
  });

  const updateAgentMutation = useMutation({
    mutationFn: ({ name, data }: { name: string; data: any }) => api.agents.update(name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-configs'] });
    },
  });

  const canCustomizePrompt = features.custom_prompt;

  const handleSaveAgentConfig = (agentName: string) => {
    const model = AGENT_MODEL_MAP[selectedModel] || selectedModel;
    updateAgentMutation.mutate({
      name: agentName,
      data: {
        model,
        system_prompt: systemPrompt,
        temperature,
      },
    });
    setDrawer(null);
  };

  const handleResetAgent = (agentName: string) => {
    const agent = [...MAIN_AGENTS, ...OTHER_AGENTS].find(a => a.name === agentName);
    if (agent) {
      setSelectedModel(agent.model.includes('Claude') ? 'claude-sonnet' : agent.model.includes('GPT') ? 'gpt-4o' : 'kimi');
      setTemperature(agent.temp);
    }
  };

  const currentAgent = [...MAIN_AGENTS, ...OTHER_AGENTS].find(a => a.name === drawer);

  return (
    <div className="min-h-screen noise-overlay">
      <div className="ambient-glow" aria-hidden="true"></div>

      <Header currentPage="agents" />

      <main 
        className="relative z-[1] animate-fade-in-up"
        style={{ 
          maxWidth: '1100px', 
          margin: '0 auto',
          padding: '28px 24px'
        }} 
        role="main">
        <div className="flex items-center justify-between mb-7 animate-fade-in-up">
          <div>
            <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: '700', color: 'var(--text-primary)' }}>Agent配置</h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginTop: '4px' }}>自定义每个Agent的模型、提示词和行为参数</p>
          </div>
          <button className="btn-ghost" style={{ fontSize: 'var(--text-sm)' }}>
            <i className="fa-solid fa-rotate" aria-hidden="true"></i>恢复默认
          </button>
        </div>

        <div className="animate-fade-in-up delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            {[...MAIN_AGENTS, ...OTHER_AGENTS].map((agent, index) => (
              <div
                key={agent.name}
                className="agent-card"
                onClick={() => setDrawer(agent.name)}
                tabIndex={0}
                role="button"
                aria-label={`配置${agent.label} Agent`}
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
                      background: agent.bg || 'rgba(255,255,255,0.05)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center'
                    }}>
                      <i className={`fa-solid ${agent.icon || 'fa-user'}`} style={{ color: agent.color || 'var(--text-tertiary)', fontSize: '16px' }} aria-hidden="true"></i>
                    </div>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{agent.label}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{agent.name}</p>
                    </div>
                  </div>
                  <span className="status-dot online" role="status" aria-label="在线"></span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>职责</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{agent.desc}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>模型</span>
                    <span style={{ color: '#c4b5fd' }}>{agent.model}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>温度</span>
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{agent.temp}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(63, 63, 70, 0.2)' }}>
                  <span className="btn-ghost" style={{ flex: 1, padding: '6px', fontSize: '11px', textAlign: 'center', cursor: 'pointer' }} onClick={() => setDrawer(agent.name)}>配置</span>
                  <span className="btn-ghost" style={{ flex: 1, padding: '6px', fontSize: '11px', textAlign: 'center', cursor: 'pointer' }}>
                    <i className="fa-solid fa-rotate" aria-hidden="true"></i>重置
                  </span>
                </div>
              </div>
            ))}
        </div>
      </main>

      {drawer && (
        <>
          <div
            className="fixed inset-0 z-40 animate-fade-in"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setDrawer(null)}
          ></div>
          <div
            className="fixed top-0 right-0 w-[460px] h-full z-50 flex flex-col animate-slide-in-right"
            style={{
              background: 'linear-gradient(180deg, rgba(12,12,16,0.98) 0%, rgba(9,9,11,0.96) 100%)',
              backdropFilter: 'blur(24px)',
              borderLeft: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.4)'
            }}
            role="dialog"
            aria-label={`${currentAgent?.label}配置详情`}
          >
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: currentAgent?.bg }}>
                  <i className={`fa-solid ${currentAgent?.icon} text-base`} style={{ color: currentAgent?.color }} aria-hidden="true"></i>
                </div>
                <div>
                  <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{currentAgent?.label} {capitalize(drawer)}</h2>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>自定义模型、提示词和行为参数</p>
                </div>
              </div>
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:bg-white/10 hover:scale-105"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                onClick={() => setDrawer(null)}
                aria-label="关闭"
              >
                <i className="fa-solid fa-xmark text-sm" style={{ color: 'var(--text-secondary)' }} aria-hidden="true"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-5">
                <div className="animate-fade-in-up">
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-2.5" style={{ color: 'var(--text-tertiary)' }}>
                    模型选择
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {MODELS.map((model) => (
                      <button
                        key={model.id}
                        className={`model-option flex items-center gap-2 p-3 rounded-lg text-sm transition-all duration-200 ${selectedModel === model.id ? 'selected' : ''}`}
                        onClick={() => setSelectedModel(model.id)}
                        style={{
                          background: selectedModel === model.id ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                          border: selectedModel === model.id ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)'
                        }}
                      >
                        <i className={model.icon} style={{ color: model.color }} aria-hidden="true"></i>
                        <span style={{ color: 'var(--text-primary)' }}>{model.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="animate-fade-in-up delay-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-2.5" style={{ color: 'var(--text-tertiary)' }}>
                    Temperature
                  </label>
                  <div className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{temperature}</span>
                      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>控制生成随机性</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                      aria-label="Temperature值"
                    />
                    <div className="flex justify-between mt-2">
                      <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>精确</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>创意</span>
                    </div>
                  </div>
                </div>

                <div className="animate-fade-in-up delay-2">
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>
                      System Prompt <span className="font-normal normal-case ml-1.5" style={{ color: 'var(--text-tertiary)' }}>v3 · 上次编辑 2天前</span>
                    </label>
                    {!canCustomizePrompt && (
                      <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                        <i className="fa-solid fa-lock mr-1" aria-hidden="true"></i>专业版功能
                      </span>
                    )}
                  </div>
                  <textarea
                    className="prompt-editor w-full rounded-lg"
                    value={systemPrompt}
                    onChange={(e) => canCustomizePrompt && setSystemPrompt(e.target.value)}
                    disabled={!canCustomizePrompt}
                    rows={8}
                    aria-label="自定义System Prompt"
                    style={{ 
                      fontSize: '13px',
                      opacity: canCustomizePrompt ? 1 : 0.5,
                      cursor: canCustomizePrompt ? 'text' : 'not-allowed'
                    }}
                  ></textarea>
                  <div className="flex justify-between mt-2.5">
                    <div className="flex gap-3">
                      {canCustomizePrompt && (
                        <>
                          <button className="text-[11px] flex items-center gap-1.5 transition-colors duration-200 hover:text-primary" style={{ color: 'var(--text-tertiary)' }}>
                            <i className="fa-regular fa-clock-rotate-left" aria-hidden="true"></i>版本历史
                          </button>
                          <button className="text-[11px] flex items-center gap-1.5 transition-colors duration-200 hover:text-primary" style={{ color: 'var(--text-tertiary)' }}>
                            <i className="fa-regular fa-circle-question" aria-hidden="true"></i>变量说明
                          </button>
                        </>
                      )}
                    </div>
                    <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>~680 tokens</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t flex gap-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <button className="btn-accent flex-1 py-2.5 text-sm" onClick={() => drawer && handleSaveAgentConfig(drawer)}>保存配置</button>
              <button className="btn-ghost flex-1 py-2.5 text-sm" onClick={() => { if (drawer) handleResetAgent(drawer); setDrawer(null); }}>取消</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }