# LifeOS Project Handoff & Setup Guide

## 1. System Overview

LifeOS is an AI-powered personal task and calendar assistant built with **Next.js 14 (App Router)** and driven by the **OpenCode agent engine** (`@opencode-ai/sdk`).

It is an external memory and decision-support system grounded in task-management psychology (Allen GTD, Kahneman planning fallacy, Covey/Eisenhower prioritisation, Newport deep work). See [docs/01](docs/01-task-management-psychology-research.md).

### How the pieces fit

Two containers, defined in [docker-compose.yml](docker-compose.yml):

| Service | Role |
|---|---|
| `lifeos` | Next.js app: web UI, REST API, all persistence |
| `opencode` | `opencode serve` — the LLM agent that talks to the app over HTTP |

The agent is a *client* of the LifeOS API, not a library inside it. Each chat maps to one OpenCode session whose working directory is a per-chat workspace.

### Three volumes, deliberately separated

| Volume | Mounted by | Holds |
|---|---|---|
| `lifeos-workspaces` | both | Per-chat agent workspaces (`AGENTS.md` only) |
| `lifeos-data` | app only | `tasks.json`, `persona.md`, `chats.json`, transcripts |
| `lifeos-secrets` | app only | Google tokens, agent session tokens |

**This separation is load-bearing.** The agent can run shell commands inside whatever it mounts. When it mounted the whole data volume, one user's agent could read every other user's tasks, persona and transcripts, and their Google refresh token. Do not re-merge these mounts.

---

## 2. Running it

### Prerequisites
- Docker Desktop
- Google Cloud OAuth client (Calendar scopes)

### Setup

```bash
cp .env.example .env      # then fill it in
docker compose up -d --build
```

Open http://localhost:3000.

`.env` values that must be real — compose refuses to start without the starred ones:

| Variable | Notes |
|---|---|
| `LIFEOS_ADMIN_SECRET` * | Operator credential. Must not be the placeholder; ≥24 chars |
| `OPENCODE_SERVER_PASSWORD` * | Shared by both containers so they always agree |
| `NEXTAUTH_SECRET` | Session signing key |
| `GOOGLE_CLIENT_ID` / `SECRET` | From Google Cloud Console |
| `LIFEOS_CRON_SECRET` | Cron routes are **disabled** when unset |
| `LIFEOS_TIMEZONE` | Default `Asia/Kolkata` |
| `PUBLIC_URL` | Public origin when tunnelled; defaults to localhost |

### Exposing it to other devices

Set `PUBLIC_URL` to the public origin **and** register `<PUBLIC_URL>/api/auth/callback/google` as an authorized redirect URI in Google Cloud Console. Google refuses plain HTTP for non-localhost, so the tunnel must be HTTPS. While the OAuth consent screen is in Testing, every other person must be added as a Test user or their sign-in simply fails.

---

## 3. The three models you need to understand

### Authentication

Three distinct credentials, deliberately not interchangeable:

1. **Web session** (NextAuth/Google) — how a human is identified.
2. **Agent session token** (`X-LifeOS-User` + `X-LifeOS-Agent`) — minted per (user, chat), expires daily, resolves to exactly one account. This is what the agent carries. It is scoped precisely because the agent's context is prompt-injectable: a leaked token grants only what its owner already had.
3. **Admin secret** (`X-LifeOS-User` + `X-LifeOS-Admin`) — operator tooling only. **Never put this in the agent's prompt.** It authorises impersonation of any user.

Cron routes use `X-LifeOS-Cron` and fail closed when no secret is configured.

### Time

**All scheduling maths goes through [lib/timezone.ts](lib/timezone.ts).** Never use `setHours()`, `getHours()` or `toLocaleTimeString()` for anything user-facing.

The app runs in a container whose local time is UTC. `new Date().setHours(9)` means 09:00 **UTC** — which is 14:30 IST. That single mistake is why a block requested for 9:00 AM appeared on the calendar at 2:30 PM. Google also ignores an event's `timeZone` field when its `dateTime` ends in `Z`, so tagging the payload `Asia/Kolkata` did not help.

Instants stay real UTC `Date` objects everywhere (so they compare correctly against Google FreeBusy). Only day and work-hour *boundaries* are zone-aware.

### Recurrence

A task whose `recurrence` names specific weekdays is only due on those days ([lib/recurrence.ts](lib/recurrence.ts)). Without this gate a `BYDAY=TU,TH,SU` routine was also booked on Mondays, duplicating its own calendar series.

---

