# LifeOS — Personal AI Task & Schedule Assistant

LifeOS is an AI-powered personal task and calendar manager built with Next.js, React, and OpenCode AI (`@opencode-ai/sdk`). It integrates grounded task-management research (GTD, time-blocking, planning fallacy calibration, deep work protection) with real Google Calendar synchronization and an interactive AI assistant.

For full architecture details, local setup guide, and API reference, see [HANDOFF.md](HANDOFF.md).

## Quick Start

1. **Configure environment variables**:
   ```bash
   cp .env.example .env.local
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Start the OpenCode AI Agent server**:
   ```bash
   npx opencode serve --port 4096
   ```
4. **Run the Next.js development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Tech Stack
- **Framework**: Next.js 14 (App Router) & React
- **Styling**: Tailwind CSS
- **AI Integration**: OpenCode SDK (`@opencode-ai/sdk`) & OpenCode Server
- **Calendar & Authentication**: NextAuth & Google Calendar OAuth2 API
