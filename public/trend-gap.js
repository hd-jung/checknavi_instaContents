const $ = (selector, root = document) => root.querySelector(selector);

const state = { data: null, activeCategory: "all", loading: false };

const number = (value) => value === null || value === undefined
  ? "수집 대기"
  : new Intl.NumberFormat("ko-KR").format(value);
const won = (value) => value ? `₩${number(value)}` : "확인 중";
const yen = (value) => value ? `¥${number(value)}` : "확인 중";

function rating(product) {
  if (product.rating === null || product.rating === undefined) return "별점 수집 대기";
  return `★ ${Number(product.rating).toFixed(1)} · ${product.reviews == null ? "리뷰 수집 대기" : `리뷰 ${number(product.reviews)}`}`;
}

function sourceLabel(source) {
  const labels = {
    live: "실시간 수집",
    cached: "서버 캐시",
    fallback: "최근 정상 스냅샷",
    reference_snapshot: "공식 검증 스냅샷",
  };
  return `${labels[source.mode] || source.mode} · ${source.updated_date || "확인 중"}`;
}

function updateClock() {
  $("#header-clock").textContent = `${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date())} KST`;
}

function productPanel(product, market) {
  const isKorea = market === "korea";
  const article = document.createElement("article");
  article.className = "market-product";
  article.innerHTML = `
    <div class="market-heading">
      <span class="${isKorea ? "kr-label" : ""}">${isKorea ? "KOREA NEXT" : "JAPAN NOW"}</span>
      <b>${product.stage}</b>
    </div>
    <div class="product-visual">
      <span class="rank-chip">#${product.rank}</span>
      <img src="${product.image_url}" alt="${product.brand} ${product.name}" loading="lazy" referrerpolicy="no-referrer">
    </div>
    <div class="brand-lockup"><span class="logo-fallback">${product.brand}</span><b>${product.brand}</b></div>
    <h3 class="product-name">${product.name}</h3>
    <div class="product-facts">
      <div><span>판매처</span><b>${product.seller}</b></div>
      <div><span>가격</span><b>${isKorea ? won(product.sale_price_krw) : yen(product.price_jpy)}<br>${isKorea ? yen(product.converted_sale_jpy) : won(product.converted_krw)} 환산</b></div>
      <div><span>평점 · 리뷰</span><b>${rating(product)}</b></div>
      <div><span>${isKorea ? "할인 · 단계" : "카테고리"}</span><b>${isKorea ? `${product.discount_rate}% · ${product.release_stage}` : product.category}</b></div>
    </div>
    <a class="product-link" href="${product.product_url}" target="_blank" rel="noopener noreferrer">공식 상품 정보 ↗</a>
  `;
  return article;
}

function renderTabs() {
  const tabs = $("#category-tabs");
  tabs.replaceChildren();
  [{ key: "all", label: "전체" }, ...state.data.comparisons.map((item) => ({
    key: item.category_key, label: item.category_label,
  }))].forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "tab";
    button.textContent = option.label;
    button.setAttribute("aria-selected", String(state.activeCategory === option.key));
    button.addEventListener("click", () => {
      state.activeCategory = option.key;
      renderTabs();
      renderComparisons();
    });
    tabs.append(button);
  });
}

function renderComparisons() {
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
      <div class="score">${item.insight.opportunity_score}<small>편집 기회점수</small></div>
      <strong>${item.insight.headline}</strong>
      <p>${item.insight.reason}</p>
      <a href="/products/${item.category_key}">한국 후보 상세 보기 →</a>
    `;
    card.append(productPanel(item.japan, "japan"), insight, productPanel(item.korea, "korea"));
    container.append(card);
  });
}

function render(data) {
  state.data = data;
  $("#jp-source-state").textContent = sourceLabel(data.sources.japan);
  $("#kr-source-state").textContent = sourceLabel(data.sources.korea);
  $("#fx-rate").textContent = data.exchange.rate_per_100_krw ? `${Number(data.exchange.rate_per_100_krw).toFixed(3)} JPY` : "확인 중";
  $("#fx-date").textContent = `기준일 ${data.exchange.as_of_date || "확인 중"}`;
  $("#cosme-source-link").href = data.sources.japan.url;
  $("#oliveyoung-source-link").href = data.sources.korea.url;
  $("#collected-at").textContent = `수집 ${new Date(data.collected_at).toLocaleString("ko-KR")}`;
  $("#method-list").replaceChildren(...data.methodology.map((text) => {
    const li = document.createElement("li"); li.textContent = text; return li;
  }));
  renderTabs();
  renderComparisons();
  $("#loading-state").hidden = true;
  $("#error-state").hidden = true;
  $("#dashboard-content").hidden = false;
}

async function loadData(force = false) {
  if (state.loading) return;
  state.loading = true;
  $("#refresh-button").disabled = true;
  $("#error-state").hidden = true;
  try {
    const response = await fetch(`/api/trend-gap${force ? "?refresh=true" : ""}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error("서버 응답 오류");
    render(data);
  } catch (error) {
    $("#loading-state").hidden = true;
    $("#error-state").hidden = false;
    $("#error-message").textContent = error.message || "잠시 후 다시 시도해 주세요.";
  } finally {
    state.loading = false;
    $("#refresh-button").disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateClock();
  setInterval(updateClock, 1000);
  $("#refresh-button").addEventListener("click", () => loadData(true));
  $("#retry-button").addEventListener("click", () => loadData());
  loadData();
});
