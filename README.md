# Personal LLM Chat

A private, ChatGPT-style assistant that runs on **your own Anthropic and OpenAI API keys**. It is built
with Next.js for one-click hosting on **Vercel**.

- **Chat** with Claude (Sonnet 5.5, Opus 5.5, Haiku 5.5, Fable 5.1) or OpenAI (GPT-6.1 Sol, GPT-6 Astra,
  GPT-6 Luna). You can switch models at any point in a conversation.
- **Documents.** When asked for a letter, report, plan, recipe and so on, the assistant writes it into a
  document panel beside the chat. From there she can **edit** it and **download it as Word, PDF or Markdown**.
  Any normal reply can be downloaded the same way.
- **Files and photos.** Attach images, PDFs, Word (.docx) and text/CSV files and ask about them. Drag and
  drop and paste also work.
- **Web search** for current information, with source links. Choose it from the **+** menu.
- **Image creation and editing** with OpenAI's GPT Image models. Choose **Create image** from the **+** menu.
  Press **Edit** under a picture to change it.
- **History synced across devices** (Upstash Redis). Chats can be searched, renamed and deleted, and get
  automatic titles.
- **Settings:** her name, "what the assistant should know about you", response style, default model,
  light/dark theme, and this month's usage.
- **Password protected.** Each person can have their own password and their own private history.
- Works well on phones. On an iPhone, use **Share → Add to Home Screen** for an app-like icon.

---

## Deploy to Vercel (about 15 minutes)

### 1. Put the code on GitHub
Create a **private** repository and push this folder to it:

```bash
cd personal-llm-chat
git init && git add . && git commit -m "Personal LLM chat"
git branch -M main
git remote add origin https://github.com/<you>/personal-llm-chat.git
git push -u origin main
```

### 2. Import the repository into Vercel
Vercel → **Add New… → Project** → pick the repository. The framework is detected as **Next.js**. Leave
the build settings as they are and click **Deploy**. The first deploy works, but shows a set-up warning
until you finish steps 3 and 4.

### 3. Add chat storage (free)
In the Vercel project: **Storage → Create Database → Upstash → Upstash for Redis** (the free plan is
plenty). Connect it to this project for all environments. Vercel adds `KV_REST_API_URL` and
`KV_REST_API_TOKEN` automatically. The app also accepts `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN`.

### 4. Add environment variables
Project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `APP_PASSWORD` | Her password. **Or** use `APP_USERS` = `Mei:her-password, Alvin:your-password` to give each person separate history. |
| `AUTH_SECRET` | A random string: `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | From console.anthropic.com → API keys |
| `OPENAI_API_KEY` | From platform.openai.com → API keys (needed for OpenAI models and image creation) |
| `APP_NAME` | Optional, e.g. `Mei's Assistant` |

Then **Deployments → ⋯ → Redeploy** so the new variables take effect.

### 5. Provider settings worth checking
- **Spend limits.** Set a monthly spend limit in both the Anthropic and OpenAI consoles (OpenAI now supports
  hard limits per project). This is the real safety net for your credits.
- **Anthropic web search** has to be switched on for your organisation by an admin in the Claude Console
  settings. If it isn't, searches with Claude models return an error, but GPT models still search.
- **OpenAI image models** may require organisation verification on the OpenAI platform before first use.

### 6. Optional extras
- **Custom domain:** Vercel → Settings → Domains.
- **Fluid compute** should be on (the default for new projects). It allows long answers to stream for up
  to 300 seconds on the Hobby plan.

---

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in at least APP_PASSWORD and one API key
npm run dev                  # http://localhost:3000
```

Without Redis variables, chats are stored in `.data/store.json`.

---

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `APP_PASSWORD` / `APP_USERS` | — | Sign-in. `APP_USERS` is `Name:password` pairs separated by commas. |
| `AUTH_SECRET` | derived from passwords | Signs the 30-day login cookie. Changing it signs everyone out. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | — | Only models whose key is set are offered. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | — | Upstash Redis (chat history, files, settings, usage). |
| `APP_NAME` | `My Assistant` | Name in the sidebar, browser tab and login page. |
| `DEFAULT_MODEL` | first available | Starting model. Each person can change it in Settings. |
| `IMAGE_MODEL` | `gpt-image-2.5-flare` | Model for new images. |
| `IMAGE_EDIT_MODEL` | `gpt-image-2.5-sunburst` | Model for editing an attached image. |
| `TITLE_MODEL` | `claude-haiku-5-5` or `gpt-6-luna` | Cheap model that names chats. |
| `WEB_SEARCH_MAX_USES` | `5` | Maximum searches per answer (Claude). |
| `ANTHROPIC_MAX_TOKENS` | `16000` | Longest Claude reply. |
| `ANTHROPIC_WEB_SEARCH_TOOL` | `web_search_20250305` | Web search tool version for Claude (e.g. `web_search_20260209` for dynamic filtering). |
| `MODELS_JSON` | built-in list | Replaces the model list without code changes: a JSON array of `{id, provider, label, description, reasoning?}`. |
| `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL` | official APIs | Point at a proxy or gateway if you use one. |

**Changing models:** the built-in list is in `lib/models.js`. Model names change often, so edit that file or
set `MODELS_JSON` when providers release new ones.

---

## How it works

```
app/
  page.js, c/[id]/page.js   – the chat app (server checks the login cookie)
  login/                    – password page
  api/chat                  – streams replies from Anthropic (Messages API) or OpenAI (Responses API)
  api/image                 – OpenAI Images API (create / edit)
  api/upload, api/files     – attachments, stored in Redis
  api/chats, settings, usage, title, login, logout
components/                 – React UI (sidebar, composer, messages, document panel, settings)
lib/
  providers/                – Anthropic + OpenAI streaming adapters (plain fetch, no SDKs)
  kv.js, store.js           – Upstash REST client + data model
  auth.js                   – HMAC-signed session cookie
  client/                   – browser helpers: streaming, document parsing, Word/PDF export
```

- API keys never reach the browser. All provider calls happen in Vercel functions.
- The model is told to wrap documents in `<document title="…">` tags. The UI shows those as document cards
  and in the side panel, and the exporters turn them into .docx (via the `docx` library), PDF (the browser's
  print dialog, then "Save as PDF") or .md.
- Files are kept in Redis with the chat and deleted with it. Large photos are shrunk in the browser before
  upload.
- Claude conversations use prompt caching, so follow-up questions about long chats or PDFs cost less.

## Limits and notes
- **4 MB per file.** Vercel function requests are capped at about 4.5 MB. Photos are resized
  automatically; split very large PDFs.
- The last 60 messages of a chat are sent to the model. For a fresh topic, start a new chat (it is also
  cheaper).
- **PDF export** opens the print dialog; choose *Save as PDF*. On iPhone it opens a new tab: use
  *Share → Print*, then pinch out on the preview to save.
- **Usage** in Settings counts tokens per model this month. For money, check the provider consoles.
- Login attempts are rate-limited (10 per 10 minutes per IP). The site sends `noindex` headers and a
  `robots.txt` that blocks search engines.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Yellow banner "Chat storage is not connected" | Connect Upstash Redis (step 3) and redeploy. |
| "No AI provider is set up" | Add an API key and redeploy. |
| "The API key was rejected" | Re-copy the key into Vercel; make sure there are no spaces. |
| "That model is not available to this API key" | The model name changed or your account lacks access: edit `lib/models.js` or set `MODELS_JSON`. |
| Claude search error | Enable web search in the Claude Console (step 5). |
| Image errors | Check OpenAI organisation verification and that `IMAGE_MODEL` exists for your account. |
