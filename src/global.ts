/// <reference types="vite/client" />
import type { Babele, CompendiumMapping, Converters, FieldMapping } from "@module";

interface GameBabele
    extends Game<Actor<null>, Actors<Actor<null>>, ChatMessage, Combat, Item<null>, Macro, Scene, User, Folder> {
    babele: Babele;
}

declare global {
    namespace globalThis {
        /* eslint-disable no-var */
        var Babele: ConstructorOf<Babele>;
        var CompendiumMapping: ConstructorOf<CompendiumMapping>;
        var Converters: ConstructorOf<Converters>;
        var FieldMapping: ConstructorOf<FieldMapping>;
        var libWrapper: {
            register: (packageId: string, target: string, fn: Function, type: string, options?: object) => number;
            unregister_all: (packageId: string) => void;
        };

        var CONFIG: Config<
            AmbientLightDocument<Scene | null>,
            ActiveEffect<Actor | Item | null>,
            Actor<TokenDocument | null>,
            ActorDelta<TokenDocument | null>,
            ChatLog,
            ChatMessage,
            Combat,
            Combatant<Combat | null, TokenDocument | null>,
            CombatTracker<Combat | null>,
            CompendiumDirectory,
            Hotbar,
            Item<Actor | null>,
            Macro,
            MeasuredTemplateDocument<Scene | null>,
            TileDocument<Scene | null>,
            TokenDocument<Scene | null>,
            WallDocument<Scene | null>,
            Scene,
            User<Actor<null>>,
            EffectsCanvasGroup
        >;
        var game: GameBabele;
        var ui: FoundryUI<
            ActorDirectory<Actor<null>>,
            ItemDirectory<Item<null>>,
            ChatLog,
            CompendiumDirectory,
            CombatTracker<Combat | null>
        >;

        var fu: typeof foundry.utils;
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
