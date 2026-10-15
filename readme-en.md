<!-- Provides the English version of the Chinese-first repository overview. -->

[简体中文](./README.md) | **English**

<p align="center">
  <a href="https://jianglisoftware.com">
    <img src="./apps/web/public/brand/uml-platform-logo.svg" width="120" height="120" alt="SoftJL official logo" />
  </a>
</p>

<div align="center">

# SoftJL Community

<p>
  <strong>An engineering workspace for capstone and course projects</strong><br />
  Connect requirements, UML, design, tests and engineering documents with your own model service.<br />
  <sub>Review coverage · Follow changes · Explain your work</sub>
</p>

<p>
  <a href="https://jianglisoftware.com"><img src="https://img.shields.io/badge/Live%20Demo-Open%20Platform-2563eb?style=for-the-badge" alt="Open the live platform" /></a>
  <a href="https://jianglisoftware.com/tutorial"><img src="https://img.shields.io/badge/User%20Guide-Read%20Online-0f766e?style=for-the-badge" alt="Read the user guide" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache--2.0-7c3aed?style=for-the-badge" alt="Apache-2.0 License" /></a>
</p>

<p>
  <img src="https://img.shields.io/badge/Version-v2.0.0-2563eb?style=flat-square" alt="Current product version v2.0.0" />
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20Next.js-61dafb?style=flat-square" alt="React and Next.js" />
  <img src="https://img.shields.io/badge/API-Fastify%20%2B%20Zod-111827?style=flat-square" alt="Fastify and Zod" />
  <img src="https://img.shields.io/badge/UML-PlantUML-f59e0b?style=flat-square" alt="PlantUML" />
  <img src="https://img.shields.io/badge/Runtime-Node.js%2022-339933?style=flat-square" alt="Node.js 22" />
</p>

> Trace your designs, guide your revisions. Review models, tests and specifications against the same requirements, follow change impacts and organize design sources you can explain in reviews and your defense.

</div>

## Overview

SoftJL Community is a self-hosted AI software engineering workspace, distributed as an independent source snapshot with a fresh Git history.

## Core Capabilities

| Stage | Included capabilities |
| --- | --- |
| Requirements | Rule extraction, quality review, revision and confirmation |
| Feasibility | System context, business/system flow and implementation options |
| Requirement models | Functional structure, business flow, use cases, domain concepts, prototype navigation, deployment requirements and analysis models |
| Design models | Architecture, use-case realization, design classes, page navigation, database, components and deployment |
| Testing | Test cases, scenarios, traceability and coverage |
| Documents | Feasibility report, requirements specification and software design description; DOCX versions and optional OnlyOffice editing |
| Workspace | Projects, members, generation tasks, retries, history and diagram editing/export |
| Models | Bring your own OpenAI-compatible provider, discover models and test connections |

### Edition boundaries

Platform billing, payments, credit management, the operations administration backend and MCP / Coding Agent integration are excluded. Authentication, project permissions, provider credential protection and generation scheduling remain available. Hosted SoftJL may offer additional features. Provider usage is billed by your own provider; community generation does not require platform credits.

Use an independent database. This distribution is not a downgrade path for an existing full-edition database. Generated models and documents require review, and tests must be executed against your actual system.

## Interface Preview

The original visual style and historical screenshots are retained. See the capability table for the current community scope.

### Homepage

![SoftJL homepage](docs/images/readme-homepage.jpg)

### Project dashboard

![Project dashboard](docs/images/readme-dashboard.jpg)

## Quick Start

Install Node.js 22, npm 10, Java 21 and Graphviz. Docker is optional for the local OnlyOffice service.

```bash
git clone https://github.com/guolola/SoftJL-community.git
cd SoftJL-community
npm ci
npm run dev
```

The development entry starts Web, API and rendering, and checks local OnlyOffice. Web normally runs on port 3000, API on 4101, renderer on 4002 and OnlyOffice on 8080. Add your provider in account model settings, test the connection and select a model. Configure persistence and encryption secrets for deployment, and disable development guest access and legacy plaintext provider settings.

## Architecture

| Directory | Responsibility |
| --- | --- |
| apps/web | React and Next.js workspace |
| apps/api | Fastify API, generation pipelines and documents |
| apps/render-service | PlantUML rendering |
| packages/contracts | Shared schemas |
| packages/prompts | Generation prompts |
| packages/harness-e2e and packages/harness-eval | Acceptance and quality evaluation |

## Common Commands

Use npm scripts: build, test:contracts, test:api, test:web, test:render, typecheck:web and audit:docs. CI is included; the original production deployment workflow is excluded.

## Online Access

[SoftJL website](https://jianglisoftware.com) offers the hosted edition, which may have different features. Run this repository locally for the community edition.

## Documentation

- [Community maintenance and verification](docs/development/community-edition.md)
- [Documentation index](docs/README.md)
- [Quick-start guide](apps/web/src/features/product-docs/content/quick-start.md)

## License

Copyright © 2026 Software Engineering Practice Platform. Project code and documentation retain the [Apache-2.0 license](LICENSE). Third-party dependencies, fonts, icons and the PlantUML runtime retain their respective licenses; see [NOTICE](NOTICE).
