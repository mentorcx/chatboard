# MVP - Dashboard de KPIs Conversacionales

Stack: **Kommo + Node.js (Fastify + Zod + Pino + pg) + Supabase (Postgres) + Metabase**.

> Alcance MVP: sin ingesta de mensajes. El funnel se construye con cambios de etapa (`lead_stage_events`) y tareas (`tasks`).

## 1) Estructura del proyecto

```txt
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── .env.example
├── sql
│   ├── 001_schema.sql
│   └── 002_views.sql
└── src
    ├── app.ts
    ├── server.ts
    ├── config
    │   ├── env.ts
    │   └── logger.ts
    ├── db
    │   └── pool.ts
    ├── jobs
    │   └── reconcileKommo.ts
    ├── routes
    │   └── webhooks.ts
    ├── services
    │   ├── kommoAuth.ts
    │   ├── kommoClient.ts
    │   ├── kommoNormalizer.ts
    │   ├── persistence.ts
    │   └── schemas.ts
    └── utils
        ├── hash.ts
        └── time.ts
```

## 2) SQL DDL para Supabase

Ejecutar `sql/001_schema.sql` en el SQL Editor de Supabase.
Incluye tablas requeridas, constraints, PK/FK, y índices recomendados para webhooks, funnel y tareas.

## 3) SQL Views para Metabase

Ejecutar `sql/002_views.sql` luego del DDL.

Views incluidas:
- `vw_lead_funnel_times`
- `vw_tasks_health`
- `vw_owner_weekly_performance`

Las etapas semánticas se resuelven por `stage_mapping`.

## 4) Servicio Webhook (Fastify)

Endpoint:
- `POST /webhooks/kommo`

Comportamiento:
- Valida firma (placeholder HMAC SHA256) desde header `X-KOMMO-SIGNATURE` o `X-SIGNATURE`.
- `safeParse` con Zod (si falla, igual guarda `raw_events`).
- Crea `event_id` estable:
  - Usa `event_id` del payload si existe.
  - Si no existe, genera SHA256 de campos estables (`event_type`, `lead_id`, `event_time`, `to_stage_id`, `task_id`, etc).
- Idempotencia con `raw_events` (`ON CONFLICT (source, event_id) DO NOTHING`).
- Persistencia:
  - Upsert `leads`
  - Insert `lead_stage_events` con `ON CONFLICT DO NOTHING`
  - Upsert `tasks`
- Manejo de errores:
  - Si falla persistencia, guarda error en `raw_events.error` y deja `processed_at` en `NULL`.

### Notas Kommo API (placeholders)
Si la cuenta Kommo usa endpoints o nombres distintos, ajustar en `src/services/kommoClient.ts`:
- `GET /api/v4/leads?filter[updated_at][from]=...`
- `GET /api/v4/tasks?filter[updated_at][from]=...`

## 5) Job nocturno de reconciliación

Archivo: `src/jobs/reconcileKommo.ts`

- Scheduler: `node-cron`
- Frecuencia: todos los días a las **02:00** timezone **America/Argentina/Buenos_Aires**.
- Flujo:
  1. `fetchLeadsUpdatedSince(48)`
  2. `fetchTasksUpdatedSince(48)`
  3. Upsert en Supabase
  4. Registro en `raw_events` con `source = 'reconcile'` y `event_type = reconcile.leads / reconcile.tasks`
- Incluye:
  - paginación
  - rate-limit básico (`sleep(150ms)`)
  - retries con backoff lineal

### Alternativa recomendada
Para mayor robustez operativa, correr reconciliación con cron externo (GitHub Actions / Cloud Scheduler + endpoint interno).

## 6) Configuración ENV + seguridad

Variables requeridas:

```env
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require
KOMMO_SUBDOMAIN=tu_subdominio
KOMMO_ACCESS_TOKEN=kommo_access_token
KOMMO_WEBHOOK_SECRET=opcional_secret
LOG_LEVEL=info
TZ=America/Argentina/Buenos_Aires
```

## 7) Metabase setup + plan de dashboard

### Levantar Metabase

```bash
docker compose up -d metabase
```

Metabase queda en `http://localhost:3001`.

