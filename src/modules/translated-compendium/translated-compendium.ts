import type { TranslatableData, Translation, TranslationEntry } from "@modules/babele/types.ts";
import type { DocumentType } from "@modules/babele/values.ts";
import { CompendiumMapping } from "@modules";
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
        const moduleMapping = translations?.module?.customMappings?.[metadata.type];
        const mappings = translations?.mapping ?? moduleMapping ?? null;
        this.mapping = new CompendiumMapping(metadata.type, mappings, this);

        if (translations) {
            mergeObject(metadata, { label: translations.label });

            this.translated = true;
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

    get documentType(): DocumentType {
        return this.metadata.type;
    }

    /** Returns the translations map as an object */
    get translationsObject(): Record<string, TranslationEntry> {
        return Object.fromEntries(this.translations.entries());
    }

    hasTranslation(
        data: Partial<TranslatableData>,
        { checkUUID }: { checkUUID?: boolean } = { checkUUID: true }
    ): boolean {
        const { id, name, uuid } = this.#getLookupData(data);
        if (checkUUID && uuid && !this.#isSameCollection(uuid)) {
            return false;
        }
        return this.translations.has(name) || this.translations.has(id) || this.hasReferenceTranslations(data);
    }

    translationsFor(
        data: Partial<TranslatableData>,
        { checkUUID }: { checkUUID?: boolean } = { checkUUID: true }
    ): TranslationEntry {
        const { id, name, uuid } = this.#getLookupData(data);
        if (checkUUID && uuid && !this.#isSameCollection(uuid)) {
            return {};
        }
        return this.translations.get(name) ?? this.translations.get(id) ?? {};
    }

    hasReferenceTranslations(data: Partial<TranslatableData>): boolean {
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

    #getLookupData(data: Partial<TranslatableData>): { id: string; name: string; uuid: string } {
        const uuid = String(data?.flags?.core?.sourceId ?? data.uuid);
        return {
            id: String(data._id),
            name: String(data.name),
            uuid: uuid.startsWith("Compendium.") ? uuid : "",
        };
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
    extractField(field: string, data: Partial<TranslatableData>): unknown {
        return this.mapping.extractField(field, data) ?? null;
    }

    translateField(field: string, data: Partial<TranslatableData> | null): unknown | null {
        if (data === null) {
            return data;
        }

        if (data.translated) {
            return this.extractField(field, data) ?? null;
        }

        return this.mapping.translateField(field, data, this.translationsFor(data)) ?? null;
    }

    translate(data: TranslatableData | null, { translationsOnly }: TranslateOptions = {}): TranslatableData | null {
        if (data === null) return null;
        if (data.translated) return data;

        const base = this.mapping.map(data, this.translationsFor(data));
        const translatedData = ((): TranslatableData => {
            if (this.references) {
                for (const ref of this.references) {
                    const referencePack = game.babele.packs.get(ref);
                    if (referencePack?.translated && referencePack.hasTranslation(data)) {
                        const fromReference = referencePack.translate(data, { translationsOnly });
                        return mergeObject(fromReference ?? {}, base);
                    }
                }
            }
            return base;
        })();
        if (translationsOnly) return translatedData;

        const mergedTranslation = mergeObject(
            translatedData,
            {
                translated: true,
                hasTranslation: this.hasTranslation(data),
                originalName: data.name,
                flags: {
                    babele: {
                        translated: true,
                        hasTranslation: this.hasTranslation(data),
                        originalName: data.name,
                    },
                },
            },
            { inplace: false }
        );
        return mergeObject(data, mergedTranslation, { inplace: false });
    }
}

interface TranslateOptions {
    translationsOnly?: boolean;
}

export { TranslatedCompendium };
export type { TranslateOptions };
