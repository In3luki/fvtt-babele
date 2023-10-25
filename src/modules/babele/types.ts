import { DocumentType } from "./values.ts";

interface DynamicMapping {
    /** A converter that was registered in this.converters */
    converter: string;
    /** The flattened path to the property that should be converted */
    path: string;
}

type Mapping = Record<string, string | DynamicMapping>;

type TranslationEntryData = string | { [key: string]: TranslationEntryData };
type TranslationEntry = Record<string, TranslationEntryData>;
type CompendiumTranslations = Record<string, TranslationEntry>;

interface Translation {
    module?: BabeleModule;
    /** The collection name  */
    collection: string;
    /** The translated name of the compendium pack */
    label: string;
    /** Optional mapping data if the keys in 'entries' are shorthands. E.g. { description: "data.description.value" }
     *  The value can be a Converter object which describes what converter should be used for that field.
     *  If no mapping is provided a default mapping is used based on document type.
     */
    mapping?: Mapping;
    /**
     * The entries come in two different variants:
     * 1. { [OriginalName]: { [propertyMapping]: value }, ...}
     * 2. [ { id: OriginalName, [propertyMapping]: value }, ...]
     */
    entries?: CompendiumTranslations | TranslationEntry[];
    /** Optional embedded folder translations: originalName->translatedName */
    folders?: Record<string, string>;
    /**  Other packs to use as translation source */
    reference?: string | string[];
    /** The whole file can also consist of flattened object properties with values.
     *
     *  "label": "Klassenmerkmaleffekte",
     *  "entries.Effect: Aberrant Blood Magic.name": "Effekt: Aberrationen-Blutmagie",
     */
    [key: string]: unknown;
}

interface BabeleModule {
    /** Directory containing the translation JSON files. */
    dir: string;
    /** The supported language */
    lang: string;
    /** The module name */
    module: string;
    /** Custom mappings that are applied to all packs of a given type */
    customMappings?: Record<Partial<DocumentType>, Record<string, string | DynamicMapping>>;
    /** Priority of this translation. Baseline is 100. Translations are merged by priority
     *  where lower priority is overwritten by higher priority*/
    priority: number;
    /** A zip file that contains the translation JSON files. Uses the `dir` options as base path */
    zipFile?: string;
}

type TranslatableData = CompendiumIndexData & {
    translated?: boolean;
    hasTranslation?: boolean;
    originalName?: string;
    flags?: {
        core?: {
            sourceId?: CompendiumUUID;
        };
        babele?: {
            translated: boolean;
            hasTranslation: boolean;
            originalName: string;
        };
    };
};

export type {
    BabeleModule,
    CompendiumTranslations,
    DynamicMapping,
    Mapping,
    TranslatableData,
    Translation,
    TranslationEntry,
    TranslationEntryData,
};
