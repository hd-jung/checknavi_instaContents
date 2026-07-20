const palettes = [
  { bg: "#f7dfed", accent: "#ff6f91" },
  { bg: "#e5e0ff", accent: "#8b72ef" },
  { bg: "#e4f5ff", accent: "#68bde8" },
  { bg: "#fff0ca", accent: "#ffbf42" },
  { bg: "#e5f6d8", accent: "#8fd05b" },
];

const state = {
  products: [],
  activeSlide: 0,
  rate: null,
  sourceMode: "",
  collectedAt: "",
  cover: {
    title: "일본에 지금 막 도착한\nK-BEAUTY 신상 5",
    subtitle: "가격·판매처·첫 리뷰까지 한 번에",
    edition: "JULY NEW DROP",
  },
  objectUrls: [],
};

const $ = (selector) => document.querySelector(selector);
const formatNumber = (value) => new Intl.NumberFormat("ko-KR").format(Number(value) || 0);
const formatYen = (value) => value == null || value === "" ? "가격 확인 중" : `¥${formatNumber(value)}`;
const formatWon = (value) => value == null || value === "" ? "환산 대기" : `약 ₩${formatNumber(value)}`;
const imageSource = (url) => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("/") || url.startsWith("data:")) return url;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "cosme.net" || host.endsWith(".cosme.net")) {
      return `/api/media?url=${encodeURIComponent(url)}`;
    }
  } catch (_) {
    return "";
  }
  return url;
};

function convertedWon(price) {
  if (price == null || !state.rate) return null;
  return Math.round(Number(price) / state.rate * 100);
}

function safeText(value, fallback = "확인 중") {
  return String(value ?? "").trim() || fallback;
}

