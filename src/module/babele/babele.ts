import {
    Converters,
    ExportTranslationsDialog,
    OnDemandTranslationDialog,
    TranslatedCompendium,
    type TranslateOptions,
} from "@module";
import { BabeleDB, BabeleLoader } from "@module/storage/index.ts";
import { JSONstringifyOrder, babeleLog, collectionFromMetadata } from "@util";
import * as R from "remeda";
import type { BabeleModule, Converter, MaybeOldModuleData, TranslatableData, Translation } from "./types.ts";
import { DEFAULT_MAPPINGS, SUPPORTED_PACKS } from "./values.ts";

class Babele {
    static DEFAULT_MAPPINGS = DEFAULT_MAPPINGS;
    static SUPPORTED_PACKS = SUPPORTED_PACKS;
    /** System provided translations */
    static systemTranslationsDir: string | null = null;

    #systemFolders: Record<string, string> = {};
    #initialized = false;
    #modules = new Map<string, BabeleModule>();

    converters: Record<string, Converter> = {};
    translations = new Map<string, Translation>();
    packs = new Collection<TranslatedCompendium>();

    constructor() {
        this.#registerDefaultConverters();
    }

    /** Initialize `game.babele` */
    static initGame(): void {
        Babele.get();
    }

    static get(): Babele {
        return (game.babele ??= new Babele());
    }

    get modules(): readonly BabeleModule[] {
        return [...this.#modules.values()];
    }

    get initialized(): boolean {
        return this.#initialized;
    }

    /** Register the default provided converters. */
    #registerDefaultConverters(): void {
        this.registerConverters({
            fromPack: Converters.fromPack(),
            name: Converters.mappedField("name"),
            nameCollection: Converters.fieldCollection("name"),
            textCollection: Converters.fieldCollection("text"),
            tableResults: Converters.tableResults(),
            tableResultsCollection: Converters.tableResultsCollection(),
            pages: Converters.pages(),
            deckCards: Converters.deckCards(),
            playlistSounds: Converters.playlistSounds(),
            adventureItems: Converters.fromDefaultMapping("Item"),
            adventureActors: Converters.fromDefaultMapping("Actor"),
            adventureCards: Converters.fromDefaultMapping("Cards"),
            adventureJournals: Converters.fromDefaultMapping("JournalEntry"),
            adventurePlaylists: Converters.fromDefaultMapping("Playlist"),
            adventureMacros: Converters.fromDefaultMapping("Macro"),
            adventureScenes: Converters.fromDefaultMapping("Scene"),
        });
    }

    register(mod: MaybeOldModuleData): void {
        if (typeof mod.dir === "string") {
            mod.dir = [mod.dir];
        }
        mod.priority ??= 100;
        const existing = this.#modules.get(mod.module);
        if (existing) {
            existing.dir.push(...mod.dir);
            return;
        }
        this.#modules.set(mod.module, mod as BabeleModule);
    }

    registerConverters(converters: Record<string, Converter>): void {
        this.converters = fu.mergeObject(this.converters, converters);
    }

    setSystemTranslationsDir(dir: string): void {
        Babele.systemTranslationsDir = dir;
    }

    /**
     * Initialize babele downloading the available translations files and instantiating the associated
     * `TranslatedCompendium` classes
     */
    async init(): Promise<boolean> {
        if (this.initialized) {
            return true;
        }
        await this.#loadTranslations();

        // No translations loaded. Return early
        if (this.translations.size === 0) {
            return false;
        }

        // Translate compendium indices and set up TranslatedCompendium instances
        const start = performance.now();
        for (const pack of game.packs) {
            const { metadata } = pack;
            const collection = collectionFromMetadata(metadata);
            const translation = this.translations.get(collection);
            if (!translation) continue;

            this.packs.set(collection, new TranslatedCompendium(metadata, translation));
            pack.index = new Collection<CompendiumIndexData>(
                this.translateIndex(pack.index.contents, pack.collection).map((i) => [i._id, i]),
            );
            this.#translatePackFolders(pack);
        }
        babeleLog(`Translated ${game.babele.translations.size} indices in ${performance.now() - start}ms`);

        // Translate compendium sidebar folder names
        if (game.data.folders) {
            for (const folder of game.folders) {
                const folderName = this.#systemFolders[folder.name];
                if (!folderName) continue;
                folder.name = folderName;
            }
        }
        // Re-render compendium sidebar to reflect changes
        ui.compendium.render();

        return (this.#initialized = true);
    }

    async #loadTranslations(): Promise<void> {
        this.translations.clear();
        const start = performance.now();

        const lang = game.settings.get("core", "language");
        const modules = this.modules.filter((m) => m.lang === lang);
        const loader = new BabeleLoader({ lang, modules });
        const allTransaltions = await loader.loadTranslations();
        if (!allTransaltions) return;

        // Sort and merge translations by priority
        for (const [_priority, translations] of allTransaltions) {
            for (const translation of translations) {
                const collection = translation.collection;
                if (collection.endsWith("_packs-folders") && R.isObject(translation.entries)) {
                    this.#systemFolders = fu.mergeObject(this.#systemFolders, translation.entries);
                    continue;
                }
                if (this.translations.has(collection)) {
                    const current = this.translations.get(collection)!;
                    fu.mergeObject(current, translation);
                } else {
                    this.translations.set(collection, translation);
                }
            }
        }

        babeleLog(`Translations loaded in ${performance.now() - start}ms`);
    }

