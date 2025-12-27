export interface FrameDef {
    id: string;
    name?: string;
    frames: number;
    move?: boolean;
}

export interface SpriteConfig {
    name: string;
    spritePath: string;
    sliceSize: string;
    fps: number;
    scale: number;
    frameAxis: 'rows' | 'columns';
    framesJson: string;
}

export interface KittySettings {
    isEnabled: boolean;
    persistOnRelaunch: boolean;
    globalMovement: boolean;
    activeSprite: string;
    activeLeafId: string | null;
    library: Record<string, SpriteConfig>;
}

export const DEFAULT_JSON = JSON.stringify({
  "rows": [
    { "id": "0", "name": "sitting", "frames": 4, "move": false },
    { "id": "1", "name": "looking", "frames": 4, "move": false },
    { "id": "2", "name": "licking", "frames": 4, "move": false },
    { "id": "3", "name": "cleaning_ears", "frames": 4, "move": false },
    { "id": "4", "name": "running", "frames": 8, "move": true },
    { "id": "5", "name": "zoomies", "frames": 8, "move": true },
    { "id": "6", "name": "sleep", "frames": 4, "move": false },
    { "id": "7", "name": "cautious", "frames": 6, "move": false },
    { "id": "8", "name": "pounce", "frames": 7, "move": false },
    { "id": "9", "name": "scaredy_cat", "frames": 8, "move": false }
  ]
}, null, 2);

export const KITTY_CONFIG: SpriteConfig = {
    name: "Kitty",
    spritePath: "", 
    sliceSize: "32",
    fps: 6,
    scale: 2,
    frameAxis: 'rows',
    framesJson: DEFAULT_JSON
};

export const MANEKI_NEKO_CONFIG: SpriteConfig = {
    name: "Maneki Neko",
    spritePath: "",
    sliceSize: "16",
    fps: 1,
    scale: 2,
    frameAxis: 'rows',
    framesJson: JSON.stringify({
        "rows": [
            { "id": "lucky", "frames": 1, "move": false }
        ]
    })
};

export const DEFAULT_SETTINGS: KittySettings = {
    isEnabled: false,
    persistOnRelaunch: false,
    globalMovement: true,
    activeSprite: "Kitty",
    activeLeafId: null,
    library: {
        "Kitty": KITTY_CONFIG,
        "Maneki Neko": MANEKI_NEKO_CONFIG
    }
};