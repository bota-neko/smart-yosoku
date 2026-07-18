/** 予測ドメイン用の純粋な日付ユーティリティ（UTC基準・外部依存なし） */

/** 'YYYY-MM-DD' を UTC ミリ秒へ */
export function toEpoch(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** UTC ミリ秒を 'YYYY-MM-DD' へ */
export function fromEpoch(epoch: number): string {
  const dt = new Date(epoch);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DAY_MS = 86_400_000;

/** 日数を加算した日付文字列 */
export function addDays(dateStr: string, days: number): string {
  return fromEpoch(toEpoch(dateStr) + days * DAY_MS);
}

/** 2日付間の日数差（a - b） */
export function diffDays(a: string, b: string): number {
  return Math.round((toEpoch(a) - toEpoch(b)) / DAY_MS);
}

/** 曜日 0=日曜..6=土曜 */
export function dayOfWeek(dateStr: string): number {
  return new Date(toEpoch(dateStr)).getUTCDay();
}

/** 月 1..12 */
export function monthOf(dateStr: string): number {
  return new Date(toEpoch(dateStr)).getUTCMonth() + 1;
}

/** 前年同日（存在しない2/29は2/28へ丸め） */
export function sameDayLastYear(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = m === 2 && d === 29 ? 28 : d;
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
