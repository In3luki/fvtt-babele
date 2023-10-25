import * as R from "remeda";
import { Babele, CompendiumMapping, Converters, FieldMapping } from "@modules/index.ts";
import { appendHeaderButton } from "@util/dom.ts";

// Expose classes
globalThis.Babele = Babele;
globalThis.CompendiumMapping = CompendiumMapping;
globalThis.Converters = Converters;
globalThis.FieldMapping = FieldMapping;
game.babele = new Babele();

Hooks.once("init", () => {
    game.settings.register("babele", "directory", {
        name: game.i18n.localize("BABELE.TranslationDirTitle"),
        hint: game.i18n.localize("BABELE.TranslationDirHint"),
        type: String,
        scope: "world",
        config: true,
        filePicker: "folder",
        default: "",
        requiresReload: true,
    });

    game.settings.register("babele", "export", {
        name: game.i18n.localize("BABELE.EnableTranslationExportTile"),
        hint: game.i18n.localize("BABELE.EnableTranslationExportHint"),
        scope: "world",
        type: Boolean,
        config: true,
        default: true,
    });

    game.settings.register("babele", "showOriginalName", {
        name: game.i18n.localize("BABELE.ShowOriginalName"),
        hint: game.i18n.localize("BABELE.ShowOriginalNameHint"),
        scope: "client",
        type: Boolean,
        config: true,
        default: false,
    });

    game.settings.register("babele", "showTranslateOption", {
        name: game.i18n.localize("BABELE.ShowTranslateOption"),
        hint: game.i18n.localize("BABELE.ShowTranslateOptionHint"),
        scope: "client",
        type: Boolean,
        config: true,
        default: true,
    });

    game.settings.register("babele", "translationFiles", {
        name: "",
        type: Array,
        default: [],
        scope: "world",
        config: false,
    });

    if (!game.modules.get("lib-wrapper")?.active && game.user.isGM) {
        ui.notifications.error(game.i18n.localize("BABELE.requireLibWrapperMessage"));
    }

    /**
     * Since foundry 0.8.+, translations are directly applied replacing the default ClientDatabaseBackend _getDocuments implementation
     * with a code that merge the incoming data with the mapped translations.
     */
    libWrapper.register(
        "babele",
        "CONFIG.DatabaseBackend._getDocuments",
        async function (
            wrapped: ClientDatabaseBackend["_getDocuments"],
            documentClass: typeof foundry.abstract.Document,
            context: DatabaseBackendGetContext,
            user: User
        ) {
            const result = await wrapped(documentClass, context, user);
            const { pack, options } = context;

            if (!pack || !game.babele.initialized) {
                return result;
            }

            if (options?.index) {
                return game.babele.translateIndex(result as CompendiumIndexData[], pack);
            } else {
                return result.map((data) => {
                    const source = data.toObject();
                    // Work around some documents not having a sourceId flag
                    // The uuid property will be filtered out by the DataModel after translation
                    if (!source.flags?.core?.sourceId) {
                        source.uuid = (data as ClientDocument).uuid;
                    }
                    return documentClass.fromSource(game.babele.translate(pack, source), { pack });
                });
            }
        },
        "WRAPPER"
    );

    /**
     * Necessary to solve a problem caused by the replacement of the index, even if already present, after reading the document.
     */
    libWrapper.register(
        "babele",
        "CompendiumCollection.prototype.indexDocument",
        function (
            this: CompendiumCollection,
            wrapped: CompendiumCollection["indexDocument"],
            document: CompendiumDocument
        ) {
            const id = document.id;
            const current = this.index.get(id, { strict: true });
            wrapped(document);
            this.index.set(id, mergeObject(this.index.get(id, { strict: true }), current));
        },
        "WRAPPER"
    );
});

Hooks.once("ready", async () => {
    if (!game.modules.get("lib-wrapper")?.active && game.user.isGM) {
        ui.notifications.error(game.i18n.localize("BABELE.requireLibWrapperMessage"));
    }

    const success = await game.babele.init();
    if (!success) {
        console.log(
            `Babele | No compendium translation files found for "${game.settings.get("core", "language")}" language.`
        );
        libWrapper.unregister_all("babele");
        return;
    }
    ui.compendium.render();

    // Translate compendium indices
    const start = performance.now();
    for (const collection of game.babele.translations.keys()) {
        const pack = game.packs.get(collection);
        if (!pack) continue;
        pack.index = new Collection<CompendiumIndexData>(
            game.babele.translateIndex(pack.index.contents, pack.collection).map((i) => [i._id, i])
        );
        game.babele.translatePackFolders(pack);
    }
    console.log(`Babele | Translated ${game.babele.translations.size} indices in ${performance.now() - start}ms`);

    Hooks.on("renderActorSheet", async (app, $html, options) => {
        if (options instanceof Promise) {
            options = await options;
        }
        const exportEnabled = game.settings.get("babele", "showTranslateOption");
        if (exportEnabled && game.user.isGM && options.editable) {
            const title = game.i18n.localize("BABELE.TranslateActorHeadBtn");
            appendHeaderButton($html[0], title, () => {
                game.babele.translateActor(app.actor);
            });
        }
    });

    Hooks.on("renderCompendium", (app, $html, options) => {
        const html = $html[0];
        const exportEnabled = game.settings.get("babele", "export");
        if (game.user.isGM && exportEnabled) {
            const title = game.i18n.localize("BABELE.CompendiumTranslations");
            appendHeaderButton(html, title, () => {
                game.babele.exportTranslationsFile(app.collection);
            });
        }

        if (
            game.settings.get("babele", "showOriginalName") &&
            R.isObject<{ index: CompendiumIndexData[] }>(options) &&
            "index" in options
        ) {
            for (const element of html.querySelectorAll(
                ".directory-list .entry-name, .directory-list .document-name"
            )) {
                if (!(element instanceof HTMLElement)) return;
                const entry = element.textContent?.length
                    ? options.index.find((i) => i.name === element.textContent)
                    : null;

                if (entry && entry.translated && entry.hasTranslation) {
                    const entryNameText = element.querySelector(".entry-name > a, .document-name > a");
                    if (!entryNameText) continue;
                    element.setAttribute("style", "display: flex; flex-direction: column;");
                    entryNameText.setAttribute("style", "line-height: normal; padding-top: 10px;");
                    entryNameText.innerHTML += `<div style="line-height: normal; font-size: 12px; color: gray;">${entry.originalName}</div>`;
                }
            }
        }
    });

    Hooks.on("importAdventure", () => {
        for (const scene of game.scenes) {
            const tokenUpdates: EmbeddedDocumentUpdateData[] = [];
            for (const token of scene.tokens) {
                const actor = game.actors.get(token.actorId ?? "");
                if (actor) {
                    tokenUpdates.push({
                        _id: token.id,
                        name: actor.name,
                    });
                }
            }
            scene.updateEmbeddedDocuments("Token", tokenUpdates);
        }
    });

    Hooks.callAll("babele.ready");
});
