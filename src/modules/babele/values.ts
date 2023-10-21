const DEFAULT_MAPPINGS = {
    Adventure: {
        name: "name",
        description: "description",
        caption: "caption",
        folders: {
            path: "folders",
            converter: "nameCollection",
        },
        journals: {
            path: "journal",
            converter: "adventureJournals",
        },
        scenes: {
            path: "scenes",
            converter: "adventureScenes",
        },
        macros: {
            path: "macros",
            converter: "adventureMacros",
        },
        playlists: {
            path: "playlists",
            converter: "adventurePlaylists",
        },
        tables: {
            path: "tables",
            converter: "tableResultsCollection",
        },
        items: {
            path: "items",
            converter: "adventureItems",
        },
        actors: {
            path: "actors",
            converter: "adventureActors",
        },
        cards: {
            path: "cards",
            converter: "adventureCards",
        },
    },
    Actor: {
        name: "name",
        description: "system.details.biography.value",
        items: {
            path: "items",
            converter: "fromPack",
        },
        tokenName: {
            path: "prototypeToken.name",
            converter: "name",
        },
    },
    Cards: {
        name: "name",
        description: "description",
        cards: {
            path: "cards",
            converter: "deckCards",
        },
    },
    Folder: {},
    Item: {
        name: "name",
        description: "system.description.value",
    },
    JournalEntry: {
        name: "name",
        description: "content",
        pages: {
            path: "pages",
            converter: "pages",
        },
    },
    Macro: {
        name: "name",
        command: "command",
    },
    Playlist: {
        name: "name",
        description: "description",
        sounds: {
            path: "sounds",
            converter: "playlistSounds",
        },
    },
    RollTable: {
        name: "name",
        description: "description",
        results: {
            path: "results",
            converter: "tableResults",
        },
    },
    Scene: {
        name: "name",
        drawings: {
            path: "drawings",
            converter: "textCollection",
        },
        notes: {
            path: "notes",
            converter: "textCollection",
        },
    },
} as const;

const PACK_FOLDER_TRANSLATION_NAME_SUFFIX = "_packs-folders" as const;

const SUPPORTED_PACKS = [
    "Adventure",
    "Actor",
    "Cards",
    "Folder",
    "Item",
    "JournalEntry",
    "Macro",
    "Playlist",
    "RollTable",
    "Scene",
] as const;

type DocumentType = keyof typeof DEFAULT_MAPPINGS;

export { DEFAULT_MAPPINGS, PACK_FOLDER_TRANSLATION_NAME_SUFFIX, SUPPORTED_PACKS };
export type { DocumentType };
