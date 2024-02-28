import type { TranslatedCompendium } from "@module";
import type { Converter, DynamicMapping, TranslatableData, TranslationEntryData } from "@module/babele/types.ts";

/**
 * Class to map, translate or extract value for a single field defined by a mapping.
 *
 * ex: new FieldMapping("desc", "data.description.value", tc)
 */
class FieldMapping {
    field: string;
    path: string;
    converter: Converter | null;
    #dynamic: boolean;
    tc?: TranslatedCompendium;

    constructor(field: string, mapping: DynamicMapping | string, tc?: TranslatedCompendium) {
        this.field = field;
        this.tc = tc;
        if (typeof mapping === "object") {
            this.path = mapping["path"];
            this.converter = game.babele.converters[mapping.converter] ?? null;
            this.#dynamic = true;
        } else {
            this.path = mapping;
            this.converter = null;
            this.#dynamic = false;
        }
    }

    /** Does this field use a converter? */
    get isDynamic(): boolean {
        return this.#dynamic;
    }

    /**
     * Translate the property specified by the `path` of this `FieldMapping` and return an object
     * containing the result
     * @param data Original data to translate
     * @param translations The extracted translation entry for the original data
     */
    map(data: TranslatableData, translations: TranslationEntryData): Record<string, unknown> {
        const value = this.translate(data, translations);
        if (value) {
            return fu.expandObject<Record<string, unknown>>({ [this.path]: value });
        }
        return {};
    }

    translate(data: TranslatableData, translations: TranslationEntryData): unknown {
        const originalValue = this.extractValue(data);
        // Is there something to translate?
        if (originalValue) {
            // Does a converter exist for this value?
            if (this.converter) {
                // Return the result of the converter function
                return this.converter(originalValue, translations[this.field], data, this.tc, translations);
            }
            // Original value is a string and no converter. Return the extracted translation
            if (typeof originalValue === "string") {
                const translation = translations[this.field];
                if (typeof translation === "string") {
                    return translation;
                }
            }
        }
        return null;
    }

    /**
     * Extracts the value corresponding to the field path configured within the passed data.
     *
     * ex:
     * const data = { "data": { "description": { "value": "bla bla" } } };
     * const value = new FieldMapping("desc", "data.description.value").extractValue(data);
     * console.log(value) // -> "bla bla"
     *
     */
    extractValue(data: Partial<TranslatableData>): unknown {
        return fu.getProperty(data, this.path);
    }

    /**
     * Extract the value corresponding to the field path in object format.
     *
     * ex:
     * const data = { "data": { "description": { "value": "bla bla" } } };
     * const value = new FieldMapping("desc", "data.description.value").extractValue(data);
     * console.log(value) // -> { "desc": "bla bla" }
     */
    extract(data: TranslatableData): Record<string, unknown> {
        return {
            [this.field]: this.extractValue(data),
        };
    }
}

export { FieldMapping };
