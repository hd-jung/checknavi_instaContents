const $ = (selector) => document.querySelector(selector);

function renderOpportunities(data) {
  $("#snapshot-copy").textContent = `Olive Young 검증일 ${data.sources.korea.updated_date} · @cosme 원본 ${data.sources.japan.updated_date}. Olive Young은 아직 실시간이 아닙니다.`;
  $("#candidate-count").textContent = data.summary.top5;
  $("#average-score").textContent = data.summary.average_opportunity_score;
  $("#new-count").textContent = data.summary.new_wave_count;
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
        <span>${item.category_label} · ${product.release_stage}</span>
        <h2><small>${product.brand}</small>${product.name}</h2>
        <p>${item.performance.appeal}</p>
        <div class="shortlist-facts"><b>${Checknavi.won(item.price_analysis.kr_sale_price)}</b><span>${Checknavi.yen(item.price_analysis.converted_sale_jpy)} 환산</span><span>할인 ${item.price_analysis.discount_rate}%</span></div>
      </div>
      <div class="shortlist-action"><div><strong>${item.opportunity_score}</strong><br><span>편집 우선순위 / 100</span></div><a href="/products/${item.category_key}">상세 분석 →</a></div>
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
