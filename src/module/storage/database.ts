import { Dexie, type Table } from "dexie";
import { BabeleModule, Translation } from "@module/babele/types.ts";

class BabeleDB extends Dexie {
    /** The module data table */
    declare modules: Table<StoredModule, number>;
    /** A list of active modules for the current language */
    #modules: BabeleModule[];

    constructor(modules?: BabeleModule[]) {
        super("BabeleDB");
        this.version(1).stores({
            modules: "++id, name",
        });
        this.#modules = modules ?? [];
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
        const currentVersion = this.#getModuleVersion(moduleName);
        if (!currentVersion) return null;
        const data = await this.modules.where("name").equals(moduleName).first();
        if (!data) return null;

        if (data.version !== currentVersion) {
            await this.modules.delete(data.id!);
            console.log(`Babele: Version mismatch for module "${moduleName}". The database entry was deleted.`);
            return null;
        }
        console.log(`Babele: Loaded database entry for module: ${moduleName}.`);
        for (const translation of data.translations) {
            console.log(`Babele: Retrieved translation for: ${translation.collection}.`);
        }
        return data;
    }

    /** Saves module data to the DB */
    async saveModuleData(moduleName: string, translations: Translation[]): Promise<void> {
        const currentVersion = this.#getModuleVersion(moduleName);
        if (!currentVersion) return;

        const existing = await this.modules.where("name").equals(moduleName).first();
        if (existing) {
            await this.modules.update(existing.id!, {
                translations: existing.translations.concat(translations),
                worlds: [...new Set(existing.worlds.concat(game.world.id))],
            });
        } else {
            await this.modules.put({
                name: moduleName,
                translations,
                version: currentVersion,
                worlds: [game.world.id],
            });
        }

        console.log(`Babele: Translations from module "${moduleName}" were saved to the local database.`);
    }

    /** Removes DB entries of modules that are no longer active */
    async cleanUp(): Promise<void> {
        const toDelete: number[] = [];
        await this.modules.each((stored) => {
            if (stored.worlds.includes(game.world.id) && !this.#modules.find((m) => m.module === stored.name)) {
                toDelete.push(stored.id!);
                console.log(`Bable: Deleting database entry for missing module: ${stored.name}.`);
            }
        });
        if (toDelete.length > 0) {
            return this.modules.bulkDelete(toDelete);
        }
    }

    /** Returns the version of a specific module by name */
    #getModuleVersion(moduleName: string): string | null {
        const version = game.modules.get(moduleName)?.version;
        if (!version) {
            console.error(`Babele: Could not find version for module "${moduleName}"!`);
            return null;
        }
        return version;
    }
}

interface StoredModule {
    /** Auto-incremented database id */
    id?: number;
    /** The module name */
    name: string;
    /** Translation data from this module */
    translations: Translation[];
    /** The module version */
    version: string;
    /** An array of world ids where this module is active */
    worlds: string[];
}

export { BabeleDB };
