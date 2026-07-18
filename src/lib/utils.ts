import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind クラスを条件付きで結合し、競合するクラスは後勝ちで解決する。
 * 例: cn('px-2', condition && 'px-4') → 'px-4'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 数値を日本語ロケールの桁区切りで表示（小数は指定桁で丸め） */
export function formatNumber(value: number, fractionDigits = 0): string {
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

/** 0-1 の割合を「%」表記へ（既定は整数） */
export function formatPercent(rate: number, fractionDigits = 0): string {
  return `${(rate * 100).toFixed(fractionDigits)}%`;
}
