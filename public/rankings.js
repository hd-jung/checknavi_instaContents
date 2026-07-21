const $ = (selector) => document.querySelector(selector);
let data = null;
let activeKey = new URLSearchParams(location.search).get("category") || "skincare";

function facts(product, isKorea) {
  const price = isKorea
    ? `${Checknavi.won(product.sale_price_krw)} · ${Checknavi.yen(product.converted_sale_jpy)} 환산`
    : `${Checknavi.yen(product.price_jpy)} · ${Checknavi.won(product.converted_krw)} 환산`;
  return `
    <div><span>판매처</span><b>${product.seller}</b></div>
    <div><span>가격</span><b>${price}</b></div>
    <div><span>평점 · 리뷰</span><b>${Checknavi.rating(product)}</b></div>
    <div><span>${isKorea ? "할인 · 단계" : "카테고리"}</span><b>${isKorea ? `${product.discount_rate}% · ${product.release_stage}` : product.category}</b></div>
  `;
}

function productMarkup(product, isKorea) {
  return `
    <div class="country-label"><span>${isKorea ? "KOREA NEXT" : "JAPAN NOW"}</span><b>#${product.rank}</b></div>
    <div class="product-image"><img src="${product.image_url}" alt="${product.brand} ${product.name}" referrerpolicy="no-referrer"></div>
    <span class="brand">${product.brand}</span>
    <h2>${product.name}</h2>
    <div class="product-facts">${facts(product, isKorea)}</div>
    <a href="${product.product_url}" target="_blank" rel="noopener noreferrer">공식 상품 정보 ↗</a>
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
  $("#japan-product").innerHTML = productMarkup(item.japan, false);
  $("#korea-product").innerHTML = productMarkup(item.korea, true);
  $("#gap-summary").innerHTML = `
    <span>${item.insight.opportunity_score}</span><small>편집 우선순위</small>
    <h3>${item.insight.headline}</h3><p>${item.insight.reason}</p>
    <a href="/products/${item.category_key}">한국 후보 상세 →</a>
  `;
}

function renderRankings(payload) {
  data = payload;
  $("#ranking-source-state").textContent = `@cosme ${Checknavi.mode(data.sources.japan.mode)}`;
  $("#japan-date").textContent = `원본 갱신 ${data.sources.japan.updated_date}`;
  $("#korea-date").textContent = `검증일 ${data.sources.korea.updated_date}`;
  renderTabs();
  renderComparison();
  $("#ranking-content").hidden = false;
  $("#ranking-error").hidden = true;
}

async function loadRankings(force = false) {
  const button = $("#refresh-ranking");
  button.disabled = true;
  button.textContent = force ? "@cosme 조회 중…" : "데이터 확인 중…";
  try {
    renderRankings(await Checknavi.fetchData(force));
  } catch (error) {
    $("#ranking-error").hidden = false;
    $("#ranking-error").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "@cosme 최신 조회";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#refresh-ranking").addEventListener("click", () => loadRankings(true));
  loadRankings();
});
