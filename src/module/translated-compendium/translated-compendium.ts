import { Babele, FieldMapping } from "@module";
import { collectionFromMetadata, collectionFromUUID } from "@util";
import * as R from "remeda";
import type {
    Mapping,
    SupportedType,
    TranslatableData,
    Translation,
    TranslationEntryData,
} from "src/module/babele/types.ts";

class TranslatedCompendium {
    metadata: CompendiumMetadata;
    translations = new Map<string, TranslationEntryData>();
    /** The `Mapping` registered for this compendium */
    mapping: Mapping;
    /** Registered `FieldMapping`s for this compendium */
    fields: FieldMapping[];
    /** Embedded folder translation data */
    folders: Record<string, string> = {};
    /** Whether this compendium pack has translated entries */
    translated = false;
    /** References by id to other compendium packs */
    references: string[] | null = null;

    constructor(metadata: CompendiumMetadata, translations?: Translation) {
        this.metadata = metadata;
        const moduleMapping = translations?.module?.customMappings?.[metadata.type] ?? {};
        const translationMappings = fu.mergeObject(moduleMapping, translations?.mapping ?? {});
        this.mapping = fu.mergeObject(Babele.DEFAULT_MAPPINGS[metadata.type], translationMappings ?? {}, {
            inplace: false,
        });
        this.fields = Object.keys(this.mapping).map((key) => new FieldMapping(key, this.mapping[key], this));

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
    get translationsObject(): Record<string, TranslationEntryData> {
        return Object.fromEntries(this.translations.entries());
    }

    isDynamic(): boolean {
        return this.fields.some((f) => f.isDynamic);
    }

    /** Does a translation for the provided source data exist in this compendium? */
    hasTranslation(data: TranslatableData, { checkUUID }: { checkUUID?: boolean } = { checkUUID: true }): boolean {
        const hasTranslation =
            this.translations.has(data.name ?? "") ||
            this.translations.has(data._id) ||
            this.#hasReferenceTranslations(data);

        return hasTranslation && checkUUID
            ? this.#isSameCollection(data.flags?.core?.sourceId ?? data.uuid)
            : hasTranslation;
    }

    /** Extract translations for the provided source data if available */
    translationsFor(
        data: TranslatableData,
        { checkUUID }: { checkUUID?: boolean } = { checkUUID: true },
    ): TranslationEntryData {
        const uuid = data?.flags?.core?.sourceId ?? data.uuid;
        if (checkUUID && uuid && !this.#isSameCollection(uuid)) {
            return {};
        }
        return this.translations.get(data.name ?? "") ?? this.translations.get(data._id) ?? {};
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
    #isSameCollection(uuid?: string): boolean {
        return collectionFromUUID(uuid) === collectionFromMetadata(this.metadata);
    }

    extract(data: TranslatableData): Record<string, string> {
        return this.fields.reduce((map, field) => {
            if (field.isDynamic) {
                return fu.mergeObject(map, { [field.field]: "{{converter}}" });
            }
            return fu.mergeObject(map, field.extract(data));
        }, {});
    }

    extractField(field: string, data: TranslatableData): unknown {
        return this.fields.find((f) => f.field === field)?.extractValue(data) ?? null;
    }

    translateField(field: string, data: TranslatableData | null): unknown | null {
        if (data === null) {
            return data;
        }

        if (data.flags?.babele?.translated) {
            return this.extractField(field, data);
        }

        return this.fields.find((f) => f.field === field)?.translate(data, this.translationsFor(data)) ?? null;
    }

    #resolveReferences(
        data: TranslatableData,
        base: Record<string, unknown>,
        translationsOnly?: boolean,
    ): Record<string, unknown> {
        for (const ref of this.references ?? []) {
            const referencePack = game.babele.packs.get(ref);
            if (referencePack?.translated && referencePack.hasTranslation(data)) {
                const fromReference = referencePack.translate(data, { translationsOnly });
                return fu.mergeObject(fromReference ?? {}, base);
            }
        }
        return base;
    }

    translate(data: TranslatableData | null, options?: { translationsOnly?: false }): TranslatableData | null;
    translate(data: TranslatableData | null, options?: { translationsOnly?: true }): Record<string, unknown> | null;
    translate(
        data: TranslatableData | null,
        options?: TranslateOptions,
    ): TranslatableData | Record<string, unknown> | null;
    translate(
        data: TranslatableData | null,
        { translationsOnly, index }: TranslateOptions = {},
    ): TranslatableData | Record<string, unknown> | null {
        if (!R.isPlainObject(data)) return null;
        if (data.flags?.babele?.translated) return data;
        if (!this.hasTranslation(data, { checkUUID: !index })) return null;

        const base = this.fields.reduce(
            (result, field) =>
                fu.mergeObject(result, field.map(data, this.translationsFor(data, { checkUUID: !index }))),
            {},
        );
        const translatedData = this.references ? this.#resolveReferences(data, base, translationsOnly) : base;
        if (translationsOnly) return translatedData;

        const mergedTranslation = fu.mergeObject(
            translatedData,
            index
                ? {
                      translated: true,
                      hasTranslation: true,
                      originalName: data.name,
                  }
                : {
                      flags: {
                          babele: {
                              translated: true,
                              hasTranslation: true,
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
    /** Whether only the extracted translations should be returned */
    translationsOnly?: boolean;
    /** Whether the translation is for the pack index */
    index?: boolean;
}

export { TranslatedCompendium };
export type { TranslateOptions };
