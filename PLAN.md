# PaperLens — Scientific Paper Analysis Platform

## Architectural Plan & Implementation Guide

---

## 1. Project Overview

**PaperLens** is a web application that allows users to upload scientific papers (PDF upload, PDF URL, or publication page URL), parse them into structured markup using document AI, and then run AI-powered analyses — starting with summarization and expanding to features like virtual journal clubs, peer review critique, claim verification, and novelty assessment.

### Core Design Principles

- **Model-agnostic pipeline**: All AI operations go through a unified provider abstraction so models can be swapped via config
- **Feature-as-plugin architecture**: Each analysis type (summarization, critique, journal club) is a self-contained "analyzer" module
- **Azure AI Foundry-first**: All models hosted on Azure AI Foundry, leveraging tool use (web search, grounding) where available
- **Progressive complexity**: Start simple, but the architecture supports growing into a full research platform

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Next.js 14+ (App Router) | Full-stack React, SSR, API routes, streaming support |
| **Language** | TypeScript | End-to-end type safety across client and server |
| **Styling** | Tailwind CSS + shadcn/ui | Modern, composable, accessible component system |
| **Database** | PostgreSQL (via Prisma ORM) | Relational data for users, papers, jobs, quotas |
| **File Storage** | Azure Blob Storage (or local disk for dev) | PDF and result storage |
| **Queue / Jobs** | BullMQ + Redis | Async processing pipeline for PDF parsing and analysis |
| **Auth** | Custom JWT auth (Phase 1) → NextAuth.js (Phase 2) | Simple start, clean migration path to OAuth |
| **AI Models** | Azure AI Foundry (OpenAI-compatible API) | Mistral Document AI, Claude Sonnet/Opus |
| **Deployment** | Docker Compose (dev) → Azure Container Apps or Vercel + Azure Functions (prod) | Flexible deployment targets |

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  Next.js App Router + Tailwind + shadcn/ui                  │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Upload   │  │ Results  │  │  Admin   │  │  Settings  │  │
│  │  Page     │  │  Page    │  │ Console  │  │  / Profile │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │ API Routes (Next.js)
┌─────────────────────┴───────────────────────────────────────┐
│                      API LAYER                              │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Auth     │  │  Papers  │  │  Jobs    │  │  Admin     │  │
│  │  Routes   │  │  Routes  │  │  Routes  │  │  Routes    │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                   SERVICE LAYER                             │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Paper Ingestion Service                    │ │
│  │  • PDF upload handler                                  │ │
│  │  • URL fetcher (direct PDF or page scrape for PDF link)│ │
│  │  • Storage manager (Azure Blob / local)                │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              AI Provider Abstraction                    │ │
│  │                                                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐  │ │
│  │  │  Document   │  │  Chat /     │  │  Tool-augmented│  │ │
│  │  │  Parser     │  │  Completion │  │  Completion    │  │ │
│  │  │  Provider   │  │  Provider   │  │  Provider      │  │ │
│  │  └─────────────┘  └─────────────┘  └───────────────┘  │ │
│  │           ↕               ↕               ↕            │ │
│  │     Azure AI Foundry (all models)                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Analyzer Plugin System                     │ │
│  │                                                        │ │
│  │  ┌────────────┐  ┌────────────┐  ┌─────────────────┐  │ │
│  │  │ Summarizer │  │ Peer Review│  │ Journal Club    │  │ │
│  │  │ (v1)       │  │ (future)   │  │ (future)        │  │ │
│  │  └────────────┘  └────────────┘  └─────────────────┘  │ │
│  │  ┌────────────┐  ┌────────────┐  ┌─────────────────┐  │ │
│  │  │ Claim      │  │ Novelty    │  │ Methods Audit   │  │ │
│  │  │ Verifier   │  │ Assessor   │  │ (future)        │  │ │
│  │  │ (future)   │  │ (future)   │  │                 │  │ │
│  │  └────────────┘  └────────────┘  └─────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Job Queue (BullMQ + Redis)                 │ │
│  │  • parse-pdf   • run-analysis   • fetch-url            │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│                    DATA LAYER                               │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Postgres │  │ Azure Blob   │  │ Redis              │    │
│  │ (Prisma) │  │ Storage      │  │ (Queue + Cache)    │    │
│  └──────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Database Schema (Prisma)

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Auth ───────────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String?   // null when using OAuth
  name          String?
  role          Role      @default(USER)
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // OAuth fields (Phase 2 — add via migration)
  // provider      String?
  // providerId    String?

  papers        Paper[]
  jobs          Job[]
  apiTokens     ApiToken[]
  usageRecords  UsageRecord[]
  quota         UserQuota?
}

