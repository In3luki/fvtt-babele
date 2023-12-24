import { TranslatedCompendium } from "@module";
import { SUPPORTED_PACKS } from "./values.ts";

type SupportedType = (typeof SUPPORTED_PACKS)[number];

interface DynamicMapping {
    /** A converter that was registered in this.converters */
    converter: string;
    /** The flattened path to the property that should be converted */
    path: string;
}

/** Called in a `FieldMapping` to allow modules to alter translation results */
type Converter = (
    /** The extracted value of the mapped field */
    sourceData: string | TranslatableData[],
    /** The translation entry matching the source data */
    translationEntry: string | TranslationEntry,
    /** The full source that contains the `sourceData` argument */
    fullSourceData?: Partial<TranslatableData>,
    /** A `TranslatedCompendium` associated with the source `FieldMapping` */
    tc?: TranslatedCompendium,
    /** The full translation that was found for `sourceData` */
    translation?: TranslationEntry,
) => string | TranslatableData[];

type Mapping = Record<string, string | DynamicMapping>;

/** Translation data for a specific document. Can be either a string of an object that contains string values */
type TranslationEntryData = string | { [key: string]: TranslationEntryData };
/** Translations for a specific document in the compendium collection */
type TranslationEntry = Record<string, TranslationEntryData>;
/** The contents of `Translation.entries`. Keys are either names or ids of documents in the compendium collection */
type CompendiumTranslations = Record<string, TranslationEntry>;

/** The parsed contents of a translation JSON file */
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
     * 1. { [OriginalName]: { [property]: value }, ...}
     * 2. [ { id: OriginalName, [property]: value }, ...]
     */
    entries?: CompendiumTranslations | TranslationEntry[];
    /** Optional embedded folder translations: originalName->translatedName */
    folders?: Record<string, string>;
    /**  Other packs to use as translation source */
    reference?: string | string[];
}

/** A module that prvoides translations */
interface BabeleModule {
    /** Directory containing the translation JSON files. */
    dir: string;
    /** The supported language */
    lang: string;
    /** The module name */
    module: string;
    /** Custom mappings that are applied to all packs of a given type */
    customMappings?: Record<Partial<SupportedType>, Record<string, string | DynamicMapping>>;
    /** Priority of this translation. Baseline is 100. Translations are merged by priority
     *  where lower priority is overwritten by higher priority*/
    priority: number;
    /** A zip file that contains the translation JSON files. Uses the `dir` options as base path */
    zipFile?: string;
}

/** A catch-all type for data that can be translated with Babele. Double translation info is required
 *  for legacy modules */
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
    Converter,
    CompendiumTranslations,
    DynamicMapping,
    Mapping,
    SupportedType,
    TranslatableData,
    Translation,
    TranslationEntry,
    TranslationEntryData,
};
