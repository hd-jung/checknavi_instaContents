const $ = (selector) => document.querySelector(selector);
const productId = document.body.dataset.productId;

function fact(label, value, note = "") {
  return `<div><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ""}</div>`;
}

function renderProduct(item) {
  const product = item.product;
  const price = item.price_analysis;
  const performance = item.performance;
  const counterpart = item.japan_counterpart;
  $("#breadcrumb-product").textContent = product.name;
  $("#product-image").src = product.image_url;
  $("#product-image").alt = `${product.brand} ${product.name}`;
  $("#product-position").textContent = `0${item.position}`;
  $("#product-category").textContent = `${item.category_label} · 화해 #${product.rank}`;
  $("#product-brand").textContent = product.brand;
  $("#product-name").textContent = product.name;
  $("#product-score").textContent = item.opportunity_score;
  $("#price-table").innerHTML = [
    fact("한국 정가", Checknavi.won(price.kr_list_price), "화해 할인율로 역산한 참고값"),
    fact("한국 실판매가", Checknavi.won(price.kr_sale_price), `${price.korea_discount_rate ?? "—"}% 할인`),
    fact("한국 정가 → 엔화", Checknavi.yen(price.converted_list_jpy), "조회 환율 적용"),
    fact("한국 판매가 → 엔화", Checknavi.yen(price.converted_sale_jpy), "조회 환율 적용"),
    fact("일본 @cosme 표시가", Checknavi.yen(price.japan_reference_jpy), counterpart.name),
    fact("일본 표시가 → 원화", Checknavi.won(price.japan_reference_krw), "조회 환율 적용"),
  ].join("");
  $("#buy-signal").textContent = `${price.buy_signal_label} · 기준 ${price.default_threshold}%`;

  const ingredientTags = performance.ingredients.length
    ? performance.ingredients.map((tag) => `<span>${tag}</span>`)
    : ["<span>전성분 미수집</span>"];
  const claimTags = performance.evidence.map((entry) => `<span>${entry.label} · 리뷰 ${Checknavi.number(entry.review_count)}건</span>`);
  $("#performance-tags").innerHTML = [...ingredientTags, ...claimTags].join("");
  $("#ingredients-status").textContent = performance.ingredients_status;
  $("#appeal-copy").textContent = performance.appeal;

  $("#proof-list").innerHTML = `
    <div><dt>브랜드 로고</dt><dd><img class="proof-wordmark" src="${product.brand_logo_url}" alt="${product.brand} 워드마크"><small>텍스트 워드마크</small></dd></div>
    <div><dt>판매처</dt><dd>${product.seller}</dd></div>
    <div><dt>별점·리뷰</dt><dd>${Checknavi.rating(product)}</dd></div>
    <div><dt>모델</dt><dd>${performance.model || performance.model_status}</dd></div>
    <div><dt>랭킹 신호</dt><dd>${item.news_signals.join("<br>")}</dd></div>
  `;
  $("#counterpart").innerHTML = `
    <img src="${counterpart.image_url}" alt="${counterpart.brand} ${counterpart.name}" referrerpolicy="no-referrer">
    <span>@cosme 카테고리 #${counterpart.rank}</span><b>${counterpart.brand}</b><h3>${counterpart.name}</h3>
    <p>${Checknavi.rating(counterpart)} · ${Checknavi.yen(counterpart.price_jpy)}</p>
    <a href="${counterpart.product_url}" target="_blank" rel="noopener noreferrer">@cosme 원본 보기 →</a>
  `;
  $("#product-content").hidden = false;
  $("#product-error").hidden = true;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const data = await Checknavi.fetchData();
    const item = data.top5.find((candidate) => candidate.category_key === productId);
    if (!item) throw new Error("해당 제품을 찾지 못했습니다.");
    renderProduct(item);
  } catch (error) {
    $("#product-error").hidden = false;
    $("#product-error").textContent = error.message;
  }
});