model ApiToken {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique
  name      String
  expiresAt DateTime?
  createdAt DateTime @default(now())
}

model UserQuota {
  id                String @id @default(cuid())
  userId            String @unique
  user              User   @relation(fields: [userId], references: [id])
  maxPapersPerDay   Int    @default(10)
  maxPapersPerMonth Int    @default(100)
  maxTokensPerMonth Int    @default(1000000)
  tier              Tier   @default(FREE)
}

enum Role {
  USER
  ADMIN
}

enum Tier {
  FREE
  PRO
  ADMIN
}

// ─── Papers & Analysis ──────────────────────────────────

model Paper {
  id            String      @id @default(cuid())
  userId        String
  user          User        @relation(fields: [userId], references: [id])
  title         String?
  authors       String?
  source        SourceType
  sourceUrl     String?     // original URL if provided
  storagePath   String      // blob storage path to PDF
  markupPath    String?     // blob storage path to parsed markup
  metadata      Json?       // extracted metadata (doi, journal, date, etc.)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  jobs          Job[]
  analyses      Analysis[]
}

enum SourceType {
  UPLOAD
  PDF_URL
  PAGE_URL
}

model Job {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  paperId     String
  paper       Paper     @relation(fields: [paperId], references: [id])
  type        JobType
  status      JobStatus @default(QUEUED)
  config      Json?     // model selection, parameters, etc.
  result      Json?     // output metadata
  error       String?
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime  @default(now())

  analysis    Analysis?
}

enum JobType {
  PARSE_PDF
  SUMMARIZE
  PEER_REVIEW
  CLAIM_VERIFY
  JOURNAL_CLUB
  NOVELTY_ASSESS
  CUSTOM
}

enum JobStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}

model Analysis {
  id          String       @id @default(cuid())
  paperId     String
  paper       Paper        @relation(fields: [paperId], references: [id])
  jobId       String       @unique
  job         Job          @relation(fields: [jobId], references: [id])
  type        JobType
  modelUsed   String       // e.g. "mistral-document-ai-2512", "claude-sonnet-4-5"
  content     String       // the actual analysis output (markdown)
  storagePath String?      // optional blob storage for large outputs
  tokenUsage  Json?        // { input: N, output: N, cost: N }
  createdAt   DateTime     @default(now())
}

// ─── Usage Tracking ─────────────────────────────────────

model UsageRecord {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  model       String
  inputTokens Int
  outputTokens Int
  cost        Float    @default(0)
  jobType     JobType
  createdAt   DateTime @default(now())
}

// ─── Model Registry (Admin-managed) ────────────────────

model ModelConfig {
  id              String  @id @default(cuid())
  slug            String  @unique  // e.g. "mistral-doc-ai", "claude-sonnet"
  displayName     String
  provider        String  // "azure-foundry"
  deploymentName  String  // Azure deployment name
  endpoint        String  // Azure endpoint URL
  apiVersion      String
  category        ModelCategory
  isDefault       Boolean @default(false)
  isActive        Boolean @default(true)
  capabilities    Json?   // { "tools": true, "webSearch": true, "vision": true }
  costPerInputToken  Float @default(0)
  costPerOutputToken Float @default(0)
  maxTokens       Int     @default(4096)
  config          Json?   // additional model-specific config
}

enum ModelCategory {
  DOCUMENT_PARSER
  CHAT_COMPLETION
  EMBEDDING
}
```

---

## 5. AI Provider Abstraction

This is the critical layer that makes models swappable. All AI interactions go through a unified interface.

### `lib/ai/provider.ts`

```typescript
// Unified interface for all AI operations

export interface AIProvider {
  parseDocument(pdf: Buffer, options?: ParseOptions): Promise<ParseResult>;
  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>;
  completeWithTools(messages: Message[], tools: Tool[], options?: CompletionOptions): Promise<ToolCompletionResult>;
}

