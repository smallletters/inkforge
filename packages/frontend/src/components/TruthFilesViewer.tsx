/**
 * 灵砚 InkForge - 记忆文件查看器
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 *
 * 功能描述：展示和管理作品记忆文件，支持版本历史和Markdown渲染
 */
import { useState, useEffect } from 'react';
import { api, ApiError } from '../lib/api';

const TRUTH_FILE_NAMES: Record<string, string> = {
  current_state: '世界状态',
  particle_ledger: '资源账本',
  pending_hooks: '未闭合伏笔',
  chapter_summaries: '各章摘要',
  subplot_board: '支线进度板',
  emotional_arcs: '情感弧线',
  character_matrix: '角色交互矩阵',
};

const TRUTH_FILE_DESCRIPTIONS: Record<string, string> = {
  current_state: '记录世界观规则、当前情节状态和重要事件',
  particle_ledger: '追踪故事中的关键元素和资源',
  pending_hooks: '记录已埋设但尚未回收的伏笔',
  chapter_summaries: '各章节内容摘要和关键情节点',
  subplot_board: '追踪各支线剧情的进展',
  emotional_arcs: '记录角色情感变化曲线',
  character_matrix: '记录角色之间的关系和互动',
};

interface TruthFile {
  name: string;
  version: number;
  content: Record<string, unknown>;
  updated_at: string;
}

interface VersionInfo {
  file_name: string;
  title: string;
  current_version: number;
  versions: {
    version: number;
    updated_at: string;
    description: string;
  }[];
}

