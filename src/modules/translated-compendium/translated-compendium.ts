import { TranslatableData, Translation, TranslationEntry } from "@modules/babele/types.ts";
import { CompendiumMapping } from "@modules";

class TranslatedCompendium {
    metadata: CompendiumMetadata;
    translations = new Map<string, TranslationEntry>();
    mapping: CompendiumMapping;
    folders: Record<string, string> = {};
    translated = false;
    reference: Translation["reference"] | null = null;

    constructor(metadata: CompendiumMetadata, translations?: Translation) {
        this.metadata = metadata;
        this.mapping = new CompendiumMapping(metadata.type, translations?.mapping ?? null, this);
        if (translations) {
            mergeObject(metadata, { label: translations.label });

            this.translated = true;
            if (translations.reference) {
                this.reference = Array.isArray(translations.reference)
                    ? translations.reference
                    : [translations.reference];
            }

            if (translations.entries) {
                if (Array.isArray(translations.entries)) {
                    for (const entry of translations.entries) {
                        const key = entry.id ?? entry.name;
                        if (!key) continue;
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

    /** Returns the translations map as an object */
    get translationsObject(): Record<string, TranslationEntry> {
        return Object.fromEntries(this.translations.entries());
    }

    hasTranslation(data: Partial<TranslatableData>): boolean {
        const uuid = String(data?.flags?.core?.sourceId ?? data.uuid);
        const id = String(data._id);
        const name = String(data.name);
        return (
            this.translations.has(uuid) ||
            this.translations.has(id) ||
            this.translations.has(name) ||
            this.hasReferenceTranslations(data)
        );
    }

    translationsFor(data: Partial<TranslatableData>): TranslationEntry {
        const uuid = String(data?.flags?.core?.sourceId ?? data.uuid);
        const id = String(data._id);
        const name = String(data.name);
        return this.translations.get(uuid) ?? this.translations.get(id) ?? this.translations.get(name) ?? {};
    }

    hasReferenceTranslations(data: Partial<TranslatableData>): boolean {
        if (this.reference) {
            for (const reference of this.reference) {
                const referencePack = game.babele.packs.get(reference);
                if (referencePack?.translated && referencePack.hasTranslation(data)) {
                    return true;
                }
            }
        }
        return false;
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
    extractField(field: string, data: Partial<TranslatableData>): unknown | null {
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

    translate(
        data: TranslatableData | null,
        { translateIndex, translationsOnly }: TranslateOptions = {}
    ): TranslatableData | null {
        if (data === null) return null;
        if (data.translated) return data;

        const base = this.mapping.map(data, this.translationsFor(data));
        const translatedData = ((): TranslatableData => {
            if (this.reference) {
                for (const ref of this.reference) {
                    const referencePack = game.babele.packs.get(ref);
                    if (referencePack?.translated && referencePack.hasTranslation(data)) {
                        const fromReference = referencePack.translate(data, { translateIndex, translationsOnly });
                        return mergeObject(fromReference ?? {}, base);
                    }
                }
            }
            return base;
        })();
        if (translationsOnly) return translatedData;

        // Index data has no need for flags
        const mergedTranslation = ((): TranslatableData => {
            if (translateIndex) {
                // Remove unnecessary id property if present
                delete translatedData.id;

                return mergeObject(
                    translatedData,
                    {
                        translated: true,
                        hasTranslation: this.hasTranslation(data),
                        originalName: data.name,
                    },
                    { inplace: false }
                );
            }
            return mergeObject(
                translatedData,
                {
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
        })();

        return mergeObject(data, mergedTranslation, { inplace: false });
    }
}

interface TranslateOptions {
    translationsOnly?: boolean;
    translateIndex?: boolean;
}

export { TranslatedCompendium };
export type { TranslateOptions };
