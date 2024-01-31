import { Dexie, type Table } from "dexie";
import type { Translation } from "@module/babele/types.ts";
import { babeleLog } from "@util";

class BabeleDB extends Dexie {
    /** The module data table */
    declare modules: Table<ModuleTable, number>;
    /** The translations table */
    declare translations: Table<TranslationsTable, number>;

    constructor() {
        super("BabeleDB");
        this.version(1).stores({
            modules: "++id, [systemId+moduleId]",
            translations: "id",
        });
    }

    /** Delete all stored data */
    static async clear(): Promise<void> {
        const db = new this();
        try {
            if (!db.isOpen) {
                await db.open();
            }
            await db.modules.clear();
            await db.translations.clear();
            db.close();
            babeleLog("All stored translations were successfully deleted from the database.");
        } catch (e) {
            if (e instanceof Error) {
                babeleLog(`Failed to clear database: ${e.stack || e}`, { error: true });
            }
        }
    }

    /** Open the database and verify cached module data */
    async init(): Promise<void> {
        try {
            if (!this.isOpen) {
                await this.open();
            }
        } catch (e) {
            if (e instanceof Error) {
                babeleLog(`Failed to open database: ${e.stack || e}`, { error: true });
            }
        }

        // Verify cached data and perform updates or deletions as necessary
        const mods = await this.modules.where({ systemId: game.system.id }).toArray();
        const worldId = game.world.id;
        const deletions: Promise<void>[] = [];
        try {
            for (const mod of mods) {
                const dbId = Number(mod.id);
                const installedMod = game.modules.get(mod.moduleId);

                // Module is no longer installed
                if (!installedMod) {
                    deletions.push(this.#deleteModule(dbId));
                    babeleLog(`Deleting database entry for missing module: ${mod.moduleId}`);
                    continue;
                }
                const currentVersion = installedMod.version;

                // Module version changed. Cache is invalid for all worlds
                if (currentVersion && currentVersion !== mod.version) {
                    deletions.push(this.#deleteModule(dbId));
                    babeleLog(`Version mismatch for module "${mod.moduleId}". The database entry will be deleted`);
                    continue;
                }

                // Module is no longer active in this world
                if (!installedMod.active && mod.worlds.includes(worldId)) {
                    if (mod.worlds.length === 1) {
                        deletions.push(this.#deleteModule(dbId));
                        babeleLog(`Deleting database entry for inactive module: ${mod.moduleId}`);
                    } else {
                        await this.modules.update(dbId, { worlds: mod.worlds.filter((w) => w !== worldId) });
                        babeleLog(`Removed world from database entry for inactive module: ${mod.moduleId}`);
                    }
                    continue;
                }

                // Module was newly activated in this world
                if (installedMod.active && currentVersion === mod.version && !mod.worlds.includes(worldId)) {
                    await this.modules.update(dbId, { worlds: mod.worlds.concat(worldId) });
                    babeleLog(`Added world to database entry for module: ${mod.moduleId}`);
                }
            }

            if (deletions.length > 0) {
                await Promise.all(deletions);
                babeleLog(
                    `Deleted ${deletions.length} stale database ${deletions.length === 1 ? "entry" : "entries"}.`,
                );
            }
        } catch (e) {
            if (e instanceof Error) {
                babeleLog(`Failed to verify cached data: ${e.stack || e}`, { error: true });
            }
        }
    }

    /** Get module data from the DB */
    async getModuleData(moduleId: string): Promise<StoredModule | null> {
        try {
            const mod = await this.modules.where({ systemId: game.system.id, moduleId: moduleId }).first();
            if (!mod) return null;
            const dbId = Number(mod.id);
            const translations = (await this.translations.get(dbId))?.data ?? [];

            for (const translation of translations) {
                babeleLog(`Retrieved translation for: ${translation.collection}`);
            }

            return {
                ...mod,
                translations,
            };
        } catch (e) {
            if (e instanceof Error) {
                babeleLog(`Failed to load from database: ${e.stack || e}`, { error: true });
            }
        }
        return null;
    }

    /** Save module data to the DB */
    async saveModuleData(moduleId: string, translations: Translation[]): Promise<void> {
        const currentVersion = game.modules.get(moduleId)?.version;
        if (!currentVersion) {
            babeleLog(`Error while saving module data: Could not find version for module "${moduleId}"!`);
            return;
        }
        const existing = await this.modules.where({ systemId: game.system.id, moduleId: moduleId }).first();
        try {
            if (existing?.id) {
                // Some modules register multiple times with different folders. Store everything in one entry
                const dbTranslations = (await this.translations.get(existing.id))?.data ?? [];
                dbTranslations.concat(translations);
                await this.translations.update(existing.id, {
                    data: dbTranslations,
                });
            } else {
                const dbId = await this.modules.put({
                    moduleId,
                    systemId: game.system.id,
                    version: currentVersion,
                    worlds: [game.world.id],
                });
                await this.translations.put({ id: dbId, data: translations });
            }

            babeleLog(`Translations from module "${moduleId}" were saved to the local database.`);
        } catch (e) {
            if (e instanceof Error) {
                babeleLog(`Failed to write to database: ${e.stack || e}`, { error: true });
            }
        }
    }

    /** Delete all module data including linked translations */
    async #deleteModule(id: number): Promise<void> {
        try {
            await this.modules.delete(id);
            await this.translations.delete(id);
        } catch (e) {
            if (e instanceof Error) {
                babeleLog(`Failed to delete module: ${e.stack || e}`, { error: true });
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

type ModuleTable = Omit<StoredModule, "translations">;

interface TranslationsTable {
    /** The id of a `ModuleTable` */
    id: number;
    /** The translation data */
    data: Translation[];
}

export { BabeleDB };
