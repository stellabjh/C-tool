// Cloudflare Pages Function: Gemini API 프록시.
// API 키는 Cloudflare 환경 변수(GEMINI_API_KEY)에만 두고 브라우저로 내보내지 않습니다.
// 선택: APP_PASSCODE 를 설정하면 요청마다 X-App-Passcode 헤더가 일치해야 합니다.
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

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
  if (!env.GEMINI_API_KEY) return json({ hasKey: false });
  const url = new URL(request.url);
  if (url.searchParams.get("models")) {
    if (denied(request, env)) return json({ error: { message: "접속 암호가 필요합니다." } }, 401);
    const upstream = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  return json({ hasKey: true, needsPasscode: !!env.APP_PASSCODE });
}

// POST /api/gemini?model=<모델명>  → generateContent 요청을 그대로 전달
export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: { message: "서버에 GEMINI_API_KEY가 설정되지 않았습니다." } }, 500);
  if (denied(request, env)) return json({ error: { message: "접속 암호가 필요합니다." } }, 401);
  const model = new URL(request.url).searchParams.get("model") || "";
  if (!/^[A-Za-z0-9._-]+$/.test(model)) return json({ error: { message: "잘못된 모델명입니다." } }, 400);
  const upstream = await fetch(`${GEMINI}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: request.body
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" }
  });
}
