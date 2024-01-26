import { Dexie, type Table } from "dexie";
import { Translation } from "@module/babele/types.ts";
import { babeleLog } from "@util";

class BabeleDB extends Dexie {
    /** The module data table */
    declare modules: Table<StoredModule, number>;
    /** Whether the cache was already validated */
    #isValidated = false;
    /** A `Map` of modules that were retrieved from the `IndexedDB` */
    #cachedModules = new Map<string, StoredModule>();

    constructor() {
        super("BabeleDB");
        this.version(1).stores({
            modules: "++id, systemId",
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
            babeleLog("All stored translations were successfully deleted from the database.");
        } catch (e) {
            if (e instanceof Error) {
                babeleLog(`Failed to clear database: ${e.stack || e}`, { error: true });
            }
        }
    }

    /** Gets module data from the DB if the module version is still the same */
    async getModuleData(moduleId: string): Promise<StoredModule | null> {
        await this.#validateCache();

        // Deep clone to dereference the cache data
        const data = fu.deepClone(this.#cachedModules.get(moduleId));
        if (!data) return null;
        for (const translation of data.translations) {
            babeleLog(`Retrieved translation for: ${translation.collection}.`);
        }
        return data;
    }

    /** Saves module data to the DB */
    async saveModuleData(moduleId: string, translations: Translation[]): Promise<void> {
        await this.#validateCache();

        const currentVersion = game.modules.get(moduleId)?.version;
        if (!currentVersion) {
            babeleLog(`Error while saving module data: Could not find version for module "${moduleId}"!`);
            return;
        }
        const existing = this.#cachedModules.get(moduleId);
        try {
            if (existing?.id) {
                // Some modules register multiple times with different folders. Store everything in one entry
                await this.modules.update(existing.id, {
                    translations: existing.translations.concat(translations),
                    worlds: [...new Set(existing.worlds.concat(game.world.id))],
                });
            } else {
                await this.modules.put({
                    moduleId,
                    systemId: game.system.id,
                    translations,
                    version: currentVersion,
                    worlds: [game.world.id],
                });
            }

            babeleLog(`Translations from module "${moduleId}" were saved to the local database.`);
        } catch (e) {
            if (e instanceof Error) {
                babeleLog(`Failed to write to database: ${e.stack || e}`, { error: true });
            }
        }
    }

    /** Validates cached data, performing updates and deletions as needed */
    async #validateCache(): Promise<void> {
        if (this.#isValidated) return;

        try {
            // Load all stored module data for the current system
            const data = await this.modules.where("systemId").equals(game.system.id).toArray();
            const worldId = game.world.id;
            const toDelete: number[] = [];

            for (const mod of data) {
                const currentVersion = game.modules.get(mod.moduleId)?.version;

                // Module version changed. Cache is invalid for all worlds
                if (currentVersion && currentVersion !== mod.version && mod.id) {
                    toDelete.push(mod.id);
                    babeleLog(`Version mismatch for module "${mod.moduleId}". The database entry will be deleted.`);
                    continue;
                }
                // Module is no longer active in this world
                if (!currentVersion && mod.worlds.includes(worldId) && mod.id) {
                    if (mod.worlds.length === 1) {
                        toDelete.push(mod.id);
                        babeleLog(`Deleting database entry for missing module: ${mod.moduleId}.`);
                    } else {
                        await this.modules.update(mod.id, { worlds: mod.worlds.filter((w) => w !== worldId) });
                        babeleLog(`Removed world from database entry for module: ${mod.moduleId}.`);
                    }
                    continue;
                }
                // Module was newly activated in this world
                if (currentVersion && currentVersion === mod.version && !mod.worlds.includes(worldId) && mod.id) {
                    await this.modules.update(mod.id, { worlds: mod.worlds.concat(worldId) });
                    babeleLog(`Added world to database entry for module: ${mod.moduleId}.`);
                }

                this.#cachedModules.set(mod.moduleId, mod);
            }

            if (toDelete.length > 0) {
                await this.modules.bulkDelete(toDelete);
                babeleLog(`Deleted ${toDelete.length} stale database ${toDelete.length === 1 ? "entry" : "entries"}.`);
            }

            this.#isValidated = true;
        } catch (e) {
            if (e instanceof Error) {
                babeleLog(`Failed to load from database: ${e.stack || e}`, { error: true });
            }
        }
    }
}

interface StoredModule {
    /** Auto-incremented database id */
    id?: number;
    /** The module id */
    moduleId: string;
    /** The system id */
    systemId: string;
    /** Translation data from this module */
    translations: Translation[];
    /** The module version */
    version: string;
    /** An array of world ids where this module is active */
    worlds: string[];
}

export { BabeleDB };
