import * as R from "remeda";
import { Converters, ExportTranslationsDialog, OnDemandTranslationDialog, TranslatedCompendium } from "@modules";
import type { TranslateOptions } from "@modules/translated-compendium/translated-compendium.ts";
import { JSONstringifyOrder, collectionFromMetadata } from "@util";
import { DEFAULT_MAPPINGS, PACK_FOLDER_TRANSLATION_NAME_SUFFIX, SUPPORTED_PACKS } from "./values.ts";
import type { FolderSchema } from "types/foundry/common/documents/folder.js";
import type { BabeleModule, TranslatableData, Translation } from "./types.ts";

class Babele {
    static DEFAULT_MAPPINGS = DEFAULT_MAPPINGS;
    static PACK_FOLDER_TRANSLATION_NAME_SUFFIX = PACK_FOLDER_TRANSLATION_NAME_SUFFIX;
    static SUPPORTED_PACKS = SUPPORTED_PACKS;

    modules: BabeleModule[] = [];
    converters: Record<string, Function> = {};
    translations = new Map<string, Translation>();
    systemTranslationsDir: string | null = null;
    initialized = false;

    declare packs: Collection<TranslatedCompendium>;
    declare folders: SourceFromSchema<FolderSchema>[];

    constructor() {
        this.registerDefaultConverters();
    }

    static get(): Babele {
        return (game.babele ??= new Babele());
    }

    /** Register the default provided converters. */
    registerDefaultConverters(): void {
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
        this.converters = mergeObject(this.converters, converters);
    }

    supported(pack: CompendiumMetadata): boolean {
        return Babele.SUPPORTED_PACKS.includes(pack.type);
    }

    setSystemTranslationsDir(dir: string): void {
        this.systemTranslationsDir = dir;
    }

    /**
     * Initialize babele downloading the available translations files and instantiating the associated
     * translated compendium class.
     */
    async init(): Promise<void> {
        if (this.translations.size === 0) {
            await this.loadTranslations();
        }

        this.packs = new Collection();

        const addTranslations = (metadata: CompendiumMetadata) => {
            const collection = collectionFromMetadata(metadata);

            if (this.supported(metadata)) {
                const translation = this.translations.get(collection);
                this.packs.set(collection, new TranslatedCompendium(metadata, translation));
            }
        };

        for (const metadata of game.data.packs) {
            addTranslations(metadata);
        }

        // Handle specific files for pack folders
        this.folders = game.data.folders;
        if (this.folders) {
            const moduleFiles = await this.#getTranslationFiles();

            // Handle specific files for pack folders
            for (const file of this.#getFiles(
                moduleFiles,
                Babele.PACK_FOLDER_TRANSLATION_NAME_SUFFIX.concat(".json")
            )) {
                addTranslations(this.#getSpecialPacksFoldersMetadata(file.split("/").pop() ?? ""));
            }
        }

        this.initialized = true;
        Hooks.callAll("babele.ready");
    }

    /**
     * Find and download the translation files for each compendium present on the world.
     * Verify the effective presence of each file using the FilePicker API.
     */
    async loadTranslations(): Promise<void> {
        this.translations.clear();
        const moduleFiles = await this.#getTranslationFiles();

        if (moduleFiles.reduce((count, data) => count + data.files.length, 0) === 0) {
            console.log(
                `Babele | no compendium translation files found for ${game.settings.get("core", "language")} language.`
            );
            return;
        }

        const loadTranslations = async (collection: string, urls: string[]) => {
            if (urls.length === 0) {
                console.log(`Babele | no translation file found for ${collection} pack`);
            } else {
                const translations = await Promise.all(
                    (await Promise.all(urls.map((url) => fetch(url)))).flatMap((response) => {
                        if (response.ok) {
                            try {
                                return response.json() as Promise<Translation>;
                            } catch (err) {
                                console.warn(err);
                            }
                        }
                        return [];
                    })
                );
                const translation = translations.at(0);
                if (translation) {
                    this.translations.set(collection, mergeObject(translation, { collection: collection }));
                    console.log(`Babele | translation for ${collection} pack successfully loaded`);
                }
            }
        };

        for (const metadata of game.data.packs) {
            if (this.supported(metadata)) {
                const collection = collectionFromMetadata(metadata);
                const collectionFileName = encodeURI(collection.concat(".json"));
                const urls = this.#getFiles(moduleFiles, collectionFileName);
                await loadTranslations(collection, urls);
            }
        }

        // Handle specific files for pack folders
        for (const file of this.#getFiles(moduleFiles, Babele.PACK_FOLDER_TRANSLATION_NAME_SUFFIX.concat(".json"))) {
            const fileName = file.split("/").pop() ?? "";
            await loadTranslations(fileName.replace(".json", ""), [file]);
        }
    }

