@echo off
REM InkForge Database Migration Script
REM Author: <smallletters@sina.com>
REM Created: 2026-04-29

set DATABASE_URL=%DATABASE_URL%||postgresql://inkforge:inkforge@localhost:5432/inkforge

echo Running database migrations for InkForge...

cd /d "%~dp0.."

echo Using drizzle-kit to push schema...
call pnpm --filter backend exec drizzle-kit push

echo Migration completed successfully!
pause
