/**
 * 灵砚 InkForge - 作品详情页面
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-29
 *
 * 功能描述：展示作品详情，管理章节，查看真相文件
 */
import { useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import StyledSelect from '../components/StyledSelect';
import { api } from '../lib/api';
import { HookTracker, CharacterRelation } from './Visualizations';

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

type NovelStatus = 'draft' | 'writing' | 'editing' | 'published';

const statuses: Record<NovelStatus, { label: string; class: string }> = {
  draft: { label: '草稿', class: 'badge-zinc' },
  writing: { label: '连载中', class: 'badge-blue' },
  editing: { label: '编辑中', class: 'badge-accent' },
  published: { label: '已发布', class: 'badge-green' },
};

interface ConfirmDialog {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export default function NovelDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'chapters' | 'truth' | 'settings' | 'visualization'>('chapters');
  const [writingNext, setWritingNext] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
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

  const { data: novel, isLoading: novelLoading } = useQuery({
    queryKey: ['novel', id],
    queryFn: () => api.novels.get(id!),
    enabled: !!id,
  });

  const { data: chapters, isLoading: chaptersLoading } = useQuery({
    queryKey: ['chapters', id],
    queryFn: () => api.chapters.list(id!),
    enabled: !!id,
  });

  const { data: truthFiles, isLoading: truthLoading } = useQuery({
    queryKey: ['truth-files', id],
    queryFn: () => api.truthFiles.list(id!),
    enabled: !!id && activeTab === 'truth',
  });

  const writeNextMutation = useMutation({
    mutationFn: () => api.novels.writeNext(id!),
    onMutate: () => {
      setWritingNext(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chapters', id] });
      queryClient.invalidateQueries({ queryKey: ['novel', id] });
      setWritingNext(false);
    },
    onError: () => {
      setWritingNext(false);
    },
  });

  const updateNovelMutation = useMutation({
    mutationFn: (data: { title?: string; genre?: string }) => api.novels.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['novel', id] });
    },
  });

  const deleteNovelMutation = useMutation({
    mutationFn: () => api.novels.delete(id!),
    onSuccess: () => {
      navigate('/');
    },
  });

  const handleDeleteNovel = () => {
    showConfirm(
      '删除作品',
      '确定要删除这个作品吗？此操作不可恢复。',
      () => deleteNovelMutation.mutate()
    );
  };

  const handleSaveSettings = (data: { title: string; genre: string }) => {
    updateNovelMutation.mutate(data);
  };

  const handleWriteNext = () => {
    writeNextMutation.mutate();
  };

  const handleViewChapter = (chapterNumber: number) => {
    navigate(`/novels/${id}/chapters/${chapterNumber}`);
  };

  const handleDeleteChapter = (chapterNumber: number, e: React.MouseEvent) => {
    e.stopPropagation();
    showConfirm(
      '删除章节',
      `确定要删除第${chapterNumber}章吗？此操作不可恢复。`,
      () => {
        api.chapters.delete(id!, chapterNumber)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['chapters', id] });
            queryClient.invalidateQueries({ queryKey: ['novel', id] });
          })
          .catch((err) => {
            console.error('删除失败:', err);
          });
      }
    );
  };

  if (novelLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <i className="fa-solid fa-spinner animate-spin text-2xl" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
      </div>
    );
  }

  if (!novel) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-tertiary)' }}>作品不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen noise-overlay">
      <div className="ambient-glow" aria-hidden="true"></div>
      
      <Header currentPage="works" />

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

      {showExportDialog && (
        <ExportDialog novelId={id!} title={novel.title} onClose={() => setShowExportDialog(false)} />
      )}

      {showImportDialog && (
        <ImportDialog novelId={id!} onClose={() => setShowImportDialog(false)} />
      )}

      <main 
        className="relative z-[1]"
        style={{ 
          maxWidth: '1400px', 
          margin: '0 auto',
          padding: '28px 24px'
        }}
        role="main"
      >
        {/* 返回按钮 */}
        <button 
          onClick={() => navigate('/works')}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-6"
          aria-label="返回作品列表"
        >
          <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
          <span>返回作品列表</span>
        </button>

        {/* 作品信息卡片 */}
        <div className="glass-card p-6 mb-6">
          <div className="flex items-start gap-6">
            <div 
              style={{ 
                width: '180px', 
                height: '240px', 
                borderRadius: '12px', 
                background: 'var(--bg-hover)',
                backgroundImage: `url(https://picsum.photos/seed/${novel.id}/400/500)`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                flexShrink: 0
              }}
              role="img"
              aria-label="作品封面"
            ></div>
            
            <div className="flex-1 flex flex-col justify-between" style={{ minHeight: '240px' }}>
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{novel.title}</h1>
                  <span 
                    className="badge"
                    style={{ background: `${genres[novel.genre]?.color || '#60a5fa'}20`, color: genres[novel.genre]?.color || '#60a5fa', border: `1px solid ${genres[novel.genre]?.color || '#60a5fa'}30` }}
                  >
                    {genres[novel.genre]?.label || novel.genre}
                  </span>
                  <span className={`badge ${statuses[novel.status as NovelStatus]?.class || 'badge-zinc'}`}>{statuses[novel.status as NovelStatus]?.label || novel.status}</span>
                </div>
                
                <div className="flex items-center gap-6 mb-6" style={{ color: 'var(--text-tertiary)' }}>
                  <span><i className="fa-solid fa-book-open" aria-hidden="true"></i> {novel.total_chapters} 章节</span>
                  <span><i className="fa-solid fa-file-text" aria-hidden="true"></i> {(novel.word_count / 10000).toFixed(2)} 万字</span>
                  <span><i className="fa-solid fa-calendar" aria-hidden="true"></i> 更新于 {formatDate(novel.updated_at)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleWriteNext}
                  disabled={writingNext}
                  className="btn-accent flex items-center gap-2"
                  aria-label="写新章节"
                >
                  {writingNext ? (
                    <>
                      <i className="fa-solid fa-spinner animate-spin" aria-hidden="true"></i>
                      生成中...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                      续写新章
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (novel.total_chapters > 0) {
                      navigate(`/novels/${id}/chapters/${novel.total_chapters}`);
                    } else {
                      writeNextMutation.mutate();
                    }
                  }}
                  className="btn-secondary"
                  aria-label={novel.total_chapters > 0 ? "进入写作" : "开始写作"}
                >
                  <i className="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                  {novel.total_chapters > 0 ? "进入写作" : "开始写作"}
                </button>
                <button
                  onClick={handleDeleteNovel}
                  className="btn-secondary flex items-center gap-2"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                  aria-label="删除作品"
                >
                  <i className="fa-solid fa-trash" aria-hidden="true"></i>
                  删除作品
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 标签页导航 */}
        <div className="flex items-center gap-1 mb-4">
          <button
            onClick={() => setActiveTab('chapters')}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'chapters' ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}
          >
            <i className="fa-solid fa-list mr-2" aria-hidden="true"></i>章节列表
          </button>
          <button
            onClick={() => setActiveTab('truth')}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'truth' ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}
          >
            <i className="fa-solid fa-database mr-2" aria-hidden="true"></i>真相文件
          </button>
          <button
            onClick={() => setActiveTab('visualization')}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'visualization' ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}
          >
            <i className="fa-solid fa-diagram-project mr-2" aria-hidden="true"></i>可视化
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'settings' ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}
          >
            <i className="fa-solid fa-gear mr-2" aria-hidden="true"></i>作品设置
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowImportDialog(true)}
              className="btn-ghost text-sm flex items-center gap-2"
              aria-label="导入章节"
            >
              <i className="fa-solid fa-file-import" aria-hidden="true"></i>导入
            </button>
            <button
              onClick={() => setShowExportDialog(true)}
              className="btn-ghost text-sm flex items-center gap-2"
              aria-label="导出作品"
            >
              <i className="fa-solid fa-file-export" aria-hidden="true"></i>导出
            </button>
          </div>
        </div>

        {/* 章节列表 */}
        {activeTab === 'chapters' && (
          <div className="glass-card p-6">
            {chaptersLoading ? (
              <div className="flex items-center justify-center py-12">
                <i className="fa-solid fa-spinner animate-spin" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
              </div>
            ) : chapters?.length === 0 ? (
              <div className="text-center py-16">
                <i className="fa-solid fa-file-text text-4xl mb-4" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true"></i>
                <p style={{ color: 'var(--text-secondary)' }}>暂无章节</p>
                <button 
                  onClick={handleWriteNext}
                  className="btn-accent mt-4"
                >
                  <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                  生成第一章
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {(chapters || []).map((chapter: any, idx: number) => (
                  <div
                    key={chapter.id || `ch-${chapter.chapter_number}-${idx}`}
                    className="flex items-center justify-between p-4 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
                    onClick={() => handleViewChapter(chapter.chapter_number)}
                    aria-label={`章节 ${chapter.chapter_number}: ${chapter.title || '未命名'}`}
                  >
                    <div className="flex items-center gap-4">
                      <span 
                        className="w-10 h-10 rounded-lg flex items-center justify-center font-medium"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                      >
                        {chapter.chapter_number}
                      </span>
                      <div>
                        <h4 style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                          {chapter.title || `第${chapter.chapter_number}章`}
                        </h4>
                        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                          {chapter.word_count} 字 · 更新于 {formatDate(chapter.updated_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {chapter.status === 'auditing' && (
                        <span className="badge badge-accent">审核中</span>
                      )}
                      {chapter.status === 'audit_failed' && (
                        <span className="badge badge-red">审核失败</span>
                      )}
                      <button
                        className="rounded transition-all"
                        style={{ padding: '4px 10px', fontSize: '12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                        onClick={(e) => handleDeleteChapter(chapter.chapter_number, e)}
                        aria-label="删除章节"
                      >
                        <i className="fa-solid fa-trash mr-1" aria-hidden="true"></i>
                        <span>删除</span>
                      </button>
                      <button 
                        className="opacity-0 group-hover:opacity-100 btn-ghost p-2 transition-all"
                        onClick={(e) => { e.stopPropagation(); handleViewChapter(chapter.chapter_number); }}
                        aria-label="编辑章节"
                      >
                        <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 真相文件 */}
        {activeTab === 'truth' && (
          <TruthFilesPanel novelId={id!} />
        )}

        {/* 可视化 */}
        {activeTab === 'visualization' && (
          <div className="grid grid-cols-2 gap-4">
            <HookTracker novelId={id!} />
            <CharacterRelation novelId={id!} />
          </div>
        )}

        {/* 作品设置 */}
        {activeTab === 'settings' && (
          <SettingsForm novel={novel} onSave={handleSaveSettings} />
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

function getTruthFileName(fileName: string): string {
  const names: Record<string, string> = {
    current_state: '当前状态',
    particle_ledger: '粒子账本',
    pending_hooks: '待处理钩子',
    chapter_summaries: '章节摘要',
    subplot_board: '副线看板',
    emotional_arcs: '情感弧线',
    character_matrix: '人物矩阵',
  };
  return names[fileName] || fileName;
}

function SettingsForm({ novel, onSave }: { novel: any; onSave: (data: { title: string; genre: string }) => void }) {
  const [title, setTitle] = useState(novel.title || '');
  const [genre, setGenre] = useState(novel.genre || 'xuanhuan');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onSave({ title: title.trim(), genre });
    }
  };

  return (
    <div className="glass-card p-6">
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>作品设置</h3>
      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div>
          <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>作品标题</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field w-full"
            aria-label="作品标题"
          />
        </div>

        <div>
          <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>题材分类</label>
          <StyledSelect
            value={genre}
            onChange={setGenre}
            options={Object.entries(genres).map(([key, g]) => ({ value: key, label: g.label, color: g.color }))}
          />
        </div>

        <div className="flex items-center justify-between pt-4">
          <button type="button" className="btn-ghost" onClick={() => { setTitle(novel.title); setGenre(novel.genre); }}>重置</button>
          <button type="submit" className="btn-accent">保存设置</button>
        </div>
      </form>
    </div>
  );
}

const TRUTH_FILE_NAMES: Record<string, { label: string; icon: string; color: string; desc: string }> = {
  current_state: { label: '世界状态', icon: 'fa-globe', color: '#60a5fa', desc: '角色位置、关系网络、已知信息' },
  particle_ledger: { label: '资源账本', icon: 'fa-coins', color: '#fbbf24', desc: '物品、金钱、物资流转' },
  pending_hooks: { label: '未闭合伏笔', icon: 'fa-bookmark', color: '#f472b6', desc: '已埋设待回收的伏笔' },
  chapter_summaries: { label: '各章摘要', icon: 'fa-list', color: '#34d399', desc: '章节梗概与关键事件' },
  subplot_board: { label: '支线进度板', icon: 'fa-diagram-project', color: '#a78bfa', desc: '支线任务进度追踪' },
  emotional_arcs: { label: '情感弧线', icon: 'fa-heart', color: '#ef4444', desc: '角色情感变化记录' },
  character_matrix: { label: '角色交互矩阵', icon: 'fa-users', color: '#14b8a6', desc: '角色间关系与互动' },
};

function TruthFilesPanel({ novelId }: { novelId: string }) {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState<string>('');

  const { data: truthFilesList, isLoading: listLoading } = useQuery({
    queryKey: ['truth-files', novelId],
    queryFn: () => api.truthFiles.list(novelId),
  });

  const { data: selectedFileContent, isLoading: contentLoading } = useQuery({
    queryKey: ['truth-file', novelId, selectedFile],
    queryFn: () => selectedFile ? api.truthFiles.get(novelId, selectedFile) : null,
    enabled: !!selectedFile,
  });

  const updateMutation = useMutation({
    mutationFn: ({ name, content }: { name: string; content: any }) =>
      fetch(`/api/v1/novels/${novelId}/truth-files/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['truth-files', novelId] });
      queryClient.invalidateQueries({ queryKey: ['truth-file', novelId, selectedFile] });
      setIsEditing(false);
    },
  });

  const handleViewFile = (fileName: string) => {
    setSelectedFile(fileName);
    setIsEditing(false);
  };

  const handleEdit = () => {
    if (selectedFileContent?.content) {
      setEditContent(JSON.stringify(selectedFileContent.content, null, 2));
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    if (selectedFile && !isEditing) return;
    try {
      const parsed = JSON.parse(editContent);
      updateMutation.mutate({ name: selectedFile!, content: parsed });
    } catch {
      alert('JSON格式错误，请检查');
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setIsEditing(false);
  };

  if (listLoading) {
    return (
      <div className="glass-card p-6 flex items-center justify-center py-16">
        <i className="fa-solid fa-spinner animate-spin text-2xl" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>真相文件</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>查看和编辑作品的7个真相文件</p>
        </div>
        {selectedFile && (
          <button className="btn-ghost text-sm" onClick={handleClose}>
            <i className="fa-solid fa-xmark mr-1" aria-hidden="true"></i>关闭
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedFile ? '280px 1fr' : '1fr', gap: '16px', minHeight: '400px' }}>
        {!selectedFile ? (
          <div className="grid grid-cols-2 gap-4">
            {((truthFilesList as any)?.files || []).map((file: any) => {
              const info = TRUTH_FILE_NAMES[file.file_name] || { label: file.file_name, icon: 'fa-file', color: '#60a5fa', desc: '' };
              return (
                <div
                  key={file.file_name}
                  className="p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-transparent hover:border-white/10"
                  onClick={() => handleViewFile(file.file_name)}
                  role="button"
                  aria-label={`查看${info.label}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: `${info.color}20` }}
                    >
                      <i className={`fa-solid ${info.icon}`} style={{ color: info.color, fontSize: '16px' }} aria-hidden="true"></i>
                    </div>
                    <div className="flex-1">
                      <h4 style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>{info.label}</h4>
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>v{file.version}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>{info.desc}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                    更新于 {formatDate(file.updated_at)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {((truthFilesList as any)?.files || []).map((file: any) => {
                const info = TRUTH_FILE_NAMES[file.file_name] || { label: file.file_name, icon: 'fa-file', color: '#60a5fa' };
                const isActive = selectedFile === file.file_name;
                return (
                  <div
                    key={file.file_name}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      isActive ? 'bg-white/10 border border-white/20' : 'bg-white/5 hover:bg-white/10 border border-transparent'
                    }`}
                    onClick={() => handleViewFile(file.file_name)}
                    role="button"
                    aria-label={`查看${info.label}`}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <i className={`fa-solid ${info.icon}`} style={{ color: info.color, fontSize: '14px' }} aria-hidden="true"></i>
                      <span style={{ fontWeight: isActive ? '600' : '400', color: 'var(--text-primary)', fontSize: '13px' }}>
                        {info.label}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-tertiary)' }}>v{file.version}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border border-white/10 rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.3)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-2">
                  <i className={`fa-solid ${TRUTH_FILE_NAMES[selectedFile]?.icon || 'fa-file'}`} style={{ color: TRUTH_FILE_NAMES[selectedFile]?.color, fontSize: '14px' }} aria-hidden="true"></i>
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>
                    {TRUTH_FILE_NAMES[selectedFile]?.label || selectedFile}
                  </span>
                  {selectedFileContent?.version && (
                    <span className="badge ml-2" style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-tertiary)' }}>
                      v{selectedFileContent.version}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button className="btn-ghost text-xs px-3 py-1.5" onClick={() => setIsEditing(false)}>取消</button>
                      <button className="btn-accent text-xs px-3 py-1.5" onClick={handleSaveEdit}>保存</button>
                    </>
                  ) : (
                    <button className="btn-ghost text-xs px-3 py-1.5" onClick={handleEdit}>
                      <i className="fa-solid fa-pen-to-square mr-1" aria-hidden="true"></i>编辑
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 400px)', fontFamily: 'var(--font-mono)' }}>
                {contentLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <i className="fa-solid fa-spinner animate-spin" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
                  </div>
                ) : isEditing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-full min-h-[300px] p-3 rounded-lg"
                    style={{
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      resize: 'vertical',
                      outline: 'none',
                    }}
                    aria-label="编辑JSON内容"
                  />
                ) : (
                  <pre style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {JSON.stringify(selectedFileContent?.content || {}, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const EXPORT_FORMATS = [
  { id: 'txt', name: '纯文本', icon: 'fa-file-lines', desc: '适合复制粘贴到其他平台', color: '#60a5fa' },
  { id: 'md', name: 'Markdown', icon: 'fa-file-code', desc: '保留格式，便于二次编辑', color: '#34d399' },
  { id: 'epub', name: 'EPUB', icon: 'fa-tablet-screen-button', desc: '电子书格式，适合阅读器', color: '#f472b6', disabled: true },
  { id: 'pdf', name: 'PDF', icon: 'fa-file-pdf', desc: '适合打印和分享', color: '#ef4444', disabled: true },
];

function ExportDialog({ novelId, title, onClose }: { novelId: string; title: string; onClose: () => void }) {
  const [format, setFormat] = useState('txt');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const token = (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
      const response = await fetch(`/api/v1/novels/${novelId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ format, chapters: 'all' }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onClose();
      } else {
        const err = await response.json();
        alert(err.error?.message || '导出失败');
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-card" style={{ width: '480px', padding: '24px' }}>
        <div className="flex items-center justify-between mb-6">
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>导出作品</h3>
          <button onClick={onClose} className="btn-ghost p-2" aria-label="关闭"><i className="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>选择导出格式</p>
          <div className="grid grid-cols-2 gap-3">
            {EXPORT_FORMATS.map((f) => (
              <div
                key={f.id}
                onClick={() => !f.disabled && setFormat(f.id)}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: `1px solid ${format === f.id ? f.color : 'rgba(255,255,255,0.1)'}`,
                  background: format === f.id ? `${f.color}15` : 'rgba(255,255,255,0.03)',
                  cursor: f.disabled ? 'not-allowed' : 'pointer',
                  opacity: f.disabled ? 0.5 : 1,
                }}
                role="button"
                aria-disabled={f.disabled}
              >
                <i className={`fa-solid ${f.icon}`} style={{ color: f.color, fontSize: '20px', marginBottom: '8px' }} aria-hidden="true"></i>
                <p style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>{f.name}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">取消</button>
          <button onClick={handleExport} disabled={isExporting} className="btn-accent">
            {isExporting ? <><i className="fa-solid fa-spinner animate-spin mr-2" aria-hidden="true"></i>导出中...</> : <><i className="fa-solid fa-download mr-2" aria-hidden="true"></i>导出</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportDialog({ novelId, onClose }: { novelId: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('xuanhuan');
  const [content, setContent] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setContent(ev.target?.result as string || '');
        if (!title) {
          setTitle(file.name.replace(/\.(txt|md)$/i, ''));
        }
      };
      reader.readAsText(file);
    }
  };

  const handleImport = async () => {
    if (!title.trim() || !content.trim()) {
      alert('请填写标题并选择文件');
      return;
    }
    setIsImporting(true);
    try {
      const token = (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
      const fileType = content.includes('#') ? 'md' : 'txt';
      const response = await fetch('/api/v1/novels/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ title: title.trim(), genre, file_content: content, file_type: fileType }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`成功导入${data.data.chapters_imported}章，共${data.data.total_words}字`);
        onClose();
        window.location.reload();
      } else {
        const err = await response.json();
        alert(err.error?.message || '导入失败');
      }
    } catch (err) {
      console.error('Import error:', err);
      alert('导入失败，请重试');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-card" style={{ width: '520px', padding: '24px' }}>
        <div className="flex items-center justify-between mb-6">
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>导入章节</h3>
          <button onClick={onClose} className="btn-ghost p-2" aria-label="关闭"><i className="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <div className="space-y-4">
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'block', marginBottom: '8px' }}>作品标题</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input-field w-full" placeholder="输入作品标题" />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'block', marginBottom: '8px' }}>题材分类</label>
            <StyledSelect value={genre} onChange={setGenre} options={Object.entries(genres).map(([k, g]) => ({ value: k, label: g.label, color: g.color }))} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'block', marginBottom: '8px' }}>选择文件</label>
            <input ref={fileInputRef} type="file" accept=".txt,.md" onChange={handleFileSelect} className="hidden" />
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '24px', borderRadius: '12px', border: '2px dashed rgba(255,255,255,0.1)', textAlign: 'center', cursor: 'pointer' }}
            >
              {content ? (
                <div>
                  <i className="fa-solid fa-file-check" style={{ color: '#34d399', fontSize: '24px', marginBottom: '8px' }} aria-hidden="true"></i>
                  <p style={{ color: 'var(--text-primary)', fontSize: '14px' }}>已选择文件</p>
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '4px' }}>{content.length} 字符</p>
                </div>
              ) : (
                <div>
                  <i className="fa-solid fa-cloud-arrow-up" style={{ color: 'var(--text-tertiary)', fontSize: '24px', marginBottom: '8px' }} aria-hidden="true"></i>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>点击选择TXT或Markdown文件</p>
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '4px' }}>支持自动识别章节结构</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost">取消</button>
          <button onClick={handleImport} disabled={isImporting || !title.trim() || !content.trim()} className="btn-accent" style={{ opacity: (!title.trim() || !content.trim()) ? 0.5 : 1 }}>
            {isImporting ? <><i className="fa-solid fa-spinner animate-spin mr-2" aria-hidden="true"></i>导入中...</> : <><i className="fa-solid fa-upload mr-2" aria-hidden="true"></i>导入</>}
          </button>
        </div>
      </div>
    </div>
  );
}