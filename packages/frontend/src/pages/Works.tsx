/**
 * 灵砚 InkForge - 作品管理页面
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-29
 *
 * 功能描述：管理用户所有作品，支持搜索、筛选、批量操作，对话式建书
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import { api } from '../lib/api';

const genres: Record<string, { label: string; color: string }> = {
  xuanhuan: { label: '玄幻', color: '#f59e0b' },
  xianxia: { label: '仙侠', color: '#60a5fa' },
  dushi: { label: '都市', color: '#34d399' },
  kehuan: { label: '科幻', color: '#a78bfa' },
  yanqing: { label: '言情', color: '#f472b6' },
  xuanyi: { label: '悬疑', color: '#94a3b8' },
  lishi: { label: '历史', color: '#f97316' },
  qihuan: { label: '奇幻', color: '#8b5cf6' },
};

const statuses = [
  { id: 'all', label: '全部', count: 0 },
  { id: 'draft', label: '草稿', count: 0 },
  { id: 'writing', label: '连载中', count: 0 },
  { id: 'editing', label: '编辑中', count: 0 },
  { id: 'published', label: '已发布', count: 0 },
];

export default function Works() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: novels, isLoading } = useQuery({
    queryKey: ['novels'],
    queryFn: api.novels.list,
  });

  const filteredNovels = novels?.filter(novel => {
    const matchSearch = novel.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = selectedStatus === 'all' || novel.status === selectedStatus;
    return matchSearch && matchStatus;
  }) || [];

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return '草稿';
      case 'writing': return '连载中';
      case 'editing': return '编辑中';
      case 'published': return '已发布';
      default: return status;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'draft': return 'badge-zinc';
      case 'writing': return 'badge-blue';
      case 'editing': return 'badge-accent';
      case 'published': return 'badge-green';
      default: return 'badge-zinc';
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
      
      <Header currentPage="works" />

      <main 
        className="relative z-[1]"
        style={{ 
          maxWidth: '1400px', 
          margin: '0 auto',
          padding: '28px 24px'
        }}
        role="main"
      >
        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' }}>作品管理</h1>
            <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '4px' }}>管理你的所有小说作品</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateDialog(true)}
              className="btn-accent flex items-center gap-2"
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              <i className="fa-solid fa-plus" aria-hidden="true"></i>新建作品
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all duration-200 ${viewMode === 'grid' ? 'bg-white/10' : 'hover:bg-white/5'}`}
              aria-label="网格视图"
            >
              <i className="fa-solid fa-grid-2" aria-hidden="true"></i>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all duration-200 ${viewMode === 'list' ? 'bg-white/10' : 'hover:bg-white/5'}`}
              aria-label="列表视图"
            >
              <i className="fa-solid fa-list" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        {/* 搜索和筛选 */}
        <div className="glass-card p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <i className="fa-solid fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} aria-hidden="true"></i>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索作品标题..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm outline-none focus:border-accent transition-colors"
                style={{ color: 'var(--text-primary)' }}
                aria-label="搜索作品"
              />
            </div>
            <div className="flex items-center gap-2">
              {statuses.map(status => (
                <button
                  key={status.id}
                  onClick={() => setSelectedStatus(status.id)}
                  className={`px-4 py-2 rounded-full text-sm transition-all duration-200 ${selectedStatus === status.id ? 'bg-accent text-black' : 'bg-white/5 text-text-secondary hover:bg-white/10'}`}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 作品列表 */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-4 gap-4">
            {filteredNovels.map((novel: any) => (
              <div
                key={novel.id}
                className="book-card cursor-pointer"
                onClick={() => navigate(`/novels/${novel.id}`)}
                aria-label={`作品：${novel.title}`}
              >
                <div
                  className="cover-gradient"
                  style={{ height: '160px', backgroundImage: `url(https://picsum.photos/seed/${novel.id}/400/200)` }}
                >
                  <div style={{ position: 'absolute', top: '10px', left: '10px' }}>
                    <span
                      className="badge"
                      style={{ background: `${genres[novel.genre]?.color || '#60a5fa'}20`, color: genres[novel.genre]?.color || '#60a5fa', border: `1px solid ${genres[novel.genre]?.color || '#60a5fa'}30` }}
                    >
                      {genres[novel.genre]?.label || novel.genre}
                    </span>
                  </div>
                  <div style={{ position: 'absolute', bottom: '10px', left: '14px', right: '14px' }}>
                    <h3 style={{ fontWeight: '700', color: 'white', fontSize: '14px', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{novel.title}</h3>
                    <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>{novel.total_chapters}章 · {(novel.word_count / 10000).toFixed(1)}万字</p>
                  </div>
                </div>
                <div style={{ padding: '12px' }}>
                  <div className="flex items-center justify-between">
                    <span className={getStatusClass(novel.status)} style={{ fontSize: '10px' }}>{getStatusLabel(novel.status)}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{formatDate(novel.updated_at)}</span>
                  </div>
                </div>
              </div>
            ))}

            {filteredNovels.length === 0 && (
              <div className="col-span-4 text-center py-16">
                <i className="fa-solid fa-book-open text-4xl mb-4" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true"></i>
                <p style={{ color: 'var(--text-secondary)' }}>暂无作品</p>
              </div>
            )}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full" role="grid">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }} scope="col">标题</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }} scope="col">题材</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }} scope="col">章节</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }} scope="col">字数</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }} scope="col">状态</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }} scope="col">更新时间</th>
                  <th style={{ textAlign: 'right', padding: '14px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }} scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredNovels.map((novel: any, index: number) => (
                  <tr 
                    key={novel.id} 
                    className="hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => navigate(`/novels/${novel.id}`)}
                    style={{ borderBottom: index < filteredNovels.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div className="flex items-center gap-3">
                        <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="fa-solid fa-book" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
                        </div>
                        <div>
                          <p style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{novel.title}</p>
                          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>ID: {novel.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span 
                        className="badge"
                        style={{ background: `${genres[novel.genre]?.color || '#60a5fa'}20`, color: genres[novel.genre]?.color || '#60a5fa', border: `1px solid ${genres[novel.genre]?.color || '#60a5fa'}30` }}
                      >
                        {genres[novel.genre]?.label || novel.genre}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{novel.total_chapters}章</td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{(novel.word_count / 10000).toFixed(1)}万</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className={getStatusClass(novel.status)} style={{ fontSize: '11px' }}>{getStatusLabel(novel.status)}</span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-tertiary)', fontSize: '13px' }}>{formatDate(novel.updated_at)}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          className="btn-ghost" 
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                          onClick={(e) => { e.stopPropagation(); api.novels.writeNext(novel.id); }}
                        >
                          <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>写新章
                        </button>
                        <button 
                          className="btn-ghost" 
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                          onClick={(e) => { e.stopPropagation(); navigate(`/novels/${novel.id}`); }}
                        >
                          <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>进入
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {filteredNovels.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <p style={{ color: 'var(--text-tertiary)' }}>暂无符合条件的作品</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showCreateDialog && (
        <CreateNovelDialog
          onClose={() => setShowCreateDialog(false)}
          onCreated={(id) => {
            setShowCreateDialog(false);
            navigate(`/novels/${id}`);
          }}
        />
      )}
    </div>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '未知';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const GENRE_OPTIONS = [
  { value: 'xuanhuan', label: '玄幻', color: '#f59e0b', desc: '东方玄幻、异世大陆' },
  { value: 'xianxia', label: '仙侠', color: '#60a5fa', desc: '修真飞升、蜀山昆仑' },
  { value: 'dushi', label: '都市', color: '#34d399', desc: '现代都市、商场职场' },
  { value: 'kehuan', label: '科幻', color: '#a78bfa', desc: '星际文明、赛博朋克' },
  { value: 'yanqing', label: '言情', color: '#f472b6', desc: '甜宠虐恋、青春校园' },
  { value: 'xuanyi', label: '悬疑', color: '#94a3b8', desc: '推理探案、惊悚悬疑' },
  { value: 'lishi', label: '历史', color: '#f97316', desc: '历史穿越、战争史诗' },
  { value: 'qihuan', label: '奇幻', color: '#8b5cf6', desc: '西式奇幻、DND风' },
];

const STEPS = [
  { id: 'genre', label: '选择题材', icon: 'fa-layer-group' },
  { id: 'title', label: '构思标题', icon: 'fa-pen-fancy' },
  { id: 'outline', label: '设定大纲', icon: 'fa-diagram-project' },
  { id: 'confirm', label: '确认创建', icon: 'fa-check' },
];

function CreateNovelDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [outline, setOutline] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const createMutation = useMutation({
    mutationFn: (data: { title: string; genre: string; outline?: string }) =>
      api.novels.create(data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['novels'] });
      onCreated(data.id);
    },
  });

  const scrollToBottom = () => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [step, selectedGenre, title]);

  const handleGenreSelect = (genre: string) => {
    setSelectedGenre(genre);
    setTimeout(() => setStep(1), 300);
  };

  const handleTitleConfirm = () => {
    if (title.trim()) {
      setStep(2);
    }
  };

  const handleOutlineConfirm = () => {
    setStep(3);
  };

  const handleCreate = async () => {
    if (!selectedGenre || !title.trim()) return;
    setIsCreating(true);
    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        genre: selectedGenre,
        outline: outline.trim() || undefined,
      });
    } catch (err) {
      setIsCreating(false);
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="glass-card"
        style={{
          width: '680px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>创建新作品</h2>
            <button onClick={onClose} className="btn-ghost p-2" aria-label="关闭">
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {STEPS.map((s, idx) => (
              <div key={s.id} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: '600',
                    background: idx <= step
                      ? 'var(--accent)'
                      : 'rgba(255,255,255,0.1)',
                    color: idx <= step ? '#000' : 'var(--text-tertiary)',
                    transition: 'all 0.3s',
                  }}
                >
                  {idx < step ? <i className="fa-solid fa-check" aria-hidden="true"></i> : idx + 1}
                </div>
                <span style={{ fontSize: '12px', color: idx <= step ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  {s.label}
                </span>
                {idx < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: '2px', background: idx < step ? 'var(--accent)' : 'rgba(255,255,255,0.1)', marginLeft: '8px' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div ref={chatRef} style={{ flex: 1, overflow: 'auto', padding: '24px', minHeight: '320px' }}>
          {step === 0 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#000', fontSize: '18px' }} aria-hidden="true"></i>
                </div>
                <div>
                  <p style={{ fontWeight: '500', color: 'var(--text-primary)' }}>灵砚AI</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>选择你想要创作的小说题材</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginTop: '20px' }}>
                {GENRE_OPTIONS.map((g) => (
                  <div
                    key={g.value}
                    onClick={() => handleGenreSelect(g.value)}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: `1px solid ${selectedGenre === g.value ? g.color : 'rgba(255,255,255,0.1)'}`,
                      background: selectedGenre === g.value ? `${g.color}15` : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    role="button"
                    aria-label={`选择${g.label}题材`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: '600', color: g.color, fontSize: '15px' }}>{g.label}</span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{g.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#000', fontSize: '18px' }} aria-hidden="true"></i>
                </div>
                <div>
                  <p style={{ fontWeight: '500', color: 'var(--text-primary)' }}>灵砚AI</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    已选择【{GENRE_OPTIONS.find(g => g.value === selectedGenre)?.label}】，现在给作品起个响亮的标题吧！
                  </p>
                </div>
              </div>
              <div style={{ marginTop: '20px' }}>
                <input
                  ref={inputRef as any}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleTitleConfirm())}
                  placeholder="输入作品标题..."
                  className="input-field w-full"
                  style={{ fontSize: '16px', padding: '14px 16px' }}
                  autoFocus
                />
                <div className="flex justify-between items-center mt-4">
                  <button onClick={() => setStep(0)} className="btn-ghost text-sm">
                    <i className="fa-solid fa-arrow-left mr-2" aria-hidden="true"></i>重选题材
                  </button>
                  <button
                    onClick={handleTitleConfirm}
                    disabled={!title.trim()}
                    className="btn-accent"
                    style={{ opacity: title.trim() ? 1 : 0.5 }}
                  >
                    确认标题 <i className="fa-solid fa-arrow-right ml-2" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#000', fontSize: '18px' }} aria-hidden="true"></i>
                </div>
                <div>
                  <p style={{ fontWeight: '500', color: 'var(--text-primary)' }}>灵砚AI</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    标题【{title}】很棒！现在可以简要描述故事大纲（可选），帮助AI更好地生成后续章节。
                  </p>
                </div>
              </div>
              <div style={{ marginTop: '20px' }}>
                <textarea
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  placeholder="简单描述一下故事背景、主要角色和冲突...（不填也可以，AI会帮你规划）"
                  className="input-field w-full"
                  style={{
                    minHeight: '140px',
                    resize: 'vertical',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    padding: '14px 16px',
                  }}
                />
                <div className="flex justify-between items-center mt-4">
                  <button onClick={() => setStep(1)} className="btn-ghost text-sm">
                    <i className="fa-solid fa-arrow-left mr-2" aria-hidden="true"></i>修改标题
                  </button>
                  <button onClick={handleOutlineConfirm} className="btn-accent">
                    {outline.trim() ? '保存并继续' : '跳过'} <i className="fa-solid fa-arrow-right ml-2" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#000', fontSize: '18px' }} aria-hidden="true"></i>
                </div>
                <div>
                  <p style={{ fontWeight: '500', color: 'var(--text-primary)' }}>灵砚AI</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>确认一下作品信息，然后就可以开始创作了！</p>
                </div>
              </div>
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>作品标题</span>
                    <button onClick={() => setStep(1)} className="btn-ghost text-xs" style={{ padding: '2px 8px' }}>修改</button>
                  </div>
                  <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>{title}</p>
                </div>
                <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>题材分类</span>
                    <button onClick={() => setStep(0)} className="btn-ghost text-xs" style={{ padding: '2px 8px' }}>修改</button>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: `${GENRE_OPTIONS.find(g => g.value === selectedGenre)?.color}20`,
                      color: GENRE_OPTIONS.find(g => g.value === selectedGenre)?.color,
                    }}
                  >
                    {GENRE_OPTIONS.find(g => g.value === selectedGenre)?.label}
                  </span>
                </div>
                {outline.trim() && (
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>故事大纲</span>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.6' }}>{outline}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mt-6">
                <button onClick={() => setStep(2)} className="btn-ghost text-sm">
                  <i className="fa-solid fa-arrow-left mr-2" aria-hidden="true"></i>修改大纲
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="btn-accent"
                  style={{ minWidth: '140px' }}
                >
                  {isCreating ? (
                    <><i className="fa-solid fa-spinner animate-spin mr-2" aria-hidden="true"></i>创建中...</>
                  ) : (
                    <><i className="fa-solid fa-rocket mr-2" aria-hidden="true"></i>开始创作</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}