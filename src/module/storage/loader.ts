import { Babele } from "@module";
import { BabeleModule, Translation } from "@module/babele/types.ts";
import { babeleLog, isSupportedType } from "@util";
import { BabeleDB } from "./database.ts";

/** Handles loading of the available translations either from the local
 *  IndexedDB or from the server
 */
class BabeleLoader {
    /** A Dexie instance */
    #db: BabeleDB;
    /** The currently set user language */
    #lang: string;
    /** A list of active modules for the current language */
    #modules: BabeleModule[];
    /** A convenience accessor for module priority */
    #priorities = new Map<string, number>();
    /** A map of translations grouped by priority */
    #priorityMap = new Map<number, Translation[]>();
    /** A list of all files that were loaded */
    #allFiles: string[] = [];

    constructor({ lang, modules }: BabeleLoaderParams) {
        this.#lang = lang;
        this.#modules = modules;
        for (const mod of modules) {
            this.#priorities.set(mod.id || mod.module, mod.priority);
        }
        this.#db = new BabeleDB();
    }

    /** Load translations from the local DB or from the server */
    async loadTranslations(): Promise<Map<number, Translation[]> | null> {
        this.#priorityMap.clear();

        const babeleDirectory = game.settings.get("babele", "directory");
        const directories: Promise<{ id?: string; translations: Translation[] }>[] = [];
        const trimmed = babeleDirectory?.trim?.();
        if (trimmed) {
            directories.push(this.#loadFromDirectory({ directory: trimmed, priority: 100 }));
        }
        if (Babele.systemTranslationsDir) {
            directories.push(
                this.#loadFromDirectory({
                    directory: `systems/${game.system.id}/${Babele.systemTranslationsDir}/${this.#lang}`,
                    priority: 100,
                }),
            );
        }
        await this.#db.init();

        for (const mod of this.#modules) {
            const moduleId = mod.id || mod.module;
            const dbData = await this.#db.getModuleData(moduleId);
            if (dbData) {
                const priority = this.#priorities.get(moduleId) ?? 100;
                this.#addToPriorityMap(priority, dbData.translations);
                continue;
            }
            for (const dir of mod.dir) {
                directories.push(
                    this.#loadFromDirectory({
                        directory: `modules/${mod.module}/${dir}`,
                        moduleId,
                        priority: mod.priority,
                    }),
                );
            }
        }

        // Process indiviual files
        if (directories.length > 0) {
            const results = await Promise.all(directories);
            for (const result of results) {
                if (!result.id) continue;
                await this.#db.saveModuleData(result.id, result.translations);
            }

            // Set the world setting for users that don't have file browse permissions
            if (game.user.isGM) {
                game.settings.set("babele", "translationFiles", this.#allFiles);
            }
        }
        this.#db.close();

        const total = [...this.#priorityMap.values()].reduce(
            (cnt: number, current: Translation[]) => (cnt += current.length),
            0,
        );

        // No translation available
        if (total === 0) {
            return null;
        }

        return this.#priorityMap;
    }

    /** Load all JSON files from one provided directory */
    async #loadFromDirectory({
        directory,
        moduleId,
        priority,
    }: LoadFromDirectoryParams): Promise<{ id?: string; translations: Translation[] }> {
        babeleLog(`Fetching translation files from "${directory}"`);
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
        this.#allFiles.push(...files);
        const fileContents = await this.#getJSONContent(files);
        const moduleTranslations: Translation[] = [];
        for (const [collection, translation] of fileContents) {
            moduleTranslations.push(translation);
            translation.collection ??= collection;
            this.#addToPriorityMap(priority, translation);
        }

        return { id: moduleId, translations: moduleTranslations };
    }

    /** Extract JSON content of provided files */
    async #getJSONContent(files: string[]): Promise<[string, Translation][]> {
        const collections: string[] = [];
        const contents: Promise<Translation>[] = [];
        for (const file of files) {
            const response = await fetch(file);
            if (response.ok) {
                const collection = file.substring(file.lastIndexOf("/") + 1, file.lastIndexOf("."));
                const pack = game.packs.get(collection);
                if (collection.endsWith("_packs-folders") || isSupportedType(pack?.metadata.type)) {
                    contents.push(response.json());
                    collections.push(collection);
                    babeleLog(`Loading translation for: ${collection}`);
                }
            }
        }
        const results = await Promise.allSettled(contents);
        return results.flatMap((result, index) => {
            const collection = collections[index];
            if (result.status === "rejected") {
                babeleLog(`Error parsing file for ${collection}:`, { error: true });
                console.error(result.reason);
                return [];
            }
            return [[collection, result.value]];
        });
    }

    /** Group translations by priority in a Map */
    #addToPriorityMap(priority: number, translation: Translation | Translation[]): void {
        if (this.#priorityMap.has(priority)) {
            const current = this.#priorityMap.get(priority)!;
            if (Array.isArray(translation)) {
                current.push(...translation);
            } else {
                current.push(translation);
            }
        } else {
            if (Array.isArray(translation)) {
                this.#priorityMap.set(priority, translation);
            } else {
                this.#priorityMap.set(priority, [translation]);
            }
        }
    }
}

interface BabeleLoaderParams {
    lang: string;
    modules: BabeleModule[];
}

interface LoadFromDirectoryParams {
    directory: string;
    moduleId?: string;
    priority: number;
}

export { BabeleLoader };
