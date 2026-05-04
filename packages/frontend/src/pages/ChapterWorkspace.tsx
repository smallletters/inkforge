/**
 * 灵砚 InkForge - 章节工作区页面
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-29
 * 
 * 功能描述：章节编辑和审计工作区，三栏布局，支持实时管线状态展示
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSSE } from '../hooks/useSSE';
import { useSubscription } from '../hooks/useSubscription';

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  radar: '策划Radar',
  planner: '大纲师',
  composer: '编剧',
  architect: '架构师',
  writer: '写手',
  observer: '资料员',
  reflector: '审核员',
  normalizer: '校对员',
  auditor: '审计员',
  reviser: '修订者',
};

const PIPELINE_AGENTS_DEFAULT = [
  { name: 'radar', status: 'pending' },
  { name: 'planner', status: 'pending' },
  { name: 'composer', status: 'pending' },
  { name: 'architect', status: 'pending' },
  { name: 'writer', status: 'pending' },
  { name: 'observer', status: 'pending' },
  { name: 'reflector', status: 'pending' },
  { name: 'normalizer', status: 'pending' },
  { name: 'auditor', status: 'pending' },
  { name: 'reviser', status: 'pending' },
];

export default function ChapterWorkspace() {
  const { id, chapterNumber } = useParams<{ id: string; chapterNumber: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const { isPro, features } = useSubscription();
  const { pipelineStatus, isConnected, resetPipeline } = useSSE(id);

  const { data: chapter, isLoading, error } = useQuery({
    queryKey: ['chapter', id, chapterNumber],
    queryFn: () => api.novels.chapter(id!, Number(chapterNumber!)),
    enabled: !!id && !!chapterNumber,
  });

  const { data: chapters } = useQuery({
    queryKey: ['chapters', id],
    queryFn: () => api.novels.chapters(id!),
    enabled: !!id,
    select: (data: any[]) => {
      const seen = new Set<number>();
      return data.filter(ch => {
        if (seen.has(ch.chapter_number)) return false;
        seen.add(ch.chapter_number);
        return true;
      });
    },
  });

  const writeNextMutation = useMutation({
    mutationFn: () => api.novels.writeNext(id!),
    onSuccess: () => {
      resetPipeline();
      queryClient.invalidateQueries({ queryKey: ['chapters', id] });
    },
  });

  const saveChapterMutation = useMutation({
    mutationFn: (content: string) => api.novels.updateChapter(id!, Number(chapterNumber!), content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chapter', id, chapterNumber] });
      setIsEditing(false);
    },
  });

  // 生成本地存储的key
  const localStorageKey = `chapter-${id}-${chapterNumber}`;

  // 当章节加载时，初始化编辑内容和标题
  useEffect(() => {
    if (chapter?.content) {
      const savedContent = localStorage.getItem(localStorageKey);
      if (savedContent && savedContent !== chapter.content) {
        setEditContent(savedContent);
        setHasUnsavedChanges(true);
      } else {
        setEditContent(chapter.content);
      }
      setEditTitle(chapter.title || '');
    } else if (chapter) {
      setEditTitle(chapter.title || '');
    }
  }, [chapter?.content, chapter?.title, localStorageKey]);

  // 自动保存到本地存储
  useEffect(() => {
    if (isEditing && editContent) {
      const timer = setTimeout(() => {
        localStorage.setItem(localStorageKey, editContent);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [editContent, isEditing, localStorageKey]);

  // 历史记录管理
  const pushToHistory = (content: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(content);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // 处理内容变化
  const handleContentChange = (value: string) => {
    if (historyIndex === -1 || value !== history[historyIndex]) {
      pushToHistory(editContent);
    }
    setEditContent(value);
    setHasUnsavedChanges(true);
  };

  // 撤销
  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setEditContent(history[historyIndex - 1]);
      setHasUnsavedChanges(true);
    }
  };

  // 重做
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setEditContent(history[historyIndex + 1]);
      setHasUnsavedChanges(true);
    }
  };

  // 格式化文本
  const formatText = (formatType: 'bold' | 'italic' | 'underline') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = editContent.substring(start, end);

    let newText = '';
    switch (formatType) {
      case 'bold':
        newText = `**${selectedText}**`;
        break;
      case 'italic':
        newText = `*${selectedText}*`;
        break;
      case 'underline':
        newText = `__${selectedText}__`;
        break;
    }

    const newContent = editContent.substring(0, start) + newText + editContent.substring(end);
    handleContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + newText.length);
    }, 0);
  };

  // 计算字数（不含空格和换行）
  const countWords = (text: string) => {
    return text.replace(/\s/g, '').length;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveChapterMutation.mutateAsync(editContent);
      localStorage.removeItem(localStorageKey);
      setHasUnsavedChanges(false);
      setHistory([]);
      setHistoryIndex(-1);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditContent(chapter?.content || '');
    setEditTitle(chapter?.title || '');
    setIsEditing(false);
    setIsEditingTitle(false);
    setHasUnsavedChanges(false);
    localStorage.removeItem(localStorageKey);
    setHistory([]);
    setHistoryIndex(-1);
  };

  const toggleEdit = () => {
    if (!isEditing) {
      setEditContent(chapter?.content || '');
      setEditTitle(chapter?.title || '');
      setHistory([chapter?.content || '']);
      setHistoryIndex(0);
    }
    setIsEditing(!isEditing);
  };

  // 章节统计
  const getChapterStats = (text: string) => {
    const wordCount = countWords(text);
    const paragraphCount = text.split('\n').filter(p => p.trim()).length;
    const readingTime = Math.ceil(wordCount / 300); // 假设每分钟读300字
    return { wordCount, paragraphCount, readingTime };
  };

  // 上一章导航
  const goToPrevChapter = () => {
    const currentNum = Number(chapterNumber);
    if (currentNum > 1) {
      navigate(`/novels/${id}/chapters/${currentNum - 1}`);
    }
  };

  // 下一章导航
  const goToNextChapter = () => {
    const currentNum = Number(chapterNumber);
    if (chapters && currentNum < chapters.length) {
      navigate(`/novels/${id}/chapters/${currentNum + 1}`);
    }
  };

  // 当管线完成时，刷新章节数据
  useEffect(() => {
    if (pipelineStatus?.status === 'completed' || pipelineStatus?.status === 'failed') {
      queryClient.invalidateQueries({ queryKey: ['chapters', id] });
      if (pipelineStatus?.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: ['chapter', id, chapterNumber] });
      }
    }
  }, [pipelineStatus?.status, id, chapterNumber, queryClient]);

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  };

  const totalDuration = pipelineStatus?.agents.reduce((acc, a) => acc + (a.duration || 0), 0) || 0;

  return (
    <div className="min-h-screen noise-overlay" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* 顶栏 */}
      <header style={{ background: 'rgba(9,9,11,0.9)', borderBottom: '1px solid var(--border-subtle)', backdropFilter: 'blur(16px)', height: '56px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', zIndex: 10 }} role="banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate(`/novels/${id}`)} className="text-sm flex items-center gap-1.5 transition-colors duration-200" style={{ color: 'var(--text-tertiary)', textDecoration: 'none', fontSize: '13px' }} aria-label="返回作品详情">
            <i className="fa-solid fa-chevron-left" style={{ marginRight: '6px' }} aria-hidden="true"></i>吞天魔帝
          </button>
          <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} aria-hidden="true"></div>
          
          {/* 上一章/下一章导航 */}
          <button 
            onClick={goToPrevChapter} 
            className="btn-ghost" 
            style={{ padding: '4px 8px', fontSize: '12px' }}
            disabled={Number(chapterNumber) <= 1}
            title="上一章"
          >
            <i className="fa-solid fa-chevron-left" aria-hidden="true"></i>
          </button>
          <button 
            onClick={goToNextChapter} 
            className="btn-ghost" 
            style={{ padding: '4px 8px', fontSize: '12px' }}
            disabled={!chapters || Number(chapterNumber) >= chapters.length}
            title="下一章"
          >
            <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </button>
          
          <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} aria-hidden="true"></div>
          
          {/* 章节标题编辑 */}
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editTitle}
              onChange={(e) => {
                setEditTitle(e.target.value);
                if (isEditing) setHasUnsavedChanges(true);
              }}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsEditingTitle(false);
              }}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--accent)',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '14px',
                fontWeight: '500',
                color: 'var(--text-primary)',
                outline: 'none',
                minWidth: '200px'
              }}
              placeholder={`第${chapterNumber}章`}
              autoFocus
            />
          ) : (
            <span 
              style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', border: '1px solid transparent' }}
              onDoubleClick={() => {
                setEditTitle(chapter?.title || '');
                setIsEditingTitle(true);
              }}
              title="双击编辑标题"
            >
              {chapter?.title || `第${chapterNumber}章`}
            </span>
          )}
          
          {/* 未保存提示 */}
          {hasUnsavedChanges && (
            <span className="badge badge-accent" style={{ fontSize: '10px' }}>
              <i className="fa-solid fa-circle mr-1" aria-hidden="true"></i>未保存
            </span>
          )}
          
          {chapter?.status === 'reviewing' && (
            <span className="badge badge-accent" style={{ fontSize: '10px' }}>待确认</span>
          )}
          {pipelineStatus?.status === 'running' && (
            <span className="badge badge-blue" style={{ fontSize: '10px' }}>
              <i className="fa-solid fa-spinner animate-spin" style={{ fontSize: '8px', marginRight: '4px' }} aria-hidden="true"></i>
              生成中
            </span>
          )}
          {isPro && (
            <span className="badge badge-green" style={{ fontSize: '10px' }}>
              <i className="fa-solid fa-crown mr-1" aria-hidden="true"></i>专业版
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isEditing ? (
            <>
              <button 
                className="btn-ghost" 
                style={{ padding: '6px 14px', fontSize: '12px' }}
                onClick={handleCancel}
              >
                取消
              </button>
              <button 
                className="btn-accent" 
                style={{ padding: '6px 16px', fontSize: '12px' }}
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <><i className="fa-solid fa-spinner animate-spin mr-1" aria-hidden="true"></i>保存中...</>
                ) : (
                  <><i className="fa-solid fa-check mr-1" aria-hidden="true"></i>保存</>
                )}
              </button>
            </>
          ) : (
            <>
              <button 
                className="btn-ghost" 
                style={{ padding: '6px 14px', fontSize: '12px' }}
                onClick={toggleEdit}
                disabled={pipelineStatus?.status === 'running'}
              >
                <i className="fa-regular fa-pen-to-square" aria-hidden="true"></i>编辑
              </button>
              {pipelineStatus?.status === 'running' ? (
                <button disabled className="btn-accent" style={{ padding: '6px 16px', fontSize: '12px', opacity: 0.6, cursor: 'not-allowed' }}>
                  <i className="fa-solid fa-spinner animate-spin" aria-hidden="true"></i>生成中...
                </button>
              ) : (
                features.advanced_pipeline ? (
                  <button 
                    className="btn-accent" 
                    style={{ padding: '6px 16px', fontSize: '12px' }}
                    onClick={() => writeNextMutation.mutate()}
                  >
                    <i className="fa-solid fa-plus" aria-hidden="true"></i>写下一章
                  </button>
                ) : (
                  <button 
                    disabled 
                    className="btn-accent" 
                    style={{ padding: '6px 16px', fontSize: '12px', opacity: 0.5, cursor: 'not-allowed' }}
                    title="专业版功能"
                  >
                    <i className="fa-solid fa-lock mr-1" aria-hidden="true"></i>写下一章
                  </button>
                )
              )}
            </>
          )}
        </div>
      </header>

      {/* 三栏 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 左侧栏 */}
        <aside className="ch-sidebar" aria-label="章节列表" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>章节</span>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{chapters?.length || 0}章</span>
            </div>
            <div style={{ position: 'relative' }}>
              <i className="fa-solid fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '11px' }} aria-hidden="true"></i>
              <input
                type="search"
                placeholder="搜索章节..."
                style={{ width: '100%', background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', padding: '7px 14px 7px 30px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-sans)' }}
                aria-label="搜索章节"
              />
            </div>
          </div>
          <div role="list" aria-label="章节目录" style={{ flex: 1, overflow: 'auto' }}>
            {chapters?.map((ch: any) => {
              const isActive = ch.chapter_number === Number(chapterNumber);
              const isGenerating = ch.status === 'generating' || (pipelineStatus?.status === 'running' && ch.chapter_number === chapters.length + 1);
              return (
                <div
                  key={ch.chapter_number}
                  className={`ch-item ${isActive ? 'active' : ''}`}
                  onClick={() => !isGenerating && navigate(`/novels/${id}/chapters/${ch.chapter_number}`)}
                  role="listitem"
                  tabIndex={0}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={`第${ch.chapter_number}章 ${ch.title || ''}，${isGenerating ? '正在生成中' : ch.status === 'published' ? '已发布' : ch.status === 'reviewing' ? '待确认' : '审计中'}`}
                >
                  <span style={{ fontSize: '11px', color: isActive ? '#60a5fa' : 'var(--text-tertiary)', width: '28px' }}>#{String(ch.chapter_number).padStart(2, '0')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', color: isActive ? 'var(--text-primary)' : isGenerating ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontWeight: isActive ? '500' : 'normal' }}>
                      {isGenerating ? '正在生成中...' : (ch.title || `第${ch.chapter_number}章`)}
                    </p>
                    <p style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                      {ch.word_count ? `${ch.word_count.toLocaleString()}字` : '—'}
                    </p>
                  </div>
                  {ch.status === 'published' && (
                    <i className="fa-solid fa-check-circle" style={{ color: '#34d399', fontSize: '10px' }} aria-hidden="true"></i>
                  )}
                  {ch.status === 'reviewing' && (
                    <i className="fa-regular fa-clock" style={{ color: 'var(--accent)', fontSize: '10px' }} aria-hidden="true"></i>
                  )}
                  {isGenerating && (
                    <i className="fa-solid fa-spinner animate-spin" style={{ color: '#60a5fa', fontSize: '10px' }} aria-hidden="true"></i>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* 底部状态栏 - 固定在底部 */}
          {chapter && (
            <div style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: '11px',
              color: 'var(--text-tertiary)',
              background: 'rgba(255,255,255,0.02)',
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              {(() => {
                const stats = getChapterStats(chapter?.content || '');
                return (
                  <>
                    {!isEditing && chapter?.updated_at && (
                      <span style={{ fontSize: '10px' }}>
                        更新: {new Date(chapter.updated_at).toLocaleDateString('zh-CN')}
                      </span>
                    )}
                    <span>
                      <i className="fa-solid fa-font mr-1" aria-hidden="true"></i>
                      {stats.wordCount}字
                    </span>
                  </>
                );
              })()}
            </div>
          )}
        </aside>

        {/* 中间正文 */}
        <main className="content-area" role="main" aria-label="章节正文">
          
          <div className="content-text">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <i className="fa-solid fa-spinner animate-spin text-2xl" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <i className="fa-solid fa-file-circle-xmark text-4xl mb-4" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true"></i>
                <h3 style={{ color: 'var(--text-secondary)', fontSize: '16px', marginBottom: '8px' }}>章节不存在</h3>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', marginBottom: '16px' }}>
                  第{chapterNumber}章尚未创建，请先生成章节
                </p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => navigate(`/novels/${id}`)}
                    className="btn-ghost" 
                    style={{ padding: '8px 16px', fontSize: '12px' }}
                  >
                    返回作品
                  </button>
                  {features.advanced_pipeline ? (
                    <button 
                      onClick={() => writeNextMutation.mutate()}
                      disabled={writeNextMutation.isPending}
                      className="btn-accent" 
                      style={{ padding: '8px 16px', fontSize: '12px' }}
                    >
                      {writeNextMutation.isPending ? (
                        <><i className="fa-solid fa-spinner animate-spin mr-2" aria-hidden="true"></i>生成中...</>
                      ) : (
                        <><i className="fa-solid fa-plus mr-2" aria-hidden="true"></i>生成第一章</>
                      )}
                    </button>
                  ) : (
                    <button 
                      disabled
                      className="btn-accent" 
                      style={{ padding: '8px 16px', fontSize: '12px', opacity: 0.5, cursor: 'not-allowed' }}
                      title="专业版功能"
                    >
                      <i className="fa-solid fa-lock mr-1" aria-hidden="true"></i>生成第一章
                    </button>
                  )}
                </div>
              </div>
            ) : isEditing ? (
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => handleContentChange(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '16px',
                  lineHeight: '1.8',
                  color: 'var(--text-primary)',
                  resize: 'none',
                  fontFamily: 'var(--font-serif)',
                  padding: '0'
                }}
                placeholder="开始写作..."
                aria-label="章节内容编辑器"
              />
            ) : chapter?.content ? (
              <>
                {chapter.content.split('\n').map((p: string, index: number) => (
                  <p key={index}>{p || '\u00A0'}</p>
                ))}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <i className="fa-solid fa-file-lines text-4xl mb-4" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true"></i>
                <h3 style={{ color: 'var(--text-secondary)', fontSize: '16px', marginBottom: '8px' }}>章节暂无内容</h3>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
                  点击右上角"编辑"开始写作
                </p>
                {features.advanced_pipeline && (
                  <button 
                    onClick={toggleEdit}
                    className="btn-accent mt-4" 
                    style={{ padding: '8px 16px', fontSize: '12px' }}
                  >
                    <i className="fa-solid fa-pen-to-square mr-2" aria-hidden="true"></i>开始写作
                  </button>
                )}
              </div>
            )}
          </div>
        </main>

        {/* 右侧审计 */}
        <aside className="audit-panel" aria-label="审计面板">
          {/* 管线状态 - 实时更新 */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div className={`pulse-dot ${isConnected ? '' : 'offline'}`} aria-hidden="true"></div>
              <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>管线状态</span>
              <span className={`badge ${pipelineStatus?.status === 'completed' ? 'badge-green' : pipelineStatus?.status === 'failed' ? 'badge-red' : 'badge-blue'}`} style={{ marginLeft: 'auto', fontSize: '9px' }}>
                {pipelineStatus?.status === 'completed' ? '完成' : pipelineStatus?.status === 'failed' ? '失败' : pipelineStatus?.status === 'running' ? '执行中' : '空闲'}
              </span>
            </div>
            
            {/* 进度条 */}
            {pipelineStatus && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                  <span>进度</span>
                  <span>{pipelineStatus.progress}%</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      height: '100%', 
                      background: 'linear-gradient(90deg, #60a5fa, #818cf8)',
                      width: `${pipelineStatus.progress}%`,
                      transition: 'width 0.3s ease-out'
                    }}
                  />
                </div>
              </div>
            )}

            {/* Agent执行列表 - 始终显示 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {(pipelineStatus?.agents || PIPELINE_AGENTS_DEFAULT).map((agent: any) => (
                <div
                  key={typeof agent === 'string' ? agent : agent.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    background: agent?.status === 'running' ? 'rgba(96,165,250,0.1)' : 'transparent'
                  }}
                >
                  {agent?.status === 'completed' && <i className="fa-solid fa-check-circle" style={{ color: '#34d399', fontSize: '10px' }} aria-hidden="true" />}
                  {agent?.status === 'running' && <i className="fa-solid fa-spinner animate-spin" style={{ color: '#60a5fa', fontSize: '10px' }} aria-hidden="true" />}
                  {agent?.status === 'failed' && <i className="fa-solid fa-circle-xmark" style={{ color: '#f87171', fontSize: '10px' }} aria-hidden="true" />}
                  {(agent?.status === 'pending' || !agent?.status) && <i className="fa-solid fa-circle" style={{ color: 'var(--text-tertiary)', fontSize: '5px' }} aria-hidden="true" />}
                  <span style={{ color: agent?.status === 'running' ? '#60a5fa' : 'var(--text-secondary)' }}>
                    {AGENT_DISPLAY_NAMES[typeof agent === 'string' ? agent : agent?.name] || (typeof agent === 'string' ? agent : agent?.name)}
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '10px' }}>
                    {formatDuration(agent?.duration)}
                  </span>
                </div>
              ))}
            </div>
            
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>总耗时 {formatDuration(totalDuration)}</span>
              <span style={{ color: pipelineStatus?.status === 'completed' ? '#34d399' : pipelineStatus?.status === 'failed' ? '#f87171' : '#60a5fa' }}>
                <i className="fa-solid fa-circle" style={{ fontSize: '5px', marginRight: '4px', verticalAlign: 'middle' }} aria-hidden="true"></i>
                {pipelineStatus?.status === 'completed' ? '管线完成' : pipelineStatus?.status === 'failed' ? '执行失败' : '正在执行'}
              </span>
            </div>
          </div>

          {/* 审计报告 */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>审计报告</span>
              {chapter?.audit_report && Object.keys(chapter.audit_report).length > 0 ? (
                <span className="badge badge-accent" style={{ fontSize: '9px' }}>
                  {((chapter.audit_report as any)?.issues?.length || 0) > 0
                    ? `${((chapter.audit_report as any)?.issues?.filter((i: any) => i.severity === 'minor' || i.severity === 'suggestion').length || 0)}个次要`
                    : '全部通过'}
                </span>
              ) : (
                <span className="badge badge-green" style={{ fontSize: '9px' }}>暂无数据</span>
              )}
            </div>
            {chapter?.audit_report && Object.keys(chapter.audit_report).length > 0 ? (
              <>
                {((chapter.audit_report as any)?.checks || []).map((check: any, idx: number) => (
                  <div key={idx} className="dim-row">
                    <span style={{ color: 'var(--text-secondary)' }}>{check.name}</span>
                    <span className={`badge ${check.status === 'pass' ? 'badge-green' : check.status === 'warn' ? 'badge-accent' : 'badge-red'}`} style={{ fontSize: '10px' }}>
                      {check.status === 'pass' ? '通过' : check.status === 'warn' ? check.message : '未通过'}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="dim-row"><span style={{ color: 'var(--text-secondary)' }}>角色记忆</span><span className="badge badge-green" style={{ fontSize: '10px' }}>通过</span></div>
                <div className="dim-row"><span style={{ color: 'var(--text-secondary)' }}>物资连续性</span><span className="badge badge-green" style={{ fontSize: '10px' }}>通过</span></div>
                <div className="dim-row"><span style={{ color: 'var(--text-secondary)' }}>伏笔回收</span><span className="badge badge-accent" style={{ fontSize: '10px' }}>1个新伏笔</span></div>
                <div className="dim-row"><span style={{ color: 'var(--text-secondary)' }}>大纲偏离</span><span className="badge badge-green" style={{ fontSize: '10px' }}>通过</span></div>
                <div className="dim-row"><span style={{ color: 'var(--text-secondary)' }}>叙事节奏</span><span className="badge badge-green" style={{ fontSize: '10px' }}>通过</span></div>
                <div className="dim-row"><span style={{ color: 'var(--text-secondary)' }}>情感弧线</span><span className="badge badge-green" style={{ fontSize: '10px' }}>通过</span></div>
                <div className="dim-row"><span style={{ color: 'var(--text-secondary)' }}>AI痕迹检测</span><span className="badge badge-green" style={{ fontSize: '10px' }}>通过</span></div>
              </>
            )}
          </div>

          {/* 问题 */}
          <div style={{ padding: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>待处理</span>
            {(chapter?.audit_report as any)?.issues?.length > 0 ? (
              ((chapter.audit_report as any)?.issues || []).slice(0, 3).map((issue: any, idx: number) => (
                <div key={idx} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <i className="fa-solid fa-circle-exclamation" style={{ color: issue.severity === 'minor' || issue.severity === 'suggestion' ? 'var(--accent)' : '#f87171', fontSize: '10px', marginTop: '3px' }} aria-hidden="true"></i>
                    <div>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{issue.description}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                        {issue.type} · {issue.severity === 'minor' ? '次要' : issue.severity === 'suggestion' ? '建议' : '重要'}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <i className="fa-solid fa-circle-exclamation" style={{ color: 'var(--accent)', fontSize: '10px', marginTop: '3px' }} aria-hidden="true"></i>
                  <div><p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>伏笔"天机阁"在第42章埋设后，本章未做任何呼应</p><p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>伏笔回收 · 次要</p></div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              {features.advanced_pipeline ? (
                <>
                  <button className="btn-accent" style={{ flex: 1, padding: '8px', fontSize: '12px' }}>自动修订</button>
                  <button className="btn-ghost" style={{ flex: 1, padding: '8px', fontSize: '12px' }}>忽略</button>
                </>
              ) : (
                <>
                  <button disabled className="btn-accent" style={{ flex: 1, padding: '8px', fontSize: '12px', opacity: 0.5, cursor: 'not-allowed' }} title="专业版功能">
                    <i className="fa-solid fa-lock mr-1" aria-hidden="true"></i>自动修订
                  </button>
                  <button className="btn-ghost" style={{ flex: 1, padding: '8px', fontSize: '12px' }}>忽略</button>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
