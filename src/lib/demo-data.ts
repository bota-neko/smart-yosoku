'use client';

/**
 * デモデータの一括初期化。
 * 商品・卸先・納品実績の3ストアを「同じ見本」から同時に作り直し、常に整合させる。
 * どれか1つだけリセットしてズレる、という事態を防ぐ。
 */
import { resetProductsDemo } from './products-store';
import { resetLocationsDemo } from './locations-store';
import { resetDeliveriesDemo } from './deliveries-store';
import { resetFactorsDemo } from './factors-store';
import { resetSettingsDemo } from './settings-store';

/** 全ストアをまとめて見本の初期状態へ戻す。 */
export function resetAllDemoData(): void {
  resetProductsDemo();
  resetLocationsDemo();
  resetDeliveriesDemo();
  resetFactorsDemo();
  resetSettingsDemo();
}

/** 旧バージョン（v1）の保存キー。現在は未使用のため自動削除する。 */
const LEGACY_KEYS = [
  'smart-yosoku:products:v1',
  'smart-yosoku:locations:v1',
  'smart-yosoku:deliveries:v1',
];

/** 使われなくなった旧保存キーをブラウザから削除する（冪等・アプリ起動時に一度呼ぶ）。 */
export function cleanupLegacyStorage(): void {
  if (typeof window === 'undefined') return;
  for (const key of LEGACY_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // localStorage 不可でも無視
    }
  }
}
