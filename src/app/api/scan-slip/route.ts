import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { createClient } from '@/lib/supabase/server';
import { loadUserApiKey } from '@/lib/server/user-api-key';
import {
  normalizeSlipResult,
  type SlipLocationRef,
  type SlipProductRef,
} from '@/lib/slip-scan';

/**
 * 納品書の画像を読み取り、卸先・日付・商品ごとの納品数を返す。
 *
 * - ログイン必須。読み取りには本人が「設定」で登録した Claude API キーを使う（費用は本人負担）
 * - 画像は保存しない（読み取りにのみ使用）
 * - 結果は「下書き」。画面で人が確認してから保存する
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGE_BASE64 = 4 * 1024 * 1024; // Vercel の送信上限(4.5MB)・Claude の画像上限(5MB)未満
const RATE_LIMIT_PER_HOUR = 200; // 費用は本人負担のため緩め（連打・暴走の抑止のみ）

const RequestSchema = z.object({
  image: z.string().min(1).max(MAX_IMAGE_BASE64),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  products: z
    .array(
      z.object({
        id: z.string().max(64),
        name: z.string().max(100),
        unit: z.string().max(20),
        caseSize: z.number().int().positive().optional(),
      }),
    )
    .max(200),
  locations: z
    .array(z.object({ id: z.string().max(64), name: z.string().max(100) }))
    .max(200),
});

const SlipSchema = z.object({
  readable: z.boolean().describe('納品書として読み取れたか'),
  slip_date: z.string().nullable().describe('納品日 YYYY-MM-DD。読めなければ null'),
  location_id: z.string().nullable().describe('一致した卸先のID。該当なしは null'),
  location_name_on_slip: z.string().nullable().describe('納品書に書かれた納品先名'),
  items: z.array(
    z.object({
      product_id: z.string().nullable().describe('一致した商品のID。該当なしは null'),
      name_on_slip: z.string().describe('納品書に書かれた品名'),
      quantity: z.number().describe('数量'),
      unit_kind: z.enum(['piece', 'case']).describe('数量がケース単位なら case'),
    }),
  ),
  note: z.string().nullable().describe('読み取りにくかった点など、利用者への短い注意（日本語）'),
});

const SYSTEM_PROMPT = `あなたは食品製造業の事務担当です。取引先へ商品を卸したときの「納品書」の写真から、納品内容を正確に書き起こします。

読み取る内容:
- 納品日（年が省略されていれば、与えられた「今日」の年を使う。和暦は西暦に直す）
- 納品先（卸先）名。登録済み卸先の一覧から同じ店を指すものを選び、その ID を location_id に入れる。表記ゆれ（株式会社の有無、略称、支店名）は同一とみなしてよいが、確信が持てなければ null
- 明細の各行：品名、数量、数量の単位
  - 品名は登録済み商品の一覧から同じ商品を指すものを選び product_id に入れる。該当がなければ null（無理に当てはめない）
  - 数量が「ケース」「cs」「箱」など箱単位なら unit_kind を "case"、個・丁・袋・kg などなら "piece"
  - 単価・金額・合計行・消費税・備考は明細に含めない

手書きや汚れで判読できない数字は推測で埋めず、その行を省いて note に書く。
画像が納品書ではない、または全く読めない場合は readable を false にし、items は空にする。`;

// 簡易レート制限（インスタンス内メモリ。厳密ではないが連打・濫用の抑止になる）
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= RATE_LIMIT_PER_HOUR) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  // ログイン確認
  let userId: string;
  let supabase: ReturnType<typeof createClient>;
  try {
    supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return error(401, '納品書の読み取りはログインすると使えます。');
    userId = data.user.id;
  } catch {
    return error(401, '納品書の読み取りはログインすると使えます。');
  }

  // 本人の API キー
  const apiKey = await loadUserApiKey(supabase, userId);
  if (apiKey === 'unconfigured') {
    return error(501, 'サーバーの暗号化設定（API_KEY_ENCRYPTION_SECRET）が未設定です。');
  }
  if (!apiKey) {
    return error(412, '「設定」で Claude の APIキーを登録すると使えます。');
  }

  if (rateLimited(userId)) {
    return error(429, '読み取り回数が上限に達しました。しばらくしてからお試しください。');
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path[0];
      if (path === 'image' || path === 'mediaType') {
        return error(400, '画像を送れませんでした。別の写真でお試しください。');
      }
      return error(400, '商品・お店の登録内容を読み込めませんでした。ページを再読み込みしてお試しください。');
    }
    body = parsed.data;
    if (body.products.length === 0) {
      return error(400, '先に「設定」→「商品」で商品を登録してください（納品書の品名と照らし合わせるため）。');
    }
  } catch {
    return error(400, '画像のサイズが大きすぎるか、送信内容が正しくありません。');
  }

  const products: SlipProductRef[] = body.products;
  const locations: SlipLocationRef[] = body.locations;

  const catalog = [
    `今日: ${body.today}`,
    '',
    '登録済みの卸先（id: 名前）:',
    ...(locations.length ? locations.map((l) => `- ${l.id}: ${l.name}`) : ['（なし）']),
    '',
    '登録済みの商品（id: 名前 / 単位 / ケース入数）:',
    ...products.map(
      (p) => `- ${p.id}: ${p.name} / ${p.unit}${p.caseSize ? ` / 1ケース=${p.caseSize}${p.unit}` : ''}`,
    ),
    '',
    'この納品書を読み取ってください。',
  ].join('\n');

  const client = new Anthropic({ apiKey });
  try {
    // 書き写し中心の作業なので、費用の安い Haiku を使う（利用料は本人負担）
    const response = await client.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 16000,
      output_config: { format: zodOutputFormat(SlipSchema) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: body.mediaType, data: body.image } },
            { type: 'text', text: catalog },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens' || !response.parsed_output) {
      return error(422, '納品書を読み取れませんでした。明るい場所で、納品書全体が写るように撮り直してください。');
    }

    return NextResponse.json(normalizeSlipResult(response.parsed_output, products, locations));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return error(429, '読み取りが混み合っています。少し待ってからお試しください。');
    }
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      return error(400, '登録したAPIキーが使えません。「設定」でキーを登録し直してください。');
    }
    if (e instanceof Anthropic.BadRequestError) {
      return error(
        400,
        '読み取れませんでした。別の写真でお試しください（Claude Console のクレジット残高が不足している場合もあります）。',
      );
    }
    if (e instanceof Anthropic.APIError) {
      return error(502, '読み取りサービスでエラーが発生しました。時間をおいてお試しください。');
    }
    return error(500, '読み取り中にエラーが発生しました。');
  }
}
