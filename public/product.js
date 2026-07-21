const $ = (selector) => document.querySelector(selector);
const productId = document.body.dataset.productId;

function fact(label, value) { return `<div><span>${label}</span><b>${value}</b></div>`; }

function renderProduct(item) {
  const product = item.product;
  const price = item.price_analysis;
  const counterpart = item.japan_counterpart;
  $("#breadcrumb-product").textContent = product.name;
  $("#product-image").src = product.image_url;
  $("#product-image").alt = `${product.brand} ${product.name}`;
  $("#product-position").textContent = `0${item.position}`;
  $("#product-category").textContent = item.category_label;
  $("#product-brand").textContent = product.brand;
  $("#product-name").textContent = product.name;
  $("#product-score").textContent = item.opportunity_score;
  $("#price-table").innerHTML = [
    fact("한국 정가", Checknavi.won(price.kr_list_price)), fact("한국 판매가", Checknavi.won(price.kr_sale_price)),
    fact("정가 엔화 환산", Checknavi.yen(price.converted_list_jpy)), fact("판매가 엔화 환산", Checknavi.yen(price.converted_sale_jpy)),
    fact("일본 비교 제품", Checknavi.yen(price.japan_counterpart_jpy)), fact("한국 할인율", `${price.discount_rate}%`),
  ].join("");
  $("#buy-signal").textContent = price.buy_signal ? "BUY SIGNAL · 20% 이상 할인" : "WATCH · 할인 조건 확인";
  $("#performance-tags").innerHTML = [...item.performance.ingredients, ...item.performance.claims].map((tag) => `<span>${tag}</span>`).join("");
  $("#appeal-copy").textContent = item.performance.appeal;
  $("#proof-list").innerHTML = `
    <div><dt>판매처</dt><dd>${product.seller}</dd></div>
    <div><dt>평점·리뷰</dt><dd>${Checknavi.rating(product)}</dd></div>
    <div><dt>모델</dt><dd>${item.performance.model}</dd></div>
    <div><dt>뉴스 신호</dt><dd>${item.news_signals.join("<br>")}</dd></div>
  `;
  $("#counterpart").innerHTML = `
    <img src="${counterpart.image_url}" alt="${counterpart.brand} ${counterpart.name}" referrerpolicy="no-referrer">
    <span>@cosme #${counterpart.rank}</span><b>${counterpart.brand}</b><h3>${counterpart.name}</h3>
    <p>${Checknavi.rating(counterpart)} · ${Checknavi.yen(counterpart.price_jpy)}</p>
    <a href="${counterpart.product_url}" target="_blank" rel="noopener noreferrer">@cosme 상품 보기 ↗</a>
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
