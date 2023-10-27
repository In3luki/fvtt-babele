import type { Mapping, TranslatableData, TranslationEntry } from "@modules/babele/types.ts";
import type { SupportedType } from "@modules/babele/types.ts";
import { Babele, FieldMapping, TranslatedCompendium } from "@modules";

class CompendiumMapping {
    /** The `Mapping` registered for this compendium */
    mapping: Mapping;
    /** Registered `FieldMapping`s for this compendium */
    fields: FieldMapping[];

    constructor(documentType: SupportedType, mapping: Maybe<Mapping>, tc?: TranslatedCompendium) {
        this.mapping = mergeObject(Babele.DEFAULT_MAPPINGS[documentType], mapping ?? {}, { inplace: false });
        this.fields = Object.keys(this.mapping).map((key) => new FieldMapping(key, this.mapping[key], tc));
    }

    /**
     * Translate registered `FieldMapping`s and return an object containing the merged results
     * @param data Original data to translate
     * @param translations The extracted translation entry for the original data
     */
    map(data: TranslatableData, translations: TranslationEntry): Record<string, unknown> {
        return this.fields.reduce((result, field) => mergeObject(result, field.map(data, translations)), {});
    }

    translateField(field: string, data: TranslatableData, translations: TranslationEntry): unknown {
        return this.fields.find((f) => f.field === field)?.translate(data, translations) ?? null;
    }

    extractField(field: string, data: TranslatableData): unknown {
        return this.fields.find((f) => f.field === field)?.extractValue(data) ?? null;
    }

    extract(data: TranslatableData): Record<string, string> {
        return this.fields.reduce((map, field) => {
            if (field.isDynamic) {
                return mergeObject(map, { [field.field]: "{{converter}}" });
            }
            return mergeObject(map, field.extract(data));
        }, {});
    }

    /** If one of the mapped field is dynamic, the compendium is considered dynamic */
    isDynamic(): boolean {
        return this.fields.some((f) => f.isDynamic);
    }
}

export { CompendiumMapping };
