/// <reference types="vite/client" />
import { FolderSource } from "types/foundry/common/documents/folder.js";
import { Babele, CompendiumMapping, Converters, FieldMapping } from "@modules";

interface GameBabele
    extends Game<Actor<null>, Actors<Actor<null>>, ChatMessage, Combat, Item<null>, Macro, Scene, User, Folder> {
    babele: Babele;
    game: {
        data: {
            folders: FolderSource[];
        };
    };
}

declare global {
    namespace globalThis {
        /* eslint-disable no-var */
        var Babele: ConstructorOf<Babele>;
        var CompendiumMapping: ConstructorOf<CompendiumMapping>;
        var Converters: ConstructorOf<Converters>;
        var FieldMapping: ConstructorOf<FieldMapping>;

        var game: GameBabele;

        var libWrapper: {
            register: (packageId: string, target: string, fn: Function, type: string, options?: object) => number;
            unregister_all: (packageId: string) => void;
        };

        var ui: FoundryUI<
            ActorDirectory<Actor<null>>,
            ItemDirectory<Item<null>>,
            ChatLog,
            CompendiumDirectory,
            CombatTracker<Combat | null>
        >;
        /* eslint-enable no-var */
    }

    interface ClientSettings {
        get(module: "core", setting: "language"): string;
        get(module: "babele", setting: "translationFiles"): string[];
        get(module: "babele", setting: "directory"): string;
        get(module: "babele", setting: "showTranslateOption"): boolean;
        get(module: "babele", setting: "showOriginalName"): boolean;
        get(module: "babele", setting: "export"): boolean;
    }

    const BUILD_MODE: "development" | "production";
}
