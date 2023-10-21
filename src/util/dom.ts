function appendHeaderButton(app: HTMLElement | null, title: string, callback: () => void): void {
    if (!app) return;
    app.querySelector(".translate")?.remove();

    const anchor = document.createElement("a");
    anchor.title = title;
    anchor.addEventListener("click", callback);

    const icon = document.createElement("i");
    icon.classList.add("fa-solid", "fa-globe");
    anchor.appendChild(icon);
    anchor.innerHTML = anchor.innerHTML.concat(title);

    const titleElement = app.querySelector(".window-title");
    if (!titleElement) return;
    titleElement.appendChild(anchor);
}

export { appendHeaderButton };
