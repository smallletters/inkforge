/**
 * 灵砚 InkForge - 数据可视化组件
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-01
 *
 * 功能描述：伏笔追踪图、角色关系图等数据可视化展示
 */
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Hook {
  id: string;
  name: string;
  type: string;
  chapter_raised: number;
  chapter_resolved?: number;
  status: 'pending' | 'resolved' | 'dropped';
  description: string;
  related_hooks?: string[];
}

interface Character {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  description: string;
  firstAppearance: number;
  relationships?: { targetId: string; type: 'ally' | 'enemy' | 'neutral' | 'family' | 'romantic' }[];
}

interface HookTrackerProps {
  novelId: string;
}

export function HookTracker({ novelId }: HookTrackerProps) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('all');
  const { data: truthFiles } = useQuery({
    queryKey: ['truth-file', novelId, 'pending_hooks'],
    queryFn: () => api.truthFiles.get(novelId, 'pending_hooks'),
    enabled: !!novelId,
  });

  const hooks: Hook[] = truthFiles?.content?.hooks || [];
  const filteredHooks = hooks.filter(h => filter === 'all' || h.status === filter);

  const stats = {
    total: hooks.length,
    pending: hooks.filter(h => h.status === 'pending').length,
    resolved: hooks.filter(h => h.status === 'resolved').length,
    dropped: hooks.filter(h => h.status === 'dropped').length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'resolved': return '#34d399';
      case 'dropped': return '#94a3b8';
      default: return '#60a5fa';
    }
  };

  const getTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      plot: '情节伏笔',
      character: '角色伏笔',
      world: '世界观伏笔',
      item: '物品伏笔',
    };
    return types[type] || type;
  };

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>伏笔追踪</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>追踪故事中的伏笔铺设与回收</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            {(['all', 'pending', 'resolved'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1 rounded-full text-xs transition-all"
                style={{
                  background: filter === f ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: filter === f ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  border: `1px solid ${filter === f ? 'rgba(255,255,255,0.15)' : 'transparent'}`,
                }}
              >
                {f === 'all' ? `全部(${stats.total})` : f === 'pending' ? `待回收(${stats.pending})` : `已回收(${stats.resolved})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: '总伏笔数', value: stats.total, color: '#60a5fa' },
          { label: '待回收', value: stats.pending, color: '#f59e0b' },
          { label: '已回收', value: stats.resolved, color: '#34d399' },
          { label: '已放弃', value: stats.dropped, color: '#94a3b8' },
        ].map((stat, idx) => (
          <div key={idx} className="p-3 rounded-lg" style={{ background: `${stat.color}10`, border: `1px solid ${stat.color}20` }}>
            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>{stat.label}</p>
            <p style={{ fontSize: '20px', fontWeight: '700', color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredHooks.length === 0 ? (
          <div className="text-center py-8">
            <i className="fa-solid fa-bookmark text-3xl mb-3" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true"></i>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>暂无伏笔记录</p>
          </div>
        ) : (
          filteredHooks.map((hook: Hook) => (
            <div
              key={hook.id}
              className="p-4 rounded-lg transition-all hover:bg-white/5"
              style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.06)` }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: getStatusColor(hook.status) }}
                  />
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>{hook.name}</span>
                  <span className="badge text-xs" style={{ background: `${getStatusColor(hook.status)}20`, color: getStatusColor(hook.status), fontSize: '10px' }}>
                    {getTypeLabel(hook.type)}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  {hook.chapter_raised}章 → {hook.chapter_resolved ? `${hook.chapter_resolved}章` : '待回收'}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', marginLeft: '14px' }}>
                {hook.description}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface CharacterRelationProps {
  novelId: string;
}

export function CharacterRelation({ novelId }: CharacterRelationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);

  const { data: truthFiles } = useQuery({
    queryKey: ['truth-file', novelId, 'character_matrix'],
    queryFn: () => api.truthFiles.get(novelId, 'character_matrix'),
    enabled: !!novelId,
  });

  const { data: characterData } = useQuery({
    queryKey: ['truth-file', novelId, 'current_state'],
    queryFn: () => api.truthFiles.get(novelId, 'current_state'),
    enabled: !!novelId,
  });

  const characters: Character[] = truthFiles?.content?.characters || characterData?.content?.characters || [];
  const relationships = truthFiles?.content?.relationships || characterData?.content?.relationships || [];

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'protagonist': return '#a78bfa';
      case 'antagonist': return '#ef4444';
      case 'supporting': return '#60a5fa';
      case 'minor': return '#94a3b8';
      default: return '#60a5fa';
    }
  };

  const getRelationColor = (type: string) => {
    switch (type) {
      case 'ally': return '#34d399';
      case 'enemy': return '#ef4444';
      case 'family': return '#f59e0b';
      case 'romantic': return '#f472b6';
      default: return '#94a3b8';
    }
  };

  const getRelationLabel = (type: string) => {
    switch (type) {
      case 'ally': return '同盟';
      case 'enemy': return '敌对';
      case 'neutral': return '中立';
      case 'family': return '亲属';
      case 'romantic': return '暧昧';
      default: return type;
    }
  };

  const roleStats = {
    protagonist: characters.filter(c => c.role === 'protagonist').length,
    antagonist: characters.filter(c => c.role === 'antagonist').length,
    supporting: characters.filter(c => c.role === 'supporting').length,
    minor: characters.filter(c => c.role === 'minor').length,
  };

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>角色关系图</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>展示角色关系网络</p>
        </div>
        <div className="flex items-center gap-2">
          {Object.entries(roleStats).map(([role, count]) => (
            <span key={role} className="flex items-center gap-1 text-xs" style={{ color: getRoleColor(role) }}>
              <span className="w-2 h-2 rounded-full" style={{ background: getRoleColor(role) }} />
              {count}
            </span>
          ))}
        </div>
      </div>

      {characters.length === 0 ? (
        <div className="text-center py-12">
          <i className="fa-solid fa-users text-3xl mb-3" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true"></i>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>暂无角色数据</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {characters.map((char: Character) => (
              <div
                key={char.id}
                onClick={() => setSelectedChar(char.id === selectedChar?.id ? null : char)}
                className="p-3 rounded-lg cursor-pointer transition-all"
                style={{
                  background: selectedChar?.id === char.id ? `${getRoleColor(char.role)}20` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${selectedChar?.id === char.id ? getRoleColor(char.role) : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: getRoleColor(char.role) }} />
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>{char.name}</span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '14px' }}>
                  {char.role === 'protagonist' ? '主角' : char.role === 'antagonist' ? '反派' : char.role === 'supporting' ? '配角' : '龙套'} · 第{char.firstAppearance}章
                </p>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {selectedChar ? (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                    style={{ background: `${getRoleColor(selectedChar.role)}20`, color: getRoleColor(selectedChar.role) }}
                  >
                    {selectedChar.name.charAt(0)}
                  </div>
                  <div>
                    <p style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '15px' }}>{selectedChar.name}</p>
                    <p style={{ fontSize: '12px', color: getRoleColor(selectedChar.role) }}>
                      {selectedChar.role === 'protagonist' ? '主角' : selectedChar.role === 'antagonist' ? '反派' : selectedChar.role === 'supporting' ? '配角' : '龙套'}
                    </p>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '16px' }}>
                  {selectedChar.description}
                </p>
                <h4 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-tertiary)', marginBottom: '8px' }}>关系</h4>
                <div className="space-y-2">
                  {(selectedChar.relationships || []).map((rel, idx) => {
                    const target = characters.find(c => c.id === rel.targetId);
                    return target ? (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span style={{ color: getRelationColor(rel.type), fontWeight: '500' }}>{getRelationLabel(rel.type)}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{target.name}</span>
                      </div>
                    ) : null;
                  })}
                  {(!selectedChar.relationships || selectedChar.relationships.length === 0) && (
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>暂无关系记录</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>点击角色查看详情</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <h4 style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-tertiary)', marginBottom: '8px' }}>关系图例</h4>
        <div className="flex gap-4">
          {[
            { type: 'ally', label: '同盟', color: '#34d399' },
            { type: 'enemy', label: '敌对', color: '#ef4444' },
            { type: 'family', label: '亲属', color: '#f59e0b' },
            { type: 'romantic', label: '暧昧', color: '#f472b6' },
            { type: 'neutral', label: '中立', color: '#94a3b8' },
          ].map(item => (
            <span key={item.type} className="flex items-center gap-1 text-xs" style={{ color: item.color }}>
              <span className="w-3 h-0.5 rounded" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
