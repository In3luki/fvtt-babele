import { Babele, CompendiumMapping, Converters, FieldMapping } from "@module";
import { TranslatableData } from "@module/babele/types.ts";
import { appendHeaderButton, babeleLog, htmlQueryAll } from "@util";
import * as R from "remeda";

// Expose classes
globalThis.Babele = Babele;
globalThis.CompendiumMapping = CompendiumMapping;
globalThis.Converters = Converters;
globalThis.FieldMapping = FieldMapping;

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
});

Hooks.once("libWrapper.Ready", () => {
    libWrapper.register(
        "babele",
        "CONFIG.DatabaseBackend._getDocuments",
        async function (
            wrapped: ClientDatabaseBackend["_getDocuments"],
            documentClass: typeof foundry.abstract.Document,
            context: DatabaseBackendGetContext,
            user: User,
        ) {
            const result = await wrapped(documentClass, context, user);
            const pack = context.pack;
            const options = context.options;

            if (!pack || !game.babele.initialized) {
                return result;
            }

            if (options?.index) {
                return game.babele.translateIndex(result as CompendiumIndexData[], pack);
            } else {
                return (result as CompendiumDocument[]).map((doc) => {
                    const source = doc.toObject() as TranslatableData;
                    // Work around some documents not having a sourceId flag
                    // The uuid property will be filtered out by the DataModel after translation
                    if (!source.flags?.core?.sourceId) {
                        source.uuid = doc.uuid;
                    }
                    return documentClass.fromSource(game.babele.translate(pack, source), { pack });
                });
            }
        },
        "WRAPPER",
    );
});

Hooks.once("ready", async () => {
    if (!game.modules.get("lib-wrapper")?.active && game.user.isGM) {
        ui.notifications.error(game.i18n.localize("BABELE.requireLibWrapperMessage"));
    }
    // Initialize game.babele in case no module was registered before this point
    Babele.initGame();
    const success = await game.babele.init();
    if (!success) {
        babeleLog(`No compendium translations found for "${game.settings.get("core", "language")}" language.`);
        libWrapper.unregister_all("babele");
        Hooks.callAll("babele.ready");
        return;
    }

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
            R.isObject<{ index: TranslatableData[] }>(options) &&
            "index" in options
        ) {
            for (const element of htmlQueryAll(html, ".directory-list .entry-name, .directory-list .document-name")) {
                const entry = element.textContent?.length
                    ? options.index.find((i) => i.name === element.textContent)
                    : null;
                const translated = !!entry?.flags?.babele?.translated;
                const hasTranslation = !!entry?.flags?.babele?.hasTranslation;
                if (translated && hasTranslation) {
                    const entryNameText = element.querySelector(".entry-name > a, .document-name > a");
                    if (!entryNameText) continue;
                    element.setAttribute("style", "display: flex; flex-direction: column;");
                    entryNameText.setAttribute("style", "line-height: normal; padding-top: 10px;");
                    entryNameText.innerHTML += `<div style="line-height: normal; font-size: 12px; color: gray;">${entry.flags?.babele?.originalName}</div>`;
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
