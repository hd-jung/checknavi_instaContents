const $ = (selector) => document.querySelector(selector);
const state = { data: null, threshold: 20, loading: false };
const number = (value) => value == null ? "수집 대기" : new Intl.NumberFormat("ko-KR").format(value);
const won = (value) => value ? `₩${number(value)}` : "확인 중";
const yen = (value) => value ? `¥${number(value)}` : "확인 중";

function updateClock() {
  $("#header-clock").textContent = `${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date())} KST`;
}

function renderList() {
  const container = $("#opportunity-list");
  container.replaceChildren();
  state.data.top5.forEach((item) => {
    const product = item.product;
    const price = item.price_analysis;
    const active = price.discount_rate >= state.threshold;
    const card = document.createElement("article");
    card.className = "opportunity-card";
    card.innerHTML = `
      <div class="opportunity-rank"><span>0${item.position}</span><small>SCORE ${item.opportunity_score}</small></div>
      <div class="opportunity-image"><img src="${product.image_url}" alt="${product.brand} ${product.name}" loading="lazy" referrerpolicy="no-referrer"></div>
      <div class="opportunity-copy">
        <span>${item.category_label} · ${product.release_stage}</span>
        <b>${product.brand}</b>
        <h2>${product.name}</h2>
        <p>${item.performance.appeal}</p>
        <div class="opportunity-meta">
          <div><small>한국 판매가</small><strong>${won(price.kr_sale_price)}</strong></div>
          <div><small>엔화 환산</small><strong>${yen(price.converted_sale_jpy)}</strong></div>
          <div><small>할인율</small><strong>${price.discount_rate}%</strong></div>
        </div>
      </div>
      <div class="opportunity-action">
        <span class="buy-signal ${active ? "active" : ""}">${active ? "BUY SIGNAL" : "WATCH"}</span>
        <a href="/products/${item.category_key}">상세 분석 보기 →</a>
      </div>
    `;
    container.append(card);
  });
}

function render(data) {
  state.data = data;
  $("#candidate-count").textContent = data.summary.top5;
  $("#opportunity-average").textContent = `${data.summary.average_opportunity_score}점`;
  $("#new-wave-count").textContent = data.summary.new_wave_count;
  $("#fx-rate").textContent = data.exchange.rate_per_100_krw ? `${Number(data.exchange.rate_per_100_krw).toFixed(3)} JPY` : "확인 중";
  $("#fx-date").textContent = `기준일 ${data.exchange.as_of_date || "확인 중"}`;
  renderList();
  $("#loading-state").hidden = true;
  $("#error-state").hidden = true;
  $("#opportunity-content").hidden = false;
}

async function loadData(force = false) {
  if (state.loading) return;
  state.loading = true;
  $("#refresh-button").disabled = true;
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
  $("#discount-threshold").addEventListener("input", (event) => {
    state.threshold = Number(event.target.value);
    $("#threshold-output").textContent = `${state.threshold}%`;
    if (state.data) renderList();
  });
  loadData();
});