    /**
     * Translate & sort the compendium index
     *
     * @param index The untranslated index
     * @param collection The pack name
     */
    translateIndex(index: CompendiumIndexData[], collection: string): CompendiumIndexData[] {
        const lang = game.settings.get("core", "language") ?? "en";
        const collator = new Intl.Collator(Intl.Collator.supportedLocalesOf([lang]).length > 0 ? lang : "en");
        return index
            .map((data) => this.translate(collection, data, { index: true }) ?? data)
            .sort((a, b) => collator.compare(a.name, b.name));
    }

    translate<TData extends TranslatableData>(
        pack: string,
        data: TData,
        options?: { translationsOnly?: false; index?: boolean },
    ): TData;
    translate<TData extends TranslatableData>(
        pack: string,
        data: TData,
        options?: { translationsOnly?: true; index?: boolean },
    ): Record<string, unknown>;
    translate<TData extends TranslatableData>(
        pack: string,
        data: TData,
        options: TranslateOptions = {},
    ): TData | Record<string, unknown> {
        const tc = this.packs.get(pack);
        if (!tc) return data;
        return tc.translate(data, options) ?? data;
    }

    translateField(
        field: string,
        pack: string,
        data: TranslatableData,
    ): ReturnType<TranslatedCompendium["translateField"]> {
        const tc = this.packs.get(pack);
        if (!tc) {
            return null;
        }
        if (!(tc.hasTranslation(data) || tc.isDynamic())) {
            return tc.extractField(field, data);
        }
        return tc.translateField(field, data);
    }

    #translatePackFolders(pack: CompendiumCollection): void {
        if (!pack?.folders?.size) return;
        const tcFolders = this.packs.get(pack.metadata.id)?.folders ?? {};
        if (Object.keys(tcFolders).length === 0) return;

        for (const folder of pack.folders) {
            const translated = tcFolders[folder.name];
            if (!translated) continue;
            folder.name = translated;
        }
    }

    extract(pack: string, data: TranslatableData): Record<string, string> {
        return this.packs.get(pack)?.extract(data) ?? {};
    }

    extractField(pack: string, field: string, data: TranslatableData): unknown | null {
        return this.packs.get(pack)?.extractField(field, data) ?? null;
    }

    async exportTranslationsFile(pack: CompendiumCollection): Promise<void> {
        const data = await ExportTranslationsDialog.create(pack);
        if (!data) return;
        const collection = pack.collection;
        const mapping = this.packs.get(collection)?.mapping;
        const file: Translation = {
            collection,
            label: pack.metadata.label,
            entries: data.format === "legacy" ? [] : {},
            mapping,
        };
        const documents = await pack.getDocuments();
        for (const doc of documents) {
            const name = String(doc.flags.babele?.originalName ?? doc.name);
            const extracted = this.extract(collection, doc.toObject() as TranslatableData);
            if (Array.isArray(file.entries)) {
                file.entries.push(fu.mergeObject({ id: name }, extracted));
            } else if (R.isObject(file.entries)) {
                file.entries[name] = extracted;
            }
        }
        const blob = new Blob([JSONstringifyOrder(file)], { type: "text/json" });
        this.#saveToFile(blob, collection.concat(".json"));
    }

    translateActor(actor: Actor): void {
        new OnDemandTranslationDialog(actor).render(true);
    }

    importCompendium(_folderName: string, _compendiumName: string): void {
        console.warn("Babele#importCompendium is not implemented!");
    }

    #saveToFile(blob: Blob, filename: string): void {
        // Create an element to trigger the download
        const a = document.createElement("a");
        a.href = window.URL.createObjectURL(blob);
        a.download = filename;

        // Dispatch a click event to the element
        a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        setTimeout(() => window.URL.revokeObjectURL(a.href), 100);
    }

    async clearDB(): Promise<void> {
        BabeleDB.clear();
    }
}

type ModuleFiles = { module: BabeleModule; files: string[] };

export { Babele };
export type { ModuleFiles };
