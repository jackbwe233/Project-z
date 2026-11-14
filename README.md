# Project Z

Project Z adds a silver-and-white companion interface to the existing browser AI app. All model bundles, model selection, cache keys, and existing chat databases are preserved.

- Chats continue saving automatically to IndexedDB; settings retain their existing localStorage keys.
- Cross-chat memory is an editable local note (up to 2,000 characters). Start a message with **Remember that …** or **My preference is …** to add a note automatically. It does not infer personal facts from every message. Notes are supplied to both standard and tool-enabled chat prompts.
- New chats use Z’s casual, honest personality. The old generic prompt also adopts it at inference time; custom prompts are preserved.
- Open **Memory** to edit, clear, export, or request persistent storage. Restore exported text by pasting it into the note box. Clearing notes does not erase their original chat messages. Existing chat export controls remain available separately.
- Local storage survives ordinary browser restarts, but private browsing, website-data clearing, storage pressure, or browser policies can remove it. Storage is device/browser specific; no cloud sync is added.
- **Dictate** uses browser speech recognition where supported and inserts text for review before sending. **Read reply** speaks the most recent reply on tap. **Stop voice** cancels speech and dictation. Speech recognition may use the browser provider’s online service; no paid API or key is added. iPhone Safari support and permission behavior require device testing.
- A stylized human-like avatar blinks, breathes and changes during thinking, dictation and speech. Reduced-motion preferences disable animation. The avatar is stylized, not photorealistic.

## Repeating replies

All three runtimes stop generation when the output ends in twelve consecutive copies of a word or short phrase (or a long repeated character block). The repeating output is replaced with a recovery message, and a runtime cache reset is requested where supported. This also stops voice mode from reading a failed reply. Start a new conversation after a loop; switching models can help if it persists. This guard also limits intentionally repetitive output and is not a guarantee of answer quality.

## Voice conversations

Load a model, clear any unsent draft, then tap **Talk to Z**. This opt-in mode sends final recognized speech automatically, waits for the model, speaks the completed reply, and listens for the next turn. **Dictate** still inserts text for review without sending. **Stop voice**, changing chats, typing, or leaving the page stops the voice session; it does not cancel a model response already running (use the chat Stop control for that). Late callbacks cannot restart a stopped session. Silence, recognition errors and playback errors end the session instead of repeatedly requesting microphone access. Listening times out after 30 seconds; playback after two minutes.

Voice uses the browser's Web Speech APIs and may require HTTPS, permission and an online speech service. Browser support varies; real microphone/speaker testing on the target iPhone and desktop is still required. There is no wake word or background microphone. Long model replies may exceed the playback timeout.

## Command Center

The Command Center uses larger touch targets and simpler headings for iPhone and desktop. The underlying proposal records, local backups, and creator approval rules are unchanged. For a manual check, open `command-center.html`, add an idea and a low-risk proposal, verify that votes still appear, then export a backup. This is a layout-only upgrade, not authenticated shared approvals.

Open **Command Center** from chat for local proposals, creator vote records, validation notes and ideas. Any rejection blocks a proposal. Major/high-risk proposals require both approvals. Low-risk proposals require both approvals or one approval plus a written validation note. Legacy checkbox-only validations no longer qualify as evidence. Votes can be reset.

These are local records, not authenticated approvals: anyone using the browser can enter either vote. The page neither contacts the other creator nor executes approved changes. Export/restore JSON backups preserve the queue and ideas. Restore validates all records before replacement and asks before overwriting. Invalid stored data disables new entries until it has been exported and restored or explicitly deleted. Entries are limited to 200 proposals and 500 ideas.

## Stock research agents

Open **Stock research**, enter the ticker plus company/exchange, and add up to ten research agents. Each agent is a bounded search job: **Run research** or **Run all** retrieves three groups of evidence (company filings, recent news, risks) through the existing Exa MCP provider. Jobs run sequentially and searches time out after 25 seconds. Stop cancels the current request and preserves previously completed reports. Search failures and empty results are displayed explicitly.

Reports contain source links, excerpts and retrieval timestamps, not verified publication dates, live prices or trading signals. Query terms are sent to Exa only when you run research. Results may be stale or identify the wrong company; check source documents. **Draft summary in Z Chat** transfers a bounded evidence prompt through sessionStorage for review, then the user sends it to the loaded local model. Small models/context windows may not reliably summarize every source. No report is automatically sent to chat.

