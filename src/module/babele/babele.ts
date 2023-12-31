import * as R from "remeda";
import {
    Converters,
    ExportTranslationsDialog,
    OnDemandTranslationDialog,
    TranslatedCompendium,
    type TranslateOptions,
} from "@module";
import { JSONstringifyOrder, collectionFromMetadata } from "@util";
import { DEFAULT_MAPPINGS, SUPPORTED_PACKS } from "./values.ts";
import type { BabeleModule, MaybeOldModuleData, TranslatableData, Translation } from "./types.ts";
import { BabeleDB, BabeleLoader } from "@module/storage/index.ts";

class Babele {
    static DEFAULT_MAPPINGS = DEFAULT_MAPPINGS;
    static SUPPORTED_PACKS = SUPPORTED_PACKS;

    #systemFolders: Record<string, string> = {};
    #systemTranslationsDir: string | null = null;
    #initialized = false;
    #modules = new Map<string, BabeleModule>();

    converters: Record<string, Function> = {};
    translations = new Map<string, Translation>();
    packs = new Collection<TranslatedCompendium>();

    constructor() {
        this.#registerDefaultConverters();
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

    registerConverters(converters: Record<string, Function>): void {
        this.converters = fu.mergeObject(this.converters, converters);
    }

    setSystemTranslationsDir(dir: string): void {
        this.#systemTranslationsDir = dir;
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
            this.packs.set(collection, new TranslatedCompendium(metadata, translation));
            pack.index = new Collection<CompendiumIndexData>(
                this.translateIndex(pack.index.contents, pack.collection).map((i) => [i._id, i]),
            );
            this.#translatePackFolders(pack);
        }
        console.log(`Babele | Translated ${game.babele.translations.size} indices in ${performance.now() - start}ms`);

        // Translate compendium sidebar folder names
        if (game.data.folders) {
            for (const folder of game.folders) {
                const folderName = this.#systemFolders[folder.name];
                if (!folderName) continue;
                folder.name = folderName;
            }
        }

        return (this.#initialized = true);
    }

    /**
     * Translate & sort the compendium index
     *
     * @param index The untranslated index
     * @param collection The pack name
     */
    translateIndex(index: CompendiumIndexData[], collection: string): TranslatableData[] {
        const lang = game.settings.get("core", "language") ?? "en";
        const collator = new Intl.Collator(Intl.Collator.supportedLocalesOf([lang]).length > 0 ? lang : "en");
        return index
            .map((data) => this.translate(collection, data) ?? data)
            .sort((a, b) => {
                return collator.compare(a.name, b.name);
            });
    }

    translate(pack: string, data: TranslatableData, options?: { translationsOnly?: false }): TranslatableData;
    translate(pack: string, data: TranslatableData, options?: { translationsOnly?: true }): Record<string, unknown>;
    translate(
        pack: string,
        data: TranslatableData,
        { translationsOnly }: TranslateOptions = {},
    ): TranslatableData | Record<string, unknown> {
        const tc = this.packs.get(pack);
        if (!tc || !(tc.hasTranslation(data) || tc.mapping.isDynamic())) {
            return data;
        }
        return tc.translate(data, { translationsOnly }) ?? data;
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
        if (!(tc.hasTranslation(data) || tc.mapping.isDynamic())) {
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
            mapping: mapping?.mapping,
        };
        const documents = await pack.getDocuments();
        for (const doc of documents) {
            const name = String(doc.flags.babele?.originalName ?? doc.name);
            const extracted = this.extract(collection, doc.toObject() as unknown as TranslatableData);
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

    async #loadTranslations(): Promise<void> {
        this.translations.clear();
        const start = performance.now();

        const lang = game.settings.get("core", "language");
        const modules = this.modules.filter((m) => m.lang === lang);
        const loader = new BabeleLoader({ lang, modules, systemTranslationsDir: this.#systemTranslationsDir });
        const unsortedTransaltions = await loader.loadTranslations();
        if (!unsortedTransaltions) return;

        // Sort and merge translations by priority
        const sorted = [...unsortedTransaltions.entries()].sort((a, b) => a[0] - b[0]);
        for (const [_priority, translations] of sorted) {
            for (const translation of translations) {
                const { collection } = translation;
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

        console.log(`Babele | Translations loaded in ${performance.now() - start}ms`);
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