export interface ParseOptions {
  modelSlug?: string;       // override default parser model
  outputFormat?: "markdown" | "html" | "json";
}

export interface CompletionOptions {
  modelSlug?: string;       // override default completion model
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  stream?: boolean;
}

export interface ParseResult {
  markup: string;
  metadata: {
    title?: string;
    authors?: string[];
    abstract?: string;
    sections?: string[];
    references?: number;
    pages?: number;
  };
  usage: TokenUsage;
}

export interface CompletionResult {
  content: string;
  usage: TokenUsage;
  modelUsed: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}
```

### `lib/ai/azure-foundry.ts`

```typescript
// Azure AI Foundry implementation
// Uses the OpenAI-compatible API that Azure AI Foundry exposes

import { ModelConfig } from "@prisma/client";

export class AzureFoundryProvider implements AIProvider {
  
  // Resolve model from DB config
  private async getModel(slug?: string, category?: ModelCategory): Promise<ModelConfig> {
    // Look up model in ModelConfig table, fall back to default for category
  }
  
  async parseDocument(pdf: Buffer, options?: ParseOptions): Promise<ParseResult> {
    const model = await this.getModel(options?.modelSlug, "DOCUMENT_PARSER");
    
    // Mistral Document AI uses a chat-completions-like API
    // with the PDF sent as a base64 document in the message
    const response = await fetch(`${model.endpoint}/chat/completions?api-version=${model.apiVersion}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.AZURE_AI_FOUNDRY_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.deploymentName,
        messages: [{
          role: "user",
          content: [
            {
              type: "document_url",  // or "image_url" with base64 for older API
              document_url: { url: `data:application/pdf;base64,${pdf.toString("base64")}` }
            },
            {
              type: "text",
              text: "Parse this scientific paper into well-structured markdown. Preserve all sections, figures/table references, equations, and citations."
            }
          ]
        }],
        max_tokens: model.maxTokens,
      }),
    });
    
    // Parse and return structured result
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult> {
    const model = await this.getModel(options?.modelSlug, "CHAT_COMPLETION");
    // Standard chat completions call against Azure AI Foundry
  }

  async completeWithTools(messages: Message[], tools: Tool[], options?: CompletionOptions): Promise<ToolCompletionResult> {
    const model = await this.getModel(options?.modelSlug, "CHAT_COMPLETION");
    // Chat completions with tool definitions (web search, etc.)
    // Azure AI Foundry supports tool use for Claude and other models
  }
}
```

---

## 6. Analyzer Plugin System

Each analysis feature is a self-contained module that implements a common interface. This is the key extensibility mechanism.

### `lib/analyzers/base.ts`

```typescript
export interface Analyzer {
  readonly type: JobType;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;                    // lucide icon name
  readonly requiredCapabilities: string[];  // e.g. ["tools", "webSearch"]
  
  // What the analyzer needs
  readonly requiresParsedMarkup: boolean;
  readonly requiresOriginalPdf: boolean;

  // Run the analysis
  execute(context: AnalyzerContext): Promise<AnalyzerResult>;
  
  // Optional: provide UI config schema for user-facing options
  getConfigSchema?(): ConfigSchema;
}

export interface AnalyzerContext {
  paper: Paper;
  markup: string;         // parsed markup of the paper
  pdfBuffer?: Buffer;     // original PDF if needed
  ai: AIProvider;         // AI provider for making calls
  config?: Record<string, any>;  // user-provided config
  onProgress?: (progress: number, message: string) => void;
}

export interface AnalyzerResult {
  content: string;        // markdown output
  sections?: { title: string; content: string }[];
  metadata?: Record<string, any>;
  usage: TokenUsage;
}
```

### `lib/analyzers/summarizer.ts` (v1 implementation)

```typescript
export class SummarizerAnalyzer implements Analyzer {
  readonly type = "SUMMARIZE";
  readonly displayName = "Paper Summary";
  readonly description = "Generate a structured summary of the paper";
  readonly icon = "FileText";
  readonly requiredCapabilities = [];
  readonly requiresParsedMarkup = true;
  readonly requiresOriginalPdf = false;

  async execute(context: AnalyzerContext): Promise<AnalyzerResult> {
    const { markup, ai, config } = context;
    
    const systemPrompt = `You are an expert scientific reviewer. Summarize the following 
    paper in a structured format with these sections:
    - **Key Findings**: The main results and conclusions
    - **Methods Overview**: Brief description of methodology
    - **Significance**: Why this work matters
    - **Limitations**: Noted or apparent limitations
    - **Context**: How this fits into the broader field
    
    Be precise, cite specific figures/tables where relevant, and maintain 
    scientific accuracy. Target audience: researchers in the same field.`;

    const result = await ai.complete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is the parsed paper:\n\n${markup}` }
      ],
      {
        modelSlug: config?.modelSlug ?? "claude-sonnet",
        maxTokens: 4096,
        temperature: 0.3,
      }
    );

    return {
      content: result.content,
      usage: result.usage,
    };
  }
}
```

### Future analyzer examples (stubs):

```typescript
// lib/analyzers/peer-review.ts
export class PeerReviewAnalyzer implements Analyzer {
  readonly type = "PEER_REVIEW";
  readonly displayName = "AI Peer Review";
  readonly description = "Get a detailed peer review-style critique";
  readonly requiredCapabilities = ["tools"];  // needs web search for reference checking
  // Uses completeWithTools() for web search to verify references, check methodology norms
}

