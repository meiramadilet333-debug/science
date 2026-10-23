# Научный навигатор

Русскоязычное приложение для сопровождения исследователя: от работы с научной идеей до поиска финансирования и подготовки материалов проекта.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (`PORT` is required; commonly 5000)
- `pnpm --filter @workspace/scientific-navigator run dev` — run the research interface
- `pnpm --filter @workspace/mockup-sandbox run dev` — run the mockup sandbox (defaults to port 5173)
- `pnpm run typecheck` — typecheck libraries and workspace packages
- `pnpm run build` — typecheck and build all workspace packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client and Zod schemas from OpenAPI
- `pnpm --filter @workspace/db run push` — push DB schema changes (development only)
- API server configuration: `PORT` is required; `OPENAI_API_KEY` is required for AI operations. `DATABASE_URL` is required for database operations. The mockup sandbox uses port 5173 by default when `PORT` is unset.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/scientific-navigator` — интерфейс исследовательских модулей, включая каталог грантов.
- `artifacts/api-server` — API научных функций и грантов; поиск грантов использует официальные источники, а AI-операции требуют серверной конфигурации.
- `lib/api-spec/openapi.yaml` — источник истины для API-контрактов; клиент и Zod-схемы генерируются из него.
- `lib/db/src/schema/` — схемы PostgreSQL и Drizzle ORM.

## Architecture decisions

- Отделять доступные функции от будущих модулей: неподключённый поиск или анализ не должен выглядеть как работающий.
- Научные публикации и гранты показывать только при наличии проверяемых источников; не подменять их демонстрационными записями.
- Явно сообщать ограничения AI-результатов; предварительные идеи и проекты требуют проверки исследователем.

## Product

Приложение помогает организовать работу исследователя: анализировать научные идеи с опорой на библиографические данные OpenAlex, работать с исследовательским AI-помощником, проверять официальные грантовые конкурсы и готовить предварительные материалы заявки. Результаты AI носят предварительный характер, а статус конкурсов основывается на доступных официальных источниках.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Не добавлять фиктивные результаты, метрики, статьи, тренды, проекты, рекомендации или активность для заполнения интерфейса.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
