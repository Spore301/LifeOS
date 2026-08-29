# LifeOS Architecture — Deployable Blueprint
## OpenCode-based Personal AI Task Assistant

> **Mode:** Structural blueprint / design document (deliverable 1). No application code is written in this document; the concrete implementation lives in the accompanying codebase and config files. Prerequisites: this machine currently has **Node v22 & npm** but **no Docker and no `opencode` binary installed** — they must be provisioned first (see §7).

---

## 0. TL;DR — the model in one paragraph

LifeOS is **not** a plain-LLM app. Each user has a private **workspace folder**. Every chat a user opens maps to one **OpenCode session** run inside that user's folder via the OpenCode **server** (`opencode serve`) + the **`@opencode-ai/sdk`** (session API). The OpenCode agent — the actual planner/scheduler — receives the user's message, reads the user's **persona** and calendar/task state, plans and prioritizes, then performs **real actions** through backend REST APIs (Google Calendar CRUD, tasks, reminders) that the agent calls as **tools**. Conversations persist per session and are **resumed** when the user returns. When the user goes offline, sessions are disposed. A nightly **cron** spawns a per-user "persona builder" agent that reflects on all sessions + the day's calendar and writes/updates a `persona.md` in the user's folder, giving every session shared long-term memory and judgment. A **reminder pipeline** (cron) fires task reminders with an **acknowledge / decline / give-reason** intent loop that feeds rescheduling.

```
        ┌───────────────┐       ┌──────────────────────────────────────────────┐
        │   Web / Chat  │  HTTP │                   Backend (Node/Next.js)      │
        │   Frontend    ├──────►│  ── Auth (Google OAuth / NextAuth)            │
        │  (Next.js)    │       │  ── Session Manager (per user × per chat)     │
        └───────────────┘       │  ── OpenCode Gateway (SDK client)             │
                                │  ── Tool/Backend API layer (Google Cal,       │
        ┌───────────────┐       │     tasks, reminders, persona)                │
        │  WhatsApp     ├──────►│  ── Reminder Scheduler (cron)                 │
        │  (Phase 2)    │       │  ── Nightly Persona Builder (cron)            │
        └───────────────┘       └──────────────┬───────────────────────────────┘
                                               │ opencode SDK (HTTP) — one server
                        ┌──────────────────────▼───────────────────────────┐
                        │              OpenCode server (Docker)             │
                        │  runs a session per (user, chat) in that user's   │
                        │  workspace folder                                  │
                        │                                                  │
                        │   /users/<uid>/<chatId>/   (workspace)            │
                        │     ├─ persona.md          (long-term memory)     │
                        │     ├─ tasks.md            (working task state)   │
                        │     └─ session state       (persisted by server)  │
                        └──────────────────────┬────────────────────────────┘
                                               │ agent performs actions via tools
                        ┌──────────────────────▼──────────────────────────┐
                        │      Backend REST APIs (HTTP, tool-exposed)      │
                        │  POST /calendar/events  · GET/PATCH/DELETE       │
                        │  POST /tasks            · GET /tasks   ...       │
                        │  POST /reminders        · persona  ...           │
                        └──────────────────────────────────────────────────┘
```

---

## 1. Core Concepts

### 1.1 User workspace folders
Each user gets a durable, versioned folder on the server's filesystem:

```
/data/users/<user_id>/
  ├─ persona.md            # shared long-term memory (see §6)
  ├─ tasks.md              # canonical human-readable task ledger (mirrors API)
  ├─ schedules/            # snapshot of calendar/plan used for context
  └─ chats/
      └─ <chat_id>/        # one folder per chat window
          ├─ AGENTS.md     # injected system instructions for this chat
          └─ <session>     # opencode session state lives here
```

A chat's OpenCode session runs with its **working directory** set to `<user_id>/chats/<chat_id>/`. This gives the agent a filesystem it can read/write for context (persona, tasks) while keeping multi-chat isolation.

### 1.2 OpenCode session = one chat
- **Open a chat** → the backend calls the OpenCode SDK `session.create({ body: { title } })` targeting that user's chat folder, then `session.prompt` with the user's first message.
- **Resume a chat** → the backend looks up the persisted `session.id` for `(user_id, chat_id)` and reuses it (`session.prompt` continues the thread). Because OpenCode persists session state, the conversation is resumed with full context.
- **Close/offline** → the backend `session` is disposed and any long-running prompt aborted (`session.abort`). The thread is persisted, so it can be resumed later.

