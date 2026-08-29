# LifeOS Project Handoff & Setup Guide

## 1. System Overview

LifeOS is an AI-powered personal task and calendar assistant built with **Next.js (React / App Router)** and integrated with the **OpenCode AI agent engine** (`@opencode-ai/sdk`). 

It serves as an external memory and decision-support system grounded in task-management psychology (David Allen GTD, Kahneman & Tversky planning fallacy, Covey/Eisenhower prioritization, Cal Newport deep work).

### Architecture Highlights
- **Web Frontend & API Server**: Next.js 14 App Router.
- **AI Agent Engine**: OpenCode server (`opencode serve`) running per-chat sessions in user workspace folders (`/data/users/<userId>/chats/<chatId>`).
- **Google Calendar Integration**: OAuth2 via NextAuth (`lib/auth.ts`) with automatic access token refresh (`lib/google-auth.ts`). Real event CRUD and FreeBusy queries.
- **Persistent User Persona**: Nightly cron & session builder updates `persona.md` per user folder for shared long-term memory across chat threads.

---

## 2. Recent Fixes & Improvements

1. **Google Calendar Payload Fix (`lib/calendar.ts`)**:
   - Added `timeZone: 'Asia/Kolkata'` to start/end event payloads.
   - Resolved 500 error (`Missing time zone definition for start time`) from Google Calendar API.
   - Preserved recurrence alignment (e.g. `RRULE:FREQ=WEEKLY;BYDAY=MO`).

2. **Task Recurrence Persistence (`lib/store/tasks.ts`)**:
   - Passed `recurrence` through `createTask` so repeating task rules (e.g., `weekly` or explicit `RRULE` strings) persist in the user's task ledger.

3. **Agent API Authorization Harmonization**:
   - Refactored `/api/schedule`, `/api/schedule/confirm`, `/api/schedule/reschedule`, and `/api/calendar/today` handlers to use `resolveUserId(req)` and `getAccessToken(userId)`.
   - Enabled server-to-server OpenCode agent tool calls (passing `X-LifeOS-User: <userId>`) to resolve real user accounts and access tokens instead of returning mock data.

---

## 3. App Starting Steps

### Prerequisites
- Node.js v18+ or v22
- npm
- Google Cloud Console OAuth Client credentials (for Google Calendar sync)

### Step 1: Environment Configuration
Copy `.env.example` to `.env.local` and populate the required keys:

```bash
cp .env.example .env.local
```

Key environment variables in `.env.local`:
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-nextauth-secret

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

OPENCODE_BASE_URL=http://127.0.0.1:4096
OPENCODE_PROVIDER=opencode
OPENCODE_MODEL=big-pickle
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Start the OpenCode Server (AI Agent)
In a separate terminal or background container, start the OpenCode server:

```bash
npx opencode serve --port 4096
```

Or using Docker:
```bash
docker run -d -p 4096:4096 ghcr.io/anomalyco/opencode serve --hostname 0.0.0.0 --port 4096
```

### Step 4: Start the Next.js Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 4. Verification & Testing

- **TypeScript Typecheck**:
  ```bash
  npx tsc --noEmit
  ```
- **Build Verification**:
  ```bash
  npm run build
  ```

---

## 5. API Reference Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tasks` | List user's active tasks |
| `POST` | `/api/tasks` | Create task with priority, deadline, recurrence |
| `PATCH` | `/api/tasks/:id` | Update task details |
| `PATCH` | `/api/tasks/:id/block` | Flag task as blocked with reason |
| `POST` | `/api/schedule` | Calculate proposed schedule from active tasks & calendar freebusy |
| `POST` | `/api/schedule/confirm` | Write confirmed tasks to Google Calendar |
| `PATCH` | `/api/schedule/reschedule` | Re-calculate schedule after blocker updates |
| `GET` | `/api/calendar/today` | Fetch today's calendar events |
| `POST` | `/api/chat/:chatId/message` | Send message to user's OpenCode session |
| `GET` | `/api/chats` | List user chat sessions |
