/**
 * エンドツーエンド検証: 生成データ→予測→実績突合→精度計算 が実際に動くことを示す。
 * 直近30日をホールドアウトし、各日を「その日の前日までの履歴」で予測して実績と比較する。
 * 実行: npx tsx scripts/verify-pipeline.ts
 */
import { generateSeedRecords, SEED_LOCATIONS, SEED_TARGETS } from '../src/lib/seed/generate';
import { EnsembleForecastEngine } from '../src/domain/forecast/engine';
import { calcAccuracy, type ForecastActualPair } from '../src/domain/accuracy/metrics';
import { detectAnomalies } from '../src/domain/anomaly/detect';
import type { DailyRecord } from '../src/domain/types';
import { addDays } from '../src/domain/dateutil';

const END = '2026-07-15';
const DAYS = 400;
const HOLDOUT = 30;

const all = generateSeedRecords(END, DAYS);
const engine = new EnsembleForecastEngine();

function toDailyRecords(locKey: string, targetKey: string): DailyRecord[] {
  return all
    .filter((r) => r.locationKey === locKey && r.targetKey === targetKey)
    .map((r) => ({
      date: r.date, sales: r.sold, produced: r.produced, waste: r.waste,
      returns: r.returns, stockout: r.stockout, soldOut: r.soldOut,
      factors: {
        weather: r.weather, tempHigh: r.tempHigh, tempLow: r.tempLow,
        isHoliday: r.isHoliday, sale: r.sale, event: r.event,
      },
    }));
}

let grandPairs: ForecastActualPair[] = [];
let anyNaN = false;

for (const loc of SEED_LOCATIONS) {
  for (const t of SEED_TARGETS) {
    const series = toDailyRecords(loc.key, t.key);
    const target = { id: t.key, name: t.name, unit: t.unit, allowDecimal: false };
    const pairs: ForecastActualPair[] = [];

    for (let h = HOLDOUT; h >= 1; h--) {
      const day = addDays(END, -h + 1);
      const history = series.filter((r) => r.date < day);
      const actualRec = series.find((r) => r.date === day);
      if (!actualRec || actualRec.sales === null) continue;
      const cond = { date: day, factors: history.length ? actualRec.factors : undefined };
      const f = engine.forecast(history, target, { date: day, factors: actualRec.factors });
      if (!Number.isFinite(f.recommendedQuantity) || !Number.isFinite(f.adjustedDemand)) anyNaN = true;
      pairs.push({ date: day, predicted: f.adjustedDemand, actual: actualRec.sales });
      void cond;
    }
    grandPairs = grandPairs.concat(pairs);
  }
}

const acc = calcAccuracy(grandPairs, 0.1);
const anomalies = detectAnomalies(toDailyRecords('factory', 'momen'));

console.log('=== エンドツーエンド検証結果 ===');
console.log(`予測実績ペア件数: ${acc.count}`);
console.log(`NaN/Infinity発生: ${anyNaN ? 'あり(異常)' : 'なし ✅'}`);
console.log(`WAPE(加重誤差率): ${(acc.wape * 100).toFixed(1)}%`);
console.log(`MAPE(誤差率, 実績0除外 ${acc.mapeCount}件): ${(acc.mape * 100).toFixed(1)}%`);
console.log(`MAE(平均誤差): ${acc.mae.toFixed(1)} 個`);
console.log(`RMSE: ${acc.rmse.toFixed(1)}`);
console.log(`Bias(偏り): ${acc.bias.toFixed(1)} (${acc.bias > 0 ? '過剰寄り' : '不足寄り'})`);
console.log(`的中率(±10%以内): ${(acc.hitRate * 100).toFixed(1)}%`);
console.log(`過剰${acc.overCount} / 不足${acc.underCount} / 適正${acc.onTargetCount}`);
console.log(`本社工場・木綿豆腐 の検知異常値: ${anomalies.length}件`);

// サンプル1件の予測理由を表示
const sampleHist = toDailyRecords('factory', 'kinu');
const sampleTarget = { id: 'kinu', name: '絹ごし豆腐', unit: '丁', allowDecimal: false };
const sample = engine.forecast(sampleHist.filter((r) => r.date < END), sampleTarget, {
  date: END, factors: { weather: 'sunny', tempHigh: 32, sale: true }, currentStock: 20, alreadyOrdered: 0,
});
console.log('\n=== サンプル予測（絹ごし豆腐・本社工場・特売あり・気温32℃）===');
console.log(`推奨数: ${sample.recommendedQuantity} ${sampleTarget.unit}`);
console.log(`予測需要 ${sample.adjustedDemand} / 安全分 ${sample.safetyStock} / 信頼度 ${sample.confidence.level}(${sample.confidence.score})`);
console.log('理由:');
for (const r of sample.reasons) console.log('  ・' + r);

if (anyNaN) process.exit(1);