export function TruthFilesViewer({ novelId }: { novelId: string }) {
  const [files, setFiles] = useState<{ file_name: string; version: number; updated_at: string }[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('current_state');
  const [content, setContent] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<VersionInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState<string>('');

  useEffect(() => {
    loadFileList();
  }, [novelId]);

  useEffect(() => {
    if (selectedFile) {
      loadFileContent(selectedFile);
    }
  }, [selectedFile, novelId]);

  const loadFileList = async () => {
    try {
      const data = await api.truthFiles.list(novelId) as { files: { file_name: string; version: number; updated_at: string }[] };
      if (data.files && data.files.length === 0) {
        await api.truthFiles.init(novelId);
        loadFileList();
        return;
      }
      setFiles(data.files || []);
    } catch (err) {
      console.error('Failed to load file list:', err);
    }
  };

  const loadFileContent = async (fileName: string, format: 'json' | 'markdown' = 'json') => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.truthFiles.get(novelId, fileName) as TruthFile;
      setContent(data.content);
      setEditContent(JSON.stringify(data.content, null, 2));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('加载文件失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async (fileName: string) => {
    try {
      const data = await api.truthFiles.getVersions(novelId, fileName);
      setVersions(data as VersionInfo);
      setShowVersions(true);
    } catch (err) {
      console.error('Failed to load versions:', err);
    }
  };

  const handleRollback = async (version: number) => {
    if (!window.confirm(`确定要回滚到版本 ${version} 吗？`)) return;

    try {
      await api.truthFiles.rollback(novelId, selectedFile, version);
      await loadFileContent(selectedFile);
      await loadFileList();
      setShowVersions(false);
    } catch (err) {
      console.error('Failed to rollback:', err);
      alert('回滚失败');
    }
  };

  const handleSave = async () => {
    try {
      const parsed = JSON.parse(editContent);
      await api.truthFiles.update(novelId, selectedFile, parsed);
      setContent(parsed);
      setEditing(false);
      await loadFileList();
    } catch (err) {
      console.error('Failed to save:', err);
      alert('保存失败，请检查JSON格式');
    }
  };

  const renderContent = (data: Record<string, unknown> | null): string => {
    if (!data) return '';

    const fileRenderer: Record<string, (data: unknown) => string> = {
      current_state: (d) => {
        const s = d as { world_name?: string; rules?: string[]; current_plot?: string; key_events?: string[] };
        return `# 世界状态\n\n**世界名称**: ${s.world_name || '未命名'}\n\n## 规则\n${(s.rules || []).map(r => `- ${r}`).join('\n')}\n\n## 当前剧情\n${s.current_plot || '暂无'}\n\n## 关键事件\n${(s.key_events || []).map(e => `- ${e}`).join('\n')}`;
      },
      particle_ledger: (d) => {
        const p = d as { particles?: { name: string; type: string; status: string; introduced_chapter?: number }[] };
        return `# 资源账本\n\n## 粒子列表\n${(p.particles || []).map(p => `| ${p.name} | ${p.type} | ${p.status} | ${p.introduced_chapter || '-'} |`).join('\n')}\n\n| 名称 | 类型 | 状态 | 引入章节 |`;
      },
      pending_hooks: (d) => {
        const h = d as { hooks?: { id: string; description: string; status: 'open' | 'resolved'; created_chapter?: number }[] };
        return `# 未闭合伏笔\n\n${(h.hooks || []).map(hook => `## ${hook.id}\n\n${hook.description}\n\n- 状态: ${hook.status === 'open' ? '🔴 未解决' : '🟢 已回收'}\n- 创建章节: ${hook.created_chapter || '-'}\n`).join('\n---\n')}`;
      },
      chapter_summaries: (d) => {
        const c = d as { chapters?: { number: number; title: string; summary: string; word_count: number }[] };
        return `# 各章摘要\n\n${(c.chapters || []).map(ch => `## 第${ch.number}章: ${ch.title}\n\n${ch.summary}\n\n*字数: ${ch.word_count}*`).join('\n\n---\n')}`;
      },
      subplot_board: (d) => {
        const s = d as { subplots?: { id: string; title: string; status: string; progress: number; related_characters?: string[] }[] };
        return `# 支线进度板\n\n${(s.subplots || []).map(sp => `## ${sp.title}\n\n- 进度: ${sp.progress}%\n- 状态: ${sp.status}\n- 关联角色: ${(sp.related_characters || []).join(', ') || '无'}\n`).join('\n---\n')}`;
      },
      emotional_arcs: (d) => {
        const e = d as { arcs?: { character: string; arc: { chapter: number; emotion: string; intensity: number }[] }[] };
        return `# 情感弧线\n\n${(e.arcs || []).map(arc => `## ${arc.character}\n\n${arc.arc.map(a => `- 第${a.chapter}章: ${a.emotion} (强度: ${a.intensity}/10)`).join('\n')}`).join('\n\n---\n')}`;
      },
      character_matrix: (d) => {
        const m = d as { relationships?: { from: string; to: string; type: string; strength: number; notes?: string }[] };
        return `# 角色交互矩阵\n\n| 角色A | 角色B | 关系类型 | 强度 | 备注 |\n|-------|-------|----------|------|------|\n${(m.relationships || []).map(r => `| ${r.from} | ${r.to} | ${r.type} | ${r.strength} | ${r.notes || '-'} |`).join('\n')}`;
      },
    };

    const renderer = fileRenderer[selectedFile];
    if (renderer) {
      return renderer(data);
    }

    return JSON.stringify(data, null, 2);
  };

  return (
    <div className="truth-files-viewer">
      <div className="truth-files-sidebar">
        <h3>记忆文件</h3>
        <ul className="truth-file-list">
          {Object.entries(TRUTH_FILE_NAMES).map(([key, label]) => {
            const fileInfo = files.find(f => f.file_name === key);
            return (
              <li
                key={key}
                className={`truth-file-item ${selectedFile === key ? 'active' : ''}`}
                onClick={() => setSelectedFile(key)}
              >
                <span className="file-label">{label}</span>
                {fileInfo && <span className="file-version">v{fileInfo.version}</span>}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="truth-files-content">
        <div className="content-header">
          <div>
            <h2>{TRUTH_FILE_NAMES[selectedFile]}</h2>
            <p className="file-description">{TRUTH_FILE_DESCRIPTIONS[selectedFile]}</p>
          </div>
          <div className="content-actions">
            <button onClick={() => loadVersions(selectedFile)} className="btn-secondary">
              版本历史
            </button>
            <button onClick={() => setEditing(!editing)} className="btn-secondary">
              {editing ? '取消' : '编辑'}
            </button>
            {editing && (
              <button onClick={handleSave} className="btn-primary">
                保存
              </button>
            )}
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading">加载中...</div>
        ) : editing ? (
          <textarea
            className="content-editor"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <div className="content-display">
            <pre>{renderContent(content)}</pre>
          </div>
        )}

        {content && !editing && (
          <div className="content-footer">
            <span>版本: {files.find(f => f.file_name === selectedFile)?.version || 1}</span>
            <span>
              更新: {files.find(f => f.file_name === selectedFile)?.updated_at
                ? new Date(files.find(f => f.file_name === selectedFile)!.updated_at).toLocaleString()
                : '未知'}
            </span>
          </div>
        )}
      </div>

      {showVersions && versions && (
        <div className="versions-modal">
          <div className="versions-modal-content">
            <div className="versions-modal-header">
              <h3>{versions.title} - 版本历史</h3>
              <button onClick={() => setShowVersions(false)}>×</button>
            </div>
            <div className="versions-list">
              {versions.versions.map((v) => (
                <div key={v.version} className="version-item">
                  <div className="version-info">
                    <span className="version-number">版本 {v.version}</span>
                    <span className="version-date">{new Date(v.updated_at).toLocaleString()}</span>
                    <span className="version-desc">{v.description}</span>
                  </div>
                  {v.version < versions.current_version && (
                    <button
                      onClick={() => handleRollback(v.version)}
                      className="btn-small"
                    >
                      回滚到此版本
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .truth-files-viewer {
          display: flex;
          height: 100%;
          background: #1a1a2e;
          color: #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
        }

        .truth-files-sidebar {
          width: 220px;
          background: #16213e;
          padding: 16px;
          border-right: 1px solid #0f3460;
        }

        .truth-files-sidebar h3 {
          margin: 0 0 16px 0;
          font-size: 14px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .truth-file-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .truth-file-item {
          padding: 12px;
          cursor: pointer;
          border-radius: 6px;
          margin-bottom: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.2s;
        }

        .truth-file-item:hover {
          background: #0f3460;
        }

        .truth-file-item.active {
          background: #0f3460;
          color: #00d9ff;
        }

        .file-version {
          font-size: 11px;
          background: #0f3460;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .truth-files-content {
          flex: 1;
          padding: 24px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .content-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
        }

        .content-header h2 {
          margin: 0 0 4px 0;
          font-size: 24px;
        }

        .file-description {
          margin: 0;
          color: #94a3b8;
          font-size: 14px;
        }

        .content-actions {
          display: flex;
          gap: 8px;
        }

        .btn-primary, .btn-secondary, .btn-small {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #00d9ff;
          color: #1a1a2e;
        }

        .btn-primary:hover {
          background: #00b8d9;
        }

        .btn-secondary {
          background: #0f3460;
          color: #e0e0e0;
        }

        .btn-secondary:hover {
          background: #1a4a7a;
        }

        .btn-small {
          padding: 4px 12px;
          background: #0f3460;
          color: #e0e0e0;
          font-size: 12px;
        }

        .content-display {
          flex: 1;
          overflow: auto;
          background: #16213e;
          border-radius: 8px;
          padding: 20px;
        }

        .content-display pre {
          margin: 0;
          white-space: pre-wrap;
          word-wrap: break-word;
          font-family: inherit;
          line-height: 1.6;
        }

        .content-editor {
          flex: 1;
          background: #16213e;
          border: 1px solid #0f3460;
          border-radius: 8px;
          padding: 20px;
          color: #e0e0e0;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 14px;
          line-height: 1.5;
          resize: none;
        }

        .content-footer {
          margin-top: 12px;
          display: flex;
          gap: 20px;
          font-size: 12px;
          color: #94a3b8;
        }

        .loading {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
        }

        .error-message {
          padding: 12px;
          background: rgba(255, 0, 0, 0.1);
          border: 1px solid #ff4444;
          border-radius: 6px;
          color: #ff6b6b;
          margin-bottom: 16px;
        }

        .versions-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .versions-modal-content {
          background: #16213e;
          border-radius: 12px;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow: hidden;
        }

        .versions-modal-header {
          padding: 20px;
          border-bottom: 1px solid #0f3460;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .versions-modal-header h3 {
          margin: 0;
        }

        .versions-modal-header button {
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 24px;
          cursor: pointer;
        }

        .versions-list {
          padding: 16px;
          overflow-y: auto;
          max-height: 60vh;
        }

        .version-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 8px;
          background: #0f3460;
        }

        .version-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .version-number {
          font-weight: 600;
        }

        .version-date {
          font-size: 12px;
          color: #94a3b8;
        }

        .version-desc {
          font-size: 12px;
          color: #64748b;
        }
      `}</style>
    </div>
  );
}