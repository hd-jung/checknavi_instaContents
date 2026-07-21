const $ = (selector) => document.querySelector(selector);
let data = null;
let activeKey = new URLSearchParams(location.search).get("category") || "skincare";

function requiredFields(product) {
  const labels = {
    name: "상품명",
    photo: "사진",
    brand_logo: "브랜드 로고",
    seller: "판매처",
    fx_price: "환율 가격",
    reviews_rating: "리뷰·별점",
  };
  return Object.entries(product.required_fields || {}).map(([key, state]) => `
    <li class="${state.available ? "complete" : "missing"}" title="${state.note || "원본 수집 완료"}">
      <span>${state.available ? "✓" : "!"}</span>${labels[key] || key}
    </li>
  `).join("");
}

function facts(product, isKorea) {
  const price = isKorea
    ? `${Checknavi.won(product.sale_price_krw)} / ${Checknavi.yen(product.converted_sale_jpy)}`
    : `${Checknavi.yen(product.price_jpy)} / ${Checknavi.won(product.converted_krw)}`;
  const priceSub = isKorea
    ? `정가 ${Checknavi.won(product.list_price_krw)} · ${product.discount_rate}% 할인`
    : `@cosme 표시가 · 원화는 조회 환율 환산`;
  return `
    <div><span>판매처</span><b>${product.seller}</b></div>
    <div><span>가격 · 환율 환산</span><b>${price}</b><small>${priceSub}</small></div>
    <div><span>별점 · 리뷰</span><b>${Checknavi.rating(product)}</b></div>
    <div><span>세부 카테고리</span><b>${product.category_detail || product.category}</b></div>
  `;
}

function productMarkup(product, isKorea) {
  const targetUrl = isKorea ? (product.purchase_url || product.product_url) : product.product_url;
  return `
    <div class="country-label">
      <span>${isKorea ? "KOREA · HWAHAE" : "JAPAN · @COSME"}</span>
      <b>카테고리 #${product.rank}</b>
    </div>
    <div class="source-row"><span>${Checknavi.mode(product.data_mode)}</span><small>${product.source_updated_at}</small></div>
    <div class="product-image"><img src="${product.image_url}" alt="${product.brand} ${product.name}" referrerpolicy="no-referrer"></div>
    <div class="brand-lockup">
      <img src="${product.brand_logo_url}" alt="${product.brand} 브랜드 워드마크">
      <small>원본에 공식 로고 파일 없음 · 텍스트 워드마크</small>
    </div>
    <h2>${product.name}</h2>
    <ul class="field-completeness">${requiredFields(product)}</ul>
    <div class="product-facts">${facts(product, isKorea)}</div>
    <a href="${targetUrl}" target="_blank" rel="noopener noreferrer">원본 상품 정보 →</a>
  `;
}

function renderTabs() {
  const tabs = $("#category-tabs");
  tabs.replaceChildren();
  data.comparisons.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "tab";
    button.textContent = item.category_label;
    button.setAttribute("aria-selected", String(item.category_key === activeKey));
    button.addEventListener("click", () => {
      activeKey = item.category_key;
      history.replaceState(null, "", `/rankings?category=${activeKey}`);
      renderTabs();
      renderComparison();
    });
    tabs.append(button);
  });
}

function renderComparison() {
  const item = data.comparisons.find((row) => row.category_key === activeKey) || data.comparisons[0];
  activeKey = item.category_key;
  $("#category-path").textContent = `한국 분류: ${item.category_detail} · 일본 원본 분류: ${item.japan.category}`;
  $("#japan-product").innerHTML = productMarkup(item.japan, false);
  $("#korea-product").innerHTML = productMarkup(item.korea, true);
  $("#gap-summary").innerHTML = `
    <span>${item.insight.opportunity_score}</span><small>편집 우선순위 / 100</small>
    <h3>${item.insight.headline}</h3><p>${item.insight.reason}</p>
    <a href="/products/${item.category_key}">가격·성능 상세 비교 →</a>
  `;
}

function renderRankings(payload) {
  data = payload;
  $("#ranking-source-state").textContent = `@cosme ${Checknavi.mode(data.sources.japan.mode)} · 화해 ${Checknavi.mode(data.sources.korea.mode)}`;
  $("#japan-date").textContent = `원본 갱신 ${data.sources.japan.updated_date} · 수집 ${Checknavi.dateTime(data.sources.japan.collected_at)}`;
  $("#korea-date").textContent = `원본 갱신 ${data.sources.korea.updated_date} · 수집 ${Checknavi.dateTime(data.sources.korea.collected_at)}`;
  $("#source-explanation").textContent = data.sources.korea.note;
  $("#methodology-list").innerHTML = data.methodology.map((line) => `<li>${line}</li>`).join("");
  renderTabs();
  renderComparison();
  $("#ranking-content").hidden = false;
  $("#ranking-error").hidden = true;
}

async function loadRankings(force = false) {
  const button = $("#refresh-ranking");
  button.disabled = true;
  button.textContent = force ? "양국 데이터 수집 중…" : "데이터 확인 중…";
  try {
    renderRankings(await Checknavi.fetchData(force));
  } catch (error) {
    $("#ranking-error").hidden = false;
    $("#ranking-error").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "양국 최신 데이터 조회";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#refresh-ranking").addEventListener("click", () => loadRankings(true));
  loadRankings();
});
