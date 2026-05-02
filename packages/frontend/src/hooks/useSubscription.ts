/**
 * 灵砚 InkForge - 订阅状态 Hook
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 * 
 * 功能描述：管理用户订阅状态，提供功能权限检查
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/store';

export interface SubscriptionFeatures {
  basic_pipeline: boolean;
  advanced_pipeline: boolean;
  custom_prompt: boolean;
  multi_model_routing: boolean;
  export_txt: boolean;
  export_md: boolean;
  export_epub: boolean;
  export_pdf: boolean;
  export_docx: boolean;
  priority_support: boolean;
  api_access: boolean;
  team_collaboration: boolean;
  private_deployment: boolean;
}

export interface SubscriptionData {
  current_plan: {
    id: string;
    name: string;
    price: number;
    period: string | null;
    features: string[];
    limits: {
      monthly_word_limit: number;
      pipeline_concurrent: number;
      provider_count: number;
      custom_prompt: boolean;
      multi_model_routing: boolean;
      export_formats: string[];
    };
    price_display: string;
  };
  usage: {
    monthly_words_used: number;
    monthly_word_limit: number;
    unlimited: boolean;
  };
  features_enabled: {
    monthly_word_limit: number;
    pipeline_concurrent: number;
    provider_count: number;
    custom_prompt: boolean;
    multi_model_routing: boolean;
    export_formats: string[];
  };
}

export function useSubscription() {
  const user = useAuthStore((s) => s.user);
  
  const { data, isLoading, error } = useQuery<SubscriptionData>({
    queryKey: ['subscription-current'],
    queryFn: api.subscription.current,
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  });

  // 优先从API获取订阅状态，如果没有则从本地存储获取
  const planIdFromApi = data?.current_plan?.id;
  const planIdFromLocal = user?.subscription_tier;
  
  // 确定订阅等级：优先API返回，其次本地存储，默认免费
  const finalPlanId = planIdFromApi || planIdFromLocal || 'free';
  
  const isPro = finalPlanId === 'pro';
  const isEnterprise = finalPlanId === 'enterprise';
  const isFree = !isPro && !isEnterprise;

  const features: SubscriptionFeatures = {
    basic_pipeline: true,
    advanced_pipeline: isPro || isEnterprise,
    custom_prompt: isPro || isEnterprise,
    multi_model_routing: isPro || isEnterprise,
    export_txt: true,
    export_md: true,
    export_epub: isPro || isEnterprise,
    export_pdf: isPro || isEnterprise,
    export_docx: isPro || isEnterprise,
    priority_support: isPro || isEnterprise,
    api_access: isEnterprise,
    team_collaboration: isEnterprise,
    private_deployment: isEnterprise,
  };

  return {
    data,
    isLoading,
    error,
    isPro,
    isEnterprise,
    isFree,
    features,
    currentPlan: data?.current_plan,
  };
}
