// Cloudflare Pages Function: Gemini API 프록시.
// API 키는 Cloudflare 환경 변수에만 두고 브라우저로 내보내지 않습니다.
// 키 이름: GEMINI_API_KEY, GEMINI_API_KEY_01, GEMINI_API_KEY_02 ... (GOOGLE_API_KEY 등도 인정)
// 키가 여러 개면 번갈아 쓰고, 한도 초과(429) 등이 나면 다른 키로 자동 재시도합니다.
// 선택: APP_PASSCODE 를 설정하면 요청마다 X-App-Passcode 헤더가 일치해야 합니다.
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

// 붙여넣기 때 생기는 공백/줄바꿈은 제거합니다.
const KEY_NAME = /^(GEMINI|GOOGLE)_(GENERATIVE_AI_)?API_KEY(_?\d+)?$|^GEMINI_KEY(_?\d+)?$|^API_KEY$/;
const findKeys = (env) =>
  Object.keys(env)
    .filter((name) => KEY_NAME.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((name) => ({ name, value: typeof env[name] === "string" ? env[name].trim() : "" }))
    .filter((k) => k.value);

// 키를 바꿔서 다시 시도할 만한 응답: 한도 초과, 서버 과부하, 키 거부
const RETRY_WITH_NEXT_KEY = new Set([429, 500, 503, 403]);

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const denied = (request, env) =>
  !!env.APP_PASSCODE && request.headers.get("X-App-Passcode") !== env.APP_PASSCODE;

// GET /api/gemini            → 서버 키 사용 가능 여부 (키 값은 절대 반환하지 않음)
// GET /api/gemini?models=1   → 사용 가능한 모델 목록
export async function onRequestGet({ request, env }) {
  const keys = findKeys(env);
  if (keys.length === 0) return json({ hasKey: false });
  const url = new URL(request.url);
  if (url.searchParams.get("models")) {
    if (denied(request, env)) return json({ error: { message: "접속 암호가 필요합니다." } }, 401);
    const upstream = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": keys[0].value } });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  return json({ hasKey: true, keyName: keys[0].name, keyCount: keys.length, needsPasscode: !!env.APP_PASSCODE });
}

// POST /api/gemini?model=<모델명>  → generateContent 요청을 그대로 전달
export async function onRequestPost({ request, env }) {
  const keys = findKeys(env);
  if (keys.length === 0) return json({ error: { message: "서버에 GEMINI_API_KEY가 설정되지 않았습니다." } }, 500);
  if (denied(request, env)) return json({ error: { message: "접속 암호가 필요합니다." } }, 401);
  const model = new URL(request.url).searchParams.get("model") || "";
  if (!/^[A-Za-z0-9._-]+$/.test(model)) return json({ error: { message: "잘못된 모델명입니다." } }, 400);

  // 재시도하려면 본문을 다시 보낼 수 있어야 하므로 키가 여러 개일 때만 미리 읽어 둡니다.
  const body = keys.length > 1 ? await request.arrayBuffer() : request.body;
  const start = Math.floor(Math.random() * keys.length); // 부하를 키마다 나눔

  let upstream;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    upstream = await fetch(`${GEMINI}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key.value },
      body
    });
    if (!RETRY_WITH_NEXT_KEY.has(upstream.status) || i === keys.length - 1) break;
    await upstream.body?.cancel();
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" }
  });
}
