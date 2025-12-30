import { Plugin, Notice, View, WorkspaceLeaf, Workspace, EventRef } from "obsidian";
import { KittySettings, DEFAULT_SETTINGS } from "./types";
import { KittySettingTab } from "./settings";
import { KittyController } from "./controller";

interface ExtendedLeaf extends WorkspaceLeaf {
    id: string;
}

interface ExtendedWorkspace extends Workspace {
    getLeafById(id: string): WorkspaceLeaf | null;
}

declare module "obsidian" {
    interface Workspace {
        on(name: 'detach', callback: (leaf: WorkspaceLeaf) => void, ctx?: unknown): EventRef;
        getLeafById(id: string): WorkspaceLeaf | null;
    }
}

export default class Kitty extends Plugin {
    settings: KittySettings;
    controller: KittyController;

    async onload() {
        await this.loadSettings();

        if (!this.settings.persistOnRelaunch) {
            this.settings.isEnabled = false;
            this.settings.activeLeafId = null;
        }

        this.controller = new KittyController(this);
        this.addChild(this.controller);
        this.addSettingTab(new KittySettingTab(this.app, this));

        this.app.workspace.onLayoutReady(() => {
            this.controller.initializeFromSave();
        });

        this.registerEvent(
            this.app.workspace.on('detach', (leaf: WorkspaceLeaf) => {
                const internalLeaf = leaf as ExtendedLeaf;
                const leafId = internalLeaf.id;

                if (leafId && leafId === this.settings.activeLeafId) {
                    this.settings.isEnabled = false;
                    this.settings.activeLeafId = null;
                    this.controller.cleanup();
                    void this.saveSettings();
                    
                    const label = this.settings.activeSprite;
                    new Notice(`${label} disappeared.`);
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                if (this.settings.isEnabled && this.settings.activeLeafId) {
                    const workspace = this.app.workspace as ExtendedWorkspace;
                    const leaf = workspace.getLeafById(this.settings.activeLeafId);
                    
                    if (!leaf) {
                        this.settings.isEnabled = false;
                        this.settings.activeLeafId = null;
                        this.controller.cleanup();
                        void this.saveSettings();
                        
                        const label = this.settings.activeSprite;
                        new Notice(`${label} disappeared.`);
                    }
                }
            })
        );
        
        this.addCommand({
            id: 'toggle-sprite',
            name: 'Toggle sprite',
            callback: async () => {
                const view = this.app.workspace.getActiveViewOfType(View);
                const leaf = view?.leaf;

                if (!leaf) {
                    new Notice("Select a pane to toggle.");
                    return;
                }

                this.settings.isEnabled = !this.settings.isEnabled;

                if (this.settings.isEnabled) {
                    const leafWithId = leaf as ExtendedLeaf;
                    this.settings.activeLeafId = leafWithId.id ?? null;
                } else {
                    this.settings.activeLeafId = null;
                }

                await this.saveSettings();
                this.controller.refresh(leaf);

                const label = this.settings.activeSprite;
                new Notice(this.settings.isEnabled ? `${label} appeared.` : `${label} disappeared.`);
            }
        });
    }

    async loadSettings() {
        const data = (await this.loadData()) as Record<string, unknown>;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}