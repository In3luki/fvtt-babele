import * as R from "remeda";
import { CompendiumMapping, TranslatedCompendium } from "@modules";
import type { TranslatableData, TranslationEntry, CompendiumTranslations, Mapping } from "@modules/babele/types.ts";
import type { DocumentType } from "@modules/babele/values.ts";
import type { TableResultSource } from "types/foundry/common/documents/table-result.js";
import type { RollTableSource } from "types/foundry/common/documents/roll-table.js";
import type { CardFaceSchema, CardSchema } from "types/foundry/common/documents/card.js";
import type { JournalEntryPageSchema } from "types/foundry/common/documents/journal-entry-page.js";
import type { PlaylistSoundSource } from "types/foundry/common/documents/playlist-sound.js";

/** Utility class with all predefined converters */
class Converters {
    static fromPack(mapping?: Mapping, documentType: DocumentType = "Item"): Function {
        const dynamicMapping = new CompendiumMapping(documentType, mapping);
        return function (documents: TranslatableData[], translations: CompendiumTranslations) {
            return Converters.#fromPack(documents, documentType, translations, dynamicMapping);
        };
    }

    static fromDefaultMapping(documentType: DocumentType) {
        return function (
            documents: TranslatableData[],
            translations: CompendiumTranslations,
            _data: TranslatableData,
            tc: TranslatedCompendium
        ): (TranslatableData | null)[] {
            const babeleTranslations = game.babele.translations.get(tc.metadata.id);
            const dynamicMapping = new CompendiumMapping(documentType, babeleTranslations?.mapping, tc);
            return Converters.#fromPack(documents, documentType, translations, dynamicMapping);
        };
    }

    static #fromPack(
        documents: TranslatableData[],
        documentType: DocumentType,
        translations: CompendiumTranslations | string,
        dynamicMapping: CompendiumMapping
    ): TranslatableData[] {
        return R.compact(
            documents.map((data) => {
                if (translations && typeof translations !== "string") {
                    const translation = translations[data._id] ?? translations[data.name];
                    if (translation) {
                        const translatedData = dynamicMapping.map(data, translation);
                        return mergeObject(data, mergeObject(translatedData, { translated: true }));
                    }
                }
                const pack = game.babele.packs.find(
                    (pack) => pack.translated && pack.documentType === documentType && pack.hasTranslation(data)
                );
                return pack ? pack.translate(data) : data;
            })
        );
    }

    static mappedField(field: string) {
        return function (
            _documents: TranslatableData[],
            translation: CompendiumTranslations | string,
            data: TranslatableData,
            tc?: TranslatedCompendium
        ): unknown {
            if (typeof translation === "string") {
                return translation;
            }
            return tc?.translateField(field, data);
        };
    }

    static fieldCollection(field: string) {
        return function (
            collection: Record<string, string>[],
            translations: TranslationEntry
        ): Record<string, string>[] {
            if (!translations) {
                return collection;
            }

            return collection.map((data) => {
                const translation = translations[data[field]];
                if (!translation) {
                    return data;
                }

                return mergeObject(data, { [field]: translation, translated: true });
            });
        };
    }

    static #tableResults(results: TableResultSource[], translations: CompendiumTranslations) {
        return results.map((data) => {
            if (translations) {
                const translation = translations[`${data.range[0]}-${data.range[1]}`];
                if (translation) {
                    return mergeObject(data, mergeObject({ text: translation }, { translated: true }));
                }
            }
            if (data.documentCollection) {
                const text = game.babele.translateField("name", data.documentCollection, { name: data.text });
                return text ? mergeObject(data, mergeObject({ text: text }, { translated: true })) : data;
            }
            return data;
        });
    }

    static tableResults() {
        return function (results: TableResultSource[], translations: CompendiumTranslations): TableResultSource[] {
            return Converters.#tableResults(results, translations);
        };
    }

    static tableResultsCollection() {
        return function (collection: RollTableSource[], translations: CompendiumTranslations): RollTableSource[] {
            if (!translations) {
                return collection;
            }

            return collection.map((data) => {
                const translation = translations[data.name];
                if (!translation) {
                    return data;
                }

                return mergeObject(data, {
                    name: translation.name ?? data.name,
                    description: translation.description ?? data.description,
                    results: Converters.#tableResults(data.results, translations),
                    translated: true,
                });
            });
        };
    }

    static #pages(pages: JournalEntryPageSource[], translations: CompendiumTranslations) {
        return pages.map((data) => {
            if (!translations) {
                return data;
            }

            const translation = translations[data.name];
            if (!translation) {
                return data;
            }

            return mergeObject(data, {
                name: translation.name,
                image: { caption: translation.caption ?? data.image.caption },
                src: translation.src ?? data.src,
                text: { content: translation.text ?? data.text.content },
                video: {
                    width: translation.width ?? data.video.width,
                    height: translation.height ?? data.video.height,
                },
                translated: true,
            });
        });
    }

    static pages() {
        return function (
            pages: JournalEntryPageSource[],
            translations: CompendiumTranslations
        ): JournalEntryPageSource[] {
            return Converters.#pages(pages, translations);
        };
    }

    static #deckCards(cards: CardSource[], translations: CompendiumTranslations) {
        return cards.map((data) => {
            if (translations) {
                const translation = translations[data.name] as Partial<CardSource>;
                if (translation) {
                    return mergeObject(data, {
                        name: translation.name ?? data.name,
                        description: translation.description ?? data.description,
                        suit: translation.suit ?? data.suit,
                        faces: ((translation.faces as CardFaceSource[]) ?? []).map((face, faceIndex) => {
                            const faceData = data.faces[faceIndex];
                            return mergeObject(faceData ?? {}, {
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
                        translated: true,
                    });
                }
            }
            return data;
        });
    }

    static deckCards() {
        return function (cards: CardSource[], translations: CompendiumTranslations): CardSource[] {
            return Converters.#deckCards(cards, translations);
        };
    }

    static #playlistSounds(sounds: PlaylistSoundSource[], translations: CompendiumTranslations) {
        return sounds.map((data) => {
            if (translations) {
                const translation = translations[data.name];
                if (translation) {
                    return mergeObject(data, {
                        name: translation.name ?? data.name,
                        description: translation.description ?? data.description,
                        translated: true,
                    });
                }
            }

            return data;
        });
    }

    static playlistSounds() {
        return function (sounds: PlaylistSoundSource[], translations: CompendiumTranslations): PlaylistSoundSource[] {
            return Converters.#playlistSounds(sounds, translations);
        };
    }
}

type JournalEntryPageSource = SourceFromSchema<JournalEntryPageSchema>;
type CardSource = SourceFromSchema<CardSchema>;
type CardFaceSource = SourceFromSchema<CardFaceSchema>;

export { Converters };
