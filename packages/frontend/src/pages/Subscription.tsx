/**
 * 灵砚 InkForge - 订阅管理页面
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-01
 *
 * 功能描述：展示订阅计划、用量统计和付费升级入口
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import { api } from '../lib/api';
import { ApiError } from '../lib/api';

const PLAN_COLORS: Record<string, { primary: string; secondary: string; accent: string }> = {
  free: { primary: '#64748b', secondary: '#94a3b8', accent: '#cbd5e1' },
  pro: { primary: '#8b5cf6', secondary: '#a78bfa', accent: '#c4b5fd' },
  enterprise: { primary: '#f59e0b', secondary: '#fbbf24', accent: '#fcd34d' },
};

const FEATURE_COMPARISON = [
  { feature: '基础Agent管线', free: true, pro: true, enterprise: true },
  { feature: '每月字数限制', free: '10万字', pro: '无限', enterprise: '无限' },
  { feature: 'Agent数量', free: '3个', pro: '10个', enterprise: '10个+' },
  { feature: '自定义提示词', free: false, pro: true, enterprise: true },
  { feature: '多模型路由', free: false, pro: true, enterprise: true },
  { feature: '33维度审计', free: false, pro: true, enterprise: true },
  { feature: '导出格式', free: 'TXT/MD', pro: 'EPUB/PDF/DOCX', enterprise: '全部' },
  { feature: '并发管线数', free: '1个', pro: '3个', enterprise: '10个' },
  { feature: '客服支持', free: '社区', pro: '优先', enterprise: '专属' },
  { feature: '团队协作', free: false, pro: false, enterprise: true },
  { feature: '私有化部署', free: false, pro: false, enterprise: true },
  { feature: 'API接入', free: false, pro: false, enterprise: true },
];

const FAQ_ITEMS = [
  { q: '订阅可以随时取消吗？', a: '是的，您可以随时取消订阅。取消后，您的付费功能将在当前计费周期结束前继续有效。' },
  { q: '字数限制是如何计算的？', a: '字数限制按自然月计算，每月1日重置。专业版及以上用户享有无限字数。' },
  { q: '升级后立即生效吗？', a: '是的，升级支付成功后，功能会立即生效。您可以在订阅页面看到更新后的计划状态。' },
  { q: '支持哪些支付方式？', a: '目前支持微信支付、支付宝和主流信用卡。我们正在陆续支持更多支付方式。' },
  { q: '年付和月付有什么区别？', a: '年付比月付最多可节省17%的费用，适合长期使用的用户。我们还提供按年计费的额外优惠。' },
  { q: '企业版可以定制吗？', a: '当然可以！企业版支持私有化部署、专属Agent定制和API接入。您可以联系我们的销售团队获取定制方案。' },
];

const PAYMENT_METHODS = [
  { id: 'wechat', name: '微信支付', icon: 'fa-brands fa-weixin' },
  { id: 'alipay', name: '支付宝', icon: 'fa-brands fa-alipay' },
  { id: 'card', name: '信用卡', icon: 'fa-regular fa-credit-card' },
];

const SOCIAL_PROOF = {
  activeUsers: '50,000+',
  novelsCreated: '120,000+',
  avgRating: '4.9/5',
  userTestimonials: [
    { name: '张作者', text: '用了半年，字数限制完全不是问题，创作效率提升了三倍！' },
    { name: '李编辑', text: '33维度审计帮我发现了写作中的很多盲点，非常专业。' },
  ],
};

export default function Subscription() {
  const queryClient = useQueryClient();
  const [billingCycle, setBillingCycle] = useState<'month' | 'year'>('month');
  const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [contactForm, setContactForm] = useState({ name: '', company: '', email: '', phone: '', message: '' });
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showUpgradeConfirm) setShowUpgradeConfirm(false);
        if (showCancelConfirm) setShowCancelConfirm(false);
        if (showContactModal) setShowContactModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showUpgradeConfirm, showCancelConfirm, showContactModal]);

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => api.subscription.plans(),
  });

  const { data: currentData, isLoading: currentLoading } = useQuery({
    queryKey: ['subscription-current'],
    queryFn: api.subscription.current,
  });

  const { data: usageData } = useQuery({
    queryKey: ['subscription-usage'],
    queryFn: api.subscription.usage,
  });

  const upgradeMutation = useMutation({
    mutationFn: (planId: string) => api.subscription.upgrade(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
      setShowUpgradeConfirm(false);
      setSelectedPlan(null);
      showToast('success', '订阅升级成功！');
    },
    onError: (error: ApiError) => {
      showToast('error', error.message || '升级失败，请重试');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.subscription.cancel(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
      setShowCancelConfirm(false);
      showToast('success', '订阅已取消');
    },
    onError: (error: ApiError) => {
      showToast('error', error.message || '取消失败，请重试');
    },
  });

  const contactMutation = useMutation({
    mutationFn: (data: typeof contactForm) => Promise.resolve(data),
    onSuccess: () => {
      setShowContactModal(false);
      setContactForm({ name: '', company: '', email: '', phone: '', message: '' });
      showToast('success', '您的咨询已提交，我们会尽快与您联系');
    },
  });

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToastMessage({ type, message });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleUpgrade = (planId: string) => {
    setSelectedPlan(planId);
    setShowUpgradeConfirm(true);
  };

  const confirmUpgrade = () => {
    if (selectedPlan) {
      upgradeMutation.mutate(selectedPlan);
    }
  };

  const currentPlan = currentData?.current_plan;
  const currentTier = currentPlan?.id || 'free';
  const plans = plansData?.plans || [];

  const usage = usageData?.usage || { words_generated: 0, words_limit: 100000, unlimited: false, percentage: 0 };

  const formatPrice = (plan: any) => {
    if (!plan) return '';
    if (plan.price === 0) return '免费';
    if (plan.price === -1) return '定制报价';
    const period = plan.period === 'month' ? '/月' : plan.period === 'year' ? '/年' : '';
    return `¥${plan.price}${period}`;
  };

  const getUsagePercent = () => {
    if (usage.unlimited) return 0;
    if (!usage.words_limit) return 0;
    return Math.min(100, (usage.words_generated / usage.words_limit) * 100);
  };

  const isYearly = billingCycle === 'year';

  if (plansLoading || currentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <i className="fa-solid fa-spinner animate-spin text-2xl" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
      </div>
    );
  }

  return (
    <div className="min-h-screen noise-overlay">
      <div className="ambient-glow" aria-hidden="true"></div>
      <Header currentPage="subscription" />

      {toastMessage && (
        <div className={`fixed top-20 left-1/2 z-[100] px-6 py-3 rounded-lg text-sm font-medium animate-fade-in-up ${toastMessage.type === 'success' ? 'bg-green-900/90 text-green-200 border border-green-700' : 'bg-red-900/90 text-red-200 border border-red-700'}`}
          style={{ transform: 'translateX(-50%)' }}>
          <i className={`fa-solid ${toastMessage.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-2`} aria-hidden="true"></i>
          {toastMessage.message}
        </div>
      )}

      <main className="relative z-[1]" style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 24px' }} role="main">
        <div className="text-center mb-8">
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>选择适合您的计划</h1>
          <p style={{ fontSize: '15px', color: 'var(--text-tertiary)' }}>解锁更强大的AI创作能力</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-10 animate-fade-in-up">
          <div className="glass-card p-4 text-center" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(17,17,23,0.7) 100%)' }}>
            <p style={{ fontSize: '28px', fontWeight: '700', color: '#a78bfa' }}>{SOCIAL_PROOF.activeUsers}</p>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>活跃创作者</p>
          </div>
          <div className="glass-card p-4 text-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(17,17,23,0.7) 100%)' }}>
            <p style={{ fontSize: '28px', fontWeight: '700', color: '#fbbf24' }}>{SOCIAL_PROOF.novelsCreated}</p>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>部小说诞生</p>
          </div>
          <div className="glass-card p-4 text-center" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(17,17,23,0.7) 100%)' }}>
            <p style={{ fontSize: '28px', fontWeight: '700', color: '#34d399' }}>{SOCIAL_PROOF.avgRating}</p>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>用户评分</p>
          </div>
        </div>

        {currentTier !== 'free' && (
          <div className="glass-card p-5 mb-8 animate-fade-in-up" style={{ border: `1px solid ${PLAN_COLORS[currentTier]?.primary}40` }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${PLAN_COLORS[currentTier]?.primary}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-crown" style={{ color: PLAN_COLORS[currentTier]?.primary, fontSize: '18px' }} aria-hidden="true"></i>
                </div>
                <div>
                  <p style={{ fontWeight: '600', color: 'var(--text-primary)' }}>当前计划：{currentPlan?.name}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    {currentTier === 'pro' ? '享受无限字数和高级功能' : '尊享企业级专属服务'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowCancelConfirm(true)} className="btn-ghost text-sm hover:text-red-400">
                <i className="fa-solid fa-xmark mr-1" aria-hidden="true"></i>
                取消订阅
              </button>
            </div>
            {!usage.unlimited && (
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span style={{ color: 'var(--text-secondary)' }}>本月用量</span>
                  <span style={{ color: 'var(--text-primary)' }}>{(usage.words_generated / 10000).toFixed(1)}万 / {(usage.words_limit / 10000).toFixed(0)}万字</span>
                </div>
                <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <div style={{ width: `${getUsagePercent()}%`, height: '100%', borderRadius: '4px', background: `linear-gradient(90deg, ${PLAN_COLORS[currentTier]?.primary}, ${PLAN_COLORS[currentTier]?.secondary})`, transition: 'width 0.3s' }} />
                </div>
                {getUsagePercent() > 80 && (
                  <p style={{ fontSize: '12px', color: '#fbbf24', marginTop: '8px' }}>
                    <i className="fa-solid fa-circle-exclamation mr-1" aria-hidden="true"></i>
                    用量接近上限，建议升级到更高级别
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center gap-3 mb-8">
          <button
            onClick={() => setBillingCycle('month')}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${billingCycle === 'month' ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            月付
          </button>
          <button
            onClick={() => setBillingCycle('year')}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${billingCycle === 'year' ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            年付 <span className="badge badge-green ml-1" style={{ fontSize: '10px' }}>省17%</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-5 mb-10">
          {plans.filter((p: any) => p.id !== 'enterprise').map((plan: any, index: number) => {
            const colors = PLAN_COLORS[plan.id] || PLAN_COLORS.free;
            const isCurrent = currentTier === plan.id;
            const isPro = plan.id === 'pro';
            const displayPrice = plan.price === 0 ? 0 : isYearly && plan.annual_price ? Math.round(plan.annual_price / 12) : plan.price;
            return (
              <div
                key={plan.id}
                className="glass-card p-6 relative animate-fade-in-up"
                style={{
                  border: isPro ? `1px solid ${colors.primary}` : '1px solid rgba(255,255,255,0.08)',
                  transform: isPro ? 'scale(1.02)' : 'none',
                  animationDelay: `${index * 80}ms`,
                }}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="badge" style={{ background: colors.primary, color: '#fff', padding: '4px 12px', fontSize: '11px' }}>
                      推荐
                    </span>
                  </div>
                )}
                <div className="text-center mb-6">
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>{plan.name}</h3>
                  <div style={{ color: colors.primary }}>
                    <span style={{ fontSize: '32px', fontWeight: '700' }}>{displayPrice}</span>
                    <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>{plan.price === 0 ? '元' : '/月'}</span>
                  </div>
                  {isYearly && plan.annual_price && plan.price > 0 && (
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>¥{plan.price * 12}</span>
                      <span className="ml-2" style={{ color: '#34d399' }}>¥{plan.annual_price}/年</span>
                    </p>
                  )}
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <i className="fa-solid fa-check" style={{ color: colors.secondary, marginTop: '3px', fontSize: '10px' }} aria-hidden="true"></i>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrent || upgradeMutation.isPending}
                  className="w-full py-3 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: isCurrent ? 'rgba(255,255,255,0.05)' : isPro ? colors.primary : 'rgba(255,255,255,0.08)',
                    color: isCurrent ? 'var(--text-tertiary)' : isPro ? '#fff' : 'var(--text-primary)',
                    cursor: isCurrent ? 'not-allowed' : 'pointer',
                    border: isPro ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {isCurrent ? (
                    <>
                      <i className="fa-solid fa-check mr-1" aria-hidden="true"></i>
                      当前计划
                    </>
                  ) : upgradeMutation.isPending && selectedPlan === plan.id ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin mr-1" aria-hidden="true"></i>
                      处理中...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-rocket mr-1" aria-hidden="true"></i>
                      立即升级
                    </>
                  )}
                </button>
              </div>
            );
          })}

          <div
            className="glass-card p-6 relative animate-fade-in-up flex flex-col"
            style={{ border: '1px dashed rgba(245,158,11,0.3)', animationDelay: '160ms' }}
          >
            <div className="text-center mb-6 flex-1">
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>企业版</h3>
              <div style={{ color: PLAN_COLORS.enterprise.primary }}>
                <span style={{ fontSize: '32px', fontWeight: '700' }}>定制</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '8px' }}>适合团队和大型项目</p>
            </div>
            <ul className="space-y-3 mb-6 flex-1">
              <li className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <i className="fa-solid fa-check" style={{ color: PLAN_COLORS.enterprise.secondary, marginTop: '3px', fontSize: '10px' }} aria-hidden="true"></i>
                私有化部署
              </li>
              <li className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <i className="fa-solid fa-check" style={{ color: PLAN_COLORS.enterprise.secondary, marginTop: '3px', fontSize: '10px' }} aria-hidden="true"></i>
                专属Agent定制
              </li>
              <li className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <i className="fa-solid fa-check" style={{ color: PLAN_COLORS.enterprise.secondary, marginTop: '3px', fontSize: '10px' }} aria-hidden="true"></i>
                SLA保障 + API接入
              </li>
              <li className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <i className="fa-solid fa-check" style={{ color: PLAN_COLORS.enterprise.secondary, marginTop: '3px', fontSize: '10px' }} aria-hidden="true"></i>
                团队协作 + 专属客服
              </li>
            </ul>
            <button
              onClick={() => setShowContactModal(true)}
              className="w-full py-3 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'rgba(245,158,11,0.1)', color: PLAN_COLORS.enterprise.primary, border: '1px solid rgba(245,158,11,0.3)' }}
            >
              <i className="fa-solid fa-phone mr-1" aria-hidden="true"></i>
              联系销售
            </button>
          </div>
        </div>

        <div className="glass-card p-6 mb-6 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            <i className="fa-solid fa-table-list mr-2" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
            功能对比
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--text-tertiary)', fontSize: '12px', fontWeight: '500' }}>功能</th>
                  <th style={{ textAlign: 'center', padding: '12px 8px', color: PLAN_COLORS.free.secondary, fontSize: '12px', fontWeight: '500' }}>免费版</th>
                  <th style={{ textAlign: 'center', padding: '12px 8px', color: PLAN_COLORS.pro.secondary, fontSize: '12px', fontWeight: '500' }}>专业版</th>
                  <th style={{ textAlign: 'center', padding: '12px 8px', color: PLAN_COLORS.enterprise.secondary, fontSize: '12px', fontWeight: '500' }}>企业版</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_COMPARISON.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: idx < FEATURE_COMPARISON.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: '13px' }}>{row.feature}</td>
                    <td style={{ textAlign: 'center', padding: '12px 8px', fontSize: '13px' }}>
                      {typeof row.free === 'boolean' ? (
                        row.free ? <i className="fa-solid fa-check" style={{ color: '#34d399' }} aria-hidden="true"></i> : <i className="fa-solid fa-minus" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true"></i>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{row.free}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 8px', fontSize: '13px' }}>
                      {typeof row.pro === 'boolean' ? (
                        row.pro ? <i className="fa-solid fa-check" style={{ color: '#34d399' }} aria-hidden="true"></i> : <i className="fa-solid fa-minus" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true"></i>
                      ) : (
                        <span style={{ color: PLAN_COLORS.pro.secondary, fontSize: '12px' }}>{row.pro}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 8px', fontSize: '13px' }}>
                      {typeof row.enterprise === 'boolean' ? (
                        row.enterprise ? <i className="fa-solid fa-check" style={{ color: '#34d399' }} aria-hidden="true"></i> : <i className="fa-solid fa-minus" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true"></i>
                      ) : (
                        <span style={{ color: PLAN_COLORS.enterprise.secondary, fontSize: '12px' }}>{row.enterprise}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-card p-6 mb-6 animate-fade-in-up" style={{ animationDelay: '240ms' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            <i className="fa-solid fa-circle-question mr-2" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
            常见问题
          </h3>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => (
              <div key={idx} className="rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-4 text-left transition-all hover:bg-white/5"
                  aria-expanded={expandedFaq === idx}
                >
                  <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.q}</span>
                  <i className={`fa-solid fa-chevron-down transition-transform duration-200 ${expandedFaq === idx ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)', fontSize: '12px' }} aria-hidden="true"></i>
                </button>
                {expandedFaq === idx && (
                  <div className="px-4 pb-4 animate-fade-in">
                    <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: '1.6' }}>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6 mb-6 animate-fade-in-up" style={{ animationDelay: '280ms' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
            <i className="fa-solid fa-users mr-2" style={{ color: 'var(--accent)' }} aria-hidden="true"></i>
            用户心声
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {SOCIAL_PROOF.userTestimonials.map((t, idx) => (
              <div key={idx} className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.6' }}>"{t.text}"</p>
                <div className="flex items-center gap-2">
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `linear-gradient(135deg, ${PLAN_COLORS.pro.primary}40, ${PLAN_COLORS.pro.secondary}40)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: PLAN_COLORS.pro.secondary }}>{t.name[0]}</span>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>{t.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {showUpgradeConfirm && selectedPlan && (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }} onClick={() => setShowUpgradeConfirm(false)}></div>
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 51, background: 'linear-gradient(180deg, #1a1a1f 0%, #12121a 100%)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '24px', padding: '32px', width: '460px', boxShadow: '0 32px 80px rgba(0,0,0,0.7)', animation: 'modalFadeIn 0.2s ease-out' }}>
            <button onClick={() => setShowUpgradeConfirm(false)} className="absolute top-4 right-4 text-text-tertiary hover:text-text-primary transition-colors" aria-label="关闭">
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true"></i>
            </button>
            <div className="text-center mb-6">
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i className="fa-solid fa-rocket" style={{ color: '#a78bfa', fontSize: '24px' }} aria-hidden="true"></i>
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>确认升级</h3>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>
                升级到 <span style={{ color: PLAN_COLORS[selectedPlan]?.secondary }}>{plans.find((p: any) => p.id === selectedPlan)?.name}</span>
                {isYearly ? '（年付）' : '（月付）'}
              </p>
            </div>
            <div className="mb-4 p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>您将获得：</p>
              <ul className="space-y-2">
                {plans.find((p: any) => p.id === selectedPlan)?.features.map((f: string, i: number) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <i className="fa-solid fa-check text-green-400 mr-2" aria-hidden="true"></i>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mb-4">
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>选择支付方式：</p>
              <div className="flex gap-3">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    className="flex-1 py-3 px-2 rounded-lg text-sm font-medium transition-all flex flex-col items-center gap-2"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    onClick={() => confirmUpgrade()}
                  >
                    <i className={`${method.icon} text-xl`} style={{ color: 'var(--text-secondary)' }} aria-hidden="true"></i>
                    <span style={{ color: 'var(--text-secondary)' }}>{method.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowUpgradeConfirm(false)} className="btn-ghost flex-1">取消</button>
              <button onClick={() => confirmUpgrade()} disabled={upgradeMutation.isPending} className="btn-accent flex-1">
                {upgradeMutation.isPending ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin mr-1" aria-hidden="true"></i>
                    处理中...
                  </>
                ) : (
                  <>
                    确认升级
                    <i className="fa-solid fa-arrow-right ml-1" aria-hidden="true"></i>
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {showCancelConfirm && (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }} onClick={() => setShowCancelConfirm(false)}></div>
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 51, background: 'linear-gradient(180deg, #1a1a1f 0%, #12121a 100%)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '24px', padding: '32px', width: '400px', boxShadow: '0 32px 80px rgba(0,0,0,0.7)', animation: 'modalFadeIn 0.2s ease-out' }}>
            <div className="text-center mb-6">
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f87171', fontSize: '24px' }} aria-hidden="true"></i>
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>确认取消订阅</h3>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>
                取消后您将失去以下高级功能：
              </p>
            </div>
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <ul className="space-y-2">
                <li style={{ fontSize: '13px', color: '#fca5a5' }}>
                  <i className="fa-solid fa-xmark text-red-400 mr-2" aria-hidden="true"></i>
                  无限字数额度
                </li>
                <li style={{ fontSize: '13px', color: '#fca5a5' }}>
                  <i className="fa-solid fa-xmark text-red-400 mr-2" aria-hidden="true"></i>
                  自定义提示词
                </li>
                <li style={{ fontSize: '13px', color: '#fca5a5' }}>
                  <i className="fa-solid fa-xmark text-red-400 mr-2" aria-hidden="true"></i>
                  多模型路由
                </li>
                <li style={{ fontSize: '13px', color: '#fca5a5' }}>
                  <i className="fa-solid fa-xmark text-red-400 mr-2" aria-hidden="true"></i>
                  高级导出格式
                </li>
              </ul>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px', textAlign: 'center' }}>
              取消后您的订阅将持续到本月底
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelConfirm(false)} className="btn-ghost flex-1">保留订阅</button>
              <button onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} className="flex-1 py-3 rounded-lg text-sm font-medium transition-all" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                {cancelMutation.isPending ? '处理中...' : '确认取消'}
              </button>
            </div>
          </div>
        </>
      )}

      {showContactModal && (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }} onClick={() => setShowContactModal(false)}></div>
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 51, background: 'linear-gradient(180deg, #1a1a1f 0%, #12121a 100%)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '24px', padding: '32px', width: '460px', boxShadow: '0 32px 80px rgba(0,0,0,0.7)', animation: 'modalFadeIn 0.2s ease-out' }}>
            <button onClick={() => setShowContactModal(false)} className="absolute top-4 right-4 text-text-tertiary hover:text-text-primary transition-colors" aria-label="关闭">
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true"></i>
            </button>
            <div className="text-center mb-6">
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i className="fa-solid fa-building" style={{ color: '#fbbf24', fontSize: '24px' }} aria-hidden="true"></i>
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>企业版咨询</h3>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>填写信息，我们的销售团队将尽快与您联系</p>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>姓名 *</label>
                <input
                  type="text"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  className="input-field"
                  placeholder="请输入您的姓名"
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>公司名称</label>
                <input
                  type="text"
                  value={contactForm.company}
                  onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                  className="input-field"
                  placeholder="请输入公司名称"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>邮箱 *</label>
                  <input
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="input-field"
                    placeholder="work@company.com"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>电话</label>
                  <input
                    type="tel"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className="input-field"
                    placeholder="138xxxx8888"
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>您的需求</label>
                <textarea
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  className="input-field"
                  rows={3}
                  placeholder="请简要描述您的需求，如：团队规模、部署方式、预算范围等"
                  style={{ resize: 'vertical', minHeight: '80px' }}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowContactModal(false)} className="btn-ghost flex-1">取消</button>
              <button
                onClick={() => contactMutation.mutate(contactForm)}
                disabled={!contactForm.name || !contactForm.email || contactMutation.isPending}
                className="btn-accent flex-1"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
              >
                {contactMutation.isPending ? '提交中...' : '提交咨询'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}