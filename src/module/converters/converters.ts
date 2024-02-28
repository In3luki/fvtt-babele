import { CompendiumMapping, type TranslatedCompendium } from "@module";
import type {
    Converter,
    Mapping,
    SupportedType,
    TranslatableData,
    TranslationEntryData,
} from "@module/babele/types.ts";
import { collectionFromUUID } from "@util";
import * as R from "remeda";
import type { CardFaceSchema, CardSchema } from "types/foundry/common/documents/card.d.ts";
import type { JournalEntryPageSchema } from "types/foundry/common/documents/journal-entry-page.d.ts";
import type { PlaylistSoundSource } from "types/foundry/common/documents/playlist-sound.d.ts";
import type { TableResultSource } from "types/foundry/common/documents/table-result.d.ts";

/** Utility class with all predefined converters */
class Converters {
    static fromPack(mapping?: Mapping, documentType: SupportedType = "Item"): Converter {
        const dynamicMapping = new CompendiumMapping(documentType, mapping);
        return function (documents: unknown, translations: TranslationEntryData | string) {
            if (!Array.isArray(documents)) return documents;
            return Converters.#fromPack(documents, documentType, translations, dynamicMapping);
        };
    }

    static fromDefaultMapping(documentType: SupportedType): Converter {
        return function (
            documents: unknown,
            translations: TranslationEntryData | string,
            _data?: TranslatableData,
            tc?: TranslatedCompendium,
        ): unknown {
            if (!Array.isArray(documents)) return documents;
            const babeleTranslations = game.babele.translations.get(tc?.metadata.id ?? "");
            const dynamicMapping = new CompendiumMapping(documentType, babeleTranslations?.mapping, tc);
            return Converters.#fromPack(documents, documentType, translations, dynamicMapping);
        };
    }

