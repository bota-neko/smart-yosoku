/**
 * ドメイン予測エンジンと Supabase の橋渡し。
 * DB行 → domain DailyRecord へ変換し、予測を生成して forecasts 系テーブルへ保存する。
 * DBアクセスは呼び出し側から渡した Supabase クライアントを使い、RLS 下で動作する。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { EnsembleForecastEngine } from '@/domain/forecast/engine';
import type { DailyRecord, ForecastTargetMeta, ForecastConditions, ForecastResult } from '@/domain/types';

/** daily_records の行（必要カラムのみ） */
interface DailyRecordRow {
  record_date: string;
  sold: number | null;
  produced: number | null;
  waste: number | null;
  returns: number | null;
  stockout: number | null;
}

type WeatherKind = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'storm';

interface ExternalFactorRow {
  factor_date: string;
  weather: WeatherKind | null;
  temp_high: number | null;
  temp_low: number | null;
  precip_probability: number | null;
  sale: boolean | null;
  campaign: boolean | null;
  event: boolean | null;
  closed: boolean | null;
  is_holiday: boolean | null;
}

/** DB行 → domain DailyRecord[] */
export function toDailyRecords(
  records: DailyRecordRow[],
  factors: ExternalFactorRow[],
  stockouts: Array<{ record_date: string; sold_out: boolean; estimated_stockout: number | null }> = [],
): DailyRecord[] {
  const factorByDate = new Map(factors.map((f) => [f.factor_date, f]));
  const stockoutByDate = new Map(stockouts.map((s) => [s.record_date, s]));
  return records.map((r) => {
    const f = factorByDate.get(r.record_date);
    const so = stockoutByDate.get(r.record_date);
    return {
      date: r.record_date,
      sales: r.sold,
      produced: r.produced,
      waste: r.waste,
      returns: r.returns,
      stockout: (so?.estimated_stockout ?? r.stockout) ?? 0,
      soldOut: so?.sold_out ?? false,
      factors: f
        ? {
            weather: f.weather ?? null,
            tempHigh: f.temp_high,
            tempLow: f.temp_low,
            precipProbability: f.precip_probability,
            sale: !!f.sale,
            campaign: !!f.campaign,
            event: !!f.event,
            closed: !!f.closed,
            isHoliday: !!f.is_holiday,
          }
        : undefined,
    };
  });
}

/**
 * 履歴と対象・条件から予測を生成（純粋にエンジンを呼ぶ）。
 * モデル別成績が渡されれば重み調整に使う。
 */
export function runForecast(
  history: DailyRecord[],
  target: ForecastTargetMeta,
  conditions: ForecastConditions,
  modelScores?: Record<string, number>,
): ForecastResult {
  const engine = new EnsembleForecastEngine({ modelScores });
  return engine.forecast(history, target, conditions);
}

/**
 * 予測を DB へ保存（forecasts + forecast_components + forecast_adjustments）。
 * 既存の同一(対象,拠点,日付,モデル)は上書き想定（呼び出し側でユニーク制御）。
 */
export async function persistForecast(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    locationId: string;
    forecastTargetId: string;
    result: ForecastResult;
  },
): Promise<{ forecastId: string | null; error: string | null }> {
  const { organizationId, locationId, forecastTargetId, result } = params;
  const { data, error } = await supabase
    .from('forecasts')
    .insert({
      organization_id: organizationId,
      location_id: locationId,
      forecast_target_id: forecastTargetId,
      forecast_date: result.date,
      model_version: result.modelVersion,
      base_demand: result.baseDemand,
      adjusted_demand: result.adjustedDemand,
      safety_stock: result.safetyStock,
      recommended_quantity: result.recommendedQuantity,
      range_low: result.rangeLow,
      range_high: result.rangeHigh,
      confidence_level: result.confidence.level,
      confidence_score: result.confidence.score,
      confidence_reasons: result.confidence.reasons,
      reasons: result.reasons,
    })
    .select('id')
    .single();

  if (error) return { forecastId: null, error: error.message };
  const forecastId = data.id as string;

  if (result.components.length > 0) {
    await supabase.from('forecast_components').insert(
      result.components.map((c) => ({
        organization_id: organizationId,
        forecast_id: forecastId,
        component_key: c.key,
        label: c.label,
        value: c.value,
        weight: c.weight,
        note: c.note ?? null,
      })),
    );
  }
  if (result.adjustments.length > 0) {
    await supabase.from('forecast_adjustments').insert(
      result.adjustments.map((a) => ({
        organization_id: organizationId,
        forecast_id: forecastId,
        adjustment_key: a.key,
        label: a.label,
        delta: a.delta,
        reason: a.reason,
      })),
    );
  }
  return { forecastId, error: null };
}
