const $ = (selector, root = document) => root.querySelector(selector);

const state = {
  data: null,
  activeCategory: "all",
  threshold: 20,
  loading: false,
};

function formatNumber(value) {
  if (value === null || value === undefined) return "수집 대기";
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatWon(value) {
  return value ? `₩${formatNumber(value)}` : "확인 중";
}

function formatYen(value) {
  return value ? `¥${formatNumber(value)}` : "확인 중";
}

function ratingText(product) {
  if (product.rating === null || product.rating === undefined) return "별점 수집 대기";
  const reviews = product.reviews === null || product.reviews === undefined
    ? "리뷰 수집 대기"
    : `리뷰 ${formatNumber(product.reviews)}`;
  return `★ ${Number(product.rating).toFixed(1)} · ${reviews}`;
}

function sourceLabel(source) {
  const labels = {
    live: "실시간 수집",
    cached: "서버 캐시",
    fallback: "최근 정상 스냅샷",
    reference_snapshot: "공식 검증 스냅샷",
    verified_reference: "공식 페이지 검증",
  };
  return `${labels[source.mode] || source.mode} · ${source.updated_date || "갱신일 확인 중"}`;
}

function updateClock() {
  const now = new Date();
  $("#header-clock").textContent = `${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now)} KST`;
}

function productImage(product) {
  const box = document.createElement("div");
  box.className = "product-visual";
  const rank = document.createElement("span");
  rank.className = "rank-chip";
  rank.textContent = `#${product.rank}`;
  box.append(rank);
  if (product.image_url) {
    const image = document.createElement("img");
    image.src = product.image_url;
    image.alt = `${product.brand} ${product.name}`;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    box.append(image);
  } else {
    const fallback = document.createElement("strong");
    fallback.textContent = product.brand;
    box.append(fallback);
  }
  return box;
}

function productPanel(product, market) {
  const article = document.createElement("article");
  article.className = "market-product";
  const isKorea = market === "korea";
  const priceMain = isKorea ? formatWon(product.sale_price_krw) : formatYen(product.price_jpy);
  const priceSub = isKorea
    ? `${formatYen(product.converted_sale_jpy)} 환산`
    : `${formatWon(product.converted_krw)} 환산`;
  article.innerHTML = `
    <div class="market-heading">
      <span class="${isKorea ? "kr-label" : ""}">${isKorea ? "KOREA NEXT" : "JAPAN NOW"}</span>
      <b>${product.stage}</b>
    </div>
  `;
  article.append(productImage(product));
  const copy = document.createElement("div");
  copy.innerHTML = `
    <div class="brand-lockup"><span class="logo-fallback">${product.brand}</span><b>${product.brand}</b></div>
    <h3 class="product-name">${product.name}</h3>
    <div class="product-facts">
      <div><span>판매처</span><b>${product.seller}</b></div>
      <div><span>가격</span><b>${priceMain}<br>${priceSub}</b></div>
      <div><span>평점 · 리뷰</span><b>${ratingText(product)}</b></div>
      <div><span>${isKorea ? "할인 / 단계" : "상세 카테고리"}</span><b>${isKorea ? `${product.discount_rate}% · ${product.release_stage}` : product.category}</b></div>
    </div>
    <a class="product-link" href="${product.product_url}" target="_blank" rel="noopener noreferrer">공식 상품 정보 ↗</a>
  `;
  article.append(copy);
  return article;
}

function renderCategories() {
  const tabs = $("#category-tabs");
  tabs.replaceChildren();
  const options = [
    { key: "all", label: "전체 비교" },
    ...state.data.comparisons.map((item) => ({
      key: item.category_key,
      label: item.category_label,
    })),
  ];
  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "tab";
    button.textContent = option.label;
    button.setAttribute("aria-selected", String(state.activeCategory === option.key));
    button.addEventListener("click", () => {
      state.activeCategory = option.key;
      renderCategories();
      renderComparison();
    });
    tabs.append(button);
  });
}

function renderComparison() {
  const container = $("#comparison-grid");
  container.replaceChildren();
  const rows = state.activeCategory === "all"
    ? state.data.comparisons
    : state.data.comparisons.filter((item) => item.category_key === state.activeCategory);
  rows.forEach((item) => {
    const card = document.createElement("article");
    card.className = "comparison-card";
    const insight = document.createElement("div");
    insight.className = "gap-insight";
    insight.innerHTML = `
      <div class="score">${item.insight.opportunity_score}<small>${item.insight.label}</small></div>
      <strong>${item.insight.headline}</strong>
      <p>${item.insight.reason}</p>
    `;
    card.append(productPanel(item.japan, "japan"), insight, productPanel(item.korea, "korea"));
    container.append(card);
  });
}

