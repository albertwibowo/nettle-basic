# Nettle Basic

A simplified version of the Nettle risk engineering platform. This app allows risk engineers to manage clients, create assessments, upload evidence, and generate AI-powered risk reports from versioned templates.

## Quick Start

```bash
cp .env.example .env
# Edit .env and add your OpenRouter API key

docker compose up --build
```

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Admin**: http://localhost:8000/admin/

The database is seeded with sample clients, assessments, evidence, and a global default report template on first run. Re-running `seed_data` will still create the default template if it is missing, even when clients already exist.

## Architecture

- **Backend**: Django + Django REST Framework (Python 3.11)
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Database**: PostgreSQL 15
- **AI**: OpenRouter API for report generation (single call returning structured JSON answers)

## Report templates

Reports are generated from **immutable template versions**:

`ReportTemplate` → `ReportTemplateVersion` → `ReportSection` → `ReportQuestion`

Each report pins a specific version. Generation creates `ReportAnswer` rows and fills them with **one** OpenRouter call that returns JSON for every question.

Template resolution on generate (if no version is pinned):

1. Latest version of a client-specific template
2. Else latest version of the global `is_default` template
3. Else `400`

## API Endpoints

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/portfolio/clients/` | GET, POST | List/create clients |
| `/api/portfolio/clients/:id/` | GET, PUT, PATCH, DELETE | Client detail |
| `/api/assessments/` | GET, POST | List/create assessments |
| `/api/assessments/:id/` | GET, PUT, PATCH, DELETE | Assessment detail |
| `/api/evidence/` | GET, POST | List/create evidence |
| `/api/evidence/?assessment=:id` | GET | Evidence for an assessment |
| `/api/reports/` | GET, POST | List/create reports (optional `template_version` on create) |
| `/api/reports/:id/` | GET | Report detail with answers grouped by section |
| `/api/reports/:id/generate/` | POST | Generate report (SSE stream; one LLM call) |
| `/api/report-templates/` | GET, POST | List/create templates (`?client=` filters by portfolio) |
| `/api/report-templates/:id/` | GET, PATCH, DELETE | Template metadata (global default cannot be deleted) |
| `/api/report-templates/:id/versions/` | GET, POST | List versions; create version with nested sections/questions |
| `/api/report-templates/:id/versions/:version_id/` | GET, DELETE | Version detail; delete a version |

### Version create payload

```json
{
  "sections": [
    {
      "title": "Executive Summary",
      "instructions": "Underwriter-facing overview",
      "order": 1,
      "questions": [
        {
          "prompt": "Summarize the overall risk posture.",
          "guidance": "2–4 paragraphs",
          "order": 1
        }
      ]
    }
  ]
}
```

`version_number` is assigned automatically. Versions are immutable — there is no PATCH for nested structure. Delete a version (or create a new one) to change structure. Portfolio companies may own many templates; create with `{ "name", "description", "client" }`.
