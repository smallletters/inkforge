export type UserType = 'individual' | 'team' | 'enterprise';
export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface User {
  id: string;
  username: string;
  email: string;
  user_type: UserType;
  preferences: Record<string, unknown>;
  subscription_tier: SubscriptionTier;
  created_at: string;
  updated_at: string;
}

export type NovelGenre = 'xuanhuan' | 'xianxia' | 'dushi' | 'kehuan' | 'yanqing' | 'xuanyi' | 'lishi' | 'qihuan';
export type NovelStatus = 'draft' | 'writing' | 'editing' | 'published';

export interface Novel {
  id: string;
  user_id: string;
  title: string;
  genre: NovelGenre;
  status: NovelStatus;
  word_count: number;
  outline: Record<string, unknown>;
  characters: Character[];
  world_setting: Record<string, unknown>;
  author_intent?: string;
  current_focus?: string;
  total_chapters: number;
  created_at: string;
  updated_at: string;
}

export interface Character {
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  description: string;
  traits?: string[];
}

export type ChapterStatus = 'draft' | 'auditing' | 'reviewing' | 'published' | 'pipeline_running' | 'audit_failed';

export interface Chapter {
  id: string;
  novel_id: string;
  chapter_number: number;
  title?: string;
  content: string;
  status: ChapterStatus;
  word_count: number;
  audit_report: AuditReport;
  revision_history: RevisionRecord[];
  created_at: string;
  updated_at: string;
}

export interface AuditReport {
  passed: boolean;
  dimensions: Record<string, 'passed' | 'failed' | 'warning'>;
  issues: AuditIssue[];
}

export interface AuditIssue {
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  dimension: string;
  description: string;
  resolved: boolean;
}

export interface RevisionRecord {
  version: number;
  changes: string;
  timestamp: string;
}

export type AgentName = 'radar' | 'planner' | 'composer' | 'architect' | 'writer' | 'observer' | 'reflector' | 'normalizer' | 'auditor' | 'reviser';

export interface AgentConfig {
  id: string;
  user_id: string;
  novel_id?: string;
  agent_name: AgentName;
  provider: string;
  model: string;
  system_prompt?: string;
  temperature: number;
  max_tokens: number;
  created_at: string;
  updated_at: string;
}

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'moonshot' | 'deepseek' | 'zhipu' | 'bailian' | 'ollama' | 'custom';

export interface LlmProvider {
  id: string;
  user_id: string;
  name: string;
  provider_type: ProviderType;
  base_url: string;
  models: string[];
  is_active: boolean;
  last_tested_at?: string;
  created_at: string;
  updated_at: string;
}

export type PipelineStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface PipelineRun {
  id: string;
  novel_id: string;
  user_id: string;
  status: PipelineStatus;
  agents_progress: AgentProgress[];
  total_duration_ms?: number;
  failed_agent?: string;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export interface AgentProgress {
  agent_name: AgentName;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration_ms?: number;
  error?: string;
}

export type TruthFileName = 'current_state' | 'particle_ledger' | 'pending_hooks' | 'chapter_summaries' | 'subplot_board' | 'emotional_arcs' | 'character_matrix';

export interface TruthFile {
  id: string;
  novel_id: string;
  file_name: TruthFileName;
  version: number;
  content_json: Record<string, unknown>;
  content_markdown?: string;
  created_at: string;
  updated_at: string;
}

export interface TruthFileDelta {
  file: TruthFileName;
  operations: Array<{
    op: 'upsert' | 'delete';
    path: string;
    value?: unknown;
  }>;
  version: number;
}

export interface SseEvent {
  event: 'pipeline.start' | 'agent.start' | 'agent.complete' | 'agent.error' | 'audit.complete' | 'audit.revision' | 'pipeline.complete' | 'pipeline.fail' | 'pipeline.progress';
  data: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginationMeta {
  cursor?: string;
  total: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: Pick<User, 'id' | 'username' | 'subscription_tier'>;
}

export interface CreateNovelRequest {
  title: string;
  genre: NovelGenre;
  outline?: string;
  characters?: Character[];
}

export interface WriteNextRequest {
  word_count_target?: number;
  focus?: string;
}

export interface UpdateAgentConfigRequest {
  provider_id?: string;
  model?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface CreateProviderRequest {
  name: string;
  provider_type: ProviderType;
  base_url: string;
  api_key: string;
  models?: string[];
}

export interface ExportRequest {
  format: 'txt' | 'md' | 'epub' | 'pdf' | 'docx';
  chapters?: 'all' | 'published' | 'custom';
  chapter_range?: { start: number; end: number };
}
