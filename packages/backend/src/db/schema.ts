import { pgTable, uuid, varchar, text, integer, jsonb, boolean, real, timestamp, unique } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  email: varchar('email', { length: 100 }).unique().notNull(),
  password_hash: varchar('password_hash', { length: 255 }).notNull(),
  user_type: varchar('user_type', { length: 20 }).notNull().default('individual'),
  preferences: jsonb('preferences').default('{}'),
  subscription_tier: varchar('subscription_tier', { length: 20 }).notNull().default('free'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const novels = pgTable('novels', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  genre: varchar('genre', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  word_count: integer('word_count').notNull().default(0),
  outline: jsonb('outline').default('{}'),
  characters: jsonb('characters').default('[]'),
  world_setting: jsonb('world_setting').default('{}'),
  author_intent: text('author_intent'),
  current_focus: text('current_focus'),
  total_chapters: integer('total_chapters').notNull().default(0),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const chapters = pgTable('chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  novel_id: uuid('novel_id').notNull().references(() => novels.id, { onDelete: 'cascade' }),
  chapter_number: integer('chapter_number').notNull(),
  title: varchar('title', { length: 200 }),
  content: text('content').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  word_count: integer('word_count').notNull().default(0),
  audit_report: jsonb('audit_report').default('{}'),
  revision_history: jsonb('revision_history').default('[]'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [unique().on(t.novel_id, t.chapter_number)]);

export const chapterVersions = pgTable('chapter_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  chapter_id: uuid('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  version_number: integer('version_number').notNull(),
  content: text('content').notNull(),
  diff: text('diff'),
  change_reason: varchar('change_reason', { length: 100 }),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => [unique().on(t.chapter_id, t.version_number)]);

export const truthFiles = pgTable('truth_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  novel_id: uuid('novel_id').notNull().references(() => novels.id, { onDelete: 'cascade' }),
  file_name: varchar('file_name', { length: 50 }).notNull(),
  version: integer('version').notNull().default(1),
  content_json: jsonb('content_json').notNull(),
  content_markdown: text('content_markdown'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [unique().on(t.novel_id, t.file_name)]);

export const agentConfigs = pgTable('agent_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  novel_id: uuid('novel_id').references(() => novels.id, { onDelete: 'cascade' }),
  agent_name: varchar('agent_name', { length: 50 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  system_prompt: text('system_prompt'),
  temperature: real('temperature').notNull().default(0.7),
  max_tokens: integer('max_tokens').notNull().default(4096),
  is_active: boolean('is_active').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const agentPromptVersions = pgTable('agent_prompt_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  agent_config_id: uuid('agent_config_id').notNull().references(() => agentConfigs.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  system_prompt: text('system_prompt').notNull(),
  change_reason: varchar('change_reason', { length: 200 }),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => [unique().on(t.agent_config_id, t.version)]);

export const llmProviders = pgTable('llm_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  provider_type: varchar('provider_type', { length: 50 }).notNull(),
  base_url: varchar('base_url', { length: 500 }).notNull(),
  api_key_encrypted: text('api_key_encrypted').notNull(),
  models: jsonb('models').default('[]'),
  is_active: boolean('is_active').notNull().default(true),
  last_tested_at: timestamp('last_tested_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const pipelineRuns = pgTable('pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  novel_id: uuid('novel_id').notNull().references(() => novels.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('running'),
  agents_progress: jsonb('agents_progress').default('[]'),
  total_duration_ms: integer('total_duration_ms'),
  failed_agent: varchar('failed_agent', { length: 50 }),
  error_message: text('error_message'),
  started_at: timestamp('started_at').notNull().defaultNow(),
  completed_at: timestamp('completed_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  refresh_token_hash: varchar('refresh_token_hash', { length: 255 }).notNull(),
  expires_at: timestamp('expires_at').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});
