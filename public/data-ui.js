window.Checknavi = (() => {
  const number = (value) => value == null ? "수집 대기" : new Intl.NumberFormat("ko-KR").format(value);
  const won = (value) => value ? `₩${number(value)}` : "확인 중";
  const yen = (value) => value ? `¥${number(value)}` : "확인 중";
  const rating = (product) => {
    if (product.rating == null) return "별점 수집 대기";
    const reviews = product.reviews == null ? "리뷰 수집 대기" : `리뷰 ${number(product.reviews)}`;
    return `★ ${Number(product.rating).toFixed(1)} · ${reviews}`;
  };
  const mode = (value) => ({
    live: "실시간",
    cached: "서버 캐시",
    fallback: "최근 정상 데이터",
    reference_snapshot: "검증 스냅샷",
  }[value] || value);

  async function fetchData(force = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
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
      if (error.name === "AbortError") throw new Error("데이터 조회가 30초를 초과했습니다.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return { number, won, yen, rating, mode, fetchData };
})();
