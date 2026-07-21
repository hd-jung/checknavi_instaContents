const $ = (selector) => document.querySelector(selector);

function renderOpportunities(data) {
  $("#snapshot-copy").textContent = `화해 원본 ${data.sources.korea.updated_date} · @cosme 원본 ${data.sources.japan.updated_date}. 조회 버튼은 랭킹 비교 페이지에 있습니다.`;
  $("#candidate-count").textContent = data.summary.top5;
  $("#average-score").textContent = data.summary.average_opportunity_score;
  $("#live-source-count").textContent = [data.sources.korea, data.sources.japan].filter((source) => source.mode === "live").length;
  $("#top5-fx").textContent = data.exchange.rate_per_100_krw ? Number(data.exchange.rate_per_100_krw).toFixed(3) : "—";

  const list = $("#opportunity-list");
  list.replaceChildren();
  data.top5.forEach((item) => {
    const product = item.product;
    const card = document.createElement("article");
    card.className = "shortlist-card";
    card.innerHTML = `
      <div class="shortlist-rank"><b>0${item.position}</b><span>TOP 5</span></div>
      <div class="shortlist-image"><img src="${product.image_url}" alt="${product.brand} ${product.name}" referrerpolicy="no-referrer"></div>
      <div class="shortlist-copy">
        <span>${item.category_label} · 화해 카테고리 #${product.rank}</span>
        <h2><small>${product.brand}</small>${product.name}</h2>
        <p>${item.performance.appeal}</p>
        <div class="shortlist-facts">
          <b>${Checknavi.won(item.price_analysis.kr_sale_price)}</b>
          <span>${Checknavi.yen(item.price_analysis.converted_sale_jpy)} 환산</span>
          <span>한국 할인 ${item.price_analysis.korea_discount_rate ?? "—"}%</span>
          <span>${Checknavi.rating(product)}</span>
        </div>
      </div>
      <div class="shortlist-action"><div><strong>${item.opportunity_score}</strong><br><span>편집 우선순위 / 100</span></div><a href="/products/${item.category_key}">가격·성능 분석 →</a></div>
    `;
    list.append(card);
  });
  $("#opportunity-content").hidden = false;
  $("#opportunity-error").hidden = true;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    renderOpportunities(await Checknavi.fetchData());
  } catch (error) {
    $("#opportunity-error").hidden = false;
    $("#opportunity-error").textContent = error.message;
  }
});