// lib/analyzers/claim-verifier.ts
export class ClaimVerifierAnalyzer implements Analyzer {
  readonly type = "CLAIM_VERIFY";
  readonly displayName = "Claim Verification";
  readonly description = "Verify key claims against existing literature";
  readonly requiredCapabilities = ["tools", "webSearch"];
  // Multi-step: extract claims → search for corroboration → report
}

// lib/analyzers/journal-club.ts
export class JournalClubAnalyzer implements Analyzer {
  readonly type = "JOURNAL_CLUB";
  readonly displayName = "Virtual Journal Club";
  readonly description = "Interactive discussion guide for journal club presentation";
  // Generates discussion questions, talking points, critical analysis prompts
}
```

### Analyzer Registry

```typescript
// lib/analyzers/registry.ts
import { SummarizerAnalyzer } from "./summarizer";
// import future analyzers here

const analyzers: Map<string, Analyzer> = new Map();

export function registerAnalyzer(analyzer: Analyzer) {
  analyzers.set(analyzer.type, analyzer);
}

export function getAnalyzer(type: string): Analyzer | undefined {
  return analyzers.get(type);
}

export function getAllAnalyzers(): Analyzer[] {
  return Array.from(analyzers.values());
}

// Register built-in analyzers
registerAnalyzer(new SummarizerAnalyzer());
// registerAnalyzer(new PeerReviewAnalyzer());  // uncomment when ready
```

---

## 7. Authentication System

### Phase 1: Self-Hosted JWT Auth

Simple email + password auth with JWT tokens. The key is structuring it so the migration to OAuth is painless.

```
lib/auth/
├── index.ts              # Main auth exports
├── jwt.ts                # JWT token creation/verification
├── middleware.ts          # Next.js middleware for route protection
├── password.ts           # bcrypt hashing
└── session.ts            # Session management (cookie-based JWT)
```

**Key design decisions:**
- JWT stored in httpOnly secure cookie (not localStorage)
- Short-lived access token (15 min) + longer refresh token (7 days)
- User model already has nullable `passwordHash` — OAuth users won't have one
- Auth middleware checks JWT and attaches user to request context

```typescript
// lib/auth/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "./jwt";

