/**
 * ドメイン共通型。UI・DBから独立した純粋な予測ドメインの型定義。
 * 将来 Python/FastAPI 等へ移行してもこの契約(interface)を保つ。
 */

/** 1日1予測対象1拠点の実績レコード（予測エンジンへの入力単位） */
export interface DailyRecord {
  /** ISO日付 'YYYY-MM-DD' */
  date: string;
  /** 販売数（需要の代理指標）。null=未入力, 0=ゼロ実績 */
  sales: number | null;
  /** 製造/納品数（供給） */
  produced?: number | null;
  /** 廃棄数 */
  waste?: number | null;
  /** 返品数 */
  returns?: number | null;
  /** 欠品数（推定含む） */
  stockout?: number | null;
  /** 売り切れたか（trueなら販売数を需要上限としない） */
  soldOut?: boolean;
  /** その日の外部要因 */
  factors?: DailyFactors;
}

/** 需要へ影響する日次外部要因 */
export interface DailyFactors {
  /** 0=日曜 .. 6=土曜。未指定なら date から算出 */
  dayOfWeek?: number;
  isHoliday?: boolean;
  /** 天候カテゴリ */
  weather?: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'storm' | null;
  tempHigh?: number | null;
  tempLow?: number | null;
  precipProbability?: number | null;
  /** 特売あり */
  sale?: boolean;
  /** キャンペーンあり */
  campaign?: boolean;
  /** 何らかのイベントあり（地域/店舗イベント等） */
  event?: boolean;
  /** 店休日 */
  closed?: boolean;
}

/** 予測対象のメタ情報 */
export interface ForecastTargetMeta {
  id: string;
  name: string;
  unit: string;
  /** 小数を許容するか（人数=整数, kg=小数など） */
  allowDecimal: boolean;
  /** 新商品フラグ */
  isNew?: boolean;
  /** 構造変化日（価格改定/リニューアル等）。この日以降を優先 */
  changePointDate?: string | null;
}

/** 予測対象日の条件（外部要因の予定値） */
export interface ForecastConditions {
  /** 予測対象日 'YYYY-MM-DD' */
  date: string;
  factors?: DailyFactors;
  /** 現在庫 */
  currentStock?: number | null;
  /** 既発注/既製造済み数 */
  alreadyOrdered?: number | null;
  /** 安全在庫率(0-1)。既定0.1 */
  safetyRate?: number;
}

/** 1つの予測要素（モデル）の寄与 */
export interface ForecastComponent {
  /** 内部キー */
  key: string;
  /** 表示名（日本語・一般利用者向け） */
  label: string;
  /** この要素が示す予測値 */
  value: number;
  /** アンサンブル内の重み(0-1, 正規化前) */
  weight: number;
  /** 人間向け説明文（任意） */
  note?: string;
}

/** 補正（加算/乗算）の寄与 */
export interface ForecastAdjustment {
  key: string;
  label: string;
  /** 補正後 - 補正前 の差分（個数単位） */
  delta: number;
  /** 日本語の理由文 */
  reason: string;
}

/** 信頼度レベル */
export type ConfidenceLevel = 'high' | 'standard' | 'low' | 'reference';

export interface ConfidenceResult {
  level: ConfidenceLevel;
  /** 0-100のスコア */
  score: number;
  /** 低い場合などの理由文 */
  reasons: string[];
}

/** 予測結果 */
export interface ForecastResult {
  targetId: string;
  date: string;
  /** ベース予測需要（アンサンブル） */
  baseDemand: number;
  /** 補正適用後の予測需要 */
  adjustedDemand: number;
  /** 安全分 */
  safetyStock: number;
  /** 現在庫 */
  currentStock: number;
  /** 既発注数 */
  alreadyOrdered: number;
  /** 最終推奨数 = adjustedDemand + safetyStock - currentStock - alreadyOrdered（下限0） */
  recommendedQuantity: number;
  /** 予測範囲（下限・上限） */
  rangeLow: number;
  rangeHigh: number;
  /** 使用したモデル要素 */
  components: ForecastComponent[];
  /** 適用した補正 */
  adjustments: ForecastAdjustment[];
  /** 日本語の予測理由（箇条書き） */
  reasons: string[];
  confidence: ConfidenceResult;
  /** データ蓄積からどの傾向を学習できているか */
  learnedFeatures: string[];
  modelVersion: string;
}

/** 予測エンジン契約。将来ML実装(Python等)へ差し替え可能。 */
export interface ForecastEngine {
  readonly version: string;
  forecast(
    history: DailyRecord[],
    target: ForecastTargetMeta,
    conditions: ForecastConditions,
  ): ForecastResult;
}
