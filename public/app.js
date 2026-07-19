const state = {
  loading: false,
  picks: [],
  museUrl: "/static/images/weekly-muse.png",
  updatedDate: "",
  exchangeRate: null,
  activeCategory: "all",
  oliveyoung: loadLocal("checknavi-oliveyoung", []),
  news: loadLocal("checknavi-news", []),
  campaigns: loadLocal("checknavi-campaigns", []),
  studioDraft: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const formatNumber = (value) => new Intl.NumberFormat("ko-KR").format(Number(value) || 0);
const proxyImage = (url) => `/api/media?url=${encodeURIComponent(url)}`;

function loadLocal(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The workspace still works when storage is disabled.
  }
}

function formatSourceDate(value) {
  if (!value || value === "확인 불가") return "—";
  return String(value).replaceAll("/", ".");
}

function formatCollectedAt(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function updateClock() {
  const now = new Date();
  $("#live-clock").textContent = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  $("#live-date").textContent = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(now);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function showView(name) {
  const target = $(`[data-view="${name}"]`);
  if (!target) return;
  $$(".view").forEach((view) => {
    const active = view === target;
    view.hidden = !active;
    view.classList.toggle("is-active", active);
  });
  $$(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === name);
  });
  $("#view-title").textContent = {
    overview: "TODAY",
    news: "NEWS RADAR",
    rank: "RANK GAP",
    lab: "PRODUCT LAB",
    studio: "CONTENT STUDIO",
    campaign: "CAMPAIGN",
  }[name] || name.toUpperCase();
  document.body.classList.remove("menu-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s()[\]{}.,·・/_-]/g, "");
}

function parseMoney(value) {
  const match = String(value || "").replaceAll(",", "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function sameProduct(pick, korea) {
  const brandMatches = normalize(pick.brand) === normalize(korea.brand);
  const left = normalize(pick.name);
  const right = normalize(korea.name);
  return brandMatches && (left.includes(right) || right.includes(left));
}

function koreaForPick(pick) {
  if (!state.oliveyoung.length) return null;
  const exact = state.oliveyoung.find((item) => sameProduct(pick, item));
  if (exact) return { ...exact, exact: true };
  const category = state.oliveyoung
    .filter((item) => normalize(item.category) === normalize(pick.group_label))
    .sort((a, b) => a.rank - b.rank)[0];
  return category ? { ...category, exact: false } : null;
}

function buySignal(pick, korea) {
  if (!korea) return { label: "한국 랭킹 입력 필요", detail: "CSV를 연결하세요" };
  if (!korea.exact) return { label: "한·일 TOP 제품 상이", detail: "콘텐츠 각도 발견" };
  const jpPrice = parseMoney(pick.price);
  const krJpy = korea.price_krw && state.exchangeRate
    ? (korea.price_krw * state.exchangeRate) / 100
    : null;
  if (!jpPrice || !krJpy) return { label: "가격 비교 준비", detail: "가격 데이터 확인" };
  const difference = Math.round(Math.abs(1 - krJpy / jpPrice) * 100);
  if (krJpy <= jpPrice * 0.85) return { label: `한국 가격 ${difference}% 우위`, detail: "직구 가격 체크" };
  if (jpPrice <= krJpy * 0.85) return { label: `일본 가격 ${difference}% 우위`, detail: "일본에서 구매" };
  return { label: "가격 차이 작음", detail: "배송비로 결정" };
}

function signalScore(pick, korea) {
  const reviewSignal = Math.min(22, Math.log10(Math.max(10, pick.reviews)) * 6);
  const japanSignal = Math.max(0, 24 - pick.source_rank * 1.2);
  const koreaSignal = korea ? Math.max(0, 28 - korea.rank * 2) : 8;
  const crossMarket = korea?.exact ? 18 : korea ? 12 : 5;
  return Math.round(Math.min(99, 24 + reviewSignal + japanSignal + koreaSignal + crossMarket));
}

function renderOverview(data) {
  const { market, weekly, exchange } = data;
  $("#hero-pick-count").textContent = weekly.categories.length;
  $("#hero-average").textContent = market.average_rating.toFixed(2);
  $("#hero-reviews").textContent = formatNumber(market.total_reviews);
  $("#market-state").textContent = market.state;
  $("#market-detail").textContent = `TOP ${market.analyzed_count} · ${market.source_mode === "live" ? "실시간 수집" : "캐시 사용"}`;
  $("#ready-content").textContent = weekly.categories.length * 3;
  $("#exchange-rate").textContent = exchange.rate_per_100_krw == null
    ? "조회 실패"
    : `¥${exchange.rate_per_100_krw.toFixed(3)}`;
  $("#exchange-date").textContent = exchange.as_of_date ? `${exchange.as_of_date} 기준` : "기준일 —";
  $("#source-state").textContent = market.state;
  $("#collected-at").textContent = `수집 ${formatCollectedAt(weekly.collected_at)}`;

  const queue = $("#editorial-queue");
  queue.replaceChildren();
  weekly.categories.slice(0, 4).forEach((pick) => {
    const row = makeElement("div", "queue-row");
    const image = makeElement("img");
    image.src = proxyImage(pick.image_url);
    image.alt = "";
    const copy = makeElement("div");
    copy.append(
      makeElement("b", "", `${pick.group_label} · ${pick.name}`),
      makeElement("small", "", `@cosme #${pick.source_rank} · ★ ${pick.rating.toFixed(1)} · ${formatNumber(pick.reviews)} reviews`),
    );
    row.append(image, copy, makeElement("span", "", "READY"));
    queue.append(row);
  });
}

function renderFilters() {
  const labels = ["all", ...new Set(state.picks.map((pick) => pick.group_label))];
  const filters = $("#rank-filters");
  filters.replaceChildren();
  labels.forEach((label) => {
    const button = makeElement("button", "filter-button", label === "all" ? "전체" : label);
    button.type = "button";
    button.classList.toggle("is-active", state.activeCategory === label);
    button.addEventListener("click", () => {
      state.activeCategory = label;
      renderFilters();
      renderRankGap();
    });
    filters.append(button);
  });
}

function rankGapCard(pick) {
  const korea = koreaForPick(pick);
  const signal = buySignal(pick, korea);
  const card = makeElement("article", "gap-card");

  const imageLink = makeElement("a", "gap-image");
  imageLink.href = pick.product_url;
  imageLink.target = "_blank";
  imageLink.rel = "noopener noreferrer";
  const image = makeElement("img");
  image.src = proxyImage(pick.image_url);
  image.alt = `${pick.brand} ${pick.name}`;
  image.loading = "lazy";
  imageLink.append(image);

  const product = makeElement("div", "gap-product");
  product.append(
    makeElement("span", "category-pill", pick.group_label),
    makeElement("p", "brand-name", pick.brand),
    makeElement("h3", "", pick.name),
  );
  const stats = makeElement("div", "gap-stats");
  stats.append(
    makeElement("span", "", `★ ${pick.rating.toFixed(1)}`),
    makeElement("span", "", `${formatNumber(pick.reviews)} reviews`),
    makeElement("span", "", `SIGNAL ${signalScore(pick, korea)}`),
  );
  product.append(stats);

  const compare = makeElement("div", "market-compare");
  const japan = makeElement("div", "market-column jp");
  japan.append(
    makeElement("span", "", "JAPAN · @COSME"),
    makeElement("strong", "", `#${pick.source_rank}`),
    makeElement("small", "", pick.price || "가격 정보 없음"),
  );
  const koreaColumn = makeElement("div", "market-column kr");
  koreaColumn.append(
    makeElement("span", "", "KOREA · OLIVE YOUNG"),
    makeElement("strong", "", korea ? `#${korea.rank}` : "—"),
    makeElement("small", "", korea
      ? `${korea.name}${korea.price_krw ? ` · ₩${formatNumber(korea.price_krw)}` : ""}`
      : "CSV 데이터를 불러오세요"),
  );
  const signalRow = makeElement("div", "buy-signal");
  signalRow.append(makeElement("span", "", signal.label), makeElement("b", "", signal.detail));
  compare.append(japan, koreaColumn, signalRow);
  card.append(imageLink, product, compare);
  return card;
}

function renderRankGap() {
  const picks = state.activeCategory === "all"
    ? state.picks
    : state.picks.filter((pick) => pick.group_label === state.activeCategory);
  $("#rank-gap-grid").replaceChildren(...picks.map(rankGapCard));
}

function setProductOptions() {
  ["#lab-product-select", "#studio-product"].forEach((selector) => {
    const select = $(selector);
    const previous = select.value;
    select.replaceChildren();
    state.picks.forEach((pick, index) => {
      const option = makeElement("option", "", `${pick.group_label} · ${pick.brand} ${pick.name}`);
      option.value = String(index);
      select.append(option);
    });
    if (previous && Number(previous) < state.picks.length) select.value = previous;
  });
  renderLabProduct();
}

function renderLabProduct() {
  const pick = state.picks[Number($("#lab-product-select").value || 0)];
  const preview = $("#lab-product-preview");
  preview.replaceChildren();
  if (!pick) return;
  const image = makeElement("img");
  image.src = proxyImage(pick.image_url);
  image.alt = `${pick.brand} ${pick.name}`;
  preview.append(
    image,
    makeElement("span", "category-pill", pick.group_label),
    makeElement("h3", "", pick.name),
    makeElement("p", "", `${pick.brand} · @cosme #${pick.source_rank} · ★ ${pick.rating.toFixed(1)} · ${formatNumber(pick.reviews)} reviews`),
  );
}

function generateLabDraft(event) {
  event.preventDefault();
  const pick = state.picks[Number($("#lab-product-select").value || 0)];
  if (!pick) return;
  const ingredients = $("#lab-ingredients").value.trim() || "주요 성분 추가 확인 필요";
  const performance = $("#lab-performance").value.trim() || "사용감과 지속력 검증 필요";
  const angle = $("#lab-angle").value.trim() || "일본 소비자 관점 메모 필요";
  const korea = koreaForPick(pick);
  const signal = buySignal(pick, korea);
  $("#lab-output").classList.remove("empty-state");
  $("#lab-output").textContent =
`[한 줄 결론]
${pick.name}은(는) ${pick.group_label} 카테고리에서 @cosme ${pick.source_rank}위에 오른 제품이다. 현재 데이터 기준 핵심 관찰점은 “${signal.label}”이다.

[근거]
• 평점 ${pick.rating.toFixed(1)} / 리뷰 ${formatNumber(pick.reviews)}건
• 주요 성분: ${ingredients}
• 성능 메모: ${performance}
• 일본 소비자 관점: ${angle}

[콘텐츠 어필]
광고 문구를 그대로 반복하지 않고, 순위·리뷰·가격과 실제 사용 조건을 나눠 설명한다. 성분 효능과 연예인 사용 여부는 원본 출처를 최종 확인한 뒤 게시한다.`;
}

function angleCopy(pick, format, angle, sponsor) {
  const korea = koreaForPick(pick);
  const signal = buySignal(pick, korea);
  const titles = {
    trend: `韓国で先に売れている？ 次に日本で注目したい${pick.group_label}`,
    price: `今買うべき？ ${pick.name}の日韓価格をチェック`,
    performance: `${pick.name}は何が違う？ 人気の理由をデータで分析`,
  };
  const hooks = {
    trend: `日本の@cosmeでは${pick.source_rank}位。レビュー${formatNumber(pick.reviews)}件の評価から、次のK-Beautyシグナルを読み解きます。`,
    price: `${signal.label}。為替と販売価格を同じ基準に直して、購入タイミングを比べます。`,
    performance: `評価${pick.rating.toFixed(1)}、レビュー${formatNumber(pick.reviews)}件。成分・使用感・向いている人を分けて確認します。`,
  };
  const outlines = {
    carousel: ["1. 結論が分かる表紙", "2. 日本ランキング", "3. 韓国ランキング", "4. 価格と為替", "5. レビュー差", "6. 向いている人", "7. 出典・まとめ"],
    reel: ["0–3秒：結論フック", "4–10秒：商品と順位", "11–20秒：日韓の差", "21–30秒：価格・性能", "31–38秒：おすすめ判断", "39–42秒：保存CTA"],
    youtube: ["導入：なぜ今この商品か", "日韓ランキングの違い", "価格・為替・販売先", "成分と性能の確認", "口コミから見える弱点", "買うべき人・待つべき人"],
  };
  const disclosure = sponsor ? `\n\n広告・協賛：${sponsor}とのタイアップコンテンツです。` : "";
  return {
    title: titles[angle],
    hook: hooks[angle],
    outline: outlines[format],
    caption:
`${titles[angle]}

${hooks[angle]}

✓ ${pick.brand}
✓ ${pick.name}
✓ @cosme ${pick.source_rank}位 / ★${pick.rating.toFixed(1)}

順位・価格・レビューは収集時点の情報です。
出典：@cosme / 為替基準日 ${$("#exchange-date").textContent}${disclosure}

#韓国コスメ #KBeauty #コスメ比較 #韓国美容`,
  };
}

function generateStudioDraft(event) {
  event.preventDefault();
  const pick = state.picks[Number($("#studio-product").value || 0)];
  if (!pick) return;
  const format = $("#studio-format").value;
  const angle = $("#studio-angle").value;
  const sponsor = $("#sponsor-toggle").checked ? ($("#sponsor-name").value.trim() || pick.brand) : "";
  state.studioDraft = { pick, format, angle, sponsor, ...angleCopy(pick, format, angle, sponsor) };
  renderStudioDraft();
}

function renderStudioDraft() {
  const draft = state.studioDraft;
  if (!draft) return;
  const output = $("#studio-output");
  output.classList.remove("empty-state");
  output.textContent =
`[TITLE]
${draft.title}

[HOOK]
${draft.hook}

[STRUCTURE]
${draft.outline.map((line) => `• ${line}`).join("\n")}

[CAPTION]
${draft.caption}`;

  const preview = $("#content-canvas-preview");
  preview.replaceChildren(
    makeElement("span", "preview-label", draft.sponsor ? "PAID PARTNERSHIP DRAFT" : "EDITORIAL PREVIEW"),
    makeElement("b", "", draft.title),
    makeElement("p", "", draft.hook),
    makeElement("small", "", `${draft.pick.brand} · @cosme #${draft.pick.source_rank}`),
  );
  preview.style.setProperty("--preview-accent", draft.pick.theme[0]);
  $("#export-content").disabled = false;
  $("#copy-draft").disabled = false;
}

async function copyStudioDraft() {
  if (!state.studioDraft) return;
  const text = $("#studio-output").textContent;
  await navigator.clipboard.writeText(text);
  const button = $("#copy-draft");
  const original = button.textContent;
  button.textContent = "복사 완료";
  setTimeout(() => { button.textContent = original; }, 1200);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = Math.max(0, image.width - sourceWidth);
  const sourceY = Math.max(0, (image.height - sourceHeight) / 2);
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawContain(ctx, image, x, y, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function wrappedLines(ctx, text, maxWidth, maxLines = 4) {
  const lines = [];
  let line = "";
  for (const char of text) {
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  const used = lines.join("").length;
  if (used < text.length && lines.length < maxLines) {
    let final = text.slice(used);
    while (final.length > 1 && ctx.measureText(`${final}…`).width > maxWidth) final = final.slice(0, -1);
    lines.push(used + final.length < text.length ? `${final}…` : final);
  }
  return lines;
}

async function exportContent() {
  const draft = state.studioDraft;
  if (!draft) return;
  const config = {
    carousel: { width: 1080, height: 1350, name: "instagram-4x5" },
    reel: { width: 1080, height: 1920, name: "reels-9x16" },
    youtube: { width: 1280, height: 720, name: "youtube-16x9" },
  }[draft.format];
  const button = $("#export-content");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "이미지 제작 중";
  try {
    const [muse, product] = await Promise.all([
      loadImage(state.museUrl),
      loadImage(proxyImage(draft.pick.image_url)),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = config.width;
    canvas.height = config.height;
    const ctx = canvas.getContext("2d");
    const vertical = config.height > config.width;
    const accent = draft.pick.theme[0] || "#d8ff45";
    const wash = draft.pick.theme[1] || "#f2f0e9";
    const gradient = ctx.createLinearGradient(0, 0, config.width, config.height);
    gradient.addColorStop(0, wash);
    gradient.addColorStop(1, accent);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, config.width, config.height);

    if (vertical) {
      drawCover(ctx, muse, 0, 0, config.width, Math.round(config.height * .58));
      const shade = ctx.createLinearGradient(0, 0, config.width, 0);
      shade.addColorStop(0, "rgba(242,240,233,.96)");
      shade.addColorStop(.62, "rgba(242,240,233,.42)");
      shade.addColorStop(1, "rgba(242,240,233,0)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, config.width, config.height * .58);
      ctx.fillStyle = "rgba(255,254,250,.97)";
      roundedRect(ctx, 48, config.height * .52, config.width - 96, config.height * .42, 34);
      ctx.fill();
      ctx.fillStyle = "#151714";
      ctx.font = "900 62px 'Malgun Gothic', 'Noto Sans JP', sans-serif";
      wrappedLines(ctx, draft.title, config.width - 450, 4).forEach((line, index) => {
        ctx.fillText(line, 82, config.height * .59 + index * 72);
      });
      ctx.fillStyle = "#f5f3ed";
      roundedRect(ctx, config.width - 375, config.height * .59, 280, 280, 24);
      ctx.fill();
      drawContain(ctx, product, config.width - 350, config.height * .61, 230, 230);
    } else {
      drawCover(ctx, muse, config.width * .52, 0, config.width * .48, config.height);
      const shade = ctx.createLinearGradient(config.width * .35, 0, config.width * .75, 0);
      shade.addColorStop(0, "rgba(242,240,233,1)");
      shade.addColorStop(1, "rgba(242,240,233,0)");
      ctx.fillStyle = shade;
      ctx.fillRect(config.width * .32, 0, config.width * .5, config.height);
      ctx.fillStyle = "#151714";
      ctx.font = "900 58px 'Malgun Gothic', 'Noto Sans JP', sans-serif";
      wrappedLines(ctx, draft.title, config.width * .47, 4).forEach((line, index) => {
        ctx.fillText(line, 64, 180 + index * 68);
      });
      ctx.fillStyle = "#fffefa";
      roundedRect(ctx, 64, 470, 190, 190, 22);
      ctx.fill();
      drawContain(ctx, product, 82, 488, 154, 154);
    }

    ctx.fillStyle = "#151714";
    ctx.fillRect(0, 0, config.width, 18);
    ctx.font = "900 20px Arial, sans-serif";
    ctx.fillText("CHECKNAVI · K-BEAUTY INTELLIGENCE", 62, 66);
    ctx.font = "800 18px Arial, sans-serif";
    ctx.fillText(`@COSME #${draft.pick.source_rank}  ·  ★ ${draft.pick.rating.toFixed(1)}`, 64, config.height - 52);
    if (draft.sponsor) {
      ctx.textAlign = "right";
      ctx.fillText(`PAID PARTNERSHIP · ${draft.sponsor}`, config.width - 64, config.height - 52);
      ctx.textAlign = "left";
    }

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
    if (!blob) throw new Error("PNG 생성에 실패했습니다.");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `checknavi-${config.name}-${draft.pick.group_key}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    button.textContent = "저장 완료";
  } catch (error) {
    button.textContent = "저장 실패";
    window.alert(error.message || "이미지를 만들지 못했습니다.");
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = original;
    }, 1200);
  }
}

function updateMuse(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (state.museUrl.startsWith("blob:")) URL.revokeObjectURL(state.museUrl);
  state.museUrl = URL.createObjectURL(file);
  $("#muse-status").textContent = `${file.name} 적용됨 · 이 브라우저에서만 사용`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error("CSV 데이터 행이 없습니다.");
  const headers = rows[0].map((value) => value.toLowerCase());
  const required = ["category", "rank", "brand", "name"];
  if (!required.every((header) => headers.includes(header))) {
    throw new Error("필수 열: category, rank, brand, name");
  }
  return rows.slice(1).map((values) => {
    const item = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    return {
      category: item.category,
      rank: Number(item.rank) || 999,
      brand: item.brand,
      name: item.name,
      price_krw: Number(String(item.price_krw || "").replaceAll(",", "")) || null,
      rating: Number(item.rating) || null,
      reviews: Number(String(item.reviews || "").replaceAll(",", "")) || null,
      seller: item.seller || "Olive Young",
    };
  }).filter((item) => item.brand && item.name);
}

async function importOliveYoung(file) {
  if (!file) return;
  try {
    state.oliveyoung = parseCsv(await file.text());
    saveLocal("checknavi-oliveyoung", state.oliveyoung);
    $("#oliveyoung-status").textContent = `${state.oliveyoung.length}개 연결됨`;
    renderRankGap();
  } catch (error) {
    $("#oliveyoung-status").textContent = error.message;
  }
}

function downloadSampleCsv() {
  const csv =
`category,rank,brand,name,price_krw,rating,reviews,seller
기초케어,1,브랜드명,제품명,25000,4.8,1200,Olive Young
포인트 색조,1,브랜드명,제품명,18000,4.7,850,Olive Young
시트마스크,1,브랜드명,제품명,3000,4.9,2400,Olive Young
선케어,1,브랜드명,제품명,22000,4.8,1900,Olive Young
베이스 메이크업,1,브랜드명,제품명,32000,4.6,760,Olive Young`;
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "oliveyoung-ranking-template.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function renderNews() {
  const container = $("#news-queue");
  $("#news-count").textContent = state.news.length;
  container.replaceChildren();
  if (!state.news.length) {
    container.className = "news-queue empty-state";
    container.textContent = "아직 추가한 뉴스가 없습니다.";
    return;
  }
  container.className = "news-queue";
  state.news.forEach((item) => {
    const row = makeElement("div", "news-row");
    const copy = makeElement("div");
    const link = makeElement("a", "", item.url);
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    copy.append(makeElement("span", "", item.type), makeElement("b", "", item.title), link);
    const remove = makeElement("button", "icon-button", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `${item.title} 삭제`);
    remove.addEventListener("click", () => {
      state.news = state.news.filter((entry) => entry.id !== item.id);
      saveLocal("checknavi-news", state.news);
      renderNews();
    });
    row.append(copy, remove);
    container.append(row);
  });
}

function addNews(event) {
  event.preventDefault();
  state.news.unshift({
    id: crypto.randomUUID(),
    type: $("#news-type").value,
    title: $("#news-title").value.trim(),
    url: $("#news-url").value.trim(),
  });
  saveLocal("checknavi-news", state.news);
  event.currentTarget.reset();
  renderNews();
}

function renderCampaigns() {
  const board = $("#campaign-board");
  $("#campaign-count").textContent = state.campaigns.length;
  $("#campaign-board-count").textContent = state.campaigns.length;
  board.replaceChildren();
  if (!state.campaigns.length) {
    board.className = "campaign-board empty-state";
    board.textContent = "등록된 캠페인이 없습니다.";
    return;
  }
  board.className = "campaign-board";
  state.campaigns.forEach((item) => {
    const row = makeElement("div", "campaign-row");
    const copy = makeElement("div");
    copy.append(makeElement("b", "", item.brand), makeElement("small", "", `${item.deliverable} · 마감 ${item.deadline}`));
    const status = makeElement("select", "status-select");
    ["제안", "협의", "제작", "검수", "게시 완료"].forEach((value) => {
      const option = makeElement("option", "", value);
      option.value = value;
      option.selected = value === item.status;
      status.append(option);
    });
    status.addEventListener("change", () => {
      item.status = status.value;
      saveLocal("checknavi-campaigns", state.campaigns);
    });
    const remove = makeElement("button", "icon-button", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `${item.brand} 캠페인 삭제`);
    remove.addEventListener("click", () => {
      state.campaigns = state.campaigns.filter((entry) => entry.id !== item.id);
      saveLocal("checknavi-campaigns", state.campaigns);
      renderCampaigns();
    });
    row.append(copy, status, remove);
    board.append(row);
  });
}

function addCampaign(event) {
  event.preventDefault();
  state.campaigns.unshift({
    id: crypto.randomUUID(),
    brand: $("#campaign-brand").value.trim(),
    deliverable: $("#campaign-deliverable").value,
    deadline: $("#campaign-deadline").value,
    status: "제안",
  });
  saveLocal("checknavi-campaigns", state.campaigns);
  event.currentTarget.reset();
  renderCampaigns();
}

function renderDashboard(data) {
  const { weekly, exchange } = data;
  state.picks = weekly.categories;
  state.museUrl = weekly.muse_url;
  state.updatedDate = weekly.updated_date;
  state.exchangeRate = exchange.rate_per_100_krw;
  renderOverview(data);
  renderFilters();
  renderRankGap();
  setProductOptions();
  $("#scope-note").textContent = weekly.scope_note;
  $("#source-link").href = weekly.source_url;
  $("#loading-state").hidden = true;
  $("#error-state").hidden = true;
  $("#oliveyoung-status").textContent = state.oliveyoung.length ? `${state.oliveyoung.length}개 연결됨` : "미연결";
}

async function loadDashboard(force = false) {
  if (state.loading) return;
  state.loading = true;
  const button = $("#refresh-button");
  button.disabled = true;
  button.classList.add("is-loading");
  $("#error-state").hidden = true;
  try {
    const response = await fetch(`/api/dashboard${force ? "?refresh=true" : ""}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.detail?.reason || data?.detail?.message || "서버 응답 오류");
    renderDashboard(data);
  } catch (error) {
    $("#loading-state").hidden = true;
    $("#error-state").hidden = false;
    $("#error-message").textContent = error.message || "잠시 후 다시 시도해 주세요.";
    $("#market-state").textContent = "연결 오류";
    $("#source-state").textContent = "소스 확인 필요";
  } finally {
    state.loading = false;
    button.disabled = false;
    button.classList.remove("is-loading");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateClock();
  setInterval(updateClock, 1000);
  renderNews();
  renderCampaigns();
  loadDashboard();

  $$(".nav-button").forEach((button) => button.addEventListener("click", () => showView(button.dataset.viewTarget)));
  $$("[data-jump]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.jump)));
  $("#mobile-menu").addEventListener("click", () => document.body.classList.toggle("menu-open"));
  $("#refresh-button").addEventListener("click", () => loadDashboard(true));
  $("#retry-button").addEventListener("click", () => loadDashboard(true));
  $("#news-form").addEventListener("submit", addNews);
  $("#campaign-form").addEventListener("submit", addCampaign);
  $("#lab-form").addEventListener("submit", generateLabDraft);
  $("#lab-product-select").addEventListener("change", renderLabProduct);
  $("#studio-form").addEventListener("submit", generateStudioDraft);
  $("#sponsor-toggle").addEventListener("change", (event) => {
    $("#sponsor-field").hidden = !event.target.checked;
  });
  $("#muse-upload").addEventListener("change", (event) => updateMuse(event.target.files?.[0]));
  $("#oliveyoung-upload").addEventListener("change", (event) => importOliveYoung(event.target.files?.[0]));
  $("#download-sample").addEventListener("click", downloadSampleCsv);
  $("#export-content").addEventListener("click", exportContent);
  $("#copy-draft").addEventListener("click", copyStudioDraft);
});
