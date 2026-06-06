document.querySelectorAll(".site-header").forEach((header) => {
  const button = header.querySelector(".hamburger-button");
  const links = header.querySelector(".nav-links");

  if (!button || !links) {
    return;
  }

  button.addEventListener("click", () => {
    const isOpen = links.classList.toggle("open");
    button.setAttribute("aria-expanded", String(isOpen));
  });

  links.addEventListener("click", (event) => {
    if (event.target.tagName === "A") {
      links.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    }
  });
});