    /**
     * Translate & sort the compendium index.
     *
     * @param index the untranslated index
     * @param pack the pack name
     */
    translateIndex(index: CompendiumIndexData[], pack: string): TranslatableData[] {
        const prevIndex = game.packs.get(pack)?.index;
        const lang = game.settings.get("core", "language") ?? "en";
        const collator = new Intl.Collator(Intl.Collator.supportedLocalesOf([lang]).length > 0 ? lang : "en");
        return index
            .flatMap((data) => {
                if (!prevIndex?.get(data._id)?.translated) {
                    return this.translate(pack, data) ?? data;
                }
                return [];
            })
            .sort((a, b) => {
                return collator.compare(a.name, b.name);
            });
    }

    /**
     * Check if the compendium pack is translated
     * @param pack compendium name (ex. dnd5e.classes)
     */
    isTranslated(pack: string): boolean {
        if (!this.initialized) return false;
        const tc = this.packs.get(pack);
        return !!tc?.translated;
    }

    translate(pack: string, data: TranslatableData, { translationsOnly }: TranslateOptions = {}): TranslatableData {
        const tc = this.packs.get(pack);
        if (!tc || !(tc.hasTranslation(data) || tc.mapping.isDynamic())) {
            return data;
        }
        return tc.translate(data, { translationsOnly }) ?? data;
    }

    translateField(
        field: string,
        pack: string,
        data: Partial<TranslatableData>
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
            const id = doc.uuid;
            const extracted = this.extract(collection, doc as TranslatableData);
            for (const [key, value] of Object.entries(extracted)) {
                if (value === "") {
                    delete extracted[key];
                }
            }
            if (Array.isArray(file.entries)) {
                file.entries.push(mergeObject({ id }, extracted));
            } else if (R.isObject(file.entries)) {
                file.entries[id] = extracted;
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

    translatePackFolders(pack: CompendiumCollection): void {
        if (!pack?.folders?.size) {
            return;
        }

        const tcFolders = this.packs.get(pack.metadata.id)?.folders ?? {};

        for (const folder of pack.folders) {
            folder.name = tcFolders[folder.name] ?? folder.name;
        }
    }

    translateSystemPackFolders(): void {
        if (!game.data.folders?.length) {
            return;
        }

        const translations: Record<string, string> = {};
        for (const pack of this.packs) {
            if (pack.metadata.name !== Babele.PACK_FOLDER_TRANSLATION_NAME_SUFFIX) {
                continue;
            }
            mergeObject(translations, pack.translationsObject, { inplace: true });
        }

        for (const folder of game.folders) {
            folder.name = translations[folder.name] ?? folder.name;
        }
    }

    async #getTranslationFiles(): Promise<ModuleFiles[]> {
        if (!game.user.hasPermission("FILES_BROWSE" as unknown as UserPermission)) {
            return game.settings.get("babele", "translationFiles");
        }

        const lang = game.settings.get("core", "language");
        const directory = game.settings.get("babele", "directory");
        const moduleFiles: ModuleFiles[] = [];
        for (const mod of this.modules.filter((m) => m.lang === lang)) {
            const directories = [`modules/${mod.module}/${mod.dir}`];

            if (directory && directory.trim && directory.trim()) {
                directories.push(`${directory}/${lang}`);
            }
            if (this.systemTranslationsDir) {
                directories.push(`systems/${game.system.id}/${this.systemTranslationsDir}/${lang}`);
            }

            const files: string[] = [];
            for (const dir of directories) {
                try {
                    const result = (await FilePicker.browse("data", dir)) as { files: string[] };
                    files.push(...result.files);
                } catch (err) {
                    console.warn(err);
                }
            }
            moduleFiles.push({ priority: mod.priority ?? 100, files });
        }

        if (game.user.isGM) {
            game.settings.set("babele", "translationFiles", moduleFiles);
        }

        return moduleFiles.sort((a, b) => b.priority - a.priority);
    }

    /** Get first match from module files. The `moduleFiles` array comes pre-sorted by priority */
    #getFiles(moduleFiles: ModuleFiles[], fileName: string): string[] {
        for (const data of moduleFiles) {
            const files = data.files.filter((f) => f.endsWith(fileName));
            if (files.length > 0) {
                return files;
            }
        }
        return [];
    }

    #getSpecialPacksFoldersMetadata(file: string) {
        const [packageName, name] = file.split(".");

        return {
            packageType: "system",
            type: "Folder",
            packageName,
            name,
        } as unknown as CompendiumMetadata;
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

type ModuleFiles = { priority: number; files: string[] };

export { Babele };
export type { ModuleFiles };
