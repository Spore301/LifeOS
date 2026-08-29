# LifeOS Reminder Pipeline

Every task gets a reminder. Every reminder is a **decision aid, not a nag**. It fires at the
right moment (just-in-time, context-aware) and always lets the user respond with an intent —
notably **"got it, I'll do"** or **"can't do right now [reason]"** — which drives the
rescheduling cascade. This document specifies the pipeline, the reminder prompt, the intent
contract, and the scheduler policy. Grounding psychology is in `docs/01` §6 and §5.

---

## 1. High-level flow

```
Day starts                        (morning plan digest)
   │
   ▼
Reminder Scheduler (cron, every minute) checks due reminders
   │
   ├─ Due + user ACTIVE  ──────────► deliver in-session push message (web) / WhatsApp (P2)
   ├─ Due + user OFFLINE ──────────► queue; deliver on next login or via push/WhatsApp if enabled
   └─ Not due / wrong moment ──────► withhold (JITAI)
                                          │
                                          ▼
                              User receives reminder with ACTION CHOICES:
                                 [Got it — I'll do it]
                                 [Can't do right now]  (+ reason, optional)
                                 [Snooze until __:__]
                                 [Done]
                                          │
                                          ▼
                              Intent parser classifies response  (see §4)
                                          │
                                          ▼
                        ┌─────────────────┴──────────────────┐
                        ▼                                   ▼
                   "got it / done"                     "can't do now" (+reason)
  task stays scheduled; mark as acknowledged;   → mark blocked/deferred, capture reason,
  close loop                                  → CASCADE reschedule + downstream dependencies
                                          │
                                          ▼
                     Recalibrate estimate & update tasks.md/persona signals
```

---

## 2. Reminder scheduling policy (JITAI — when to fire)

A reminder is eligible only when ALL hold:
1. Task state is `not_started` or `in_progress` (never remind on `done`/`dropped`).
2. Current time is within the configured quiet window (respect sleep hours) and not inside a
   protected **deep-work block** or **meeting** on the user's calendar.
3. The reminder is near its lead-time (see lead times below) and the user is reachable
   (online, or offline-push enabled).

**Lead times (per priority):**
| Task priority/due type | Lead time | Example |
|---|---|---|
| Urgent (due today, <2h away) | ~15 min before | immediate-ish, single |
| High | ~30–60 min before | single nudge |
| Medium | morning + one 30-min-before | batching preferred |
| Long-horizon project | daily morning digest | micro-milestone check-in |

**Batching rule:** non-urgent nudges coalesce into two daily digests (morning plan + end-of-day
review). Only genuinely time-sensitive deadlines fire immediate one-off notifications.
This keeps notification count low (attention budget, docs/01 §6).

---

## 3. Reminder message prompt (sent to the user)

Every reminder is framed as an **implementation intention** (Gollwitzer) — tied to a cue, not
just an abstract time — and offers explicit actions:

```
🔔 Task due: <task.title>   (project: <project>)
   Deadline: <due>  ·  Estimated: <calibrated duration>

When you <situational cue, e.g. "finish this email" / "leave your 10:00 meeting">,
then <the single next action for the task>.

Respond with one of:
  1. "Got it, I'll do it"        → keep it scheduled, we're all set.
  2. "Can't do right now" + [reason]  → I'll reschedule + cascade other tasks.
  3. "Snooze until <time>"       → I'll nudge you then instead.
  4. "Done"                      → I'll mark it complete and record the real time.
```

Keep it short and scannable; one action per notification.

---

## 4. Intent contract (user response → action)

The backend exposes `POST /api/tasks/:id/reminder-response` (or routes it into the agent
session). The **intent parser** maps free or button text to a normalized intent:

| Intent | Trigger words (illustrative) | Backend action |
|---|---|---|
| `ACCEPT` | "got it", "i'll do", "ok", "will do", yes | Keep slot; set `reminder_acknowledged`; close loop |
| `DONE` | "done", "finished", "completed" | Task → `done`; record actual duration (estimate recalibration) |
| `DECLINE` / `DELAYED` | "can't", "can't do right now", "not now", "busy", "delayed", "pushed" | Capture reason; task → `blocked`/`deferred`; **cascade** |
| `SNOOZE` | "snooze until <t>", "move to <t>", "later" | Re-queue reminder at requested time |
| `DROP` | "drop it", "not important", "cancel" | Task → `deferred (explicit)`; conscious closure |

**Response schema (stores reason + drives cascade):**
```json
{
  "taskId": "task-123",
  "intent": "DELAYED",
  "reason": "waiting on client feedback",
  "snoozeUntil": null,
  "actualDurationMinutes": null
}
```

---

## 5. Cascade on "can't do right now"

When the user declines/delays, the agent should:
1. Acknowledge kindly (no guilt — docs/01 §5/#17).
2. Mark the task `blocked` (or `deferred`) with the given reason.
3. Re-offer the task at a concrete new time (default: next free slot; ask if a specific time).
4. **Cascade** downstream/dependent tasks to new slots so the day stays coherent.
5. Record the actual duration on completion to recalibrate the estimate (docs/01 §2).
6. Update `tasks.md` and feed the outcome to the nightly persona builder.

The cascade reuses the existing scheduling engine (`lib/scheduler.ts`) — greedy first-fit into
free slots, bumping lower-priority tasks when needed, leaving slack (approx. 20–25% under-load).

---

## 6. Deliver routes

| Channel | Route |
|---|---|
| Web (active session) | Inject an assistant message into the user's OpenCode session, or show a UI card; user responds via the same route |
| WhatsApp (Phase 2) | `POST /api/whatsapp/webhook` → reminder text → user replies with intent text → parser → cascade |
| Offline | Queue + deliver via push/WhatsApp if enabled; otherwise fold into the next morning digest |

---

## 7. Reminder scheduler pseudocode (cron)

```
every 1 minute, for each user:
  persona  = read persona.md; tasks = GET /api/tasks
  for each task where task.state in (not_started, in_progress)
       and not in quiet_window(now)
       and not inside_deep_block(user, now)
       and (lead_time_reached(task, now) or digest_due(...)):
    if is_time_sensitive(task):  deliver_single(task)
    else:                        queue_for_digest(task)
  if digest_due: send morning plan digest / end-of-day review digest
```

---

## 8. Data written back (signals)

- `reminder_acknowledged`, `reminder_snoozed_until`, `reminder_response`
- Actual vs estimated duration per completion → recalibration
- Decline reasons → recurring-blocker patterns for persona
- These are consumed by the nightly persona builder (docs/02 §6) so reminders get
  progressively better calibrated to the user's reality.