## 4. API reference

All routes require an authenticated caller. `:id` is a task id.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tasks` | List tasks (filter by `state`, `project`) |
| `POST` | `/api/tasks` | Create task (incl. `recurrence`) |
| `PATCH` | `/api/tasks/:id` | Update task |
| `PATCH` | `/api/tasks/:id/block` | Flag/clear a blocker |
| `POST` | `/api/tasks/:id/reminder-response` | Reminder intent loop (docs/04) |
| `GET` | `/api/calendar/today` | **Read** the real Google Calendar. Returns `mocked: true` when there is no working token — do not present those as real events |
| `POST` | `/api/agenda/schedule` | Propose today's schedule |
| `POST` | `/api/agenda/confirm` | Write to Google Calendar (**upserts** by task id) |
| `DELETE` | `/api/agenda/event` | Remove a task's calendar block |
| `GET` | `/api/persona` | Read persona |
| `POST` | `/api/persona` | `{append}` a durable fact, or `{persona}` to replace |
| `POST` | `/api/chat/:chatId/message` | Blocking chat turn |
| `POST` | `/api/chat/:chatId/message/stream` | **SSE** chat turn: text deltas + live tool steps |
| `GET` | `/api/chats` | List chats |
| `POST` | `/api/cron/reminders` | Reminder worker (cron secret) |
| `POST` | `/api/cron/build-persona` | Nightly persona build (cron secret) |

`/api/schedule`, `/api/schedule/confirm` and `/api/schedule/reschedule` are a **legacy parallel stack**. The agent uses `/api/agenda/*`. Prefer the agenda routes; see open issue 4.

### Streaming notes

Three things are easy to get wrong and cost real time:

- The SDK's `event.subscribe()` does **not** route through the custom fetch that adds the opencode Basic auth header. It 401s and retries forever. Read `/event` directly.
- That stream is **scoped per directory**. Without `?directory=` you get heartbeats only and the run looks hung.
- The server emits part updates for the **user** message too — which is the whole preamble. Filter on message role, or the assistant appears to open every reply by reciting its own prompt (agent token included).

---

## 5. Verification

```bash
npx tsc --noEmit                          # typecheck
docker compose up -d --build              # rebuild
docker compose logs -f lifeos             # app logs
```

Auth behaviour worth re-checking after any change to `lib/auth-user.ts`:

```
placeholder / wrong / absent admin secret  -> 401
agent token used for another account       -> 401
POST /api/parse, /api/transcribe unauth'd  -> 401
cron routes without secret                 -> 401
```

---

## 6. Known open issues

Ordered by what will bite first. Full context in the review discussion.

1. **The nightly persona build erases stated preferences.** `buildPersona` calls `setPersona` with a wholesale replacement and the fallback builder regenerates from scratch, so the `## Stated preferences` block (e.g. "always use IST") is wiped on the next cron run. Fix before relying on persona memory.
2. **Reminders will spam.** `computeDueReminders` never checks `reminderAcknowledged` despite its doc comment, and a task with no deadline skips the lead-time gate entirely, so it fires on every tick. The quiet window also still uses server-local `getHours()`, so "22:00–08:00" actually runs 03:30–13:30 IST.
3. **A failed token refresh returns the dead token.** `getAccessToken` falls through to the expired value, so `needsCalendarAuth` reads false and the write 401s later.
4. **Two parallel scheduling stacks** (`/api/schedule*` vs `/api/agenda/*`) that have already drifted. Collapse them.
5. **The JSON store is not concurrency-safe.** Every store does read-modify-write with a non-atomic `writeFileSync`; concurrent agent and UI writes drop one, and a crash mid-write truncates the ledger. `appendMessage` rewrites the whole transcript per message.
6. **Three invalid sort comparators** (`lib/notifications.ts`, `lib/store/chats.ts`, the tasks route) never return 0 and mishandle missing values, so "most recently active" is unreliable.
7. **`sanitize()` collisions** — `a.b@x.com` and `a-b@x.com` map to the same user directory.
8. **Minor** — `googleapis` is a dependency but never imported; the Dockerfile runs as root; no `output: 'standalone'`, so the runner image carries full `node_modules`.

### Architectural note

The agent calls the REST API by curling endpoints described in prose. That is why it could claim "Saved to memory" when nothing was saved, and why it believed a calendar-read endpoint did not exist. Turning these into typed OpenCode tools would make a failed call an error the model must reckon with rather than something it can narrate past — the structural fix for a whole class of confident-but-false replies.
