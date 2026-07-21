const $ = (selector) => document.querySelector(selector);

function renderOverview(data) {
  const jp = data.sources.japan;
  const kr = data.sources.korea;
  $("#cosme-mode").textContent = Checknavi.mode(jp.mode);
  $("#cosme-detail").textContent = `원본 ${jp.updated_date} · 집계 ${jp.aggregation_period}`;
  $("#korea-mode").textContent = Checknavi.mode(kr.mode);
  $("#olive-detail").textContent = `원본 ${kr.updated_date} · ${kr.aggregation_period}`;
  $("#fx-rate").textContent = data.exchange.rate_per_100_krw ? `${Number(data.exchange.rate_per_100_krw).toFixed(3)} JPY` : "확인 중";
  $("#fx-detail").textContent = `기준일 ${data.exchange.as_of_date || "확인 중"}`;
  $("#fx-mode").textContent = data.exchange.error ? "FALLBACK" : "LIVE";
  $("#collected-at").textContent = `확인 ${new Date(data.collected_at).toLocaleString("ko-KR")}`;

  const list = $("#signal-list");
  list.replaceChildren();
  data.comparisons.forEach((item) => {
    const card = document.createElement("article");
    card.className = "signal-item";
    card.innerHTML = `
      <span>${item.category_label}</span>
      <b>${item.insight.headline}</b>
      <p>${item.japan.brand} → ${item.korea.brand}</p>
      <a href="/rankings?category=${item.category_key}">비교 보기 →</a>
    `;
    list.append(card);
  });
  $("#overview-content").hidden = false;
  $("#signal-section").hidden = false;
  $("#load-error").hidden = true;
}

async function loadOverview(force = false) {
  const button = $("#refresh-cosme");
  button.disabled = true;
  button.textContent = force ? "양국 데이터 조회 중…" : "데이터 확인 중…";
  try {
    renderOverview(await Checknavi.fetchData(force));
  } catch (error) {
    $("#load-error").hidden = false;
    $("#load-error").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "양국 최신 조회";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#refresh-cosme").addEventListener("click", () => loadOverview(true));
  loadOverview();
});