Watchlists and reports save locally, with JSON export/validated restore. Imported links are restricted to HTTP(S); excerpts render as text. These jobs do not trade, manage a portfolio, monitor in the background, or create autonomous agents. Shared memory, remote creator identities, scheduled monitoring, vehicle access and self-modifying code require separate services and are not implemented here.

### Validation

`npm run lint` and `npm test` cover the voice state machine (including stop races), approval rules, backup validation, research cancellation/timeouts, and DOM workflows. Browser rendering, real speech recognition/playback and live model inference must also be checked on target devices before deploying. Live Exa availability is an external dependency, not guaranteed by mocked provider tests.

Run `npx playwright install chromium` and `npm run test:browser` for desktop and 390px layout checks, research-to-chat handoff and Command Center workflows. GitHub CI includes these checks when repository workflows are enabled. These tests use mocked search results and do not simulate real microphone hardware.

Deploy the repository root with GitHub Pages as before. Run `npm ci`, `npm run lint`, and `npm test` to validate.

---

# WebLLM

Private, on-device AI with an agent loop that runs in the browser.

**[Open Project Z](https://jackbwe233.github.io/Project-z/)**

![WebLLM running locally in the browser — model load, chat, and web search](docs/webllm-x.gif)

WebLLM is a proof of concept: can a useful model load from a static website, reason,
call a tool, inspect the result, and continue its work without an account, API key,
backend, or local installation?

Today, the answer is yes—with the limits of today's small on-device models. Models
will improve, and the harness can improve with them. This project is step zero: a
small, inspectable implementation of agentic work on private local inference.

## What works today

- Local inference through WebGPU
- Gemma 4 E2B with thinking and tool use
- Bonsai 27B with a compact 4K context window and tool use
- Smaller LFM2.5 230M and 350M models with tool use
- A bounded model → tool → model agent loop
- Conversation-scoped text files with fuzzy `@file` references, local `read`, and safe regex/literal `grep`
- Optional web search through Exa MCP, with no API key
- Local conversation history and model caching
- Editable system prompts and prompt-guided JSON or EBNF output
- OpenAI-compatible conversation exports and detailed debug traces

The production app is static HTML and JavaScript. There is no application server
and no build step.

## Try it

Use Chrome 113+, Edge 113+, or Safari 18+. Firefox is not supported by the current
WebGPU runtimes.

1. Open [Project Z](https://jackbwe233.github.io/Project-z/).
2. Choose a model in the sidebar.
3. Select **Load model**.
4. Wait for the first download and warm-up, then send a message.
5. Optionally add text files and reference them with `@`, or enable **Web search**.

The first load downloads model weights from Hugging Face. Gemma is about 2.5 GB;
the LFM models are about 150 MB and 220 MB. The browser caches them for later
visits when storage is available.

No account or API key is required. “Zero setup” still means that the browser must
support WebGPU, have enough storage, and download a model once.

## How the agent loop works

The loop is deliberately conventional. The model does not directly call JavaScript
or access the network. It emits structured text asking for a declared tool; the
harness parses that request, runs the matching function, records its output as a
tool message, and asks the model to continue.

```text
user message
    ↓
assemble system prompt + transcript + tool definitions
    ↓
local model generation
    ├─ final answer ──────────────────────────────→ save and render
    └─ tool call
          ↓
       validate and execute registered tool
          ↓
       append assistant tool call + tool result
          ↓
       local model generation resumes
```

For one agent turn:

1. `app.js` adds the user's message to the current session.
2. `lib/messages.js` builds the effective model transcript.
3. `lib/agent-loop.js` asks the model adapter for a generation.
4. The adapter selected by `lib/runtime-registry.js` translates canonical messages
   and normalizes that runtime's output.
5. If there is no tool call, the answer is complete.
6. If there is a tool call, the loop resolves it against the tool registry and
   executes it. Unknown tools and execution failures become tool-result messages,
   so the model can see what happened.
7. The assistant tool call and matching tool result are appended to the transcript,
   then generation runs again.
8. The resulting canonical messages are saved to IndexedDB and rendered by the UI.

Declarative descriptors in `lib/tool-registry.js` resolve preferred, eligible, and
active state before building one set containing local `read`, `grep`, and optional
`web_search`. The loop itself is model- and tool-agnostic: tools provide a name,
schema, execution function, prompt policy, trust level, and whether concurrent
execution is safe.

### What is inserted where

The stored session contains:

- the editable system prompt;
- chronological `user`, `assistant`, and `tool` messages;
- thinking and generation metrics on assistant messages;
- tool call IDs and execution metadata.

The stored system prompt defaults to:

```text
You are a helpful assistant.
```

Immediately before a model call, the app creates an effective system message. It
does not rewrite the stored prompt. The layers are added in this order:

1. The session's system prompt.
2. The fixed January 2025 knowledge cutoff and the browser's current local date.
3. In agent mode, the tool-call protocol.
4. Policies contributed by active tools, such as when and how to search.
5. Guards telling the model to treat uploaded and external tool data as evidence,
   never as instructions.
6. In ordinary chat mode, optional JSON or EBNF guidance.

Active tool schemas are supplied through the selected runtime adapter. Tool policy
is rebuilt before every generation, so the final tools-disabled generation does
not retain stale tool-use instructions. File/web tools and grammar guidance are
mutually exclusive in the current UI.

Before generation, the loaded model's tokenizer measures the complete prompt. The
input budget reserves the requested output length plus 256 safety tokens. If the
conversation is too large, the harness removes the oldest complete user turns. It
never splits an assistant tool call from its tool result and never shortens the
current turn. If the current turn alone does not fit, generation fails visibly.

### Boundaries and stopping rules

Agent execution is bounded so a small model cannot search forever:

- At most three tool rounds
- At most four calls from one generation
- At most eight calls in one user turn
- One final generation with tools disabled after the tool-round limit

Calls execute sequentially unless every requested tool explicitly declares itself
parallel-safe. `web_search` is parallel-safe. Stopping a response propagates an
`AbortSignal` through model generation and search, and partial state is preserved.

Tool calls are only executed after the parser finds a complete, balanced call.
Calls inside an open thinking channel and truncated calls are ignored. This avoids
executing half-generated arguments.

### Local files, end to end

Users can select or drop up to 10 supported text files per conversation. Original
inputs and normalized files are limited to 1 MB each, while the 5 MB conversation
quota measures normalized text actually stored in IndexedDB. Files are decoded
and normalized in the browser and rejected if binary or unsupported. The app
never receives an operating-system path or broader filesystem access.

The composer and historical message editor offer fuzzy `@file` completion.
Uploading adds a file to the conversation workspace but does not reference it;
the user explicitly selects a workspace row or autocomplete result to add a
removable reference chip. Plain typed `@filename` text never attaches a file.
Stored user messages keep only selected stable attachment IDs; bounded excerpts
are added at the model boundary and are not duplicated into chat history. File
references are inactive when both local tools are disabled. A metadata-only
manifest lets the model discover available virtual paths while a local tool is
active.
`read` and `grep` are enabled by default in the Tools sidebar and are automatically
re-enabled when files are uploaded. The read-only tools can:

- `read` numbered line ranges from one exact virtual path;
- `grep` JavaScript regular expressions across uploaded files, with an explicit
  literal-text mode and optional path or extension filtering. Regex matching runs
  in a disposable worker with a strict deadline so catastrophic backtracking
  cannot block the interface.

File excerpt and tool-output budgets are declared with each model, with especially
small limits for Bonsai's 4K context window. Files are conversation-scoped:
deleting a conversation deletes its attachments, and clearing browser site data
removes both.

The default OpenAI conversation export does not expand file references. The
diagnostic export captures exact post-fitting runtime requests for the latest
in-memory turn. After reload it falls back to a clearly labelled reconstruction of
current context. Diagnostics can include bounded referenced-file excerpts; the
download dialog labels this before export. Neither format bundles complete
attachment records.

### Web search, end to end

When Web Search is enabled, the effective prompt tells the model when to search and
how to write focused queries. A call can contain up to three queries. The search
tool:

1. normalizes and deduplicates queries for that user turn;
2. sends them to the public Exa MCP endpoint;
3. requests up to three results per query;
4. sanitizes and formats the returned evidence;
5. gives the same evidence to the UI and the local model.

The selected model then generates again with the full search result in its
transcript. It may answer, make another search within the limits, or report that
the evidence is insufficient. The host does not truncate provider evidence,
classify answer quality, retry weak answers, or invent a result.

## Privacy and network access

Prompts, generations, chat history, and uploaded files stay in the browser when Web
Search is off. Inference and local file tools always run locally.

There are two intentional network paths:

- Model files are downloaded from Hugging Face and cached locally.
- When Web Search is enabled, normalized queries are sent to the third-party Exa
  MCP service and results return to the browser.

Search queries therefore are not private to the device. Search results are treated
as untrusted external data before being shown to the model.

Sessions and conversation-scoped text attachments live in the `webllm-sessions`
IndexedDB database. Preferences and theme live in `localStorage`. Model weights use
IndexedDB and/or Cache Storage depending on the runtime. Storage failures degrade
to in-memory chat and files where possible.

## Models

- **Gemma 4 E2B** — default, about 2.5 GB, thinking and `web_search`
- **LFM2.5 230M** — about 150 MB, fastest, native LFM tool calling
- **LFM2.5 350M** — about 220 MB, a larger LFM option with native tool calling

Gemma 4 E4B is not loadable by the app.

## Design decisions

**Browser first.** A static site is the shortest path from a link to private local
inference. It also makes the runtime boundary easy to inspect: the browser is the
application.

**A transcript, not hidden state.** Tool requests and results are ordinary
chronological messages. This makes sessions portable, debuggable, and exportable.

**A small generic loop.** The orchestration code knows how to generate, dispatch
tools, append results, and stop. Search-specific behavior stays in the search tool;
runtime-specific syntax and generation behavior stay behind the runtime registry.

**Bounded autonomy.** Hard round and call limits are more predictable than asking a
small model to decide when it has done enough.

**Visible failure.** Incomplete calls are not executed, tool errors go back into the
transcript, and oversized current turns fail rather than silently losing content.

**No host-side answer judge.** The harness currently accepts the model's final
answer. There is no evaluator, retry loop, memory summarizer, planner, or background
worker. Those are possible future improvements, not behavior hidden in the demo.

## Current limitations

- Web search is the only tool wired into the UI.
- Agent quality is constrained by a small local model and its tool-call reliability.
- Grammar mode is prompt guidance, not token-level constrained decoding.
- The model must remain loaded in the active page; there is no background runtime.
- Unit tests do not run real WebGPU inference.

This is a proof of concept, not a security boundary for executing arbitrary tools.
Any new tool should validate its inputs, define its output contract and trust
level, and expose only the minimum capability needed.

## Local development

Clone the repository and serve it over HTTP:

```bash
make run
```

Then open [http://localhost:8080](http://localhost:8080). Do not open `index.html`
through `file://`; normal model caching and persistence require an HTTP(S) origin.

There is no production build. Development dependencies are used only for linting
and tests:

```bash
make install
make lint
make test
```

`make ci` runs the same install, lint, and test sequence used by GitHub Actions.
Node.js 22 is used in CI.

## Project structure

- `index.html` — document shell and styles
- `app.js` — UI state, model lifecycle, streaming, persistence, and orchestration
- `lib/agent-loop.js` — bounded model/tool transcript loop
- `lib/messages.js` — effective prompt construction and exports
- `lib/runtime-registry.js` — runtime loading, token counting, generation options,
  tool protocol, and adapter selection
- `lib/gemma-adapter.js` — canonical-message and Gemma protocol boundary
- `lib/lfm-adapter.js` — canonical-message and LFM protocol boundary
- `lib/tools.js` — tool declarations and prompt policies
- `lib/web-search-tool.js` — query handling and search execution
- `lib/` — testable browser-independent application logic
- `gemma-4-e2b.js` and `lfm2_5.js` — vendored WebGPU runtimes
- `tests/` — Vitest unit tests
- `docs/architecture.md` — detailed source of truth for current behavior

## Contributing

Keep changes small and the production surface simple: vanilla JavaScript, static
assets, and testable logic in `lib/`. Run `make lint` and `make test` for every
change. Update this README and `docs/architecture.md` when the agent loop, prompt
layers, persistence, model registry, or privacy boundary changes.

Real inference is not covered by the unit suite, so runtime changes should also be
smoke-tested in a supported browser over HTTPS.

## Credits

WebLLM builds on the Hugging Face and Transformers.js ecosystem, including the
browser ML work of [Joshua Lochner](https://github.com/Xenova). The LFM runtime is
based on
[webml-community/lfm2-webgpu-kernels](https://huggingface.co/spaces/webml-community/lfm2-webgpu-kernels).
The bounded inner-turn design is informed by [pi.dev](https://pi.dev/).

## License

MIT
