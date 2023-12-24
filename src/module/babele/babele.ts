import * as R from "remeda";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import {
    Converters,
    ExportTranslationsDialog,
    OnDemandTranslationDialog,
    TranslatedCompendium,
    type TranslateOptions,
} from "@module";
import { JSONstringifyOrder, collectionFromMetadata } from "@util";
import { DEFAULT_MAPPINGS, SUPPORTED_PACKS } from "./values.ts";
import type { BabeleModule, TranslatableData, Translation, SupportedType } from "./types.ts";

class Babele {
    static DEFAULT_MAPPINGS = DEFAULT_MAPPINGS;
    static SUPPORTED_PACKS = SUPPORTED_PACKS;

    #systemFolders: Record<string, string> = {};
    #systemTranslationsDir: string | null = null;
    #initialized = false;

    modules: BabeleModule[] = [];
    converters: Record<string, Function> = {};
    translations = new Map<string, Translation>();
    packs = new Collection<TranslatedCompendium>();

    constructor() {
        this.#registerDefaultConverters();
    }

    static get(): Babele {
        return (game.babele ??= new Babele());
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

    register(mod: BabeleModule): void {
        mod.priority ??= 100;
        this.modules.push(mod);
    }

    registerConverters(converters: Record<string, Function>): void {
        this.converters = fu.mergeObject(this.converters, converters);
    }

    supported(type?: SupportedType): boolean {
        if (!type) return false;
        return Babele.SUPPORTED_PACKS.includes(type);
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
                this.translateIndex(pack.index.contents, pack.collection).map((i) => [i._id, i])
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
        { translationsOnly }: TranslateOptions = {}
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
        data: TranslatableData
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

        if (game.user.isGM) {
            await game.settings.set("babele", "translationFiles", []);
        }
        const lang = game.settings.get("core", "language");
        const babeleDirectory = game.settings.get("babele", "directory");
        const directories: Promise<void>[] = [];
        const allFiles: string[] = [];
        const zips: Promise<void>[] = [];
        const unsortedTransaltions = new Map<number, Translation[]>();
        const trimmed = babeleDirectory?.trim?.();
        if (trimmed) {
            directories.push(this.#loadFromDirectory(trimmed, unsortedTransaltions, 100, allFiles));
        }
        if (this.#systemTranslationsDir) {
            directories.push(
                this.#loadFromDirectory(
                    `systems/${game.system.id}/${this.#systemTranslationsDir}/${lang}`,
                    unsortedTransaltions,
                    100,
                    allFiles
                )
            );
        }
        for (const mod of this.modules.filter((m) => m.lang === lang)) {
            if (mod.zipFile) {
                zips.push(this.#extractTranslation(mod, unsortedTransaltions, mod.priority));
                continue;
            }
            directories.push(
                this.#loadFromDirectory(
                    `modules/${mod.module}/${mod.dir}`,
                    unsortedTransaltions,
                    mod.priority,
                    allFiles
                )
            );
        }
        // No translation available
        if (directories.length === 0 && zips.length === 0) {
            return;
        }
        // Process indiviual files
        if (directories.length > 0) {
            await Promise.all(directories);

            if (game.user.isGM) {
                game.settings.set("babele", "translationFiles", allFiles);
            }
        }
        // Process zips
        if (zips.length > 0) {
            await Promise.all(zips);
        }

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

    async #extractTranslation(
        mod: BabeleModule,
        translationsMap: Map<number, Translation[]>,
        priority: number
    ): Promise<void> {
        const zipPath = `modules/${mod.module}/${mod.dir}/${mod.zipFile}`;
        console.log(`Babele | Fetching translation zip file from: ${zipPath}`);
        const response = await fetch(zipPath);
        if (response.ok) {
            const start = performance.now();
            const blob = await response.blob();
            console.log("Babele | Processing translation zip file");
            try {
                const reader = new ZipReader(new BlobReader(blob));
                const entries = await reader.getEntries();
                const fileContents: Promise<string>[] = [];
                const collections: string[] = [];
                for (const entry of entries) {
                    if (entry.filename.endsWith(".json")) {
                        const collection = entry.filename.substring(0, entry.filename.lastIndexOf("."));
                        const pack = game.packs.get(collection);
                        if (collection.endsWith("_packs-folders") || this.supported(pack?.metadata.type)) {
                            const text = entry.getData?.(new TextWriter());
                            if (text) {
                                collections.push(collection);
                                fileContents.push(text);
                            }
                        }
                    }
                }
                const results = await Promise.all(fileContents);
                for (const [index, text] of results.entries()) {
                    const collection = collections[index];
                    try {
                        const newTranslation = JSON.parse(text) as Translation;
                        newTranslation.collection ??= collection;
                        if (translationsMap.has(priority)) {
                            const current = translationsMap.get(priority)!;
                            current.push(newTranslation);
                        } else {
                            translationsMap.set(priority, [newTranslation]);
                        }
                        console.log(`Babele | Translation for ${collection} pack successfully loaded`);
                    } catch (err) {
                        if (err instanceof Error) {
                            console.error(`Babele | Translation for ${collection} could not be parsed: ${err.message}`);
                        }
                    }
                }
                const c = results.length;
                console.log(
                    `Babele | ${c} ${c === 0 ? "translation" : "translations"} extracted in ${
                        performance.now() - start
                    }ms`
                );
            } catch (err) {
                if (err instanceof Error) {
                    console.error(`Babele | Error loading zip file at "${zipPath}": ${err.message}`);
                }
            }
        }
    }

    async #loadFromDirectory(
        directory: string,
        translationsMap: Map<number, Translation[]>,
        priority: number,
        allFiles: string[]
    ): Promise<void> {
        console.log(`Babele | Fetching translation files from "${directory}"`);
        const filesFromDirectory = async (directory: string) => {
            if (!game.user.hasPermission("FILES_BROWSE" as unknown as UserPermission)) {
                return game.settings.get("babele", "translationFiles").filter((path) => path.startsWith(directory));
            }
            const result = (await FilePicker.browse("data", directory, { extensions: [".json"] })) as {
                files: string[];
            };
            return result.files;
        };

        const files = await filesFromDirectory(directory);
        allFiles.push(...files);
        const fileContents = await this.#getJSONContent(files);
        for (const [collection, translation] of fileContents) {
            translation.collection ??= collection;
            if (translationsMap.has(priority)) {
                const current = translationsMap.get(priority)!;
                current.push(translation);
            } else {
                translationsMap.set(priority, [translation]);
            }
        }
    }

    async #getJSONContent(files: string[]): Promise<[string, Translation][]> {
        const collections: string[] = [];
        const contents: Promise<Translation>[] = [];
        for (const file of files) {
            const response = await fetch(file);
            if (response.ok) {
                const collection = file.substring(file.lastIndexOf("/") + 1, file.lastIndexOf("."));
                const pack = game.packs.get(collection);
                if (collection.endsWith("_packs-folders") || this.supported(pack?.metadata.type)) {
                    contents.push(response.json());
                    collections.push(collection);
                    console.log(`Babele | Loading translation for: ${collection}`);
                }
            }
        }
        const results = await Promise.allSettled(contents);
        return results.flatMap((result, index) => {
            const collection = collections[index];
            if (result.status === "rejected") {
                console.error(`Babel | Error parsing file for ${collection}:`, result.reason);
                return [];
            }
            return [[collection, result.value]];
        });
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
}

type ModuleFiles = { module: BabeleModule; files: string[] };

export { Babele };
export type { ModuleFiles };
