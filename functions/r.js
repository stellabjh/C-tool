// Cloudflare Pages Function: 리포트 링크(/r?c=그림이름#r=...)의 카톡 미리보기 카드.
// 리포트 내용은 링크 뒤쪽(# 뒤)에 들어 있어 서버로 오지 않으므로, 서버에는 아무것도 저장하지 않습니다.
// 카톡·메신저의 미리보기는 서버가 내려 주는 HTML의 og 태그로 만들어지므로, 앱(index.html)에 그림·제목·설명 태그를 끼워서 돌려줍니다.
// 그림 파일은 /card/<이름>.jpg 에 있습니다. 제목·설명은 고객 이름 없이 모든 링크에 같은 문구입니다.
const CARDS = {
  family: { title: "우리 가족 보장분석 리포트", desc: "온 가족 함께 든든하게, 가족 보장을 한눈에 확인하세요." },
  friends: { title: "내 보장, 다섯 친구로 점검", desc: "병원비·생활비·부양비 등 다섯 가지 기준으로 확인해요." },
  report: { title: "내 보험, 한눈에 보기", desc: "가입한 계약과 담보를 표로 정리했어요. 눌러서 확인하세요." },
  signal: { title: "내 보장 신호등 점검", desc: "초록·노랑·빨강으로 내 보장 상태를 바로 확인하세요." }
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = Object.prototype.hasOwnProperty.call(CARDS, url.searchParams.get("c")) ? url.searchParams.get("c") : "family";
  const card = CARDS[key];

  // 앱 본문(index.html)을 그대로 가져옵니다.
  const asset = await env.ASSETS.fetch(new Request(new URL("/", url).toString()));
  if (!asset.ok) return new Response("리포트 화면을 불러오지 못했습니다.", { status: 502 });
  let html = await asset.text();
  // 앱 본체의 변수가 새로 그리는 리포트의 변수와 겹치지 않도록 앱 본체를 함수로 감쌉니다 (index.html 의 APP_MAIN 표시).
  html = html.replace("/*APP_MAIN_START*/", "(function(){").replace("/*APP_MAIN_END*/", "})();");

  const image = url.origin + "/card/" + key + ".jpg";
  const tags = [
    '<meta name="robots" content="noindex, nofollow" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:locale" content="ko_KR" />',
    '<meta property="og:title" content="' + esc(card.title) + '" />',
    '<meta property="og:description" content="' + esc(card.desc) + '" />',
    '<meta property="og:image" content="' + esc(image) + '" />',
    '<meta property="og:image:width" content="900" />',
    '<meta property="og:image:height" content="471" />',
    '<meta property="og:url" content="' + esc(url.origin + "/r?c=" + key) + '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="description" content="' + esc(card.desc) + '" />'
  ].join("\n  ");
  const titleTag = "<title>" + esc(card.title) + "</title>\n  " + tags;
  html = /<title>[^<]*<\/title>/.test(html) ? html.replace(/<title>[^<]*<\/title>/, titleTag) : html.replace("</head>", "  " + titleTag + "\n</head>");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}
