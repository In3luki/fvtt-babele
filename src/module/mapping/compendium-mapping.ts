import { Babele, FieldMapping, TranslatedCompendium } from "@module";
import type { Mapping, SupportedType, TranslatableData, TranslationEntryData } from "@module/babele/types.ts";

class CompendiumMapping {
    /** The `Mapping` registered for this compendium */
    mapping: Mapping;
    /** Registered `FieldMapping`s for this compendium */
    fields: FieldMapping[];

    constructor(documentType: SupportedType, mapping: Maybe<Mapping>, tc?: TranslatedCompendium) {
        this.mapping = fu.mergeObject(Babele.DEFAULT_MAPPINGS[documentType], mapping ?? {}, { inplace: false });
        this.fields = Object.keys(this.mapping).map((key) => new FieldMapping(key, this.mapping[key], tc));
    }

    /**
     * Translate registered `FieldMapping`s and return an object containing the merged results
     * @param data Original data to translate
     * @param translations The extracted translation entry for the original data
     */
    map(data: TranslatableData, translations: TranslationEntryData): Record<string, unknown> {
        return this.fields.reduce((result, field) => fu.mergeObject(result, field.map(data, translations)), {});
    }

    translateField(field: string, data: TranslatableData, translations: TranslationEntryData): unknown {
        return this.fields.find((f) => f.field === field)?.translate(data, translations) ?? null;
    }

    extractField(field: string, data: TranslatableData): unknown {
        return this.fields.find((f) => f.field === field)?.extractValue(data) ?? null;
    }

    extract(data: TranslatableData): Record<string, string> {
        return this.fields.reduce((map, field) => {
            if (field.isDynamic) {
                return fu.mergeObject(map, { [field.field]: "{{converter}}" });
            }
            return fu.mergeObject(map, field.extract(data));
        }, {});
    }

    /** If one of the mapped field is dynamic, the compendium is considered dynamic */
    isDynamic(): boolean {
        return this.fields.some((f) => f.isDynamic);
    }
}

export { CompendiumMapping };
