/**
 * 灵砚 InkForge - 文风仿写页面
 * 作者：&lt;smallletters@sina.com&gt;
 * 创建日期：2026-05-01
 *
 * 功能描述：分析文本风格、模仿指定风格改写内容
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import Header from '../components/Header';
import { api } from '../lib/api';

export default function StyleImitation() {
  const navigate = useNavigate();
  const [referenceText, setReferenceText] = useState('');
  const [targetContent, setTargetContent] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [imitationResult, setImitationResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'analyze' | 'imitate'>('analyze');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImitating, setIsImitating] = useState(false);

  const analyzeMutation = useMutation({
    mutationFn: (text: string) => api.style.analyze(text),
    onSuccess: (data) => {
      setAnalysisResult(data);
      setActiveTab('imitate');
    },
  });

  const imitateMutation = useMutation({
    mutationFn: ({ content, styleProfile }: { content: string; styleProfile: any }) => 
      api.style.imitate(content, styleProfile),
    onSuccess: (data) => {
      setImitationResult(data);
    },
  });

  const handleAnalyze = async () => {
    if (!referenceText.trim() || referenceText.length < 100) {
      alert('请输入至少100字的参考文本');
      return;
    }
    setIsAnalyzing(true);
    try {
      await analyzeMutation.mutateAsync(referenceText);
    } catch (error) {
      console.error('Analysis error:', error);
      alert('文风分析失败，请重试');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImitate = async () => {
    if (!targetContent.trim()) {
      alert('请输入要改写的内容');
      return;
    }
    if (!analysisResult) {
      alert('请先分析参考文本');
      return;
    }
    setIsImitating(true);
    try {
      await imitateMutation.mutateAsync({ content: targetContent, styleProfile: analysisResult });
    } catch (error) {
      console.error('Imitation error:', error);
      alert('文风仿写失败，请重试');
    } finally {
      setIsImitating(false);
    }
  };

  return (
    <div className="min-h-screen noise-overlay">
      <div className="ambient-glow" aria-hidden="true" />
      
      <Header currentPage="works" />

      <main className="relative z-[1] max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">文风仿写</h1>
            <p className="text-sm text-gray-400 mt-1">分析文本风格，模仿创作</p>
          </div>
          <button
            onClick={() => navigate('/works')}
            className="px-4 py-2 rounded-lg bg-white/5 text-sm text-gray-300 hover:bg-white/10 transition-all"
          >
            返回作品列表
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧 - 参考文本和目标内容 */}
          <div className="space-y-6">
            {/* 参考文本 */}
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center">
                    <i className="fa-solid fa-file-text text-amber-400 text-sm" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">参考文本</h3>
                </div>
                <span className="text-xs text-gray-400">
                  {referenceText.length} / 建议1000字
                </span>
              </div>
              <textarea
                value={referenceText}
                onChange={(e) => setReferenceText(e.target.value)}
                placeholder="粘贴要分析的参考文本..."
                className="w-full min-h-[200px] p-4 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-400 resize-vertical focus:outline-none focus:border-amber-500/50"
              />
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !referenceText.trim()}
                className={`mt-4 w-full py-3 rounded-lg text-sm font-semibold transition-all ${
                  isAnalyzing || !referenceText.trim()
                    ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/25'
                }`}
              >
                {isAnalyzing ? (
                  <><i className="fa-solid fa-spinner animate-spin mr-2" /> 分析中...</>
                ) : (
                  <><i className="fa-solid fa-wand-magic-sparkles mr-2" /> 分析文风</>
                )}
              </button>
            </div>

            {/* 目标内容 */}
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-500/5 flex items-center justify-center">
                    <i className="fa-solid fa-pen-to-square text-purple-400 text-sm" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">要改写的内容</h3>
                </div>
              </div>
              <textarea
                value={targetContent}
                onChange={(e) => setTargetContent(e.target.value)}
                placeholder="输入要改写的内容..."
                className="w-full min-h-[200px] p-4 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-400 resize-vertical focus:outline-none focus:border-purple-500/50"
              />
              <button
                onClick={handleImitate}
                disabled={isImitating || !targetContent.trim() || !analysisResult}
                className={`mt-4 w-full py-3 rounded-lg text-sm font-semibold transition-all ${
                  isImitating || !targetContent.trim() || !analysisResult
                    ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:shadow-lg hover:shadow-purple-500/25'
                }`}
              >
                {isImitating ? (
                  <><i className="fa-solid fa-spinner animate-spin mr-2" /> 改写中...</>
                ) : (
                  <><i className="fa-solid fa-magic mr-2" /> 开始仿写</>
                )}
              </button>
            </div>
          </div>

          {/* 右侧 - 分析结果和仿写结果 */}
          <div className="space-y-6">
            {/* 标签页 */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('analyze')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'analyze'
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                <i className="fa-solid fa-chart-bar mr-2" /> 文风分析
              </button>
              <button
                onClick={() => setActiveTab('imitate')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'imitate'
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                <i className="fa-solid fa-copy mr-2" /> 仿写结果
              </button>
            </div>

            {/* 分析结果 */}
            {activeTab === 'analyze' && (
              <div className="glass-card p-5 min-h-[450px]">
                {analysisResult ? (
                  <div className="space-y-4">
                    {analysisResult.writing_style && (
                      <div>
                        <h4 className="text-sm font-semibold text-white mb-3">风格特征</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">词汇水平</span>
                            <span className="text-white">
                              {analysisResult.writing_style.vocabulary_level}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">句子结构</span>
                            <span className="text-white">
                              {analysisResult.writing_style.sentence_structure}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">段落长度</span>
                            <span className="text-white">
                              {analysisResult.writing_style.paragraph_length}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">对话比例</span>
                            <span className="text-white">
                              {(analysisResult.writing_style.dialogue_ratio * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">叙事视角</span>
                            <span className="text-white">
                              {analysisResult.writing_style.narrative_perspective}
                            </span>
                          </div>
                          {analysisResult.writing_style.tone && (
                            <div>
                              <span className="text-gray-400 text-sm">语气基调</span>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {analysisResult.writing_style.tone.map((t: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded-full text-xs bg-blue-500/15 text-blue-300 border border-blue-500/20"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {analysisResult.distinctive_features && analysisResult.distinctive_features.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-white mb-3">独特特征</h4>
                        <div className="space-y-2">
                          {analysisResult.distinctive_features.map((feature: any, idx: number) => (
                            <div key={idx} className="p-3 rounded-lg bg-white/5 border border-white/10">
                              <p className="text-sm text-white font-medium">{feature.feature}</p>
                              {feature.example && (
                                <p className="text-xs text-gray-400 mt-1 italic">
                                  "{feature.example}"
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <i className="fa-solid fa-chart-pie text-4xl text-gray-500 mb-4" />
                    <p className="text-gray-400">分析结果将显示在这里</p>
                    <p className="text-xs text-gray-500 mt-1">上传参考文本后点击分析</p>
                  </div>
                )}
              </div>
            )}

            {/* 仿写结果 */}
            {activeTab === 'imitate' && (
              <div className="glass-card p-5 min-h-[450px]">
                {imitationResult ? (
                  <div className="space-y-4">
                    {imitationResult.adapted_content && (
                      <div>
                        <h4 className="text-sm font-semibold text-white mb-3">改写内容</h4>
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                          <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">
                            {imitationResult.adapted_content}
                          </p>
                        </div>
                      </div>
                    )}
                    {imitationResult.style_elements_applied && imitationResult.style_elements_applied.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-white mb-3">应用的风格元素</h4>
                        <div className="flex flex-wrap gap-2">
                          {imitationResult.style_elements_applied.map((element: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 rounded-full text-xs bg-green-500/15 text-green-300 border border-green-500/20"
                            >
                              {element}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <i className="fa-solid fa-copy text-4xl text-gray-500 mb-4" />
                    <p className="text-gray-400">仿写结果将显示在这里</p>
                    <p className="text-xs text-gray-500 mt-1">先分析参考文本，再输入要改写的内容</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