### 1.3 The agent is the brain; the backend is the hands
The OpenCode agent is **not** a code editor here — it is a task planner/assistant. It:
1. Reads the user message.
2. Loads `persona.md` + current task/calendar context (from the backend API tools, or files).
3. **Plans and prioritizes** using the task-management rules (deliverable 3).
4. Executes via **tools** that hit the backend REST APIs (create/update events, flag blockers, set reminders).
5. Responds conversationally (confirmations, clarifying questions, proposed schedule).

### 1.4 Tool model
The backend APIs are exposed to the OpenCode agent as **custom tools** (OpenCode supports custom tools; the backend can also be reached via the agent's existing `bash`/`webfetch` tools calling the REST API, or via a lightweight MCP server). Recommended: package the backend API as an **MCP server** or a set of **custom tools** so calls are structured and typed rather than free-text shell commands.

---

## 2. Components

### 2.1 Backend (Node.js / Next.js — reuse existing LifeOS app + extend)
Runs the web/chat UI, auth, and the OpenCode gateway.

| Module | Responsibility |
|---|---|
| **Auth** | Google OAuth via NextAuth (`lib/auth.ts`). Grants the app access to the user's Google Calendar (scope already requests `calendar` / `calendar.events`, `offline`). User identity = `session.user.id` / `sub`. |
| **Session Manager** | Maintains map `(user_id, chat_id) -> opencode session.id`; creates/resumes/disposes OpenCode sessions; lifecycle tied to user online/offline. |
| **OpenCode Gateway** | Thin client over `@opencode-ai/sdk`: `createOpencodeClient({ baseUrl })` → `session.create`, `session.prompt`, `session.messages`, `session.abort`, `session.delete`. |
| **Tool API layer** | REST endpoints the agent calls (Google Calendar proxy reusing `lib/calendar.ts`, task ledger, reminders, persona read/write). Existing `/api/calendar/*`, `/api/schedule/*` are the seed. |
| **Reminder Scheduler** | Cron that re-checks tasks and dispatches reminders into the right (online) session or via push/WhatsApp. (deliverable 5) |
| **Nightly Persona Builder** | Cron that for each user spawns a fresh OpenCode session to analyze the day and write `persona.md`. (§6) |

### 2.2 OpenCode server (Docker)
Runs `opencode serve` headless. Multiple sessions served from one process.

```
docker run -d \
  -p 4096:4096 \
  -e OPENCODE_SERVER_PASSWORD=<secret> \
  -v lifeos_data:/data \
  ghcr.io/anomalyco/opencode serve --hostname 0.0.0.0 --port 4096 --cors http://localhost:3000
```

- Persist the data volume so sessions survive container restarts.
- Protect with `OPENCODE_SERVER_PASSWORD` (HTTP basic auth; username `opencode`).
- The OpenCode server must be configured with the **model provider** used for the assistants. The user's requirement is "opencode with free big pickle model" — configure that provider/model as the default in `opencode.json` so every spawned session uses it. (Provider/model selection is also settable per-`session.prompt` via `model: { providerID, modelID }`.)

### 2.3 Web / Chat frontend
Reuse the existing Next.js UI. Instead of the current `/api/parse` → DeepSeek path, the client now:
1. POSTs the user's message to a backend route, e.g. `POST /api/chat/:chatId/message`.
2. The backend routes it into the OpenCode session (`session.prompt`) and streams the assistant reply back.
The clearance between *parse* and *schedule* that used to be client-side moves **into the agent**: the agent plans/schedules and proposes, and the frontend still gatekeeps the final Google Calendar write via the existing confirmation modal (no silent writes).

---

## 3. Request / response pipeline (user message → action)

```
User types/speaks in chat window
        │
        ▼
POST /api/chat/{chatId}/message         (backend)
        │
        ▼
Session Manager: resolve/reuse OpenCode session  (user_id, chat_id)
        │
        ▼
OpenCode Gateway: session.prompt({ id, parts:[{type:"text",text:userMsg}] })
        │                                ┌──────────────────────────────┐
        ▼                                │  AGENT (big-pickle model)    │
   (agent turn)                          │  · read persona.md           │
        │                                │  · read tasks.md / calendar  │
        ▼                                │  · plan & prioritize (rules) │
   agent calls TOOLS ───────────────────►│  · call backend APIs         │
   GET /tasks, POST /calendar/events     │    (create/update/delete)    │
   POST /reminders, PATCH /tasks/block   │  · produce reply + proposed  │
        │                                └──────────────────────────────┘
        ▼
assistant reply streamed back to frontend
        ▼
if agent proposed schedule → frontend confirmation modal → POST confirm
        ▼
Google Calendar write via existing /api/schedule/confirm
```

---

## 4. Session lifecycle

| Event | Backend action |
|---|---|
| User opens new chat | Create `chats/<chat_id>/` folder; write `AGENTS.md`; `session.create` + store id; `session.prompt(firstMsg)` |
| User sends message | `session.prompt` (continues thread) |
| User opens existing chat | Resolve stored `session.id` → `session.prompt` (resume with history) |
| User goes offline / closes chat | `session.abort` (if running); mark idle; eventually `session.delete` or dispose; **thread persists** for resume |
| Nightly | Reminder cron runs; Persona Builder runs |
| DB/deploy | OpenCode server restarts → sessions reloaded from volume |

---

## 5. Backend REST API (agent tools)

These are the "hands" the agent calls. Seed from the existing `lib/calendar.ts` + `lib/scheduler.ts`; extend with tasks + reminders + persona.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/tasks` | Create task (title, duration, deadline, priority, project, depends_on) |
| `GET` | `/api/tasks` | List tasks by state/project |
| `PATCH` | `/api/tasks/:id` | Update task (state, deadline, estimate) |
| `PATCH` | `/api/tasks/:id/block` | Flag blocked/unblocked with reason → triggers cascade |
| `GET` | `/api/calendar/freebusy` | Query free/busy (reuse `fetchGoogleFreeBusy`) |
| `POST` | `/api/calendar/events` | Create event (reuse `writeTaskToGoogleCalendar`) |
| `PATCH` | `/api/calendar/events/:id` | Move/reschedule event |
| `DELETE` | `/api/calendar/events/:id` | Delete event |
| `GET` | `/api/calendar/today` | Today's events + free slots (existing) |
| `POST` | `/api/reminders` | Schedule a reminder for a task |
| `GET` | `/api/persona` | Read user persona for context |
| `POST` | `/api/tasks/:id/reminder-response` | Record "got it / can't do now / reason" |

---

## 6. Nightly Persona Builder (cron)

For each user, once per day (e.g. 23:00):
1. Spawn a **fresh** OpenCode session in `<user_id>/` (a dedicated `persona/` subfolder).
2. Seed context: all chat sessions from the day (`session.messages` summaries), today's calendar events, task ledger deltas, reminder responses, and the previous `persona.md`.
3. Prompt: "Analyze today. Update persona.md capturing: work patterns, typical task types & effort ratios, projects, energy/time preferences, priorities, recurring blockers, response/commitment behavior, and any stated preferences. Keep it concise, factual, and useful as future judgment context. Do NOT invent facts."
4. Write the updated `persona.md` in the user's folder so every future session reads it.

This gives the system **shared long-term memory** and consistent judgment across otherwise-isolated chat sessions.

---

## 7. Deployment & prerequisites

**Required on host:**
- Node 18+/22 (present), npm (present).
- Docker + Docker Compose (❌ not currently installed on this machine — install first).
- OpenCode CLI (❌ not currently installed) — installed inside the image via `ghcr.io/anomalyco/opencode` (no host install needed), or `npm i -g opencode-ai`.
- `@opencode-ai/sdk` (published, v1.18.25) added to the backend's `package.json`.
- Provider/model credentials for the assistant model ("big pickle") configured in `opencode.json`.

**Compose services (example `docker-compose.yml`):**
- `opencode` — the OpenCode server (`opencode serve`), volume `lifeos_data:/data`, port 4096.
- `web` — the backend/frontend (existing Next.js app, built), connects to opencode at `http://opencode:4096`.
- `cron` — a small worker container (or same `web` image) running the reminder scheduler + nightly persona builder on schedules.

```yaml
services:
  opencode:
    image: ghcr.io/anomalyco/opencode
    command: ["serve", "--hostname", "0.0.0.0", "--port", "4096", "--cors", "http://localhost:3000"]
    environment:
      OPENCODE_SERVER_PASSWORD: ${OPENCODE_SERVER_PASSWORD}
    volumes:
      - lifeos_data:/data
    ports:
      - "4096:4096"
  web:
    build: .
    environment:
      OPENCODE_BASE_URL: http://opencode:4096
      OPENCODE_SERVER_PASSWORD: ${OPENCODE_SERVER_PASSWORD}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      NEXTAUTH_URL: ${NEXTAUTH_URL}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
    ports:
      - "3000:3000"
    depends_on:
      - opencode
volumes:
  lifeos_data:
```

---

## 8. Security notes
- OpenCode server behind `OPENCODE_SERVER_PASSWORD` (basic auth); backend is the only legitimate client.
- Scope OpenCode server access to the backend container (internal network), don't expose 4096 publicly.
- Google OAuth tokens stay server-side (existing pattern).
- User folders keyed by authenticated `user_id`; never trust client-supplied paths.
- Persona may contain personal data — treat as PII; encrypt at rest if deployed beyond single-host POC.
