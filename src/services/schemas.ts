import { z } from 'zod';

const nullableBigInt = z.union([z.number(), z.string()]).transform((v) => Number(v)).nullable().optional();
const nullableDate = z.union([z.string(), z.number(), z.date()]).nullable().optional();

export const kommoWebhookSchema = z.object({
  event_id: z.union([z.string(), z.number()]).optional(),
  event_type: z.string().optional(),
  event_time: nullableDate,
  lead: z
    .object({
      id: nullableBigInt,
      created_at: nullableDate,
      updated_at: nullableDate,
      pipeline_id: nullableBigInt,
      stage_id: nullableBigInt,
      from_stage_id: nullableBigInt,
      to_stage_id: nullableBigInt,
      owner_id: nullableBigInt,
      status: z.string().nullable().optional(),
      lost_reason_id: nullableBigInt,
      price: z.union([z.number(), z.string()]).nullable().optional(),
      tags: z.array(z.unknown()).optional(),
      utm_source: z.string().nullable().optional(),
      utm_campaign: z.string().nullable().optional(),
      channel: z.string().nullable().optional(),
      source: z.string().nullable().optional(),
      campaign: z.string().nullable().optional()
    })
    .partial()
    .optional(),
  task: z
    .object({
      id: nullableBigInt,
      lead_id: nullableBigInt,
      owner_id: nullableBigInt,
      task_type: z.string().nullable().optional(),
      created_at: nullableDate,
      due_at: nullableDate,
      completed_at: nullableDate,
      status: z.string().nullable().optional()
    })
    .partial()
    .optional(),
  actor: z
    .object({
      type: z.string().nullable().optional(),
      id: nullableBigInt
    })
    .partial()
    .optional(),
  payload: z.record(z.any()).optional()
});

export type KommoWebhookParsed = z.infer<typeof kommoWebhookSchema>;
