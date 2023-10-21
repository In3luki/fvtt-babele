class ExportTranslationsDialog extends Dialog {
    pack: CompendiumCollection;

    constructor(pack: CompendiumCollection, dialogData = {}, options = {}) {
        super(dialogData, options);
        this.pack = pack;
    }

    static async create(pack: CompendiumCollection): Promise<Record<string, unknown> | null> {
        const html = await renderTemplate("modules/babele/templates/export-translations-dialog.hbs", pack);

        return new Promise((resolve: (data: Record<string, unknown> | null) => void) => {
            const dlg = new this(pack, {
                title: pack.metadata.label + ": " + game.i18n.localize("BABELE.ExportTranslationTitle"),
                content: html,
                buttons: {
                    exp: {
                        icon: `<i class="fas fa-download"></i>`,
                        label: game.i18n.localize("BABELE.ExportTranslationBtn"),
                        callback: ($html: JQuery) => {
                            const form = $html[0].querySelector("form");
                            if (!form) resolve(null);
                            const fd = new FormDataExtended(form!).object;
                            resolve(fd);
                        },
                    },
                },
                default: "exp",
                close: () => resolve(null),
            });
            dlg.render(true);
        });
    }
}

export { ExportTranslationsDialog };
