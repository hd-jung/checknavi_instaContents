const $ = (selector) => document.querySelector(selector);
const productId = document.body.dataset.productId;
const number = (value) => value == null ? "수집 대기" : new Intl.NumberFormat("ko-KR").format(value);
const won = (value) => value ? `₩${number(value)}` : "확인 중";
const yen = (value) => value ? `¥${number(value)}` : "확인 중";

function fact(label, value) {
  return `<div><span>${label}</span><b>${value}</b></div>`;
}

function render(item) {
  const product = item.product;
  const price = item.price_analysis;
  const performance = item.performance;
  const counterpart = item.japan_counterpart;

  $("#product-position").textContent = `0${item.position}`;
  $("#product-image").src = product.image_url;
  $("#product-image").alt = `${product.brand} ${product.name}`;
  $("#product-category").textContent = item.category_label;
  $("#product-brand").textContent = product.brand;
  $("#product-name").textContent = product.name;
  $("#product-score").textContent = item.opportunity_score;
  $("#price-table").innerHTML = [
    fact("한국 정가", won(price.kr_list_price)),
    fact("한국 판매가", won(price.kr_sale_price)),
    fact("정가 엔화 환산", yen(price.converted_list_jpy)),
    fact("판매가 엔화 환산", yen(price.converted_sale_jpy)),
    fact("일본 비교 제품 가격", yen(price.japan_counterpart_jpy)),
    fact("한국 할인율", `${price.discount_rate}%`),
  ].join("");
  $("#buy-signal").textContent = price.buy_signal ? "BUY SIGNAL · 20% 이상 할인" : "WATCH · 할인 조건 확인";
  $("#buy-signal").classList.toggle("active", price.buy_signal);
  $("#performance-tags").innerHTML = [...performance.ingredients, ...performance.claims]
    .map((tag) => `<span>${tag}</span>`).join("");
  $("#appeal-copy").textContent = performance.appeal;
  $("#proof-list").innerHTML = `
    <div><dt>판매처</dt><dd>${product.seller}</dd></div>
    <div><dt>평점</dt><dd>${product.rating == null ? "수집 대기" : `★ ${Number(product.rating).toFixed(1)}`}</dd></div>
    <div><dt>리뷰</dt><dd>${product.reviews == null ? "Olive Young 서버 수집 대기" : number(product.reviews)}</dd></div>
    <div><dt>모델</dt><dd>${performance.model}</dd></div>
    <div><dt>뉴스 신호</dt><dd>${item.news_signals.join("<br>")}</dd></div>
  `;
  $("#counterpart").innerHTML = `
    <img src="${counterpart.image_url}" alt="${counterpart.brand} ${counterpart.name}" referrerpolicy="no-referrer">
    <span>@cosme #${counterpart.rank}</span>
    <b>${counterpart.brand}</b>
    <h3>${counterpart.name}</h3>
    <p>★ ${Number(counterpart.rating).toFixed(1)} · 리뷰 ${number(counterpart.reviews)} · ${yen(counterpart.price_jpy)}</p>
    <a href="${counterpart.product_url}" target="_blank" rel="noopener noreferrer">@cosme 상품 보기 ↗</a>
  `;
  $("#loading-state").hidden = true;
  $("#product-content").hidden = false;
}

async function loadProduct() {
  try {
    const response = await fetch("/api/trend-gap", { cache: "no-store" });
    const data = await response.json();
    const item = data.top5.find((candidate) => candidate.category_key === productId);
    if (!item) throw new Error("해당 제품을 찾지 못했습니다.");
    render(item);
  } catch (error) {
    $("#loading-state").hidden = true;
    $("#error-state").hidden = false;
    $("#error-message").textContent = error.message || "TOP 5 목록에서 다시 선택해 주세요.";
  }
}

document.addEventListener("DOMContentLoaded", loadProduct);