export async function authMiddleware(req: NextRequest) {
  const token = req.cookies.get("access_token")?.value;
  
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  
  try {
    const payload = await verifyToken(token);
    // Attach user info to headers for downstream use
    const headers = new Headers(req.headers);
    headers.set("x-user-id", payload.userId);
    headers.set("x-user-role", payload.role);
    return NextResponse.next({ headers });
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}
```

### Phase 2 Migration Path: NextAuth.js

When ready to add OAuth:

1. Install `next-auth` and the Prisma adapter
2. Add `provider` and `providerId` columns to User table (migration)
3. Configure NextAuth with credentials provider (preserves existing users) + GitHub/Google providers
4. Swap `authMiddleware` to use NextAuth's `getServerSession()`
5. Existing JWT users can link OAuth accounts via settings page

The migration is smooth because:
- User model is already provider-agnostic
- `passwordHash` is already nullable
- Auth logic is centralized in `lib/auth/`, not scattered across components

---

## 8. Job Processing Pipeline

### Flow for a Paper Upload

```
User uploads PDF (or provides URL)
        │
        ▼
  ┌─────────────┐
  │ API: POST   │  → Validate input, check quota
  │ /api/papers │  → If URL: enqueue FETCH_URL job
  └──────┬──────┘  → If PDF: store in blob, create Paper record
         │
         ▼
  ┌─────────────┐
  │ Job: PARSE  │  → Pull PDF from storage
  │   _PDF      │  → Send to Mistral Document AI via AzureFoundryProvider
  └──────┬──────┘  → Store markup in blob, update Paper record
         │
         ▼
  ┌──────────────┐
  │ Job: ANALYZE │  → Pull markup from storage
  │ (SUMMARIZE)  │  → Run through selected Analyzer
  └──────┬───────┘  → Store analysis result, update Job status
         │
         ▼
  ┌──────────────┐
  │ Notify user  │  → SSE/WebSocket push or polling
  │ (real-time)  │  → Results page now shows outputs
  └──────────────┘
```

### BullMQ Worker Setup

```typescript
// workers/paper-processor.ts
import { Worker } from "bullmq";

const worker = new Worker("paper-processing", async (job) => {
  switch (job.name) {
    case "fetch-url":
      // Fetch PDF from URL (handle both direct PDF and page-with-PDF-link)
      // Uses puppeteer/playwright for page scraping if needed
      break;
    case "parse-pdf":
      // Call AzureFoundryProvider.parseDocument()
      break;
    case "run-analysis":
      // Look up analyzer from registry, execute
      break;
  }
}, {
  connection: redisConnection,
  concurrency: 3,
});
```

---

## 9. UI Design

### Page Structure

```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
├── (main)/
│   ├── layout.tsx             # Sidebar nav + header
│   ├── dashboard/page.tsx     # Recent papers, quick upload
│   ├── upload/page.tsx        # Paper upload page
│   ├── papers/
│   │   ├── page.tsx           # Paper library (list/grid)
│   │   └── [id]/
│   │       ├── page.tsx       # Paper detail — parsed view + analyses
│   │       └── analysis/
│   │           └── [type]/page.tsx  # Specific analysis result
│   └── settings/page.tsx      # Profile, API keys, preferences
├── (admin)/
│   ├── layout.tsx             # Admin layout with admin nav
│   ├── dashboard/page.tsx     # Usage stats, system health
│   ├── users/page.tsx         # User management
│   ├── models/page.tsx        # Model configuration
│   ├── quotas/page.tsx        # Quota management
│   └── jobs/page.tsx          # Job queue monitoring
└── api/
    ├── auth/[...]/route.ts
    ├── papers/route.ts
    ├── papers/[id]/route.ts
    ├── papers/[id]/analyze/route.ts
    ├── jobs/[id]/route.ts
    └── admin/[...]/route.ts
```

### Key UI Components

#### Upload Page
```
┌──────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────┐  │
│  │           Upload a Scientific Paper             │  │
│  │                                                 │  │
│  │  ┌─────────────────────────────────────────┐   │  │
│  │  │                                         │   │  │
│  │  │     📄 Drop your PDF here               │   │  │
│  │  │        or click to browse               │   │  │
│  │  │                                         │   │  │
│  │  └─────────────────────────────────────────┘   │  │
│  │                                                 │  │
│  │  ── or paste a link ──────────────────────────  │  │
│  │                                                 │  │
│  │  ┌─────────────────────────────────────────┐   │  │
│  │  │ https://arxiv.org/abs/2401.12345   [→]  │   │  │
│  │  └─────────────────────────────────────────┘   │  │
│  │                                                 │  │
│  │  Analysis Options                               │  │
│  │  ┌──────────────┐  ┌──────────────┐            │  │
│  │  │ ✅ Summary   │  │ 🔒 Peer Rev  │            │  │
│  │  └──────────────┘  └──────────────┘            │  │
│  │  ┌──────────────┐  ┌──────────────┐            │  │
│  │  │ 🔒 Claims    │  │ 🔒 Novelty   │            │  │
│  │  └──────────────┘  └──────────────┘            │  │
│  │                                                 │  │
│  │  Model: [Claude Sonnet 4.5 ▾]                   │  │
│  │                                                 │  │
│  │         [ Process Paper → ]                     │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

#### Results Page
```
┌──────────────────────────────────────────────────────┐
│  Paper: "Broadly Neutralizing Antibodies..."         │
│  Authors: Smith et al. (2025)  │  Status: ✅ Done    │
│                                                       │
│  ┌──────────┬──────────┬──────────┐                  │
│  │ Summary  │ Markup   │ Original │   (tab nav)      │
│  └──────────┴──────────┴──────────┘                  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │                                                 │ │
│  │  ## Key Findings                                │ │
│  │  The study demonstrates that...                 │ │
│  │                                                 │ │
│  │  ## Methods Overview                            │ │
│  │  Using cryo-EM at 3.2Å resolution...           │ │
│  │                                                 │ │
│  │  ## Significance                                │ │
│  │  This represents a major advance in...          │ │
│  │                                                 │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  [ ⬇ Download Summary (.md) ]  [ ⬇ Download Markup ] │
│  [ ⬇ Download All (.zip) ]                           │
│                                                       │
│  ── Run Additional Analysis ──                       │
│  [ + Peer Review ]  [ + Claim Check ]  [ + More ]    │
└──────────────────────────────────────────────────────┘
```

#### Admin Console — Dashboard
```
┌────────────────────────────────────────────────────────┐
│  Admin Console                                         │
│  ┌──────┬───────┬────────┬────────┬───────┐           │
│  │Dash  │Users  │Models  │Quotas  │Jobs   │           │
│  └──────┴───────┴────────┴────────┴───────┘           │
│                                                        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│  │ 247        │ │ 1,842      │ │ 3.2M       │        │
│  │ Users      │ │ Papers     │ │ Tokens/day │        │
│  └────────────┘ └────────────┘ └────────────┘        │
│                                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Usage Over Time (chart)                        │  │
│  │  ████▓▓▓░░░░░░░░                               │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Recent Jobs                                    │  │
│  │  ┌──────┬────────┬──────────┬────────┬───────┐  │  │
│  │  │ User │ Paper  │ Type     │ Status │ Time  │  │  │
│  │  ├──────┼────────┼──────────┼────────┼───────┤  │  │
│  │  │ jdoe │ Ab...  │ Summary  │ ✅     │ 12s   │  │  │
│  │  │ alee │ CR...  │ Parse    │ ⏳     │ --    │  │  │
│  │  └──────┴────────┴──────────┴────────┴───────┘  │  │
│  └─────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

#### Admin — Model Management
```
┌─────────────────────────────────────────────────────────┐
│  Model Configuration                    [ + Add Model ] │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Mistral Document AI 2512              [Default ⭐] │  │
│  │ Category: Document Parser                          │  │
│  │ Deployment: mistral-document-ai-2512               │  │
│  │ Endpoint: https://xxx.services.ai.azure.com/...    │  │
│  │ Capabilities: vision ✅  tools ❌  search ❌      │  │
│  │ Cost: $0.001/1K input  •  $0.003/1K output        │  │
│  │ Status: Active ✅              [ Edit ] [ Disable ]│  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Claude Sonnet 4.5                     [Default ⭐] │  │
│  │ Category: Chat Completion                          │  │
│  │ Deployment: claude-sonnet-4-5-20250929             │  │
│  │ Endpoint: https://xxx.services.ai.azure.com/...    │  │
│  │ Capabilities: vision ✅  tools ✅  search ✅      │  │
│  │ Cost: $0.003/1K input  •  $0.015/1K output        │  │
│  │ Status: Active ✅              [ Edit ] [ Disable ]│  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Claude Opus 4.5                                    │  │
│  │ Category: Chat Completion                          │  │
│  │ Deployment: claude-opus-4-5-20250929               │  │
│  │ ...                                                │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 10. Key shadcn/ui Components to Use

| Component | Where |
|-----------|-------|
| `Button`, `Input`, `Label` | Everywhere |
| `Card`, `CardHeader`, `CardContent` | Paper cards, stat cards, model cards |
| `Tabs`, `TabsContent` | Results page (Summary / Markup / Original) |
| `Dialog`, `Sheet` | Model config editing, paper details |
| `DropdownMenu` | Model selector, user menu |
| `Table` | Admin tables (users, jobs, usage) |
| `Badge` | Status indicators (queued, processing, done, failed) |
| `Progress` | Job progress bars |
| `Skeleton` | Loading states |
| `Toast` | Notifications (job complete, errors) |
| `Command` | Quick paper search (⌘K) |
| `Avatar` | User nav |
| `Separator` | Visual section breaks |
| `Select` | Model selection dropdown |
| `Switch` | Toggle features, activate/deactivate models |
| `Alert` | Quota warnings, errors |

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [x] Next.js project setup with TypeScript, Tailwind, shadcn/ui
- [x] PostgreSQL + Prisma schema, migrations
- [x] Redis + BullMQ setup
- [x] JWT auth system (register, login, logout, middleware)
- [x] Azure Blob Storage integration (with local file fallback for dev)
- [x] Basic UI layout (sidebar, header, routing)

#### Phase 1 Deviations & Notes for Future Phases
- **Prisma 7**: The installed version is Prisma 7.x, which removes `url` from the `datasource` block in `schema.prisma`. The connection URL is now configured in `prisma.config.ts`. The PrismaClient requires an adapter (`@prisma/adapter-pg`) instead of a direct connection string. This affects how the client is instantiated in `src/lib/db.ts`.
- **Next.js 16 proxy**: Next.js 16 deprecated the `middleware.ts` file convention in favor of `proxy.ts` (renamed function export from `middleware` to `proxy`). The PLAN's auth section references `authMiddleware` — this is now at `src/proxy.ts` with a `proxy()` export. Same functionality, different naming.
- **ioredis version**: BullMQ bundles its own version of ioredis. Do NOT install a standalone `ioredis` package — it causes type conflicts. Import from `bullmq/node_modules/ioredis` if needed outside the queue.
- **shadcn/ui Toast → Sonner**: The `toast` component is deprecated in shadcn/ui. Using `sonner` instead (same API pattern, already installed).
- **Docker networking**: `docker-compose.yml` uses `network_mode: host` instead of port mapping due to environment constraints. Postgres is on port 5432 and Redis on port 6379 on the host directly.

### Phase 2: Core Pipeline (Week 2-3)
- [x] PDF upload endpoint + storage
- [x] URL fetching (direct PDF + page scraping for PDF links)
- [x] AI Provider abstraction + Azure Foundry implementation
- [x] Mistral Document AI integration for PDF parsing
- [x] Job queue workers for parse pipeline
- [x] Upload page UI
- [x] Processing status UI (real-time updates via SSE or polling)

### Phase 3: Summarization (Week 3-4)
- [x] Analyzer plugin system + registry
- [x] Summarizer analyzer implementation
- [x] Model selection UI (dropdown tied to ModelConfig table)
- [x] Results page with tabs (Summary / Markup / PDF)
- [x] Download functionality (.md) — .zip not yet implemented
- [x] Paper library page

### Phase 4: Admin Console (Week 4-5)
- [x] Admin route protection (role-based)
- [x] Admin dashboard (usage stats, recent jobs)
- [x] User management (list, activate/deactivate, change role)
- [x] Model management (CRUD on ModelConfig)
- [x] Quota management (per-user and tier-based)
- [x] Job queue monitoring
- [x] Usage tracking and cost estimation

### Phase 5: Polish & Hardening (Week 5-6)
- [x] Error handling throughout (retries, graceful failures)
- [x] Rate limiting on API routes
- [x] Input validation (file size, file type, URL patterns)
- [x] Loading states, empty states, error states for all pages
- [x] Mobile responsiveness
- [x] Keyboard shortcuts (⌘K for search)
- [x] Toast notifications for async job completion

### Phase 6: Expansion (Ongoing)
- [ ] OAuth migration (NextAuth.js + GitHub/Google providers)
- [ ] Additional analyzers: Peer Review, Claim Verification, Novelty Assessment
- [ ] Web search tool integration for claim verification via Azure AI Foundry tool use
- [ ] Paper comparison mode (upload two papers, compare)
- [ ] Export to various formats (docx, PDF report)
- [ ] API access for programmatic use (API keys from settings)
- [ ] Batch processing (upload multiple papers)
- [ ] Team/org features

---

## 12. Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/paperlens"

# Redis
REDIS_URL="redis://localhost:6379"

# Azure AI Foundry
AZURE_AI_FOUNDRY_ENDPOINT="https://your-resource.services.ai.azure.com"
AZURE_AI_FOUNDRY_KEY="your-api-key"
AZURE_AI_FOUNDRY_API_VERSION="2025-01-01"

# Azure Blob Storage (optional — falls back to local in dev)
AZURE_STORAGE_CONNECTION_STRING=""
AZURE_STORAGE_CONTAINER="paperlens-files"

# Auth
JWT_SECRET="your-secret-key-min-32-chars"
JWT_REFRESH_SECRET="your-refresh-secret-min-32-chars"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
MAX_UPLOAD_SIZE_MB=50
```

---

## 13. Deployment Options

### Development
```bash
docker compose up  # Postgres + Redis
npm run dev        # Next.js dev server
npm run worker     # BullMQ worker process
```

### Production (Recommended: Azure Container Apps)
- **Web app**: Next.js container on Azure Container Apps
- **Worker**: Separate container for BullMQ workers (scales independently)
- **Database**: Azure Database for PostgreSQL Flexible Server
- **Cache/Queue**: Azure Cache for Redis
- **Storage**: Azure Blob Storage
- **CI/CD**: GitHub Actions → Azure Container Registry → Container Apps

### Alternative: Vercel + Azure Functions
- **Web app**: Vercel (great for Next.js)
- **Workers**: Azure Functions with BullMQ (or switch to Azure Queue Storage)
- Simpler ops but slightly more complex architecture

---

## 14. URL-to-PDF Resolution Strategy

Since users may provide publication page URLs (not direct PDF links), we need a smart resolver:

```typescript
// lib/ingestion/url-resolver.ts

export async function resolveUrl(url: string): Promise<{ pdfUrl: string; metadata?: any }> {
  // 1. Check if URL is a direct PDF (Content-Type check via HEAD request)
  // 2. Handle known publishers:
  //    - arxiv.org/abs/XXXX → arxiv.org/pdf/XXXX.pdf
  //    - doi.org/10.XXX → follow redirect, find PDF link
  //    - biorxiv.org/content/XXX → append .full.pdf
  //    - pubmed/PMC → find PDF link in page
  //    - nature.com, science.org, cell.com → publisher-specific patterns
  // 3. Fallback: fetch page, look for:
  //    - <meta> tags with PDF URLs
  //    - <a> tags with href containing ".pdf"
  //    - OpenGraph/citation meta tags
  // 4. Last resort: use headless browser (Playwright) to render JS-heavy pages
}
```

---

## 15. Security Considerations

- **File validation**: Verify uploaded files are actual PDFs (magic bytes check), not just `.pdf` extension
- **URL allowlisting**: Only fetch from known academic publisher domains + arxiv/biorxiv/medrxiv
- **File size limits**: Cap at 50MB (configurable)
- **Rate limiting**: Per-user rate limits on API routes (express-rate-limit or similar)
- **CSRF protection**: SameSite cookies + CSRF tokens on mutations
- **SQL injection**: Prisma parameterized queries (built-in)
- **XSS**: React's built-in escaping + sanitize rendered markdown (DOMPurify)
- **Secrets**: All API keys in env vars, never in client bundle
- **Admin routes**: Double-check role in both middleware and API handler

---

## Summary

This architecture gives you a clean foundation that's simple enough to build quickly but extensible enough to grow into a full research analysis platform. The key architectural bets are:

1. **AI Provider abstraction** — swap models by changing a database row, not code
2. **Analyzer plugin system** — add new analysis types by implementing one interface
3. **Job queue** — async processing keeps the UI responsive and enables scaling
4. **Admin-managed model registry** — no code deploys to add/swap/configure models
5. **Auth migration path** — start simple, upgrade to OAuth without rewriting

The total codebase for Phase 1-4 should be roughly 5,000-8,000 lines of TypeScript, achievable by a single developer in 4-6 weeks.
