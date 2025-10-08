const MENU_BREAKPOINT = 960;

export default function initNavigation() {
  const body = document.body;
  const toggleButton = document.getElementById("hamburgerButton");
  const nav = document.getElementById("appNav");

  if (!body || !toggleButton || !nav || toggleButton.dataset.navBound === "true") {
    if (body) {
      body.classList.remove("menu-open");
    }
    if (toggleButton) {
      toggleButton.setAttribute("aria-expanded", "false");
    }
    return;
  }

  const closeMenu = () => {
    if (!body.classList.contains("menu-open")) {
      return;
    }
    body.classList.remove("menu-open");
    toggleButton.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    if (body.classList.contains("menu-open")) {
      return;
    }
    body.classList.add("menu-open");
    toggleButton.setAttribute("aria-expanded", "true");
    nav.focus?.();
  };

  const toggleMenu = () => {
    if (body.classList.contains("menu-open")) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  toggleButton.addEventListener("click", (event) => {
    event.preventDefault();
    toggleMenu();
  });

  nav.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLAnchorElement) {
      closeMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= MENU_BREAKPOINT) {
      closeMenu();
      toggleButton.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  toggleButton.setAttribute("aria-expanded", "false");
  body.classList.remove("menu-open");
  toggleButton.dataset.navBound = "true";
}
