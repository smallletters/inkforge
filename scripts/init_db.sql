-- InkForge Database Initialization Script
-- Author: <smallletters@sina.com>
-- Created: 2026-04-29

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) NOT NULL DEFAULT 'individual',
    preferences JSONB DEFAULT '{}',
    subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create novels table
CREATE TABLE IF NOT EXISTS novels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    genre VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    word_count INTEGER NOT NULL DEFAULT 0,
    outline JSONB DEFAULT '{}',
    characters JSONB DEFAULT '[]',
    world_setting JSONB DEFAULT '{}',
    author_intent TEXT,
    current_focus TEXT,
    total_chapters INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create chapters table
CREATE TABLE IF NOT EXISTS chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL,
    title VARCHAR(200),
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    word_count INTEGER NOT NULL DEFAULT 0,
    audit_report JSONB DEFAULT '{}',
    revision_history JSONB DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(novel_id, chapter_number)
);

-- Create chapter_versions table
CREATE TABLE IF NOT EXISTS chapter_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    diff TEXT,
    change_reason VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(chapter_id, version_number)
);

-- Create truth_files table
CREATE TABLE IF NOT EXISTS truth_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    file_name VARCHAR(50) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    content_json JSONB NOT NULL,
    content_markdown TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(novel_id, file_name)
);

-- Create agent_configs table
CREATE TABLE IF NOT EXISTS agent_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    novel_id UUID REFERENCES novels(id) ON DELETE CASCADE,
    agent_name VARCHAR(50) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    system_prompt TEXT,
    temperature REAL NOT NULL DEFAULT 0.7,
    max_tokens INTEGER NOT NULL DEFAULT 4096,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create agent_prompt_versions table
CREATE TABLE IF NOT EXISTS agent_prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_config_id UUID NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    system_prompt TEXT NOT NULL,
    change_reason VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(agent_config_id, version)
);

-- Create llm_providers table
CREATE TABLE IF NOT EXISTS llm_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(50) NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    models JSONB DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_tested_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create pipeline_runs table
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    agents_progress JSONB DEFAULT '[]',
    total_duration_ms INTEGER,
    failed_agent VARCHAR(50),
    error_message TEXT,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create user_sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_novels_user_id ON novels(user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_novel_id ON chapters(novel_id);
CREATE INDEX IF NOT EXISTS idx_chapter_versions_chapter_id ON chapter_versions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_truth_files_novel_id ON truth_files(novel_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_user_id ON agent_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_novel_id ON agent_configs(novel_id);
CREATE INDEX IF NOT EXISTS idx_llm_providers_user_id ON llm_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_novel_id ON pipeline_runs(novel_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_id ON pipeline_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