function renderTopFive() {
  const container = $("#top-five-list");
  container.replaceChildren();
  state.data.top5.forEach((item) => {
    const { product, price_analysis: price, performance } = item;
    const buy = price.discount_rate >= state.threshold;
    const row = document.createElement("article");
    row.className = "top-product";
    row.innerHTML = `
      <div class="top-position">0${item.position}</div>
      <div class="top-summary">
        <img src="${product.image_url}" alt="${product.brand} ${product.name}" loading="lazy" referrerpolicy="no-referrer">
        <span>${item.category_label} · SCORE ${item.opportunity_score}</span>
        <strong>${product.brand}<br>${product.name}</strong>
      </div>
      <div class="top-detail">
        <section class="detail-panel">
          <span>A · PRICE COMPARISON</span>
          <div class="price-grid">
            <div><small>한국 정가</small><b>${formatWon(price.kr_list_price)}</b></div>
            <div><small>한국 판매가</small><b>${formatWon(price.kr_sale_price)}</b></div>
            <div><small>정가 환산</small><b>${formatYen(price.converted_list_jpy)}</b></div>
            <div><small>판매가 환산</small><b>${formatYen(price.converted_sale_jpy)}</b></div>
            <div><small>일본 현재 TOP 제품</small><b>${formatYen(price.japan_counterpart_jpy)}</b></div>
            <div><small>할인율</small><b>${price.discount_rate}%</b></div>
          </div>
          <div class="buy-signal ${buy ? "active" : ""}">
            ${buy ? `BUY SIGNAL · ${state.threshold}% 이상 할인` : `WATCH · 기준까지 ${Math.max(0, state.threshold - price.discount_rate)}%p`}
          </div>
        </section>
        <section class="detail-panel">
          <span>B · PERFORMANCE BRIEF</span>
          <div class="tag-list">${[...performance.ingredients, ...performance.claims].map((tag) => `<span>${tag}</span>`).join("")}</div>
          <p class="appeal-copy">${performance.appeal}</p>
          <ul class="signal-list">
            <li>모델: ${performance.model}</li>
            <li>판매처: ${product.seller}</li>
            <li>평점·리뷰: ${ratingText(product)}</li>
            ${item.news_signals.map((signal) => `<li>${signal}</li>`).join("")}
          </ul>
        </section>
      </div>
    `;
    container.append(row);
  });
}

function renderDashboard(data) {
  state.data = data;
  $("#jp-source-state").textContent = sourceLabel(data.sources.japan);
  $("#kr-source-state").textContent = sourceLabel(data.sources.korea);
  $("#fx-rate").textContent = data.exchange.rate_per_100_krw
    ? `${Number(data.exchange.rate_per_100_krw).toFixed(3)} JPY`
    : "확인 중";
  $("#fx-date").textContent = `기준일 ${data.exchange.as_of_date || "확인 중"}`;
  $("#opportunity-average").textContent = `${data.summary.average_opportunity_score} / 100`;
  $("#cosme-source-link").href = data.sources.japan.url;
  $("#oliveyoung-source-link").href = data.sources.korea.url;
  $("#collected-at").textContent = `수집 시각 ${new Date(data.collected_at).toLocaleString("ko-KR")}`;
  $("#method-list").replaceChildren(...data.methodology.map((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    return li;
  }));
  renderCategories();
  renderComparison();
  renderTopFive();
  $("#loading-state").hidden = true;
  $("#error-state").hidden = true;
  $("#dashboard-content").hidden = false;
}

async function loadData(force = false) {
  if (state.loading) return;
  state.loading = true;
  const button = $("#refresh-button");
  button.disabled = true;
  if (!state.data) $("#loading-state").hidden = false;
  $("#error-state").hidden = true;
  try {
    const response = await fetch(`/api/trend-gap${force ? "?refresh=true" : ""}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.detail?.message || "서버 응답 오류");
    renderDashboard(data);
  } catch (error) {
    $("#loading-state").hidden = true;
    $("#error-state").hidden = false;
    $("#error-message").textContent = error.message || "잠시 후 다시 시도해 주세요.";
  } finally {
    state.loading = false;
    button.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateClock();
  setInterval(updateClock, 1000);
  $("#refresh-button").addEventListener("click", () => loadData(true));
  $("#retry-button").addEventListener("click", () => loadData(true));
  $("#discount-threshold").addEventListener("input", (event) => {
    state.threshold = Number(event.target.value);
    $("#threshold-output").textContent = `${state.threshold}%`;
    if (state.data) renderTopFive();
  });
  loadData();
});
