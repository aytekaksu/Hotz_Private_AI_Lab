# Changelog

All notable changes to this project will be documented in this file.

## 2025-10-14

### Added
- Chat UI: Stop button to abort a streaming response mid‑generation.
- Image understanding: user image attachments are now sent to the model as `file` parts (data URLs), enabling proper vision analysis.

### Changed
- Upgraded to latest AI SDK stack (`ai` v5, `@ai-sdk/react` v2, `@ai-sdk/openai` v2) and migrated server/client integrations:
  - Server uses `openrouter.chat(...)` with `streamText` and `convertToModelMessages` to ensure correct tool calling.
  - Enabled multi‑step tool execution; the model can chain multiple tools per answer.
  - System prompt updated so `get_current_datetime` usage is seamless (no tool mentions in replies).
- Calendar tool hardening (`list_calendar_events`):
  - Accepts `start_date`/`end_date` or `start`/`end`; normalizes to RFC3339.
  - Requests only required fields from Google and filters strictly by the requested window.
  - Token‑safe defaults: minimal fields only; description/location/attendees/link excluded unless requested.
  - Event list size capped (`max_results`, bounded by `GCAL_MAX_EVENTS`, default 50) with description truncation (`truncate_description` or `GCAL_MAX_EVENT_DESCRIPTION`).
  - Pagination supported via `page_token` and returns `next_page_token`.

### Fixed
- Excessive token usage (10k+ / 100k+) from dumping large calendar payloads into context.
- Model confusion when listing events for a specific month (older items leaking in).
- Vision: model previously couldn’t “see” images even when attached.

