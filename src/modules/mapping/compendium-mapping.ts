import type { Mapping, TranslatableData, TranslationEntry } from "@modules/babele/types.ts";
import type { DocumentType } from "@modules/babele/values.ts";
import { Babele, FieldMapping, TranslatedCompendium } from "@modules";

class CompendiumMapping {
    mapping: Mapping;
    fields: FieldMapping[];

    constructor(documentType: DocumentType, mapping: Maybe<Mapping>, tc?: TranslatedCompendium) {
        this.mapping = mergeObject(Babele.DEFAULT_MAPPINGS[documentType], mapping ?? {}, { inplace: false });
        this.fields = Object.keys(this.mapping).map((key) => new FieldMapping(key, this.mapping[key], tc));
    }

    /**
     * @param data original data to translate
     */
    map(data: TranslatableData, translations: TranslationEntry, deep?: boolean): Record<string, unknown> {
        // Translate registered FieldMappings and merge results
        return this.fields.reduce((result, field) => mergeObject(result, field.map(data, translations, deep)), {});
    }

    translateField(field: string, data: Partial<TranslatableData>, translations: TranslationEntry): unknown {
        return this.fields.find((f) => f.field === field)?.translate(data, translations) ?? null;
    }

    extractField(field: string, data: Partial<TranslatableData>): unknown {
        return this.fields.find((f) => f.field === field)?.extractValue(data) ?? null;
    }

    extract(data: TranslatableData): Record<string, string> {
        return this.fields.reduce((map, field) => {
            if (field.isDynamic) {
                return mergeObject(map, { [field.field]: "{{Converter}}" });
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
