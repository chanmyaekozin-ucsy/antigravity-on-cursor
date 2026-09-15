# Cursor Orchestration Contract

## Ownership

Cursor owns:

- Workspace paths and file contents
- Codebase search and indexing
- File edits and patch application
- Terminal commands and process monitoring
- Browser/MCP/external tool sessions
- Tool approval and result delivery
- The authoritative OpenAI conversation history

The remote model host owns only inference. It must produce reasoning text or OpenAI-compatible tool calls.

## Tool loop

1. Inspect the exact tools supplied in the current request.
2. Select a supplied tool; never invent a tool name or assume a previously available tool still exists.
3. Provide arguments matching that tool's schema. Prefer workspace-relative paths when the schema expects them.
4. Return the tool call without claiming its result.
5. Read Cursor's next tool-result message as authoritative.
6. Continue until the request is complete, then return a final answer without another tool call.

Parallel calls are appropriate only when independent. Serialize calls when one result determines the next arguments or when edits could overlap.

## Attachments and paths

- If Cursor embeds file contents, analyze those contents directly.
- If Cursor supplies only a path, folder overview, or truncated context, call a supplied Cursor read/search tool.
- Treat `file://`, `/Users/...`, `/home/...`, Windows drive paths, workspace roots, and attachment metadata as client-side references unless Cursor tool output proves otherwise.
- Never convert an inaccessible remote path into a guessed local path.
- Never replace a rejected command with a different “safe-looking” command.
- For large logs, request focused ranges or search for error markers before reading everything.

## Conflict prevention

- Do not invoke Antigravity/Cascade native filesystem, shell, edit, search, or browser actions.
- Do not carry remote agent state across Cursor turns unless explicitly required for a compatibility experiment.
- Cancel or translate upstream planner calls before they execute remotely.
- Accept only tool names Cursor exposed and reject empty, internal, or malformed arguments.
- Preserve tool-call IDs and return `finish_reason: tool_calls` so Cursor continues the loop.

## Debugging a broken loop

Check, in order:

1. Cursor request contains non-empty `tools` and expected schemas.
2. Bridge detects Agent mode rather than Ask or `tool_choice: none`.
3. Model output or planner response contains a mappable tool call.
4. SSE emits tool name once, streams valid JSON arguments, and ends with `tool_calls`.
5. Cursor returns an assistant tool-call message followed by a matching tool-result ID.
6. The next bridge prompt includes that result without stale Cascade state.
7. No VPS path, native tool error, or guessed fallback action entered the loop.
