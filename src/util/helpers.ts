import { Babele } from "@module";
import { SupportedType } from "@module/babele/types.ts";

function JSONstringifyOrder(obj: object): string {
    const allKeys: Set<string> = new Set();
    const idKeys: string[] = [];
    JSON.stringify(obj, (key, value) => {
        if (/^[a-z0-9]{20,}$/g.test(key)) {
            idKeys.push(key);
        } else {
            allKeys.add(key);
        }

        return value;
    });
    const sortedKeys = Array.from(allKeys).sort().concat(idKeys);

    const newJson = JSON.stringify(obj, sortedKeys, 4);
    return `${newJson}\n`;
}

function collectionFromMetadata(metadata: CompendiumMetadata): string {
    const collectionPrefix = metadata.packageType === "world" ? "world" : metadata.packageName;
    return `${collectionPrefix}.${metadata.name}`;
}

function isCompendiumUUID(uuid: unknown): uuid is CompendiumUUID {
    return typeof uuid === "string" && uuid.startsWith("Compendium.");
}

function collectionFromUUID(uuid: unknown): string | null {
    if (!isCompendiumUUID(uuid)) return null;
    return uuid.split(".").splice(1, 2).join(".");
}

function isSupportedType(type?: unknown): type is SupportedType {
    if (typeof type !== "string") return false;
    return Babele.SUPPORTED_PACKS.includes(type as SupportedType);
}

export { isCompendiumUUID, isSupportedType, collectionFromMetadata, collectionFromUUID, JSONstringifyOrder };
