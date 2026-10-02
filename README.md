# OpenVoice Edge

A private text-to-speech and speech-to-text web app that runs on Cloudflare Workers. It has a React front end and an OpenAI-style HTTP API.

| | Models |
|---|---|
| Text to speech | Edge TTS (free, 500+ voices), CosyVoice2, MOSS-TTSD (two-speaker dialogue) |
| Speech to text | SenseVoiceSmall (fast), XingChenASR-V3.2 (dialects), XingChenASR-Diarize-V3.0 (speakers and timestamps) |

CosyVoice2, MOSS-TTSD and the three speech-to-text models run on [SiliconFlow](https://siliconflow.cn). Edge TTS needs no key. The UI is available in Chinese and English.

Access is private. Every request needs an access key. The admin edits settings in the browser, so you don't have to redeploy to change them.

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in ADMIN_TOKEN (24+ characters)
npm run dev                      # http://localhost:5173
```

Open the page and enter `ADMIN_TOKEN` as the access key. Open **Admin** to paste the SiliconFlow key (or set `SILICONFLOW_API_KEY` in `.dev.vars`).

Without a SiliconFlow key only Edge TTS is offered. The app lists only the models that can run.

Checks:

```bash
npm test                 # unit and route tests (no network)
npm run typecheck
npm run lint
npm run check:size       # source files stay under 1000 lines
npm run smoke -- http://localhost:5173           # quick check of a running instance
npm run smoke -- http://localhost:5173 --full    # also calls every SiliconFlow model once
```

`smoke` reads `ADMIN_TOKEN` from `.dev.vars`. For a deployment, set `OVE_TOKEN` to an access key instead. `--full` spends a small amount of SiliconFlow balance.

## Deploy

```bash
npx wrangler login
npx wrangler secret put ADMIN_TOKEN            # 24+ characters, this is the admin credential
npx wrangler secret put SILICONFLOW_API_KEY    # optional, can be set later on the Admin page
npm run deploy
```

The `CONFIG` KV namespace in `wrangler.jsonc` has no id. Recent Wrangler versions create it on the first deploy. If yours does not, run `npx wrangler kv namespace create CONFIG` and put the returned id in `wrangler.jsonc`.

### Deploying from GitHub

`.github/workflows/deploy.yml` runs typecheck, lint, tests and the build on every push and pull request. **A push never deploys by itself.** Deploying is a separate, deliberate step. Run `./scripts/release.ps1` with no arguments to print the help. Nothing happens until you pass an option.

| Command | What it does |
|---|---|
| `./scripts/release.ps1 -Message "what changed"` | Runs the checks, scans the changes for secrets, commits, pushes and waits for the GitHub checks. Nothing reaches Cloudflare. |
| `./scripts/release.ps1 -Message "what changed" -Deploy` | The same, then deploys to Workers and checks the live site. |
| `./scripts/release.ps1 -Deploy` | Deploys what is already on `main`. |
| `./scripts/release.ps1 -Push` | Pushes commits you already made. |
| `./scripts/release.ps1 -DryRun` | Rehearses everything without committing, pushing or deploying. |

After a deploy the script checks `https://openvoice-edge.hicms.workers.dev/api/health`. Use `-Url` to check another site. If `OVE_TOKEN` holds an access key, it also runs the full smoke test. `-SkipChecks` skips the local checks.

You can also deploy from the Actions tab: choose "CI and deploy", then "Run workflow" on `main`.

The deploy job needs two secrets in the `production` GitHub Environment: `CLOUDFLARE_API_TOKEN` (an API token with only Workers Scripts: Edit and Workers KV Storage: Edit) and `CLOUDFLARE_ACCOUNT_ID`. Install and build run without them. Only the deploy step sees the token. `ADMIN_TOKEN` and the SiliconFlow key are not stored in GitHub. Set them once with `wrangler secret put`, and later deploys keep them.

### Where settings live

| Setting | Stored in | Notes |
|---|---|---|
| `ADMIN_TOKEN` | Worker secret | Admin credential. Never written to KV. |
| SiliconFlow key | KV (from the Admin page) or `SILICONFLOW_API_KEY` | The KV value wins. The Admin page only shows the last 4 characters. |
| Defaults, character and file limits | KV | Edited on the Admin page. |
| Access keys | KV | Only a SHA-256 hash is stored. The full key is shown once when you create it. |

KV is eventually consistent. A new setting or a revoked access key can take up to about a minute to reach every location.

### Access keys

The admin creates one key per person on the Admin page (format `ovk_<id>_<secret>`) and can revoke it at any time. Keys work for both the UI and the API.

The Worker rate-limits by IP before it checks the key (60 per minute), and again per key afterwards (30 per minute). Long text is sent in several calls, so a 5000-character text can use 7 to 10 of those 30. Change the limits in `wrangler.jsonc`.

### Operation logs

Open **Admin → Operation logs** to review speech and transcription requests, newest first. Filter by operation type or result, refresh for new records, or load older records. Settings remain in their own tab.

Each entry shows the completion time (in your browser's local time), the administrator or access-key label, model, input character count or uploaded audio size when available, processing time, and success or failure. Failed requests show a short reason. Revoking an access key does not remove its existing records or label.

Logs cover authenticated requests that reach `/v1/audio/speech` or `/v1/audio/transcriptions`, from both the website and API clients. Each client-side part of a long text is a separate entry. Server-side splitting remains one entry. Success means the server finished processing, not that the browser finished playback or download. Browser cancellation, authentication failures and requests rejected by the authentication rate limit are not separate log events.

Only summaries are stored: no input text, tone instructions, transcript, audio, filename, IP address or credential. Entries expire after 30 days. Processing time excludes the log write. The administrator-only endpoint is `GET /api/admin/logs`, with optional `kind=speech|transcription`, `status=success|failed`, and `cursor`. It returns `{ logs, cursor }`; keep the same filters with the returned cursor until it is `null`. A filtered page may be empty while its cursor still points to older records.

Logs use the existing `CONFIG` KV binding, so no migration or new service is needed. KV is eventually consistent and records may take time to appear. Each completed request adds one KV write and shares the [KV usage limits](https://developers.cloudflare.com/kv/platform/limits/) with settings and access keys. This is intended for a private, low-volume app. If storage fails or its quota is exhausted, the operation still returns its original result and the Worker emits `operation_log.write_failed`; the record can be missing, and an exhausted shared write quota also affects settings and key changes. Logs are best effort, not a billing ledger or guaranteed audit trail.

## API

All calls need `Authorization: Bearer <access key>`. The API is same-origin only (no CORS headers).

```bash
# List the models that can run
curl -H "Authorization: Bearer $KEY" https://your.workers.dev/v1/models

# Text to speech (returns audio/mpeg)
curl -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"edge-tts","input":"Hello there","voice":"en-US-AriaNeural"}' \
  https://your.workers.dev/v1/audio/speech -o hello.mp3

# Speech to text
curl -H "Authorization: Bearer $KEY" \
  -F model=XingChenAGI/XingChenASR-Diarize-V3.0 -F response_format=srt \
  -F file=@meeting.mp3 https://your.workers.dev/v1/audio/transcriptions
```

Speech request fields: `model`, `input`, `voice`, `speed` (0.25–4), `pitch` and `volume` (Edge only, -50 to 50 percent), `style` (Edge only), `instructions` (CosyVoice2 tone). For MOSS-TTSD write the script as `[S1]...[S2]...`.

Transcription `response_format` is `json`, `text`, `verbose_json`, `srt` or `vtt`. SRT and VTT only work with models that return timestamps (Diarize). Others get `422 no_timestamps`.

Errors use `{ "error": { "message", "type", "code" } }`. Error bodies never include upstream text, keys or your input.

## Limits

- Text to speech: 5000 characters per request by default (admin can raise it to 30000). Long text is split at sentence boundaries and joined. CosyVoice2 is split at 500 characters and runs three parts at a time. MOSS-TTSD is not split.
- Speech to text: 25 MB per file by default (hard cap 50 MB). Free Workers plans have tight CPU and memory limits, so keep files small there.
- Edge voices whose id contains `:` (Dragon HD) are left out because they return truncated audio.
- The Edge voice list is a snapshot in `worker/data/edge-voices.json`. Refresh it with `npm run sync-voices`.

## Privacy

- Text and audio go to Microsoft (Edge TTS) or SiliconFlow (everything else). The Worker does not store them.
- The browser keeps your access key and the last 20 generated texts in `localStorage`. Use a private device, or sign out from the account menu to remove the key.
- Administrators can view operation summaries in KV for 30 days, including access-key labels. Logs never contain credentials, input text, transcripts, filenames, audio or upstream response bodies.

## Layout

```
shared/    types, zod schemas, text splitting, subtitle formats (used by both sides)
worker/    Hono app: auth, admin, speech, transcription, catalog, providers
src/       React app (features/tts, features/stt, features/admin, i18n)
public/    _headers (CSP, nosniff, microphone policy), theme boot script
scripts/   sync-voices.ts, smoke.ts, check-size.ts
tests/     vitest suites for shared and worker code
```
