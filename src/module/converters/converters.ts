import * as R from "remeda";
import { CompendiumMapping, type TranslatedCompendium } from "@module";
import type {
    CompendiumTranslations,
    Mapping,
    SupportedType,
    TranslatableData,
    TranslationEntry,
} from "@module/babele/types.ts";
import type { TableResultSource } from "types/foundry/common/documents/table-result.d.ts";
import type { RollTableSource } from "types/foundry/common/documents/roll-table.d.ts";
import type { CardFaceSchema, CardSchema } from "types/foundry/common/documents/card.d.ts";
import type { JournalEntryPageSchema } from "types/foundry/common/documents/journal-entry-page.d.ts";
import type { PlaylistSoundSource } from "types/foundry/common/documents/playlist-sound.d.ts";
import { collectionFromUUID } from "@util";

/** Utility class with all predefined converters */
class Converters {
    static fromPack(mapping?: Mapping, documentType: SupportedType = "Item"): Function {
        const dynamicMapping = new CompendiumMapping(documentType, mapping);
        return function (documents: TranslatableData[], translations: CompendiumTranslations) {
            return Converters.#fromPack(documents, documentType, translations, dynamicMapping);
        };
    }

    static fromDefaultMapping(documentType: SupportedType) {
        return function (
            documents: TranslatableData[],
            translations: CompendiumTranslations,
            _data: TranslatableData,
            tc: TranslatedCompendium,
        ): (TranslatableData | null)[] {
            const babeleTranslations = game.babele.translations.get(tc.metadata.id);
            const dynamicMapping = new CompendiumMapping(documentType, babeleTranslations?.mapping, tc);
            return Converters.#fromPack(documents, documentType, translations, dynamicMapping);
        };
    }

    static #fromPack(
        documents: TranslatableData[],
        documentType: SupportedType,
        translations: CompendiumTranslations | string,
        dynamicMapping: CompendiumMapping,
    ): TranslatableData[] {
        return R.compact(
            documents.map((data) => {
                if (translations && typeof translations !== "string") {
                    const translation = translations[data._id] ?? translations[data.name];
                    if (translation) {
                        const translatedData = dynamicMapping.map(data, translation);
                        return fu.mergeObject(data, fu.mergeObject(translatedData, { translated: true }));
                    }
                }
                const pack = ((): TranslatedCompendium | null => {
                    const collection = collectionFromUUID(data.flags?.core?.sourceId ?? data.uuid);
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

    static mappedField(field: string) {
        return function (
            _documents: TranslatableData[],
            translation: CompendiumTranslations | string,
            data: TranslatableData,
            tc?: TranslatedCompendium,
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
            translations: TranslationEntry,
        ): Record<string, string>[] {
            if (!translations) {
                return collection;
            }

            return collection.map((data) => {
                const translation = translations[data[field]];
                if (!translation) {
                    return data;
                }

                return fu.mergeObject(data, { [field]: translation, translated: true });
            });
        };
    }

    static #tableResults(results: TableResultSource[], translations: CompendiumTranslations) {
        return results.map((data) => {
            if (translations) {
                const translation = translations[`${data.range[0]}-${data.range[1]}`];
                if (translation) {
                    return fu.mergeObject(data, { text: translation, translated: true });
                }
            }
            if (data.documentCollection) {
                const text = game.babele.translateField("name", data.documentCollection, {
                    name: data.text,
                } as TranslatableData);
                return text ? fu.mergeObject(data, { text, translated: true }) : data;
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

                return fu.mergeObject(data, {
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

            return fu.mergeObject(data, {
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
            translations: CompendiumTranslations,
        ): JournalEntryPageSource[] {
            return Converters.#pages(pages, translations);
        };
    }

    static #deckCards(cards: CardSource[], translations: CompendiumTranslations) {
        return cards.map((data) => {
            if (translations) {
                const translation = translations[data.name] as Partial<CardSource>;
                if (translation) {
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
                    return fu.mergeObject(data, {
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
