# PaperLens

AI-powered scientific paper analysis platform. Upload PDFs or submit URLs from academic publishers — PaperLens parses the document with AI and generates structured summaries covering key findings, methods, significance, limitations, and broader context.

## Features

- **PDF upload and URL ingestion** — drag-and-drop PDFs or paste URLs from arXiv, bioRxiv, medRxiv, DOI-backed publishers, and any site with a `citation_pdf_url` meta tag
- **AI document parsing** — extracts structured text from PDFs via Azure AI Foundry
- **Structured summarization** — generates analyses covering Key Findings, Methods, Significance, Limitations, and Context
- **Extensible analyzer plugins** — summarizer built-in; peer review, claim verification, and journal club analyzers planned
- **Real-time job tracking** — polling-based status updates with toast notifications
- **Admin console** — user management, AI model configuration, per-user quota management, job monitoring with live stats
- **Cmd+K command palette** — quick navigation across the app
- **Security** — JWT auth with httpOnly cookies, Redis-backed rate limiting, input validation, error boundaries

**Tech stack:** Next.js 16 · TypeScript · Tailwind CSS v4 · shadcn/ui · PostgreSQL · Prisma 7 · Redis · BullMQ · Azure AI Foundry

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [PostgreSQL](https://www.postgresql.org/) 16+
- [Redis](https://redis.io/) 7+
- [Azure AI Foundry](https://ai.azure.com/) account (for document parsing and summarization)
- (Optional) Azure Blob Storage account for persistent file storage

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/briney/paperlens.git
cd paperlens

# 2. Install dependencies
npm install

# 3. Start PostgreSQL and Redis
docker compose up -d

# 4. Configure environment
./setup.sh
# Or manually: copy .env.example to .env and fill in values

# 5. Set up the database
npm run db:generate
npm run db:migrate

# 6. Start the dev server
npm run dev

# 7. In a separate terminal, start the worker
npm run worker
```

Open [http://localhost:3000](http://localhost:3000) and register an account.

## Environment Variables

Run `./setup.sh` to generate your `.env` file interactively — it auto-generates JWT secrets and validates required values. Alternatively, copy `.env.example` to `.env` and fill in the values manually.

| Variable | Required | Description | Example |
|---|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://paperlens:paperlens_dev@localhost:5432/paperlens` |
| `REDIS_URL` | Yes | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Yes | Access token signing secret (32+ chars) | — |
| `JWT_REFRESH_SECRET` | Yes | Refresh token signing secret (32+ chars) | — |
| `AZURE_AI_FOUNDRY_ENDPOINT` | No | Legacy fallback endpoint URL (used when task policies/models are not configured) | `https://your-resource.services.ai.azure.com` |
| `AZURE_AI_FOUNDRY_KEY` | Yes | Azure AI Foundry API key | — |
| `AZURE_AI_FOUNDRY_API_VERSION` | No | Legacy fallback API version (default: `2025-01-01`) | `2025-01-01` |
| `AZURE_STORAGE_CONNECTION_STRING` | No | Azure Blob Storage connection string (falls back to local `.storage/`) | — |
| `AZURE_STORAGE_CONTAINER` | No | Blob container name (default: `paperlens-files`) | `paperlens-files` |
| `ADMIN_EMAIL` | No | Seed admin email (for `npm run db:seed`) | `admin@example.com` |
| `ADMIN_PASSWORD` | No | Seed admin password | — |
| `ADMIN_NAME` | No | Seed admin display name | `Admin` |
| `MAX_UPLOAD_SIZE_MB` | No | Max PDF upload size in MB (default: `50`) | `50` |
| `NODE_ENV` | No | Environment | `development` / `production` |

Model invocation settings are now per-model in **Admin → Models**, and task-to-model defaults/overrides are managed in **Admin → Task Policies**.

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run worker` | Start BullMQ job worker (required for paper processing) |
| `npm run db:migrate` | Run Prisma database migrations |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run lint` | Run ESLint |

## Docker Compose

The included `docker-compose.yml` runs PostgreSQL 16 and Redis 7 for local development. Both services use `network_mode: host`, so they're available at `localhost:5432` and `localhost:6379` respectively.

```bash
docker compose up -d      # start infrastructure
docker compose down        # stop infrastructure
```

The app itself runs outside Docker via `npm run dev` and `npm run worker`.

## Production Deployment

### Build and run

```bash
npm run build
npm run start          # web server (port 3000)
npm run worker         # worker process (separate terminal/container)
```

The web server and worker **must run as separate processes** — the worker is a long-running Node.js process that executes BullMQ jobs for PDF fetching, parsing, and analysis.

### Key considerations

- Set `NODE_ENV=production`
- Use strong, unique values for `JWT_SECRET` and `JWT_REFRESH_SECRET`
- Configure Azure Blob Storage for persistent file storage — the local `.storage/` fallback won't survive container restarts
- Set up a reverse proxy (nginx, Caddy) for TLS termination
- Use managed PostgreSQL and Redis, or back them with persistent volumes

### Deployment targets

- **Docker** — build a container from the Next.js app, run the worker as a separate service with the same image but `npm run worker` as the entrypoint
- **Azure Container Apps / AWS ECS** — two services (web + worker) sharing the same image with different start commands
- **Vercel + separate worker** — deploy Next.js to Vercel; run the worker on a VM or container service (Vercel doesn't support long-running background workers)

## Project Structure

```
src/
├── app/
│   ├── (auth)/              # Login & register pages
│   ├── (main)/              # Dashboard, upload, papers, settings
│   │   └── papers/[id]/     # Individual paper view
│   ├── (admin)/             # Admin console (users, models, quotas, jobs)
│   └── api/                 # API routes (auth, papers, admin, storage)
├── components/              # React components + shadcn/ui
│   ├── admin/               # Admin-specific components
│   └── ui/                  # shadcn/ui primitives
├── lib/
│   ├── ai/                  # AI provider abstraction (Azure Foundry)
│   ├── analyzers/           # Analysis plugins (summarizer)
│   ├── auth/                # JWT auth, sessions, password hashing
│   ├── ingestion/           # URL resolver, PDF validator
│   ├── queue/               # BullMQ queue + worker
│   └── storage/             # Storage abstraction (local + Azure Blob)
└── proxy.ts                 # Route protection (auth + admin guard)
```

## Architecture

1. **Upload** — user uploads a PDF or submits a URL. The API creates `Paper` and `Job` records in PostgreSQL.
2. **Ingestion** — the BullMQ worker picks up the job, fetches the PDF (resolving URLs for arXiv, bioRxiv, DOI, etc.), validates it, and stores it via the storage abstraction.
3. **Parsing** — the worker sends the PDF to Azure AI Foundry for document parsing, extracting structured text and metadata.
4. **Analysis** — user triggers analysis from the paper detail page. The worker runs an analyzer plugin (e.g., summarizer) that calls Azure AI Foundry to generate a structured summary, stored as an `Analysis` record.
5. **Delivery** — the frontend polls for job status updates and displays results with toast notifications.

## License

[MIT](LICENSE)
