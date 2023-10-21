import { CompendiumTranslations, TranslatableData, Translation, TranslationEntry } from "@modules/babele/types.ts";
import { CompendiumMapping } from "@modules";

class TranslatedCompendium {
    metadata: CompendiumMetadata;
    translations: CompendiumTranslations = {};
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
                        this.translations[key] = entry;
                    }
                } else {
                    this.translations = translations.entries;
                }
            }

            if (translations.folders) {
                this.folders = translations.folders;
            }
        }
    }

    hasTranslation(data: Partial<TranslatableData>): boolean {
        return (
            !!this.translations[data._id ?? ""] ||
            !!this.translations[data.name ?? ""] ||
            this.hasReferenceTranslations(data)
        );
    }

    translationsFor(data: Partial<TranslatableData>): TranslationEntry {
        return this.translations[data._id ?? ""] || this.translations[data.name ?? ""] || {};
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
            return this.mapping.extractField(field, data) ?? null;
        }

        return this.mapping.translateField(field, data, this.translationsFor(data)) ?? null;
    }

    translate(data: TranslatableData | null, translationsOnly?: boolean): TranslatableData | null {
        if (data === null) {
            return null;
        }

        if (data.translated) {
            return data;
        }

        let translatedData = this.mapping.map(data, this.translationsFor(data));

        if (this.reference) {
            for (const ref of this.reference) {
                const referencePack = game.babele.packs.get(ref);
                if (referencePack?.translated && referencePack.hasTranslation(data)) {
                    const fromReference = referencePack.translate(data, true);
                    translatedData = mergeObject(fromReference ?? {}, translatedData);
                }
            }
        }

        if (translationsOnly) {
            return translatedData;
        } else {
            return mergeObject(
                data,
                mergeObject(
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
                ),
                { inplace: false }
            );
        }
    }
}

export { TranslatedCompendium };
