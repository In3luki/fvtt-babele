interface DynamicMapping {
    /** A converter that was registered in this.converters */
    converter: string;
    /** The flattened path to the property that should be converted */
    path: string;
}

type TranslationEntry = {
    /** The original name of the Document */
    id?: string;
    /** Alternative for `id` */
    name?: string;
    /** Any translation values */
    [key: string]: unknown;
};

interface Translation {
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
     * The entries come in two different variants that I have seen so far:
     * 1. { [OriginalName]: { [propertyMapping]: value }, ...}
     * 2. [ { id: OriginalName, [propertyMapping]: value }, ...]
     */
    entries?: Record<string, TranslationEntry> | TranslationEntry[];
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

type CompendiumTranslations = Record<string, TranslationEntry>;

type Mapping = Record<string, string | DynamicMapping>;

interface BabeleModule {
    dir: string;
    lang: string;
    module: string;
    /** Priority of this translation. Baseline is 100. If multiple translations are loaded the highest priority is used. */
    priority: number;
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

// type Translation = Record<string, TranslationEntry>;

type Translated = Record<string, string | unknown>;

type DocumentData = {
    _id: string;
    name?: string;
    translated?: boolean;
    hasTranslation?: boolean;
    originalName?: string;
    flags?: {
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
    DocumentData,
    DynamicMapping,
    Mapping,
    TranslatableData,
    Translation,
    TranslationEntry,
    Translated,
};
