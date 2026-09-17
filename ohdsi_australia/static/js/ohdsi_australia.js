const menuButton = document.querySelector(".menu-button");
const utilityBar = document.querySelector(".utility-bar");

if (menuButton && utilityBar) {
	menuButton.addEventListener("click", () => {
		const isOpen = utilityBar.classList.toggle("is-open");
		menuButton.setAttribute("aria-expanded", String(isOpen));
	});
}
