import type { DailyRecord } from '@/domain/types';
import { addDays, dayOfWeek } from '@/domain/dateutil';

/**
 * 決定論的な合成履歴を生成（乱数なし）。
 * 週次の曜日変動＋緩やかな季節性＋弱いトレンドを持たせる。
 */
export function buildHistory(endDate: string, days: number, base = 100): DailyRecord[] {
  const records: DailyRecord[] = [];
  for (let i = days; i >= 1; i--) {
    const date = addDays(endDate, -i);
    const dow = dayOfWeek(date);
    // 金土は多め、月は少なめ
    const dowMult = [0.9, 0.8, 0.95, 1.0, 1.05, 1.3, 1.2][dow];
    // 季節性：日ごとの緩やかな正弦（乱数を使わず決定論的）
    const seasonal = 1 + 0.15 * Math.sin((i / 365) * 2 * Math.PI);
    const trend = 1 + (days - i) * 0.0002;
    const sales = Math.round(base * dowMult * seasonal * trend);
    records.push({
      date,
      sales,
      produced: sales + 10,
      waste: Math.max(0, 10 - (i % 7)),
      returns: 0,
      stockout: 0,
      factors: { dayOfWeek: dow },
    });
  }
  return records;
}