### Conectar Metabase a Supabase Postgres
En onboarding de Metabase (Database):
- Type: PostgreSQL
- Host: `<supabase-host>`
- Port: `5432`
- DB Name: `postgres` (o la que uses)
- User: `<supabase-user>`
- Password: `<supabase-password>`
- SSL: Enabled (`require`)

### Dashboard “KPIs Conversacionales”
Cards sugeridas:
1. **Leads In (últimos 7 días)** desde `leads.created_at`
2. **Funnel NEW→QUALIFIED→APPOINTMENT_SET→WON** usando `vw_lead_funnel_times`
3. **Avg Time to Qualify (hrs)** desde `time_to_qualify_hours`
4. **Avg Time to Appointment (hrs)** desde `time_to_appointment_hours`
5. **Win Rate** desde `vw_owner_weekly_performance.win_rate`
6. **Tasks Overdue (count)** desde `vw_tasks_health` (`is_overdue = true`)
7. **Ranking owners** (won, win_rate, avg_time_to_qualify)

Filtros globales:
- date range
- owner_id
- channel
- source/campaign
- pipeline_id

## 8) Pasos de ejecución

### Requisitos
- Node.js 20+
- npm 10+
- Proyecto Supabase ya creado
- Credenciales Kommo

### 1) Ejecutar SQL en Supabase
1. Abrir SQL Editor.
2. Ejecutar `sql/001_schema.sql`.
3. Ejecutar `sql/002_views.sql`.

### 2) Configurar `.env`

```bash
cp .env.example .env
# editar valores
```

### 3) Levantar servicio Node

```bash
npm install
npm run dev
```

### 4) Configurar webhook en Kommo
Configurar webhook apuntando a:

```txt
POST https://<tu-host>/webhooks/kommo
```

### 5) Probar con curl

```bash
curl -X POST http://localhost:3000/webhooks/kommo \
  -H "Content-Type: application/json" \
  -H "X-KOMMO-SIGNATURE: sha256=<firma_placeholder>" \
  -d '{
    "event_type": "lead.stage_changed",
    "event_time": "2026-01-30T15:04:00Z",
    "lead": {
      "id": 10101,
      "created_at": "2026-01-25T10:00:00Z",
      "updated_at": "2026-01-30T15:04:00Z",
      "pipeline_id": 3001,
      "from_stage_id": 11,
      "to_stage_id": 12,
      "owner_id": 900,
      "status": "active",
      "price": 20000,
      "lost_reason_id": null,
      "tags": ["inbound", "whatsapp"],
      "utm_source": "google",
      "utm_campaign": "search_brand",
      "channel": "whatsapp"
    },
    "actor": { "type": "user", "id": 900 }
  }'
```

### 6) Levantar Metabase y conectar DB

```bash
docker compose up -d metabase
```

Luego conectar a Supabase con SSL.

## Scripts NPM

- `npm run dev`: desarrollo con recarga.
- `npm run build`: compila TypeScript.
- `npm run start`: ejecuta build compilado.
- `npm run lint`: chequeo de tipos TS.
- `npm run migrate`: recordatorio para ejecutar SQL en Supabase.

## Checklist de validación

- [ ] `/health` responde `{ ok: true }`.
- [ ] Webhook Kommo guarda en `raw_events`.
- [ ] Duplicados de webhook no reprocesan (`duplicated: true`).
- [ ] `leads`, `lead_stage_events`, `tasks` se pueblan correctamente.
- [ ] Errores de DB quedan en `raw_events.error`.
- [ ] Job de reconciliación corre a las 02:00 y deja trazas en logs.
- [ ] Metabase consulta las views sin errores.

## Troubleshooting

### Duplicados en webhooks
- Verificar `event_id` enviado por Kommo.
- Si no viene, revisar fórmula de hash en `kommoNormalizer.ts`.

### Timestamps inconsistentes
- Confirmar `TZ=America/Argentina/Buenos_Aires` en runtime.
- Guardar siempre en UTC (`timestamptz`) y convertir en visualización.

### Webhooks caídos / reintentos Kommo
- Revisar logs estructurados (`pino`).
- Consultar `raw_events` con `processed_at IS NULL` y `error IS NOT NULL`.
- Volver a procesar manualmente leyendo `payload` de `raw_events`.
