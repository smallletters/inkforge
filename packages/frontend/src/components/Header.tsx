/**
 * 灵砚 InkForge - 统一Header组件
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-30
 * 
 * 功能描述：所有页面共用的顶部导航栏组件
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import { api } from '../lib/api';

interface HeaderProps {
  currentPage: 'dashboard' | 'works' | 'agents' | 'models' | 'subscription';
}

const navItems = [
  { id: 'dashboard', label: '创作总览', path: '/', icon: 'fa-solid fa-grid-2' },
  { id: 'works', label: '作品管理', path: '/works', icon: 'fa-solid fa-book-open' },
  { id: 'agents', label: 'Agent配置', path: '/agents', icon: 'fa-solid fa-robot' },
  { id: 'models', label: '模型配置', path: '/models', icon: 'fa-solid fa-brain' },
  { id: 'subscription', label: '订阅', path: '/subscription', icon: 'fa-solid fa-crown' },
];

export default function Header({ currentPage }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout, updateUsername } = useAuthStore();
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateNovel, setShowCreateNovel] = useState(false);
  const [editUsername, setEditUsername] = useState(user?.username || '');

  const handleSaveUsername = () => {
    if (editUsername.trim()) {
      updateUsername(editUsername.trim());
      setShowSettings(false);
      setShowMenu(false);
    }
  };

  const handleCreateNovel = () => {
    setShowCreateNovel(true);
  };

  const confirmCreateNovel = async (title: string, genre: string) => {
    try {
      await api.novels.create({ title: title.trim(), genre });
      setShowCreateNovel(false);
      window.location.reload();
    } catch (error) {
      console.error('创建作品失败:', error);
    }
  };

  return (
    <header 
      className="sticky top-0 z-50" 
      style={{ 
        background: 'rgba(9,9,11,0.85)', 
        backdropFilter: 'blur(16px)', 
        borderBottom: '1px solid var(--border-subtle)',
        height: 'var(--height-header)'
      }} 
      role="banner"
    >
      <div style={{ width: '100%', padding: '0 100px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 group"
          aria-label="返回首页"
        >
          <div className="relative">
            <i className="fa-solid fa-feather text-lg transition-transform duration-300 group-hover:rotate-12" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
            <div className="absolute inset-0 blur-md opacity-0 group-hover:opacity-50 transition-opacity duration-300" style={{ background: 'var(--accent)' }} aria-hidden="true"></div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight" style={{ color: 'var(--text-primary)' }}>灵砚</span>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>InkForge</span>
          </div>
        </button>
        
        <nav className="flex items-center gap-1" aria-label="主导航">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`nav-item ${item.id === currentPage ? 'active' : ''}`}
              aria-current={item.id === currentPage ? 'page' : undefined}
            >
              <i className={item.icon} aria-hidden="true"></i>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 relative">
          <button 
            onClick={handleCreateNovel}
            className="btn-accent"
            aria-label="新建作品"
          >
            <i className="fa-solid fa-plus mr-1.5" aria-hidden="true"></i>新建作品
          </button>
          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-105"
              style={{ background: 'rgba(39,39,42,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}
              aria-label="用户菜单"
              aria-expanded={showMenu}
            >
              <i className="fa-solid fa-circle-user" style={{ color: 'var(--text-secondary)' }} aria-hidden="true"></i>
            </button>
            
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)}></div>
                <div className="absolute right-0 top-full mt-2 w-56 glass-card p-3 z-50 animate-fade-in-up" style={{ borderRadius: '14px' }}>
                  <div className="px-3 py-3 mb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>当前用户</p>
                    <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>{user?.username || '未设置用户名'}</p>
                  </div>
                  <button 
                    onClick={() => { setShowSettings(true); setEditUsername(user?.username || ''); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 hover:bg-white/5"
                    style={{ color: 'var(--text-secondary)', background: 'transparent' }}
                  >
                    <i className="fa-solid fa-gear w-4" aria-hidden="true"></i>账号设置
                  </button>
                  <button 
                    onClick={() => { logout(); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 hover:bg-red-500/10 hover:text-red-400"
                    style={{ color: 'var(--text-secondary)', background: 'transparent' }}
                  >
                    <i className="fa-solid fa-right-from-bracket w-4" aria-hidden="true"></i>退出登录
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showSettings && (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="glass-card p-6 w-full max-w-sm animate-fade-in-up" style={{ borderRadius: '16px' }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/15 to-amber-500/5 flex items-center justify-center">
                  <i className="fa-solid fa-user text-amber-400" aria-hidden="true"></i>
                </div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>账号设置</h3>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs mb-2 block" style={{ color: 'var(--text-tertiary)' }}>用户名</label>
                  <input 
                    type="text" 
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    placeholder="设置你的用户名"
                    className="input-field"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={() => setShowSettings(false)} className="btn-ghost text-sm py-2 px-4">取消</button>
                  <button onClick={handleSaveUsername} className="btn-accent text-sm py-2 px-4">保存</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <CreateNovelModal
        isOpen={showCreateNovel}
        onClose={() => setShowCreateNovel(false)}
        onCreated={confirmCreateNovel}
      />
    </header>
  );
}

function CreateNovelModal({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: (title: string, genre: string) => void }) {
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('xuanhuan');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreated(title, genre);
    onClose();
    setTitle('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="glass-card p-6 w-full max-w-md animate-fade-in-up" style={{ borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
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