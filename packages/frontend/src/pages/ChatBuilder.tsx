/**
 * 灵砚 InkForge - 对话式建书页面
 * 作者：&lt;smallletters@sina.com&gt;
 * 创建日期：2026-05-01
 *
 * 功能描述：通过自然语言对话引导用户创建小说作品
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import { api } from '../lib/api';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

type ExtractedInfo = {
  genre?: string;
  title?: string;
  outline?: string;
  characters?: string;
  world_setting?: string;
};

const GENRE_OPTIONS: Record<string, { label: string; color: string }> = {
  xuanhuan: { label: '玄幻', color: '#f59e0b' },
  xianxia: { label: '仙侠', color: '#60a5fa' },
  dushi: { label: '都市', color: '#34d399' },
  kehuan: { label: '科幻', color: '#a78bfa' },
  yanqing: { label: '言情', color: '#f472b6' },
  xuanyi: { label: '悬疑', color: '#94a3b8' },
  lishi: { label: '历史', color: '#f97316' },
  qihuan: { label: '奇幻', color: '#8b5cf6' },
};

export default function ChatBuilder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是灵砚AI创作助手。让我们一起开始一段精彩的小说创作之旅吧！\n\n首先，请告诉我你想要创作什么类型的小说？（如玄幻、都市、仙侠等）',
      timestamp: new Date(),
    },
  ]);
  const [extractedInfo, setExtractedInfo] = useState<ExtractedInfo>({});
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async () => {
    const content = inputValue.trim();
    if (!content || isTyping || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputValue('');
    setIsTyping(true);
    setIsStreaming(true);

    try {
      let responseContent = '';
      let newInfo = extractedInfo;

      await api.chat.stream(
        { messages: updatedMessages.map(m => ({ role: m.role, content: m.content })), extracted_info: extractedInfo },
        (data) => {
          if (data.done) {
            setIsStreaming(false);
            return;
          }

          if (data.reply) {
            responseContent = data.reply;
          }

          if (data.extracted_info) {
            newInfo = { ...newInfo, ...data.extracted_info };
          }
        },
      );

      if (newInfo !== extractedInfo) {
        setExtractedInfo(newInfo);
      }

      if (newInfo.title && newInfo.genre) {
        setShowCreateConfirm(true);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent || '好的，我了解了。继续告诉我更多信息吧！',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，遇到了一些问题。请稍后再试，或者检查网络连接。',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCreateNovel = async () => {
    if (!extractedInfo.title || !extractedInfo.genre) return;

    try {
      const data = await api.chat.create({
        title: extractedInfo.title,
        genre: extractedInfo.genre,
        outline: extractedInfo.outline,
        world_setting: extractedInfo.world_setting,
      });

      queryClient.invalidateQueries({ queryKey: ['novels'] });
      navigate(`/novels/${data.id}`);
    } catch (error) {
      console.error('Create novel error:', error);
      alert('创建作品失败，请重试');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleQuickReply = (reply: string) => {
    setInputValue(reply);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div className="min-h-screen noise-overlay">
      <div className="ambient-glow" aria-hidden="true" />
      
      <Header currentPage="works" />

      <main className="relative z-[1] max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">对话式创作</h1>
            <p className="text-sm text-gray-400 mt-1">和我聊聊，让我帮你构建一部精彩的小说</p>
          </div>
          <button
            onClick={() => navigate('/works')}
            className="px-4 py-2 rounded-lg bg-white/5 text-sm text-gray-300 hover:bg-white/10 transition-all"
          >
            返回作品列表
          </button>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 glass-card p-0 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <i className="fa-solid fa-wand-magic-sparkles text-white text-lg" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">灵砚AI助手</p>
                  <p className="text-xs text-gray-400">准备就绪</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-wand-magic-sparkles text-white text-xs" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[70%] rounded-2xl p-4 ${
                      message.role === 'user'
                        ? 'bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-tr-md'
                        : 'bg-white/5 text-white rounded-tl-md border border-white/10'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content}
                    </p>
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-user text-white text-xs" />
                    </div>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                    <i className="fa-solid fa-wand-magic-sparkles text-white text-xs" />
                  </div>
                  <div className="bg-white/5 text-white rounded-2xl rounded-tl-md border border-white/10 p-4">
                    <div className="flex gap-2">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-white/10">
              <div className="flex flex-col gap-3">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {!extractedInfo.genre && (
                    <>
                      <button
                        onClick={() => handleQuickReply('我想写一部玄幻小说')}
                        className="px-3 py-1.5 rounded-full text-xs bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 flex-shrink-0"
                      >
                        玄幻
                      </button>
                      <button
                        onClick={() => handleQuickReply('我想写一部都市小说')}
                        className="px-3 py-1.5 rounded-full text-xs bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 flex-shrink-0"
                      >
                        都市
                      </button>
                      <button
                        onClick={() => handleQuickReply('我想写一部仙侠小说')}
                        className="px-3 py-1.5 rounded-full text-xs bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 flex-shrink-0"
                      >
                        仙侠
                      </button>
                      <button
                        onClick={() => handleQuickReply('我想写一部科幻小说')}
                        className="px-3 py-1.5 rounded-full text-xs bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 flex-shrink-0"
                      >
                        科幻
                      </button>
                    </>
                  )}
                  {extractedInfo.genre && !extractedInfo.title && (
                    <>
                      <button
                        onClick={() => handleQuickReply('标题可以叫《天行道》')}
                        className="px-3 py-1.5 rounded-full text-xs bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 flex-shrink-0"
                      >
                        给个标题建议
                      </button>
                      <button
                        onClick={() => handleQuickReply('让我想想...')}
                        className="px-3 py-1.5 rounded-full text-xs bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 flex-shrink-0"
                      >
                        让我想想
                      </button>
                    </>
                  )}
                </div>

                <div className="flex gap-3">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="和我聊聊你的想法..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-400 resize-none outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
                    rows={2}
                    disabled={isTyping}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || isTyping}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                      inputValue.trim() && !isTyping
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:shadow-lg hover:shadow-purple-500/25'
                        : 'bg-white/5 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isTyping ? (
                      <i className="fa-solid fa-spinner animate-spin" />
                    ) : (
                      <i className="fa-solid fa-paper-plane" />
                    )}
                    发送
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-5 space-y-5">
            <h3 className="text-sm font-semibold text-white mb-4">收集的信息</h3>
            
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">题材</span>
                  {extractedInfo.genre && (
                    <span
                      className="px-2 py-1 rounded-full text-xs"
                      style={{
                        background: `${GENRE_OPTIONS[extractedInfo.genre]?.color}20`,
                        color: GENRE_OPTIONS[extractedInfo.genre]?.color,
                      }}
                    >
                      {GENRE_OPTIONS[extractedInfo.genre]?.label || extractedInfo.genre}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300">
                  {extractedInfo.genre ? (
                    GENRE_OPTIONS[extractedInfo.genre]?.label || extractedInfo.genre
                  ) : (
                    <span className="text-gray-500">待确定</span>
                  )}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <span className="text-xs text-gray-400 block mb-2">标题</span>
                <p className="text-sm text-gray-300">
                  {extractedInfo.title || <span className="text-gray-500">待确定</span>}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <span className="text-xs text-gray-400 block mb-2">大纲</span>
                <p className="text-sm text-gray-300 line-clamp-4">
                  {extractedInfo.outline || <span className="text-gray-500">待补充</span>}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <span className="text-xs text-gray-400 block mb-2">世界观</span>
                <p className="text-sm text-gray-300 line-clamp-4">
                  {extractedInfo.world_setting || <span className="text-gray-500">待补充</span>}
                </p>
              </div>
            </div>

            <div className="pt-5 border-t border-white/10">
              <button
                onClick={() => setShowCreateConfirm(true)}
                disabled={!extractedInfo.title || !extractedInfo.genre}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                  extractedInfo.title && extractedInfo.genre
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:shadow-lg hover:shadow-purple-500/25'
                    : 'bg-white/5 text-gray-500 cursor-not-allowed'
                }`}
              >
                创建作品
              </button>
            </div>
          </div>
        </div>
      </main>

      {showCreateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="glass-card p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">确认创建作品</h3>
            
            <div className="space-y-3 mb-6">
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <span className="text-xs text-gray-400 block mb-1">作品标题</span>
                <p className="text-sm text-white">{extractedInfo.title}</p>
              </div>
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <span className="text-xs text-gray-400 block mb-1">题材</span>
                <span
                  className="px-2 py-1 rounded-full text-xs inline-block"
                  style={{
                    background: `${GENRE_OPTIONS[extractedInfo.genre!]?.color}20`,
                    color: GENRE_OPTIONS[extractedInfo.genre!]?.color,
                  }}
                >
                  {GENRE_OPTIONS[extractedInfo.genre!]?.label || extractedInfo.genre}
                </span>
              </div>
              {extractedInfo.outline && (
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-xs text-gray-400 block mb-1">大纲</span>
                  <p className="text-sm text-gray-300">{extractedInfo.outline}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateConfirm(false)}
                className="flex-1 py-2.5 rounded-lg text-sm bg-white/5 text-gray-300 hover:bg-white/10 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleCreateNovel}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:shadow-lg hover:shadow-purple-500/25 transition-all"
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
