document.querySelectorAll(".mobile-menu").forEach((menu) => {
  const button = menu.querySelector(".hamburger-button");
  const links = menu.querySelector(".mobile-nav-links");

  button.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("open");
    button.setAttribute("aria-expanded", String(isOpen));
  });

  links.addEventListener("click", (event) => {
    if (event.target.tagName === "A") {
      menu.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    }
  });
});
