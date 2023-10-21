import type { TranslatableData } from "@modules/babele/types.ts";

class OnDemandTranslationDialog extends Dialog {
    processsing: boolean = false;

    constructor(actor: Actor) {
        super({
            title: game.i18n.localize("BABELE.TranslateActorTitle"),
            content: (): string => {
                const p = document.createElement("p");
                p.innerHTML = game.i18n.localize("BABELE.TranslateActorHint");
                const textArea = document.createElement("textarea");
                textArea.rows = 10;
                textArea.cols = 50;
                textArea.id = "actor-translate-log";
                textArea.style.fontFamily = "Courier, monospace";
                textArea.style.resize = "none";
                textArea.style.cursor = "default";
                textArea.readOnly = true;
                const div = document.createElement("div");
                div.append(p, textArea);
                return div.outerHTML;
            },
            buttons: {
                translate: {
                    icon: '<i class="fa-solid fa-globe"></i>',
                    label: game.i18n.localize("BABELE.TranslateActorBtn"),
                    callback: async ($html: JQuery) => {
                        const html = $html[0];
                        const area = html.querySelector<HTMLTextAreaElement>("#actor-translate-log");
                        if (!area) return;
                        this.processsing = true;
                        area.append(`start...\n`);
                        const items = actor.items.contents.length;
                        let translated = 0;
                        let untranslated = 0;

                        const updates: TranslatableData[] = [];
                        for (let idx = 0; idx < items; idx++) {
                            const item = actor.items.contents[idx];
                            const data = item.toObject() as unknown as TranslatableData;

                            const pack = game.babele.packs.find((pack) => pack.translated && pack.hasTranslation(data));
                            if (pack) {
                                const translatedData = pack.translate(data, true);
                                if (!translatedData) continue;
                                updates.push(mergeObject(translatedData, { _id: item.id }));
                                area.append(`${data.name.padEnd(68, ".")}ok\n`);
                                translated += 1;
                            } else {
                                area.append(`${data.name.padEnd(61, ".")}not found\n`);
                                untranslated += 1;
                            }
                        }
                        if (updates.length) {
                            area.append(`Updating...\n`);
                            await actor.updateEmbeddedDocuments("Item", updates);
                        }
                        area.append(
                            `\nDone. total items: ${items}, total translated: ${translated}, total untranslated: ${untranslated}\n`
                        );
                        area.scrollTop = area.scrollHeight;
                        this.processsing = false;
                    },
                },
            },
            default: "translate",
        });
    }

    override async close(options?: { force?: boolean }): Promise<void> {
        if (!this.processsing) {
            return super.close(options);
        }
        return;
    }

    static override get defaultOptions(): ApplicationOptions {
        return {
            ...super.defaultOptions,
            width: 600,
        };
    }
}

export { OnDemandTranslationDialog };