function create(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function renderTabs() {
  const tabs = $("#slide-tabs");
  tabs.replaceChildren();
  for (let index = 0; index < 6; index += 1) {
    const button = create("button", `slide-tab${state.activeSlide === index ? " is-active" : ""}`, String(index + 1).padStart(2, "0"));
    button.type = "button";
    button.addEventListener("click", () => selectSlide(index));
    tabs.append(button);
  }
}

function productImage(product, className = "") {
  const src = imageSource(product.image_url);
  if (!src) return create("span", `${className} product-placeholder`.trim(), product.brand);
  const image = create("img", className);
  image.src = src;
  image.alt = `${product.brand} ${product.name}`;
  image.loading = "lazy";
  image.addEventListener("error", () => {
    image.replaceWith(create("span", "product-placeholder", product.brand));
  }, { once: true });
  return image;
}

function coverCard() {
  const card = create("article", `news-card cover-card${state.activeSlide === 0 ? " is-active" : ""}`);
  card.dataset.slide = "0";
  card.append(
    create("span", "card-number", "01 / 06"),
    create("span", "cover-kicker", `CHECKNAVI · ${state.cover.edition}`),
  );
  const titleWrap = create("div");
  titleWrap.append(
    create("h2", "cover-title", state.cover.title),
    create("p", "cover-subtitle", state.cover.subtitle),
  );
  card.append(titleWrap);
  const products = create("div", "cover-products");
  state.products.slice(0, 5).forEach((product, index) => {
    const frame = create("div", "cover-product");
    frame.style.setProperty("--lift", `${index % 2 ? -12 : 0}%`);
    frame.append(productImage(product));
    products.append(frame);
  });
  while (products.children.length < 5) {
    const frame = create("div", "cover-product");
    frame.append(create("span", "", "NEW DROP"));
    products.append(frame);
  }
  card.append(products);
  const footer = create("div", "cover-footer");
  footer.append(create("span", "", "SAVE & SWIPE →"), create("span", "", "SOURCE · @COSME / OFFICIAL"));
  card.append(footer);
  card.addEventListener("click", () => selectSlide(0));
  return card;
}

function releaseCard(product, index) {
  const palette = palettes[index % palettes.length];
  const slideIndex = index + 1;
  const card = create("article", `news-card product-card${state.activeSlide === slideIndex ? " is-active" : ""}`);
  card.dataset.slide = String(slideIndex);
  card.style.setProperty("--card-bg", palette.bg);
  card.style.setProperty("--card-accent", palette.accent);

  const topline = create("div", "card-topline");
  topline.append(
    create("span", "new-badge", "NEW IN JAPAN"),
    create("span", "release-date", safeText(product.release_date, "DATE TBA").replaceAll("-", ".")),
  );
  card.append(create("span", "card-number", `${String(slideIndex + 1).padStart(2, "0")} / 06`), topline);

  const brand = create("div", "brand-lockup");
  const logoSrc = imageSource(product.brand_logo_url);
  if (logoSrc) {
    const logo = create("img");
    logo.src = logoSrc;
    logo.alt = `${product.brand} 로고`;
    logo.addEventListener("error", () => logo.replaceWith(document.createTextNode(product.brand)), { once: true });
    brand.append(logo);
  } else {
    brand.textContent = product.brand;
  }
  card.append(brand);

  const visual = create("div", "product-visual");
  visual.append(productImage(product), create("span", "category-label", safeText(product.category, "K-BEAUTY")));
  card.append(visual);
  card.append(
    create("h3", "product-name", product.name),
    create("p", "seller-line", `판매처 · ${safeText(product.seller)}`),
  );

  const meta = create("div", "product-meta");
  const price = create("div", "price-box");
  price.append(create("b", "", formatYen(product.price_jpy)), create("small", "", formatWon(convertedWon(product.price_jpy))));
  const review = create("div", "review-box");
  review.append(
    create("b", "", product.reviews ? `★ ${Number(product.rating || 0).toFixed(1)}` : "NEW"),
    create("small", "", product.reviews ? `${formatNumber(product.reviews)} REVIEWS` : "아직 리뷰 없음"),
  );
  meta.append(price, review);
  card.append(meta, create("span", "card-source", "DATA · @COSME / BRAND OFFICIAL"));
  card.addEventListener("click", () => selectSlide(slideIndex));
  return card;
}

function renderCards() {
  const grid = $("#card-grid");
  grid.replaceChildren(coverCard(), ...state.products.slice(0, 5).map(releaseCard));
  renderTabs();
}

function selectSlide(index) {
  state.activeSlide = index;
  renderCards();
  renderEditor();
  document.querySelector(`[data-slide="${index}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function setValue(selector, value) {
  $(selector).value = value ?? "";
}

function renderEditor() {
  const isCover = state.activeSlide === 0;
  $("#cover-editor").hidden = !isCover;
  $("#product-editor").hidden = isCover;
  $("#editor-title").textContent = isCover ? "01 · 표지" : `${String(state.activeSlide + 1).padStart(2, "0")} · 신제품 ${state.activeSlide}`;
  if (isCover) {
    setValue("#cover-title", state.cover.title);
    setValue("#cover-subtitle", state.cover.subtitle);
    setValue("#cover-edition", state.cover.edition);
    return;
  }
  const product = state.products[state.activeSlide - 1];
  if (!product) return;
  setValue("#edit-brand", product.brand);
  setValue("#edit-release-date", product.release_date);
  setValue("#edit-name", product.name);
  setValue("#edit-category", product.category);
  setValue("#edit-seller", product.seller);
  setValue("#edit-price", product.price_jpy);
  setValue("#edit-rating", product.rating);
  setValue("#edit-reviews", product.reviews);
  setValue("#converted-price", formatWon(convertedWon(product.price_jpy)));
  $("#product-source").href = product.product_url || product.source_url || "#";
}

function updateCover() {
  state.cover.title = $("#cover-title").value;
  state.cover.subtitle = $("#cover-subtitle").value;
  state.cover.edition = $("#cover-edition").value;
  renderCards();
}

const editorMap = {
  "#edit-brand": "brand",
  "#edit-release-date": "release_date",
  "#edit-name": "name",
  "#edit-category": "category",
  "#edit-seller": "seller",
  "#edit-price": "price_jpy",
  "#edit-rating": "rating",
  "#edit-reviews": "reviews",
};

function updateProduct(event) {
  const product = state.products[state.activeSlide - 1];
  if (!product) return;
  const key = editorMap[`#${event.target.id}`];
  if (!key) return;
  product[key] = ["price_jpy", "rating", "reviews"].includes(key)
    ? (event.target.value === "" ? null : Number(event.target.value))
    : event.target.value;
  $("#converted-price").value = formatWon(convertedWon(product.price_jpy));
  renderCards();
}

function applyUpload(file, field) {
  if (!file || !file.type.startsWith("image/")) return;
  const product = state.products[state.activeSlide - 1];
  if (!product) return;
  const url = URL.createObjectURL(file);
  state.objectUrls.push(url);
  product[field] = url;
  renderCards();
}

function formatCollectedAt(value) {
  if (!value) return "수집 시각 —";
  return `수집 시각 ${new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value))}`;
}

async function loadReleases(force = false) {
  const refresh = $("#refresh-releases");
  refresh.disabled = true;
  refresh.textContent = "수집 중";
  $("#release-error").hidden = true;
  if (!state.products.length) $("#loading-releases").hidden = false;
  try {
    const response = await fetch(`/api/new-releases${force ? "?refresh=true" : ""}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.detail?.message || "서버 응답 오류");
    state.products = data.products.slice(0, 5);
    state.rate = data.exchange.rate_per_100_krw;
    state.sourceMode = data.source_mode;
    state.collectedAt = data.collected_at;
    $("#rate-value").textContent = state.rate ? `¥ ${Number(state.rate).toFixed(3)}` : "조회 실패";
    $("#rate-date").textContent = data.exchange.as_of_date ? `기준일 ${data.exchange.as_of_date}` : "환율 기준일 —";
    $("#calendar-source").href = data.source_url;
    $("#collection-note").textContent = `${formatCollectedAt(data.collected_at)} · ${
      data.source_mode === "live" ? "실시간 상품 정보" : "최근 정상 상품 정보"
    }`;
    const badge = $("#source-badge");
    badge.textContent = data.source_mode === "live" ? "LIVE NEW RELEASES" : "최근 정상 데이터";
    badge.className = `source-badge ${data.source_mode === "live" ? "is-live" : "is-fallback"}`;
    $("#loading-releases").hidden = true;
    $("#export-all").disabled = false;
    $("#export-current").disabled = false;
    renderCards();
    renderEditor();
  } catch (error) {
    $("#loading-releases").hidden = true;
    $("#release-error").hidden = false;
    $("#release-error-message").textContent = error.message || "잠시 후 다시 시도해 주세요.";
  } finally {
    refresh.disabled = false;
    refresh.textContent = "실시간 갱신";
  }
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = imageSource(src);
  });
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawContain(ctx, image, x, y, width, height) {
  if (!image) return;
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function textLines(ctx, text, maxWidth, maxLines = 4) {
  const value = String(text || "");
  const lines = [];
  let line = "";
  for (const char of value) {
    if (char === "\n") {
      lines.push(line);
      line = "";
      if (lines.length >= maxLines) break;
      continue;
    }
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
      if (lines.length >= maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

function drawLines(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  textLines(ctx, text, maxWidth, maxLines).forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

async function coverCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, "#ff876f");
  gradient.addColorStop(.52, "#ff876f");
  gradient.addColorStop(.521, "#dfff49");
  gradient.addColorStop(1, "#dfff49");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#7f68e8";
  ctx.beginPath();
  ctx.arc(990, 92, 230, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(23,23,23,.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(540, 500, 460, 330, -.14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#171717";
  ctx.font = "900 25px Arial, sans-serif";
  ctx.fillText(`CHECKNAVI · ${state.cover.edition}`, 72, 95);
  ctx.font = "950 96px 'Malgun Gothic', 'Noto Sans KR', sans-serif";
  drawLines(ctx, state.cover.title, 70, 245, 850, 102, 3);
  ctx.font = "750 31px 'Malgun Gothic', sans-serif";
  drawLines(ctx, state.cover.subtitle, 76, 500, 660, 43, 2);

  const images = await Promise.all(state.products.slice(0, 5).map((product) => loadImage(product.image_url)));
  images.forEach((image, index) => {
    const x = 65 + index * 195;
    const y = 720 + (index % 2 ? 20 : 0);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    roundedRect(ctx, x, y, 175, 410, 80);
    ctx.fill();
    if (image) {
      drawContain(ctx, image, x + 15, y + 55, 145, 270);
    } else {
      ctx.save();
      ctx.translate(x + 95, y + 310);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "#171717";
      ctx.font = "900 20px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.products[index]?.brand || "NEW", 0, 0);
      ctx.restore();
    }
  });
  ctx.fillStyle = "#171717";
  ctx.font = "900 20px Arial, sans-serif";
  ctx.fillText("SAVE & SWIPE →", 72, 1270);
  ctx.textAlign = "right";
  ctx.fillText("SOURCE · @COSME / BRAND OFFICIAL", 1008, 1270);
  ctx.textAlign = "left";
  return canvas;
}

async function productCanvas(product, index) {
  const palette = palettes[index % palettes.length];
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.arc(1050, 1280, 390, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#171717";
  roundedRect(ctx, 66, 65, 230, 48, 3);
  ctx.fill();
  ctx.fillStyle = "#fffdf8";
  ctx.font = "900 20px Arial, sans-serif";
  ctx.fillText("NEW IN JAPAN", 92, 97);
  ctx.textAlign = "right";
  ctx.fillStyle = "#171717";
  ctx.font = "850 20px Arial, sans-serif";
  ctx.fillText(safeText(product.release_date, "DATE TBA").replaceAll("-", "."), 1010, 96);
  ctx.textAlign = "left";

  const [productAsset, logoAsset] = await Promise.all([
    loadImage(product.image_url),
    loadImage(product.brand_logo_url),
  ]);
  if (logoAsset) {
    drawContain(ctx, logoAsset, 68, 145, 380, 70);
  } else {
    ctx.fillStyle = "#171717";
    ctx.font = "950 45px Arial, sans-serif";
    ctx.fillText(product.brand, 68, 193);
  }

  ctx.fillStyle = "rgba(255,255,255,.9)";
  roundedRect(ctx, 64, 245, 952, 570, 18);
  ctx.fill();
  if (productAsset) {
    drawContain(ctx, productAsset, 150, 285, 780, 455);
  } else {
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(540, 510, 175, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#171717";
    ctx.textAlign = "center";
    ctx.font = "950 54px Arial, sans-serif";
    ctx.fillText(product.brand, 540, 525);
    ctx.textAlign = "left";
  }
  ctx.fillStyle = palette.accent;
  roundedRect(ctx, 88, 740, 310, 46, 4);
  ctx.fill();
  ctx.fillStyle = "#171717";
  ctx.font = "900 18px 'Malgun Gothic', sans-serif";
  ctx.fillText(safeText(product.category, "K-BEAUTY"), 106, 770);

  ctx.fillStyle = "#171717";
  ctx.font = "950 52px 'Malgun Gothic', 'Noto Sans JP', sans-serif";
  drawLines(ctx, product.name, 66, 890, 940, 62, 3);
  ctx.fillStyle = "#6e6a63";
  ctx.font = "750 23px 'Malgun Gothic', sans-serif";
  ctx.fillText(`판매처 · ${safeText(product.seller)}`, 68, 1060);

  ctx.strokeStyle = "rgba(23,23,23,.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(66, 1105);
  ctx.lineTo(1014, 1105);
  ctx.stroke();
  ctx.fillStyle = "#171717";
  ctx.font = "950 42px Arial, sans-serif";
  ctx.fillText(formatYen(product.price_jpy), 68, 1170);
  ctx.font = "750 22px 'Malgun Gothic', sans-serif";
  ctx.fillStyle = "#6e6a63";
  ctx.fillText(formatWon(convertedWon(product.price_jpy)), 68, 1206);
  ctx.textAlign = "right";
  ctx.fillStyle = "#171717";
  ctx.font = "950 37px Arial, sans-serif";
  ctx.fillText(product.reviews ? `★ ${Number(product.rating || 0).toFixed(1)}` : "NEW", 1010, 1170);
  ctx.font = "750 20px Arial, sans-serif";
  ctx.fillStyle = "#6e6a63";
  ctx.fillText(product.reviews ? `${formatNumber(product.reviews)} REVIEWS` : "NO REVIEWS YET", 1010, 1206);
  ctx.textAlign = "left";
  ctx.fillStyle = "#171717";
  ctx.font = "800 16px Arial, sans-serif";
  ctx.fillText("CHECKNAVI · DATA @COSME / BRAND OFFICIAL", 66, 1300);
  return canvas;
}

async function makeCanvas(slide) {
  if (slide === 0) return coverCanvas();
  return productCanvas(state.products[slide - 1], slide - 1);
}

async function canvasBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
}

async function downloadSlide(slide) {
  const canvas = await makeCanvas(slide);
  const blob = await canvasBlob(canvas);
  if (!blob) throw new Error("PNG 생성에 실패했습니다.");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `checknavi-new-drop-${String(slide + 1).padStart(2, "0")}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1800);
}

async function exportCurrent() {
  const button = $("#export-current");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "PNG 제작 중";
  try {
    await downloadSlide(state.activeSlide);
    button.textContent = "저장 완료";
  } catch (error) {
    window.alert(error.message || "이미지를 저장하지 못했습니다.");
    button.textContent = "저장 실패";
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = original;
    }, 1200);
  }
}

async function exportAll() {
  const button = $("#export-all");
  const original = button.textContent;
  button.disabled = true;
  try {
    for (let slide = 0; slide < 6; slide += 1) {
      button.textContent = `${slide + 1}/6 제작 중`;
      await downloadSlide(slide);
      await new Promise((resolve) => setTimeout(resolve, 320));
    }
    button.textContent = "6장 저장 완료";
  } catch (error) {
    window.alert(error.message || "이미지를 저장하지 못했습니다.");
    button.textContent = "저장 실패";
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = original;
    }, 1500);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderTabs();
  renderEditor();
  loadReleases();
  ["#cover-title", "#cover-subtitle", "#cover-edition"].forEach((selector) => {
    $(selector).addEventListener("input", updateCover);
  });
  Object.keys(editorMap).forEach((selector) => $(selector).addEventListener("input", updateProduct));
  $("#product-image-upload").addEventListener("change", (event) => applyUpload(event.target.files?.[0], "image_url"));
  $("#brand-logo-upload").addEventListener("change", (event) => applyUpload(event.target.files?.[0], "brand_logo_url"));
  $("#refresh-releases").addEventListener("click", () => loadReleases(true));
  $("#export-current").addEventListener("click", exportCurrent);
  $("#export-all").addEventListener("click", exportAll);
});

window.addEventListener("beforeunload", () => {
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
});
