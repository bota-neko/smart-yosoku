import { z } from 'zod';

/** 数値: 空文字/undefined は null（未入力）、'0' は 0（ゼロ実績）として区別 */
export const nullableNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  });

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください');

export const roleSchema = z.enum(['owner', 'admin', 'staff', 'viewer']);

/** 実績1行 */
export const dailyRecordInput = z.object({
  date: isoDate,
  locationId: z.string().uuid(),
  forecastTargetId: z.string().uuid(),
  delivered: nullableNumber,
  sold: nullableNumber,
  produced: nullableNumber,
  ordered: nullableNumber,
  stock: nullableNumber,
  returns: nullableNumber,
  waste: nullableNumber,
  stockout: nullableNumber,
  visitors: nullableNumber,
  reservations: nullableNumber,
  cancellations: nullableNumber,
  taskCount: nullableNumber,
  salesAmount: nullableNumber,
  note: z.string().max(500).optional().nullable(),
});
export type DailyRecordInput = z.infer<typeof dailyRecordInput>;

/** 予測対象マスタ */
export const forecastTargetInput = z.object({
  name: z.string().min(1, '名称は必須です').max(100),
  categoryId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid(),
  price: nullableNumber,
  cost: nullableNumber,
  isActive: z.boolean().default(true),
  allowDecimal: z.boolean().default(false),
  note: z.string().max(500).optional().nullable(),
});

/** 拠点マスタ */
export const locationInput = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['store', 'branch', 'factory', 'salesfloor', 'warehouse', 'supplier', 'office', 'other']),
  note: z.string().max(500).optional().nullable(),
});

/** 外部要因 */
export const externalFactorInput = z.object({
  date: isoDate,
  locationId: z.string().uuid().nullable().optional(),
  weather: z.enum(['sunny', 'cloudy', 'rainy', 'snowy', 'storm']).nullable().optional(),
  tempHigh: nullableNumber,
  tempLow: nullableNumber,
  precipProbability: nullableNumber,
  sale: z.boolean().default(false),
  campaign: z.boolean().default(false),
  event: z.boolean().default(false),
  closed: z.boolean().default(false),
  note: z.string().max(500).optional().nullable(),
});

/** イベント（繰り返し対応） */
export const eventInput = z.object({
  title: z.string().min(1).max(100),
  date: isoDate,
  recurrence: z.enum(['once', 'weekly', 'monthly', 'yearly']).default('once'),
  locationId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).optional().nullable(),
});

/** 手動補正 */
export const adjustmentInput = z.object({
  forecastId: z.string().uuid(),
  adjustedQuantity: nullableNumber,
  reason: z.string().min(1, '修正理由は必須です').max(300),
  comment: z.string().max(500).optional().nullable(),
});

/** 組織設定 */
export const organizationSettingsInput = z.object({
  toleranceHit: z.number().min(0).max(1).default(0.05),
  toleranceNear: z.number().min(0).max(1).default(0.1),
  toleranceCaution: z.number().min(0).max(1).default(0.2),
  safetyRate: z.number().min(0).max(1).default(0.1),
  allowDecimal: z.boolean().default(false),
});
