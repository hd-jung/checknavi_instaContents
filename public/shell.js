function updateShellTime() {
  const now = new Date();
  document.querySelector("#sidebar-clock").textContent = `${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now)} KST`;
  document.querySelector("#topbar-date").textContent = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).format(now);
}

document.addEventListener("DOMContentLoaded", () => {
  updateShellTime();
  setInterval(updateShellTime, 30000);
  document.querySelector("#mobile-menu")?.addEventListener("click", (event) => {
    event.stopPropagation();
    document.body.classList.toggle("menu-open");
  });
  document.querySelector(".app-main")?.addEventListener("click", () => document.body.classList.remove("menu-open"));
});
