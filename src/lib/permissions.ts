/** ロール権限判定（サーバー/クライアント共通の純粋ロジック） */

export type Role = 'owner' | 'admin' | 'staff' | 'viewer';

export type Action =
  | 'view'
  | 'record.write'      // 実績入力・編集
  | 'master.write'      // 拠点/予測対象/カテゴリ等マスタ編集
  | 'forecast.adjust'   // 手動補正
  | 'settings.write'    // 組織設定
  | 'members.manage'    // メンバー・権限管理
  | 'org.delete';       // 組織削除

const MATRIX: Record<Role, Action[]> = {
  owner: ['view', 'record.write', 'master.write', 'forecast.adjust', 'settings.write', 'members.manage', 'org.delete'],
  admin: ['view', 'record.write', 'master.write', 'forecast.adjust', 'settings.write', 'members.manage'],
  staff: ['view', 'record.write', 'forecast.adjust'],
  viewer: ['view'],
};

/** role が action を実行できるか */
export function can(role: Role, action: Action): boolean {
  return MATRIX[role]?.includes(action) ?? false;
}

/** 役割の日本語ラベル */
export function roleLabel(role: Role): string {
  return { owner: 'オーナー', admin: '管理者', staff: '一般担当者', viewer: '閲覧のみ' }[role];
}

/** ロールの上下関係（メンバー管理時に自分以上のロールを付与させない等に使用） */
const RANK: Record<Role, number> = { owner: 3, admin: 2, staff: 1, viewer: 0 };
export function outranks(a: Role, b: Role): boolean {
  return RANK[a] > RANK[b];
}
