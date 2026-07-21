window.Checknavi = (() => {
  const number = (value) => value == null ? "수집되지 않음" : new Intl.NumberFormat("ko-KR").format(value);
  const won = (value) => value == null ? "확인 불가" : `₩${number(value)}`;
  const yen = (value) => value == null ? "확인 불가" : `¥${number(value)}`;
  const rating = (product) => {
    if (product.rating == null) return "별점 수집되지 않음";
    const reviews = product.reviews == null ? "리뷰 수 수집되지 않음" : `리뷰 ${number(product.reviews)}건`;
    return `★ ${Number(product.rating).toFixed(2)} · ${reviews}`;
  };
  const mode = (value) => ({
    live: "실시간 조회",
    cached: "서버 캐시",
    fallback: "최근 정상 스냅샷",
    reference_snapshot: "검증 스냅샷",
  }[value] || value);
  const dateTime = (value) => {
    if (!value) return "확인 불가";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  };

  async function fetchData(force = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(`/api/trend-gap${force ? "?refresh=true" : ""}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.detail?.message || "데이터 서버 응답 오류");
      return data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("실시간 조회가 35초를 초과했습니다. 잠시 후 다시 시도해 주세요.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return { number, won, yen, rating, mode, dateTime, fetchData };
})();
