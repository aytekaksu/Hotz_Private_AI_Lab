# Architecture & Tool Calling

## Overview

This app is a Next.js 14 project using the Vercel AI SDK v5 and the OpenRouter provider. The chat API streams responses and supports multi‑step tool calling, enabling the model to chain several tools (e.g., Google Calendar followed by Google Tasks) within one answer.

Key components:
- `apps/web/app/api/chat/route.ts` — server route that prepares the prompt, tools and streams the result.
- `@ai-sdk/openai` via `openrouter.chat(...)` — model endpoint.
- `convertToModelMessages(...)` — converts UI messages (including tool and file parts) into model messages.
- `apps/web/lib/tools/*` — tool implementations.
- `apps/web/lib/tools/executor.ts` — routes tool invocations to concrete implementations.
- SQLite persistence in `apps/web/lib/db/*`.

## Message Flow
1. Client sends UI messages to `/api/chat`.
2. Server normalizes attachments (files/images become file parts), injects a system message with current context.
3. Tools are prepared from conversation-enabled set (+ `get_current_datetime` always available).
4. `streamText` is called with `openrouter.chat('anthropic/claude-haiku-4.5')`, messages and tools.
5. The model may call tools (multiple steps). The SDK executes tools with `execute` handlers.
6. Once finished, the assistant text is saved and streamed to the client.

## Tool Calling

### Calendar (Token‑safe)
`apps/web/lib/tools/google-calendar.ts` implements:
- Input normalization: accepts `start_date/end_date` or `start/end` (RFC3339 or `YYYY-MM-DD`).
- Field selection: requests only required fields from Google (via `fields` parameter).
- Server‑side filtering by the requested window.
- Output shaping defaults:
  - Minimal fields: `id`, `title`, `start`, `end`.
  - `max_results` (default 20, bounded by `GCAL_MAX_EVENTS`).
  - `truncate_description` (default 140 or `GCAL_MAX_EVENT_DESCRIPTION`).
  - Optional flags to include `description`, `location`, `attendees`, `link`.
  - Pagination via `page_token` and `next_page_token`.

This prevents tool outputs from bloating the model context.

### Tasks (Token‑safe)
`apps/web/lib/tools/google-tasks.ts` implements:
- Primary list by default (`@default`) to avoid extra lookups.
- Output shaping defaults:
  - Minimal fields: `id`, `title`, `status`, `due`.
  - `max_results` (default 20, bounded by `GTASKS_MAX_TASKS`).
  - Optional flags to include `notes` and `completed` tasks.
  - Pagination via `page_token` and `next_page_token`.
- Request timeouts via `GTASKS_TIMEOUT_MS` to prevent hanging tool calls.

### Notes for Agents
- Tools are enabled per conversation and require OAuth when applicable (Google/Notion). The UI exposes a Tool dialog to toggle them.
- Keep tool outputs small: prefer pagination (`next_page_token`) to large blobs.
- The server filters and trims responses; do not assume full objects are returned.

### Time (Seamless)
`get_current_datetime` returns rich data (ISO, date, time, timezone, etc.). The system prompt instructs the model to integrate this information naturally, without mentioning tool usage.

### Image Understanding
User image attachments are embedded as `file` parts (data URLs). The AI SDK converts them for the provider (e.g., OpenAI‑compatible image inputs), allowing the model to describe images.

## Streaming & Multi‑step Execution

The server calls `streamText` with `stopWhen: [stepCountIs(8)]`, allowing up to 8 steps (LLM calls/tool cycles). The AI SDK automatically orchestrates tool calls and streams tokens back to the client. The UI provides a `Stop` button that calls `stop()` to abort streaming.

## Persistence & Conversation State
- SQLite stores users, conversations, messages, attachments, and OAuth credentials.
- The runtime exclusively uses Bun's built-in `bun:sqlite` driver; there is no Node-specific fallback.
- The chat route persists the last assistant text and updates conversation titles based on first user messages.

## Tricky Parts & Tips
- Always convert UI messages to model messages (`convertToModelMessages`) before calling the model.
- Images must be `file` parts; simple `image` parts won’t be recognized.
- For calendar queries, keep outputs small; if the model needs more events, it can request `next_page_token` or increase `max_results` thoughtfully.
- Use `stopWhen` to control step limits for iterative tool calling.
