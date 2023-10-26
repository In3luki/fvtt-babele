import type { DynamicMapping, TranslatableData, TranslationEntry } from "@modules/babele/types.ts";
import { TranslatedCompendium } from "@modules";

/**
 * Class to map, translate or extract value for a single field defined by a mapping.
 *
 * ex: new FieldMapping("desc", "data.description.value", tc)
 */
class FieldMapping {
    field: string;
    path: string;
    converter: Function | null;
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
     * Translate the value and return expanded object
     */
    map(data: TranslatableData, translations: TranslationEntry): Record<string, string> {
        const value = this.translate(data, translations);
        if (value) {
            return expandObject<Record<string, string>>({ [this.path]: value });
        }
        return {};
    }

    translate(data: Partial<TranslatableData>, translations: TranslationEntry): unknown {
        const originalValue = this.extractValue(data);
        if (this.converter && originalValue) {
            return this.converter(originalValue, translations[this.field], data, this.tc, translations);
        }
        return translations[this.field];
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
    extractValue(data: Partial<TranslatableData>): string {
        return getProperty(data, this.path) as string;
    }

    /**
     * Extract the value corresponding to the field path in object format.
     *
     * ex:
     * const data = { "data": { "description": { "value": "bla bla" } } };
     * const value = new FieldMapping("desc", "data.description.value").extractValue(data);
     * console.log(value) // -> { "desc": "bla bla" }
     */
    extract(data: TranslatableData): Record<string, string> {
        return {
            [this.field]: this.extractValue(data),
        };
    }
}

export { FieldMapping };
