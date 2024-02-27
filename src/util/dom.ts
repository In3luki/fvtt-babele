/**  DOM helper functions that return HTMLElement(s) (or `null`) */

type MaybeHTML = Maybe<Document | Element | EventTarget>;

function htmlQuery<K extends keyof HTMLElementTagNameMap>(
    parent: MaybeHTML,
    selectors: K,
): HTMLElementTagNameMap[K] | null;
function htmlQuery(parent: MaybeHTML, selectors: string): HTMLElement | null;
function htmlQuery<E extends HTMLElement = HTMLElement>(parent: MaybeHTML, selectors: string): E | null;
function htmlQuery(parent: MaybeHTML, selectors: string): HTMLElement | null {
    if (!(parent instanceof Element || parent instanceof Document)) return null;
    return parent.querySelector<HTMLElement>(selectors);
}

function htmlQueryAll<K extends keyof HTMLElementTagNameMap>(
    parent: MaybeHTML,
    selectors: K,
): HTMLElementTagNameMap[K][];
function htmlQueryAll(parent: MaybeHTML, selectors: string): HTMLElement[];
function htmlQueryAll<E extends HTMLElement = HTMLElement>(parent: MaybeHTML, selectors: string): E[];
function htmlQueryAll(parent: MaybeHTML, selectors: string): HTMLElement[] {
    if (!(parent instanceof Element || parent instanceof Document)) return [];
    return Array.from(parent.querySelectorAll<HTMLElement>(selectors));
}

function htmlClosest<K extends keyof HTMLElementTagNameMap>(
    parent: MaybeHTML,
    selectors: K,
): HTMLElementTagNameMap[K] | null;
function htmlClosest(child: MaybeHTML, selectors: string): HTMLElement | null;
function htmlClosest<E extends HTMLElement = HTMLElement>(parent: MaybeHTML, selectors: string): E | null;
function htmlClosest(child: MaybeHTML, selectors: string): HTMLElement | null {
    if (!(child instanceof Element)) return null;
    return child.closest<HTMLElement>(selectors);
}

function appendHeaderButton(app: HTMLElement | null, title: string, callback: () => void): void {
    htmlQuery(app, ".translate")?.remove();

    const anchor = document.createElement("a");
    anchor.title = title;
    anchor.addEventListener("click", callback);

    const icon = document.createElement("i");
    icon.classList.add("fa-solid", "fa-globe");
    anchor.appendChild(icon);
    anchor.innerHTML = anchor.innerHTML.concat(title);

    const titleElement = htmlQuery(app, ".window-title");
    if (!titleElement) return;
    titleElement.appendChild(anchor);
}

export { appendHeaderButton, htmlClosest, htmlQuery, htmlQueryAll };
