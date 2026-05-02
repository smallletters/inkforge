/**
 * 灵砚 InkForge - 创作总览页面
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-29
 *
 * 功能描述：展示用户的作品概览、统计数据、AI创作建议和快捷操作
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';

interface ConfirmDialog {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const [showLogin, setShowLogin] = useState(!user);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm });
  }, []);

  const hideConfirm = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  }, []);

  const { data: novels, refetch } = useQuery({
    queryKey: ['novels'],
    queryFn: api.novels.list,
    enabled: !!user
  });

  const stats = (() => {
    const novelList = novels || [];
    const totalNovels = novelList.length;
    const totalChapters = novelList.reduce((sum: number, n: any) => sum + (n.total_chapters || 0), 0);
    const totalWords = novelList.reduce((sum: number, n: any) => sum + (n.word_count || 0), 0);
    const aiWords = novelList.reduce((sum: number, n: any) => sum + (n.ai_word_count || 0), 0);
    const aiPercent = totalWords > 0 ? ((aiWords / totalWords) * 100).toFixed(1) : '0';
    return [
      { label: '总作品数', value: totalNovels, unit: '', change: '较上月 +0', changeColor: '#34d399', changeIcon: 'fa-solid fa-arrow-up', bg: 'rgba(251,191,36,0.12)', icon: 'fa-solid fa-book-open', iconColor: '#fbbf24' },
      { label: '总章节', value: totalChapters, unit: '', change: '较上月 +0', changeColor: '#34d399', changeIcon: 'fa-solid fa-arrow-up', bg: 'rgba(59,130,246,0.12)', icon: 'fa-solid fa-file-lines', iconColor: '#60a5fa' },
      { label: '总字数', value: (totalWords / 10000).toFixed(1), unit: '万', change: '较上月 +0万', changeColor: '#34d399', changeIcon: 'fa-solid fa-arrow-up', bg: 'rgba(139,92,246,0.12)', icon: 'fa-solid fa-pen-line', iconColor: '#a78bfa' },
      { label: 'AI辅助字数', value: (aiWords / 10000).toFixed(1), unit: '万', change: `占比 ${aiPercent}%`, changeColor: '#60a5fa', changeIcon: 'fa-solid fa-robot', bg: 'rgba(16,185,129,0.12)', icon: 'fa-solid fa-brain', iconColor: '#34d399' },
    ];
  })();

  const deleteNovelMutation = useMutation({
    mutationFn: (id: string) => api.novels.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['novels'] });
    },
  });

  const handleDeleteNovel = (e: React.MouseEvent, novelId: string) => {
    e.stopPropagation();
    showConfirm(
      '删除作品',
      '确定要删除这个作品吗？此操作不可恢复。',
      () => deleteNovelMutation.mutate(novelId)
    );
  };

  if (showLogin) return <LoginForm onLogin={() => setShowLogin(false)} />;

  return (
    <div className="min-h-screen noise-overlay">
      <div className="ambient-glow" aria-hidden="true"></div>

      <Header currentPage="dashboard" />

      {/* 确认对话框 */}
      {confirmDialog.isOpen && (
        <>
          <div
            className="fixed inset-0 z-50 animate-fade-in"
            style={{
              background: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(8px)',
            }}
            onClick={hideConfirm}
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
            {/* 顶部装饰条 */}
            <div style={{
              height: '3px',
              background: 'linear-gradient(90deg, transparent 0%, #ef4444 50%, transparent 100%)',
            }} />

            <div style={{ padding: '32px 28px 28px' }}>
              {/* 内容区域：图标 + 文字 */}
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                {/* 圆形图标容器 */}
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

                {/* 文字内容 */}
                <div style={{ flex: 1, paddingTop: '4px' }}>
                  <h3 id="confirm-title" style={{
                    fontSize: '20px',
                    fontWeight: '600',
                    color: '#ffffff',
                    margin: '0 0 8px 0',
                    letterSpacing: '-0.01em',
                  }}>
                    {confirmDialog.title}
                  </h3>
                  <p style={{
                    fontSize: '14px',
                    color: 'rgba(255,255,255,0.5)',
                    margin: 0,
                    lineHeight: '1.6',
                  }}>
                    {confirmDialog.message}
                  </p>
                </div>
              </div>

              {/* 分隔线 */}
              <div style={{
                height: '1px',
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
                margin: '28px 0',
              }} />

              {/* 操作按钮区域 */}
              <div style={{
                display: 'flex',
                gap: '16px',
                justifyContent: 'center',
              }}>
                <button
                  onClick={hideConfirm}
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
                    hideConfirm();
                    confirmDialog.onConfirm();
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
      
      <main 
        className="relative z-[1] animate-fade-in-up"
        style={{ 
          maxWidth: '1280px', 
          margin: '0 auto',
          padding: '28px 24px'
        }} 
        role="main">
        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-[28px]">
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' }}>创作总览</h1>
            <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '4px' }}>欢迎回来，今天也是写作的好日子</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-tertiary)', fontSize: '13px' }}>
            <i className="fa-regular fa-calendar" style={{ color: 'rgba(245,158,11,0.5)' }} aria-hidden="true"></i>
            <span>{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>

        {/* 统计行 */}
        <div className="grid grid-cols-4 gap-4 mb-[32px]">
          {stats.map((s, i) => (
            <div key={i} className="glass-card animate-fade-in-up" style={{ animationDelay: `${50 + i * 50}ms`, padding: '20px' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{s.label}</span>
                <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className={`${s.icon}`} style={{ color: s.iconColor, fontSize: '14px' }} aria-hidden="true"></i>
                </span>
              </div>
              <div className="stat-value">{s.value}{s.unit && <span style={{ fontSize: '16px', color: 'var(--text-tertiary)' }}>{s.unit}</span>}</div>
              <div style={{ fontSize: '12px', color: s.changeColor, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <i className={s.changeIcon} style={{ fontSize: '10px' }} aria-hidden="true"></i>{s.change}
              </div>
            </div>
          ))}
        </div>

        {/* 主内容区 */}
        <div className="flex gap-5">
          {/* 书架 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-5" style={{ marginTop: '10px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>我的作品</h2>
              <div className="flex gap-2">
                <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }} aria-label="网格视图">
                  <i className="fa-solid fa-grid-2" aria-hidden="true"></i>
                </button>
                <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }} aria-label="列表视图">
                  <i className="fa-solid fa-list" aria-hidden="true"></i>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {novels?.map((novel: any, index: number) => (
                <article
                  key={novel.id}
                  className={`book-card animate-fade-in-up`}
                  style={{ animationDelay: `${150 + index * 50}ms` }}
                  tabIndex={0}
                  aria-label={`作品：${novel.title}`}
                >
                  <div
                    className="cover-gradient"
                    style={{ backgroundImage: `url(https://picsum.photos/seed/${novel.id}/400/200)` }}
                  >
                    <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 1 }}>
                      <span className="badge badge-accent">
                        <i className="fa-solid fa-wand-sparkles" style={{ fontSize: '10px', marginRight: '4px' }} aria-hidden="true"></i>
                        AI创作
                      </span>
                    </div>
                    <div style={{ position: 'absolute', bottom: '12px', left: '16px', right: '16px', zIndex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <h3 style={{ fontWeight: '700', color: 'white', fontSize: '15px', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{novel.title}</h3>
                        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>{novel.total_chapters ?? 0}章 · {(novel.word_count / 10000).toFixed(1)}万字</p>
                      </div>
                      <span className={`badge ${getStatusBadgeClass(novel.status)}`}>{getStatusText(novel.status)}</span>
                    </div>
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                      <span><i className="fa-regular fa-clock" style={{ marginRight: '4px' }} aria-hidden="true"></i>{formatTime(novel.updated_at)}</span>
                      <span><i className="fa-solid fa-robot" style={{ marginRight: '4px' }} aria-hidden="true"></i>{novel.model || 'Claude'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button
                        className="btn-accent"
                        style={{ flex: 1, padding: '7px 12px', fontSize: '12px' }}
                        onClick={() => api.novels.writeNext(novel.id)}
                      >
                        <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: '11px' }} aria-hidden="true"></i>
                        写下一章
                      </button>
                      <button
                        className="btn-ghost"
                        style={{ flex: 1, padding: '7px 12px', fontSize: '12px' }}
                        onClick={() => navigate(`/novels/${novel.id}`)}
                      >
                        进入作品
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              
              {(!novels || novels.length === 0) && (
                <>
                  {[1, 2].map((i) => (
                    <article key={i} className={`book-card animate-fade-in-up`} style={{ animationDelay: `${150 + i * 50}ms` }}>
                      <div
                        className="cover-gradient"
                        style={{ backgroundImage: `url(https://picsum.photos/seed/placeholder${i}/400/200)` }}
                      >
                        <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 1 }}>
                          <span className="badge badge-accent">
                            <i className="fa-solid fa-wand-sparkles" style={{ fontSize: '10px', marginRight: '4px' }} aria-hidden="true"></i>
                            AI创作
                          </span>
                        </div>
                        <div style={{ position: 'absolute', bottom: '12px', left: '16px', right: '16px', zIndex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                          <div>
                            <h3 style={{ fontWeight: '700', color: 'white', fontSize: '15px', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>春天旋律</h3>
                            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>42章 · 13.8万字</p>
                          </div>
                          <span className="badge badge-green">连载中</span>
                        </div>
                      </div>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                          <span><i className="fa-regular fa-clock" style={{ marginRight: '4px' }} aria-hidden="true"></i>昨天</span>
                          <span><i className="fa-solid fa-robot" style={{ marginRight: '4px' }} aria-hidden="true"></i>Claude</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          <button className="btn-accent" style={{ flex: 1, padding: '7px 12px', fontSize: '12px' }}>
                            <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: '11px' }} aria-hidden="true"></i>
                            写下一章
                          </button>
                          <button className="btn-ghost" style={{ flex: 1, padding: '7px 12px', fontSize: '12px' }}>
                            进入作品
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </>
              )}

              <button
                className="book-card flex flex-col items-center justify-center cursor-pointer animate-fade-in-up"
                style={{ animationDelay: `${150 + (novels?.length || 2) * 50}ms`, minHeight: '200px' }}
                aria-label="新建作品"
                onClick={() => setShowCreateModal(true)}
              >
                <div className="text-center">
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                    <i className="fa-solid fa-plus" style={{ color: 'var(--accent)', fontSize: '18px' }} aria-hidden="true"></i>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>创建新作品</p>
                </div>
              </button>
            </div>
          </div>

          {/* 右侧栏 */}
          <aside className="w-72 flex-shrink-0 flex flex-col gap-6" aria-label="快捷面板">
            {/* AI建议 */}
            <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '400ms', marginTop: '51px' }}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-solid fa-wand-magic-sparkles text-base" style={{ color: '#60a5fa' }} aria-hidden="true"></i>
                  </div>
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: '600', color: 'var(--text-primary)' }}>AI创作建议</h3>
                </div>
                <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <i className="fa-solid fa-circle text-xs mr-1" style={{ color: '#22d3ee' }} aria-hidden="true"></i>实时
                </span>
              </div>
              <div className="space-y-3">
                {suggestions.map((s, i) => (
                  <div 
                    key={i} 
                    className="p-4 rounded-md transition-all duration-200 hover:scale-[1.01]" 
                    style={{ background: s.bg, border: `1px solid ${s.border}` }}
                  >
                    <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6, color: s.color }}>
                      <i className={s.icon} style={{ color: 'var(--accent)', marginRight: '8px' }} aria-hidden="true"></i>
                      {s.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 快捷操作 */}
            <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '500ms' }}>
              <div className="flex items-center gap-3 mb-5">
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-bolt text-base" style={{ color: '#fbbf24' }} aria-hidden="true"></i>
                </div>
                <h3 style={{ fontSize: 'var(--text-base)', fontWeight: '600', color: 'var(--text-primary)' }}>快捷操作</h3>
              </div>
              <div className="space-y-2">
                {shortcuts.map((s, i) => (
                  <button 
                    key={i} 
                    className="btn-ghost w-full justify-start px-4 py-3 rounded-md transition-all duration-200 hover:bg-hover"
                    aria-label={s.label}
                    onClick={() => handleShortcutClick(s.action, navigate)}
                  >
                    <i className={s.icon} style={{ color: s.iconColor, width: '20px', textAlign: 'center' }} aria-hidden="true"></i>
                    <span style={{ fontSize: 'var(--text-base)' }}>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 近期活动 */}
            <div className="glass-card p-4 animate-fade-in-up" style={{ animationDelay: '600ms' }}>
              <div className="flex items-center gap-2 mb-4">
                <div style={{ width: '24px', height: '24px', borderRadius: 'var(--radius-xs)', background: 'rgba(100,116,139,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-regular fa-clock" style={{ color: '#94a3b8' }} aria-hidden="true"></i>
                </div>
                <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-primary)' }}>近期活动</h3>
              </div>
              <div className="space-y-3">
                {activities.map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5 group cursor-pointer">
                    <div className="relative">
                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', marginTop: '6px', flexShrink: 0, transition: 'transform 0.2s', background: a.dotColor }} className="group-hover:scale-150" aria-hidden="true"></div>
                      {i < activities.length - 1 && <div className="absolute top-3 left-1/2 w-px h-full -translate-x-1/2" style={{ background: 'var(--border-subtle)' }} aria-hidden="true"></div>}
                    </div>
                    <div className="flex-1">
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{a.text}</p>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>{a.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>

      <CreateNovelModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => refetch()}
      />
    </div>
  );
}

const suggestions = [
  { 
    text: '《吞天魔帝》第46章可引入新势力"天机阁"，与主线伏笔产生关联',
    bg: 'rgba(59,130,246,0.04)',
    border: 'rgba(59,130,246,0.1)',
    color: '#93c5fd',
    icon: 'fa-solid fa-lightbulb'
  },
  { 
    text: '《星际纪元》当前节奏偏慢，建议在第39章设置小型冲突',
    bg: 'rgba(139,92,246,0.04)',
    border: 'rgba(139,92,246,0.1)',
    color: '#c4b5fd',
    icon: 'fa-solid fa-chart-line'
  },
];

const shortcuts = [
  { label: '对话式建书', icon: 'fa-solid fa-comments', iconColor: '#60a5fa', action: 'chat-builder' },
  { label: '文风仿写', icon: 'fa-solid fa-palette', iconColor: '#f59e0b', action: 'style-imitation' },
  { label: '批量写下一章', icon: 'fa-solid fa-layer-group', iconColor: 'var(--accent)' },
  { label: '全文审计', icon: 'fa-solid fa-shield-check', iconColor: '#60a5fa' },
  { label: '导出作品', icon: 'fa-solid fa-file-export', iconColor: '#a78bfa' },
];

const activities = [
  { text: '《吞天魔帝》第45章 审计通过', time: '2小时前', dotColor: '#34d399' },
  { text: '《星际纪元》第38章 生成完成', time: '昨天 15:30', dotColor: '#60a5fa' },
  { text: '模型配置更新：写手 → Claude 3.5', time: '2天前', dotColor: 'var(--accent)' },
];

function handleShortcutClick(action: string | undefined, navigate: (path: string) => void) {
  switch(action) {
    case 'chat-builder':
      navigate('/chat-builder');
      break;
    case 'style-imitation':
      navigate('/style-imitation');
      break;
    default:
      // Do nothing for other actions
      break;
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'draft': return 'badge-zinc';
    case 'completed': return 'badge-green';
    case 'auditing': return 'badge-blue';
    default: return 'badge-green';
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case 'draft': return '草稿';
    case 'completed': return '已完结';
    case 'auditing': return '审计中';
    default: return '连载中';
  }
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '未知';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours}小时前`;
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const fd = new FormData(e.target as HTMLFormElement);
    const email = (fd.get('email') as string).trim();
    const password = fd.get('password') as string;

    if (!email.includes('@')) { 
      setError('请输入有效的邮箱地址'); 
      setLoading(false); 
      return; 
    }
    if (password.length < 6) { 
      setError('密码至少6位'); 
      setLoading(false); 
      return; 
    }

    try {
      const data = await api.auth.login(email, password);
      setAuth(data.access_token, data.user);
      onLogin();
    } catch (loginErr) {
      try {
        const data = await api.auth.register(email.split('@')[0], email, password);
        setAuth(data.access_token, data.user);
        onLogin();
      } catch (registerErr) {
        const errorMsg = registerErr instanceof Error ? registerErr.message : '操作失败，请检查后端服务是否运行';
        if (errorMsg.includes('认证已过期') || errorMsg.includes('认证令牌')) {
          setError('登录已过期，请重试');
        } else {
          setError(errorMsg);
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={handleSubmit} className="glass-card p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <i className="fa-solid fa-feather text-3xl text-amber-400 mb-3" aria-hidden="true"></i>
          <h2 className="text-xl font-bold">登录灵砚</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>AI赋能的小说创作平台</p>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
            {error}
          </div>
        )}
        <div className="flex flex-col gap-4">
          <input name="email" type="email" placeholder="邮箱" className="input-field" required />
          <input name="password" type="password" placeholder="密码（至少6位）" className="input-field" required minLength={6} />
          <button type="submit" disabled={loading} className="btn-accent w-full" style={loading ? { opacity: 0.6 } : {}}>
            {loading ? '处理中...' : '登录 / 注册'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateNovelModal({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('xuanhuan');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await api.novels.create({ title: title.trim(), genre });
    onCreated();
    onClose();
    setTitle('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="glass-card p-6 w-full max-w-md animate-fade-in-up" style={{ borderRadius: '16px' }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/15 to-amber-500/5 flex items-center justify-center">
            <i className="fa-solid fa-book-open text-amber-400" aria-hidden="true"></i>
          </div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>创建新作品</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>作品标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入作品标题"
                className="input-field w-full"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>题材分类</label>
              <select value={genre} onChange={(e) => setGenre(e.target.value)} className="input-field w-full">
                <option value="xuanhuan">玄幻</option>
                <option value="xianxia">仙侠</option>
                <option value="dushi">都市</option>
                <option value="kehuan">科幻</option>
                <option value="yanqing">言情</option>
                <option value="xuanyi">悬疑</option>
                <option value="lishi">历史</option>
                <option value="qihuan">奇幻</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={onClose} className="btn-ghost text-sm py-2 px-4">取消</button>
              <button type="submit" disabled={!title.trim()} className="btn-accent text-sm py-2 px-4">创建</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
