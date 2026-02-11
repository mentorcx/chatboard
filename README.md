# MVP - Dashboard de KPIs Conversacionales (n8n + Supabase + Metabase)

Implementación MVP orientada a **n8n** para lógica y endpoints (sin backend Node custom).

## Arquitectura

- **n8n**: recibe webhooks de Kommo, normaliza, aplica idempotencia y persiste en Supabase.
- **Supabase Postgres**: modelo transaccional + views analíticas.
- **Metabase**: visualización de KPIs.

> Alcance: **sin ingesta de mensajes**. Funnel basado en `lead_stage_events` y `tasks`.

## Estructura del proyecto

```txt
.
├── docker-compose.yml
├── .env.example
├── sql
│   ├── 001_schema.sql
│   └── 002_views.sql
└── n8n
    └── workflows
        ├── kommo_webhook_workflow.json
        └── kommo_reconcile_workflow.json
```

## 1) SQL DDL para Supabase

Ejecutar `sql/001_schema.sql`.

Tablas incluidas:
- `raw_events`
- `leads`
- `lead_stage_events`
- `tasks`
- `users`
- `pipelines`
- `stages`
- `lost_reasons`
- `stage_mapping`

Incluye índices recomendados y comentarios.

## 2) SQL Views para Metabase

Ejecutar `sql/002_views.sql`.

Views:
- `vw_lead_funnel_times`
- `vw_tasks_health`
- `vw_owner_weekly_performance`

## 3) n8n Workflows (lógica + endpoints)

### A) Webhook de Kommo
Archivo: `n8n/workflows/kommo_webhook_workflow.json`

- Endpoint en n8n: `POST /webhooks/kommo`
- Firma: `X-KOMMO-SIGNATURE` / `X-SIGNATURE` (placeholder HMAC SHA256)
- Normalización de eventos:
  - `lead.created`, `lead.updated`, `lead.stage_changed`
  - `task.created`, `task.updated`, `task.completed`
- Idempotencia:
  - usa `event_id` del payload si viene
  - si no, hash SHA256 estable
  - inserta en `raw_events` con `ON CONFLICT DO NOTHING`
- Persistencia:
  - upsert `leads`
  - insert `lead_stage_events`
  - upsert `tasks`
- Marca `raw_events.processed_at` cuando finaliza.

### B) Reconciliación nocturna
Archivo: `n8n/workflows/kommo_reconcile_workflow.json`

- Trigger: cron diario `0 2 * * *`
- TZ: `America/Argentina/Buenos_Aires`
- Llama a endpoints Kommo (placeholders):
  - `GET /api/v4/leads?filter[updated_at][from]=...`
  - `GET /api/v4/tasks?filter[updated_at][from]=...`
- Registra corrida en `raw_events`:
  - `source='reconcile'`
  - `event_type='reconcile.leads' / 'reconcile.tasks'`
  - `event_id` con hash del lote.

> Si los endpoints reales de Kommo difieren, ajustar nodos HTTP del workflow.

## 4) Configuración ENV

Copiar `.env.example` a `.env`:

```bash
cp .env.example .env
```

Variables importantes:
- `DATABASE_URL`
- `KOMMO_SUBDOMAIN`
- `KOMMO_ACCESS_TOKEN`
- `KOMMO_WEBHOOK_SECRET`
- `TZ=America/Argentina/Buenos_Aires`

## 5) Levantar stack

```bash
docker compose up -d
```

Servicios:
- n8n: `http://localhost:5678`
- Metabase: `http://localhost:3001`

## 6) Importar workflows en n8n

1. Entrar a n8n (`localhost:5678`).
2. Importar `n8n/workflows/kommo_webhook_workflow.json`.
3. Importar `n8n/workflows/kommo_reconcile_workflow.json`.
4. Crear credencial Postgres de Supabase en n8n y asignarla a nodos Postgres (`Supabase Postgres`).
5. Activar workflows.

## 7) Configurar webhook en Kommo

Apuntar Kommo a:

```txt
POST http://<tu-host-n8n>:5678/webhook/webhooks/kommo
```

## 8) Prueba rápida con curl

