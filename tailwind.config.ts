import type { Config } from 'tailwindcss';

/**
 * Tailwind 設定。
 * 色は globals.css の CSS 変数（--color-*）を参照する形で定義し、
 * デザインの一元管理とダークモード拡張の余地を確保する。
 * 各 CSS 変数は「R G B」形式（例: 15 61 92）で保持し、
 * rgb(var(--x) / <alpha-value>) で不透明度も扱えるようにする。
 */
const withAlpha = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 面・背景・文字
        background: withAlpha('--color-bg'),
        surface: withAlpha('--color-surface'),
        border: withAlpha('--color-border'),
        foreground: withAlpha('--color-foreground'),
        muted: {
          DEFAULT: withAlpha('--color-muted'),
          bg: withAlpha('--color-muted-bg'),
        },
        // ブランド主要色（濃紺）とアクセント（深い青緑）
        primary: {
          DEFAULT: withAlpha('--color-primary'),
          hover: withAlpha('--color-primary-hover'),
          fg: withAlpha('--color-primary-fg'),
        },
        accent: withAlpha('--color-accent'),
        // 推奨数量専用の濃い赤
        recommend: withAlpha('--color-recommend'),
        // 状態色（色だけに頼らずアイコン/ラベルと併用する前提）
        state: {
          up: withAlpha('--color-up'), // 増加=オレンジ
          down: withAlpha('--color-down'), // 減少=青
          good: withAlpha('--color-good'), // 良好=緑
          warn: withAlpha('--color-warn'), // 注意=オレンジ
          bad: withAlpha('--color-bad'), // 危険=赤
          ref: withAlpha('--color-ref'), // 参考値=グレー
        },
      },
      borderRadius: {
        // 角丸は控えめに統一
        md: '0.375rem',
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
