const state = {
  loading: false,
  refreshTimer: null,
  picks: [],
  museUrl: "/static/images/weekly-muse.png",
  updatedDate: "",
};

const $ = (selector) => document.querySelector(selector);
const formatNumber = (value) => new Intl.NumberFormat("ko-KR").format(value ?? 0);
const proxyImage = (url) => `/api/media?url=${encodeURIComponent(url)}`;

const formatSourceDate = (value) => {
  if (!value || value === "확인 불가") return "—";
  return value.replaceAll("/", ".");
};

const formatCollectedAt = (value) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
};

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
    year: "numeric",
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

function weeklyCard(pick, index) {
  const card = makeElement("article", "weekly-card");
  card.style.setProperty("--accent", pick.theme[0]);
  card.style.setProperty("--wash", pick.theme[1]);
  card.style.setProperty("--delay", `${index * 80}ms`);

  const visual = makeElement("div", "weekly-visual");
  const muse = makeElement("img", "weekly-muse");
  muse.src = state.museUrl;
  muse.alt = "가상 K-뷰티 캠페인 뮤즈";
  const shade = makeElement("span", "weekly-shade");
  const categoryIndex = makeElement("span", "weekly-index", `0${index + 1}`);
  const eyebrow = makeElement("span", "weekly-eyebrow", pick.eyebrow);
  const category = makeElement("h3", "weekly-category", pick.group_label);
  const description = makeElement("p", "weekly-description", pick.description);
  visual.append(muse, shade, categoryIndex, eyebrow, category, description);

  const productPanel = makeElement("div", "weekly-product-panel");
  const productImageWrap = makeElement("a", "weekly-product-image");
  productImageWrap.href = pick.product_url;
  productImageWrap.target = "_blank";
  productImageWrap.rel = "noopener noreferrer";
  const productImage = makeElement("img");
  productImage.src = proxyImage(pick.image_url);
  productImage.alt = `${pick.brand} ${pick.name}`;
  productImage.loading = index > 1 ? "lazy" : "eager";
  productImage.addEventListener("error", () => productImageWrap.classList.add("image-error"), { once: true });
  productImageWrap.appendChild(productImage);

  const copy = makeElement("div", "weekly-product-copy");
  copy.append(
    makeElement("span", "source-rank", `@cosme #${pick.source_rank}`),
    makeElement("p", "weekly-brand", pick.brand),
  );
  const name = makeElement("a", "weekly-name", pick.name);
  name.href = pick.product_url;
  name.target = "_blank";
  name.rel = "noopener noreferrer";
  copy.append(name);
  const stats = makeElement("div", "weekly-stats");
  stats.append(
    makeElement("span", "", `★ ${pick.rating.toFixed(1)}`),
    makeElement("span", "", `${formatNumber(pick.reviews)} reviews`),
  );
  copy.append(stats);

  const saveButton = makeElement("button", "thumbnail-button");
  saveButton.type = "button";
  saveButton.setAttribute("aria-label", `${pick.group_label} 인스타그램 썸네일 저장`);
  saveButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 17v3h16v-3"/></svg>
    <span>1080×1350 저장</span>
  `;
  saveButton.addEventListener("click", () => exportThumbnail(pick, saveButton));
  productPanel.append(productImageWrap, copy, saveButton);
  card.append(visual, productPanel);
  return card;
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

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const lines = [];
  let line = "";
  for (const character of text) {
    const next = line + character;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = character;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) {
    const used = lines.join("").length;
    const remaining = text.slice(used);
    let finalLine = remaining;
    while (ctx.measureText(finalLine + "…").width > maxWidth && finalLine.length > 1) {
      finalLine = finalLine.slice(0, -1);
    }
    lines.push(used + finalLine.length < text.length ? `${finalLine}…` : finalLine);
  }
  lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
}

async function exportThumbnail(pick, button) {
  const originalText = button.querySelector("span").textContent;
  button.disabled = true;
  button.classList.add("is-exporting");
  button.querySelector("span").textContent = "PNG 제작 중";
  try {
    const [muse, product] = await Promise.all([
      loadImage(state.museUrl),
      loadImage(proxyImage(pick.image_url)),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");

    const background = ctx.createLinearGradient(0, 0, 1080, 1350);
    background.addColorStop(0, pick.theme[1]);
    background.addColorStop(1, pick.theme[0]);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCover(ctx, muse, 0, 0, 1080, 820);

    const faceShade = ctx.createLinearGradient(0, 0, 760, 0);
    faceShade.addColorStop(0, "rgba(247,244,236,.98)");
    faceShade.addColorStop(.55, "rgba(247,244,236,.65)");
    faceShade.addColorStop(1, "rgba(247,244,236,0)");
    ctx.fillStyle = faceShade;
    ctx.fillRect(0, 0, 860, 820);

    ctx.fillStyle = pick.theme[0];
    ctx.fillRect(0, 0, 1080, 22);
    ctx.fillStyle = "#171511";
    ctx.font = "800 24px Arial, sans-serif";
    ctx.letterSpacing = "4px";
    ctx.fillText("WEEKLY K-BEAUTY PICK", 70, 92);
    ctx.font = "900 94px 'Malgun Gothic', 'Noto Sans KR', sans-serif";
    drawWrappedText(ctx, pick.group_label, 66, 224, 570, 108, 2);
    ctx.font = "500 28px 'Malgun Gothic', sans-serif";
    ctx.fillStyle = "rgba(23,21,17,.7)";
    drawWrappedText(ctx, pick.description, 70, 380, 500, 42, 2);

    ctx.fillStyle = "#171511";
    roundedRect(ctx, 70, 480, 210, 58, 29);
    ctx.fill();
    ctx.fillStyle = "#fffdf8";
    ctx.font = "800 24px Arial, sans-serif";
    ctx.fillText(`@cosme #${pick.source_rank}`, 98, 518);

    ctx.fillStyle = "rgba(255,253,248,.96)";
    roundedRect(ctx, 44, 760, 992, 530, 36);
    ctx.fill();
    ctx.strokeStyle = "rgba(23,21,17,.18)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#f3f0e8";
    roundedRect(ctx, 76, 806, 382, 382, 24);
    ctx.fill();
    drawContain(ctx, product, 102, 832, 330, 330);

    ctx.fillStyle = "#756f64";
    ctx.font = "700 25px Arial, 'Malgun Gothic', sans-serif";
    ctx.fillText(pick.brand, 505, 842);
    ctx.fillStyle = "#171511";
    ctx.font = "900 48px 'Malgun Gothic', 'Noto Sans JP', sans-serif";
    drawWrappedText(ctx, pick.name, 505, 920, 470, 62, 3);

    ctx.fillStyle = pick.theme[0];
    roundedRect(ctx, 505, 1105, 140, 58, 29);
    ctx.fill();
    ctx.fillStyle = "#171511";
    ctx.font = "900 27px Arial, sans-serif";
    ctx.fillText(`★ ${pick.rating.toFixed(1)}`, 530, 1143);
    ctx.fillStyle = "#756f64";
    ctx.font = "700 23px Arial, sans-serif";
    ctx.fillText(`${formatNumber(pick.reviews)} REVIEWS`, 674, 1142);

    ctx.fillStyle = "#171511";
    ctx.font = "800 21px Arial, sans-serif";
    ctx.fillText("K-BEAUTY PULSE", 76, 1254);
    ctx.textAlign = "right";
    ctx.font = "600 19px Arial, sans-serif";
    ctx.fillStyle = "#756f64";
    ctx.fillText(`DATA @COSME · ${formatSourceDate(state.updatedDate)}`, 992, 1254);
    ctx.textAlign = "left";

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
    if (!blob) throw new Error("PNG 생성에 실패했습니다.");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `weekly-kbeauty-${pick.group_key}-${(state.updatedDate || "latest").replaceAll("/", "-")}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    button.querySelector("span").textContent = "저장 완료";
  } catch (error) {
    button.querySelector("span").textContent = "저장 실패";
    window.alert(error.message || "썸네일을 만들지 못했습니다.");
  } finally {
    button.classList.remove("is-exporting");
    setTimeout(() => {
      button.disabled = false;
      button.querySelector("span").textContent = originalText;
    }, 1400);
  }
}

function renderDashboard(data) {
  const { market, weekly, exchange } = data;
  state.picks = weekly.categories;
  state.museUrl = weekly.muse_url;
  state.updatedDate = weekly.updated_date;

  $("#market-state").textContent = market.state;
  $("#market-detail").textContent = `TOP ${market.analyzed_count} 분석 · ${market.visible_count}개 카테고리 · ${market.source_mode === "live" ? "실시간 수집" : "캐시 사용"}`;
  $("#average-rating").textContent = market.average_rating.toFixed(2);
  $("#total-reviews").textContent = formatNumber(market.total_reviews);
  $("#leading-category").textContent = "5 CATEGORY";
  $("#leading-count").textContent = market.visible_count;
  $("#exchange-rate").textContent = exchange.rate_per_100_krw == null ? "조회 실패" : `¥ ${exchange.rate_per_100_krw.toFixed(3)}`;
  $("#exchange-date").textContent = exchange.as_of_date ? `기준일 ${exchange.as_of_date}` : "기준일 —";
  $("#ranking-updated").textContent = `원본 갱신 ${formatSourceDate(weekly.updated_date)}`;
  $("#ranking-period").textContent = `집계기간 ${formatSourceDate(weekly.aggregation_period)}`;
  $("#scope-note").textContent = weekly.scope_note;
  $("#source-link").href = weekly.source_url;
  $("#collected-at").textContent = `수집 시각 ${formatCollectedAt(weekly.collected_at)}`;

  const grid = $("#weekly-grid");
  grid.replaceChildren(...weekly.categories.map(weeklyCard));
  $("#loading-state").hidden = true;
  $("#error-state").hidden = true;
  grid.hidden = false;
}

function updateMuse(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (state.museUrl.startsWith("blob:")) URL.revokeObjectURL(state.museUrl);
  state.museUrl = URL.createObjectURL(file);
  document.querySelectorAll(".weekly-muse").forEach((image) => { image.src = state.museUrl; });
  $("#muse-status").textContent = `${file.name} 적용됨 · 브라우저 안에서만 사용`;
}

async function loadDashboard(force = false) {
  if (state.loading) return;
  state.loading = true;
  const refreshButton = $("#refresh-button");
  refreshButton.disabled = true;
  refreshButton.classList.add("is-loading");
  if (!$("#weekly-grid").children.length) $("#loading-state").hidden = false;
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
    $("#weekly-grid").hidden = true;
    $("#error-state").hidden = false;
    $("#error-message").textContent = error.message || "잠시 후 다시 시도해 주세요.";
    $("#market-state").textContent = "연결 오류";
    $("#market-detail").textContent = "외부 데이터 소스 연결을 확인해 주세요.";
  } finally {
    state.loading = false;
    refreshButton.disabled = false;
    refreshButton.classList.remove("is-loading");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateClock();
  setInterval(updateClock, 1000);
  loadDashboard();
  $("#refresh-button").addEventListener("click", () => loadDashboard(true));
  $("#retry-button").addEventListener("click", () => loadDashboard(true));
  $("#muse-upload").addEventListener("change", (event) => updateMuse(event.target.files?.[0]));
  state.refreshTimer = setInterval(() => loadDashboard(false), 60_000);
});