    static #fromPack(
        documents: TranslatableData[],
        documentType: SupportedType,
        translations: TranslationEntryData | string,
        dynamicMapping: CompendiumMapping,
    ): TranslatableData[] {
        return R.compact(
            documents.map((data) => {
                if (R.isPlainObject(translations)) {
                    const translation = translations[data._id] ?? translations[data.name ?? ""];
                    if (R.isPlainObject(translation)) {
                        const translatedData = dynamicMapping.map(data, translation);
                        return fu.mergeObject(data, fu.mergeObject(translatedData, { translated: true }));
                    }
                }
                const pack = ((): TranslatedCompendium | null => {
                    const collection = collectionFromUUID(data.flags?.core?.sourceId);
                    if (collection) {
                        const p = game.babele.packs.get(collection);
                        if (p?.translated && p.hasTranslation(data, { checkUUID: false })) {
                            return p;
                        }
                    }
                    return (
                        game.babele.packs.find(
                            (pack) =>
                                pack.translated && pack.documentType === documentType && pack.hasTranslation(data),
                        ) ?? null
                    );
                })();
                return pack ? pack.translate(data) : data;
            }),
        );
    }

    static mappedField(field: string): Converter {
        return function (
            originalValue: unknown,
            translation: TranslationEntryData | string,
            data?: TranslatableData,
            tc?: TranslatedCompendium,
        ): unknown {
            if (typeof translation === "string") {
                return translation;
            }
            if (tc && data) {
                return tc.translateField(field, data);
            }
            return originalValue;
        };
    }

    static fieldCollection(field: string): Converter {
        return function (collection: unknown, translations: TranslationEntryData | string): unknown {
            if (!R.isPlainObject(translations) || !Array.isArray(collection)) {
                return collection;
            }

            return collection.map((data) => {
                const translation = translations[data[field]];
                if (!translation) {
                    return data;
                }

                return fu.mergeObject(data, { [field]: translation, flags: { babele: { translated: true } } });
            });
        };
    }

    static #tableResults(results: TableResultSource[], translations: TranslationEntryData | string) {
        return results.map((data) => {
            if (typeof translations !== "string") {
                const translation = translations[`${data.range[0]}-${data.range[1]}`];
                if (translation) {
                    return fu.mergeObject(data, { text: translation, flags: { babele: { translated: true } } });
                }
            }
            if (data.documentCollection) {
                const text = game.babele.translateField("name", data.documentCollection, {
                    name: data.text,
                } as TranslatableData);
                return text ? fu.mergeObject(data, { text, flags: { babele: { translated: true } } }) : data;
            }
            return data;
        });
    }

    static tableResults(): Converter {
        return function (results: unknown, translations: TranslationEntryData | string): unknown {
            if (!Array.isArray(results)) return results;
            return Converters.#tableResults(results, translations);
        };
    }

    static tableResultsCollection(): Converter {
        return function (collection: unknown, translations: TranslationEntryData | string): unknown {
            if (!translations || !Array.isArray(collection)) {
                return collection;
            }

            if (!R.isPlainObject(translations)) return collection;
            return collection.map((data) => {
                const extracted = translations[data.name];
                if (!R.isPlainObject(extracted)) return data;

                return fu.mergeObject(data, {
                    name: extracted.name ?? data.name,
                    description: extracted.description ?? data.description,
                    results: Converters.#tableResults(data.results, translations),
                    flags: { babele: { translated: true } },
                });
            });
        };
    }

    static #pages(pages: JournalEntryPageSource[], translations: TranslationEntryData | string) {
        if (!R.isPlainObject(translations)) return pages;

        return pages.map((data) => {
            const translation = translations[data.name];
            if (!R.isPlainObject(translation)) return data;

            return fu.mergeObject(data, {
                name: translation.name,
                image: { caption: translation.caption ?? data.image.caption },
                src: translation.src ?? data.src,
                text: { content: translation.text ?? data.text.content },
                video: {
                    width: translation.width ?? data.video.width,
                    height: translation.height ?? data.video.height,
                },
                flags: { babele: { translated: true } },
            });
        });
    }

    static pages(): Converter {
        return function (pages: unknown, translations: TranslationEntryData | string): unknown {
            if (!Array.isArray(pages)) return;
            return Converters.#pages(pages, translations);
        };
    }

    static #deckCards(cards: CardSource[], translations: TranslationEntryData | string) {
        if (!R.isPlainObject(translations)) return cards;
        return cards.map((data) => {
            const translation = translations[data.name] as Partial<CardSource>;
            if (!R.isPlainObject(translation)) return data;

            return fu.mergeObject(data, {
                name: translation.name ?? data.name,
                description: translation.description ?? data.description,
                suit: translation.suit ?? data.suit,
                faces: ((translation.faces as CardFaceSource[]) ?? []).map((face, faceIndex) => {
                    const faceData = data.faces[faceIndex];
                    return fu.mergeObject(faceData ?? {}, {
                        img: face.img ?? faceData.img,
                        name: face.name ?? faceData.name,
                        text: face.text ?? faceData.text,
                    });
                }),
                back: {
                    img: translation.back?.img ?? data.back.img,
                    name: translation.back?.name ?? data.back.name,
                    text: translation.back?.text ?? data.back.text,
                },
                flags: { babele: { translated: true } },
            });
        });
    }

    static deckCards(): Converter {
        return function (cards: unknown, translations: TranslationEntryData | string): unknown {
            if (!Array.isArray(cards)) return cards;
            return Converters.#deckCards(cards, translations);
        };
    }

    static #playlistSounds(sounds: PlaylistSoundSource[], translations: TranslationEntryData | string) {
        if (!R.isPlainObject(translations)) return sounds;
        return sounds.map((data) => {
            if (translations) {
                const translation = translations[data.name];
                if (R.isPlainObject(translation)) {
                    return fu.mergeObject(data, {
                        name: translation.name ?? data.name,
                        description: translation.description ?? data.description,
                        flags: { babele: { translated: true } },
                    });
                }
            }
            return data;
        });
    }

    static playlistSounds(): Converter {
        return function (sounds: unknown, translations: TranslationEntryData | string): unknown {
            if (!Array.isArray(sounds)) return sounds;
            return Converters.#playlistSounds(sounds, translations);
        };
    }
}

type JournalEntryPageSource = SourceFromSchema<JournalEntryPageSchema>;
type CardSource = SourceFromSchema<CardSchema>;
type CardFaceSource = SourceFromSchema<CardFaceSchema>;

export { Converters };
