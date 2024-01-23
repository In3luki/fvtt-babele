import { Dexie, type Table } from "dexie";
import { Translation } from "@module/babele/types.ts";

class BabeleDB extends Dexie {
    /** The module data table */
    declare modules: Table<StoredModule, number>;
    /** Whether the cache was already validated */
    #isCacheValidated = false;
    /** A `Map` of modules that were retrieved from the `IndexedDB` */
    #cachedModules = new Map<string, StoredModule>();

    constructor() {
        super("BabeleDB");
        this.version(1).stores({
            modules: "++id, name, system",
        });
    }

    /** Deletes all stored data */
    static async clear(): Promise<void> {
        const db = new this();
        try {
            if (!db.isOpen) {
                await db.open();
            }
            await db.modules.clear();
            db.close();
            console.log("Babele: All stored translations were successfully deleted from the database.");
        } catch (e) {
            if (e instanceof Error) {
                console.error(`Failed to clear database: ${e.stack || e}`);
            }
        }
    }

    /** Gets module data from the DB if the module version is still the same */
    async getModuleData(moduleName: string): Promise<StoredModule | null> {
        if (!this.#isCacheValidated) {
            await this.#validateCache();
        }
        // Deep clone to dereference the cache data
        const data = fu.deepClone(this.#cachedModules.get(moduleName));
        if (!data) return null;
        for (const translation of data.translations) {
            console.log(`Babele: Retrieved translation for: ${translation.collection}.`);
        }
        return data;
    }

    /** Saves module data to the DB */
    async saveModuleData(moduleName: string, translations: Translation[]): Promise<void> {
        const currentVersion = game.modules.get(moduleName)?.version;
        if (!currentVersion) {
            console.error(`Babele: Error while saving module data: Could not find version for module "${moduleName}"!`);
            return;
        }
        const existing = await this.modules.where("name").equals(moduleName).first();
        if (existing?.id) {
            await this.modules.update(existing.id, {
                translations: existing.translations.concat(translations),
                worlds: [...new Set(existing.worlds.concat(game.world.id))],
            });
        } else {
            await this.modules.put({
                name: moduleName,
                system: game.system.id,
                translations,
                version: currentVersion,
                worlds: [game.world.id],
            });
        }

        console.log(`Babele: Translations from module "${moduleName}" were saved to the local database.`);
    }

    /** Validates cached data, performing updates and deletions as needed */
    async #validateCache(): Promise<void> {
        // Load all stored module data for the current system
        const data = await this.modules.where("system").equals(game.system.id).toArray();
        const worldId = game.world.id;
        const toDelete: number[] = [];

        for (const mod of data) {
            const currentVersion = game.modules.get(mod.name)?.version;

            // Module version changed. Cache is invalid for all worlds
            if (currentVersion && currentVersion !== mod.version && mod.id) {
                toDelete.push(mod.id);
                console.log(`Babele: Version mismatch for module "${mod.name}". The database entry will be deleted.`);
                continue;
            }
            // Module is no longer active in this world
            if (!currentVersion && mod.worlds.includes(worldId) && mod.id) {
                if (mod.worlds.length === 1) {
                    toDelete.push(mod.id);
                    console.log(`Bable: Deleting database entry for missing module: ${mod.name}.`);
                } else {
                    await this.modules.update(mod.id, { worlds: mod.worlds.filter((w) => w !== worldId) });
                    console.log(`Bable: Removed world from database entry for module: ${mod.name}.`);
                }
                continue;
            }
            // Module was newly activated in this world
            if (currentVersion && currentVersion === mod.version && !mod.worlds.includes(worldId) && mod.id) {
                await this.modules.update(mod.id, { worlds: mod.worlds.concat(worldId) });
                console.log(`Bable: Added world to database entry for module: ${mod.name}.`);
            }

            this.#cachedModules.set(mod.name, mod);
        }

        if (toDelete.length > 0) {
            await this.modules.bulkDelete(toDelete);
            console.log(
                `Babele: Deleted ${toDelete.length} stale database ${toDelete.length === 1 ? "entry" : "entries"}.`,
            );
        }

        this.#isCacheValidated = true;
    }
}

interface StoredModule {
    /** Auto-incremented database id */
    id?: number;
    /** The module name */
    name: string;
    /** The system id */
    system: string;
    /** Translation data from this module */
    translations: Translation[];
    /** The module version */
    version: string;
    /** An array of world ids where this module is active */
    worlds: string[];
}

export { BabeleDB };
