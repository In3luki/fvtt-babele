import type { TranslatableData, Translation, TranslationEntry } from "src/module/babele/types.ts";
import type { SupportedType } from "src/module/babele/types.ts";
import { CompendiumMapping } from "src/module/index.ts";
import { collectionFromMetadata, collectionFromUUID } from "@util";

class TranslatedCompendium {
    metadata: CompendiumMetadata;
    translations = new Map<string, TranslationEntry>();
    mapping: CompendiumMapping;
    folders: Record<string, string> = {};
    translated = false;
    references: Translation["reference"] | null = null;

    constructor(metadata: CompendiumMetadata, translations?: Translation) {
        this.metadata = metadata;
        const moduleMapping = translations?.module?.customMappings?.[metadata.type] ?? {};
        const mappings = fu.mergeObject(moduleMapping, translations?.mapping ?? {});
        this.mapping = new CompendiumMapping(metadata.type, mappings, this);

        if (translations) {
            this.translated = true;
            this.metadata.label = translations.label;

            if (translations.reference) {
                this.references = Array.isArray(translations.reference)
                    ? translations.reference
                    : [translations.reference];
            }
            if (translations.entries) {
                if (Array.isArray(translations.entries)) {
                    for (const entry of translations.entries) {
                        const key = entry.id;
                        if (typeof key !== "string") continue;
                        this.translations.set(key, entry);
                    }
                } else {
                    this.translations = new Map(Object.entries(translations.entries));
                }
            }
            if (translations.folders) {
                this.folders = translations.folders;
            }
        }
    }

    get documentType(): SupportedType {
        return this.metadata.type;
    }

    /** Returns the translations map as an object */
    get translationsObject(): Record<string, TranslationEntry> {
        return Object.fromEntries(this.translations.entries());
    }

    /** Does a translation for the provided source data exist in this compendium? */
    hasTranslation(data: TranslatableData, { checkUUID }: { checkUUID?: boolean } = { checkUUID: true }): boolean {
        const uuid = data?.flags?.core?.sourceId ?? data.uuid ?? "";
        if (checkUUID && uuid && !this.#isSameCollection(uuid)) {
            return false;
        }
        return (
            this.translations.has(data.name) || this.translations.has(data._id) || this.#hasReferenceTranslations(data)
        );
    }

    /** Extract translations for the provided source data if available */
    translationsFor(
        data: TranslatableData,
        { checkUUID }: { checkUUID?: boolean } = { checkUUID: true },
    ): TranslationEntry {
        const uuid = data?.flags?.core?.sourceId ?? data.uuid ?? "";
        if (checkUUID && uuid && !this.#isSameCollection(uuid)) {
            return {};
        }
        return this.translations.get(data.name) ?? this.translations.get(data._id) ?? {};
    }

    #hasReferenceTranslations(data: TranslatableData): boolean {
        if (this.references) {
            for (const reference of this.references) {
                const referencePack = game.babele.packs.get(reference);
                if (referencePack?.translated && referencePack.hasTranslation(data)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Does the provided uuid belong to this compendium pack? */
    #isSameCollection(uuid: string): boolean {
        return collectionFromUUID(uuid) === collectionFromMetadata(this.metadata);
    }

    /**
     * Delegate extract to the compendium mapping relative method.
     * @see CompendiumMapping.extract()
     */
    extract(data: TranslatableData): Record<string, string> {
        return this.mapping.extract(data);
    }

    /**
     * Delegate extractField to the compendium mapping relative method.
     * @see CompendiumMapping.extractField()
     */
    extractField(field: string, data: TranslatableData): unknown {
        return this.mapping.extractField(field, data) ?? null;
    }

    translateField(field: string, data: TranslatableData | null): unknown | null {
        if (data === null) {
            return data;
        }

        if (data.translated) {
            return this.extractField(field, data) ?? null;
        }

        return this.mapping.translateField(field, data, this.translationsFor(data)) ?? null;
    }

    translate(data: TranslatableData | null, options?: { translationsOnly?: false }): TranslatableData | null;
    translate(data: TranslatableData | null, options?: { translationsOnly?: true }): Record<string, unknown> | null;
    translate(
        data: TranslatableData | null,
        options?: TranslateOptions,
    ): TranslatableData | Record<string, unknown> | null;
    translate(
        data: TranslatableData | null,
        { translationsOnly }: TranslateOptions = {},
    ): TranslatableData | Record<string, unknown> | null {
        if (data === null) return null;
        if (data.translated) return data;
        const hasTranslation = this.hasTranslation(data);

        const base = this.mapping.map(data, this.translationsFor(data));
        const translatedData = ((): Record<string, unknown> => {
            if (this.references) {
                for (const ref of this.references) {
                    const referencePack = game.babele.packs.get(ref);
                    if (referencePack?.translated && referencePack.hasTranslation(data)) {
                        const fromReference = referencePack.translate(data, { translationsOnly });
                        return fu.mergeObject(fromReference ?? {}, base);
                    }
                }
            }
            return base;
        })();
        if (translationsOnly) return translatedData;

        const mergedTranslation = fu.mergeObject(
            translatedData,
            /** Top-level plus flags for backwards compatibilty */
            {
                translated: true,
                hasTranslation,
                originalName: data.name,
                flags: {
                    babele: {
                        translated: true,
                        hasTranslation,
                        originalName: data.name,
                    },
                },
            },
            { inplace: false },
        );
        return fu.mergeObject(data, mergedTranslation, { inplace: false });
    }
}

interface TranslateOptions {
    translationsOnly?: boolean;
}

export { TranslatedCompendium };
export type { TranslateOptions };