```bash
curl -X POST http://localhost:5678/webhook/webhooks/kommo \
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

## 9) Metabase Dashboard plan

Conectar Metabase a Supabase Postgres (SSL enabled) y armar dashboard **KPIs Conversacionales**:

1. Leads In (últimos 7 días)
2. Funnel (NEW→QUALIFIED→APPOINTMENT_SET→WON)
3. Avg Time to Qualify (hrs)
4. Avg Time to Appointment (hrs)
5. Win Rate
6. Tasks Overdue
7. Ranking owners

Filtros globales:
- date range
- owner_id
- channel
- source/campaign
- pipeline_id

## 10) Guía detallada de puesta en marcha (paso a paso)

### 10.1 Preparación de Supabase
1. Crear proyecto Supabase.
2. Ir a **SQL Editor**.
3. Ejecutar `sql/001_schema.sql`.
4. Ejecutar `sql/002_views.sql`.
5. Confirmar que existan tablas (`raw_events`, `leads`, `lead_stage_events`, `tasks`, etc.) y views (`vw_*`).

### 10.2 Preparación de n8n
1. Copiar `.env.example` a `.env` y completar variables.
2. Generar `N8N_ENCRYPTION_KEY` (mínimo 32 chars).
3. Ejecutar `docker compose up -d`.
4. Ingresar a `http://localhost:5678` y crear usuario/admin.

### 10.3 Importación de workflows
1. En n8n, ir a **Workflows → Import from File**.
2. Importar:
   - `n8n/workflows/kommo_webhook_workflow.json`
   - `n8n/workflows/kommo_reconcile_workflow.json`
3. Crear credencial **Postgres** con el `DATABASE_URL` de Supabase.
4. Abrir cada workflow y asignar la credencial a los nodos Postgres.
5. Guardar y **activar** ambos workflows.

### 10.4 Configuración en Kommo
1. En Kommo, crear webhook de tipo POST.
2. URL: `http://<tu-host-n8n>:5678/webhook/webhooks/kommo`
3. Si usás firma: configurar `KOMMO_WEBHOOK_SECRET` y enviar header `X-KOMMO-SIGNATURE`.

### 10.5 Configuración en Metabase
1. Ingresar a `http://localhost:3001`.
2. Crear conexión a Postgres:
   - Host: `<supabase-host>`
   - Port: `5432`
   - DB: `postgres`
   - User/Password: credenciales Supabase
   - SSL: enabled (`require`)
3. Verificar que aparezcan las views `vw_*`.

### 10.6 Checklist de activación
- [ ] Workflows activos en n8n.
- [ ] `raw_events` recibe registros con `source='kommo'`.
- [ ] `leads`, `lead_stage_events` y `tasks` con datos.
- [ ] Reconciliación nocturna programada.
- [ ] Metabase conectado y leyendo views.

## 11) Go-live script de verificación (copy/paste)

> Ejecutá estos pasos en orden. Ajustá URLs/credenciales según tu entorno.

### 11.1 Variables rápidas (bash)
```bash
export N8N_BASE_URL="http://localhost:5678"
export KOMMO_WEBHOOK_URL="$N8N_BASE_URL/webhook/webhooks/kommo"
```

### 11.2 Verificar endpoint de webhook con payload simulado
```bash
curl -s -X POST "$KOMMO_WEBHOOK_URL" \
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

### 11.3 Verificar persistencia (SQL)
```sql
-- Debe existir al menos 1 raw_event
SELECT COUNT(*) FROM raw_events WHERE source = 'kommo';

-- Verificar lead actualizado
SELECT * FROM leads WHERE lead_id = 10101;

-- Verificar evento de etapa
SELECT * FROM lead_stage_events WHERE lead_id = 10101 ORDER BY event_at DESC LIMIT 5;
```

### 11.4 Verificar views en Metabase / SQL
```sql
SELECT * FROM vw_lead_funnel_times WHERE lead_id = 10101;
SELECT * FROM vw_tasks_health LIMIT 5;
```

### 11.5 Verificar reconciliación
```sql
SELECT * FROM raw_events
WHERE source = 'reconcile'
ORDER BY received_at DESC
LIMIT 5;
```

## Troubleshooting

- **Eventos duplicados:** revisar `raw_events` (`source,event_id` único).
- **Webhook responde 401:** revisar `KOMMO_WEBHOOK_SECRET` + header firma.
- **No inserta en Supabase:** validar credencial Postgres en n8n y permisos SQL.
- **Diferencias de API Kommo:** ajustar nodos HTTP (placeholders).
