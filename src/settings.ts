import { App, PluginSettingTab, Setting, Modal, Notice, normalizePath } from "obsidian";
import Kitty from "./main";
import { SpriteConfig, KITTY_CONFIG, MANEKI_NEKO_CONFIG } from "./types";

export class KittySettingTab extends PluginSettingTab {
    plugin: Kitty;
    editorConfig: SpriteConfig;

    constructor(app: App, plugin: Kitty) {
        super(app, plugin);
        this.plugin = plugin;
        this.resetEditor();
    }

    resetEditor() {
        const active = this.plugin.settings.library[this.plugin.settings.activeSprite] || KITTY_CONFIG;
        this.editorConfig = { ...active };
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Persist on relaunch')
            .addToggle(t => t
                .setValue(this.plugin.settings.persistOnRelaunch)
                .onChange(async (val) => {
                    this.plugin.settings.persistOnRelaunch = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Allow movement')
            .addToggle(t => t
                .setValue(this.plugin.settings.globalMovement)
                .onChange(async (val) => {
                    this.plugin.settings.globalMovement = val;
                    await this.plugin.saveSettings();
                }));

        const options: Record<string, string> = {};
        Object.keys(this.plugin.settings.library).forEach(k => options[k] = k);

        new Setting(containerEl)
            .setName('Active sprite')
            .addDropdown(drop => drop
                .addOptions(options)
                .setValue(this.plugin.settings.activeSprite)
                .onChange(async (val) => {
                    this.plugin.settings.activeSprite = val;
                    await this.plugin.saveSettings();
                    this.resetEditor();
                    this.display();
                    this.plugin.controller.refresh(this.plugin.controller.targetLeaf || undefined);
                }));

        new Setting(containerEl).setName('Sprite editor').setHeading();

        new Setting(containerEl).setName('Name').addText(t => t
            .setValue(this.editorConfig.name)
            .onChange(v => { this.editorConfig.name = v; }));

        new Setting(containerEl)
            .setName('Sprite image')
            .setDesc('Copy a sprite into the plugin folder.')
            .addButton(btn => btn
                .setButtonText('Choose file')
                .onClick(() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    
                    input.onchange = (e: Event) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;

                        const reader = new FileReader();
                        reader.onload = async (event) => {
                            const content = event.target?.result as ArrayBuffer;
                            const pluginDir = this.plugin.manifest.dir;
                            if (!pluginDir) return;

                            const fileName = file.name;
                            const destinationPath = normalizePath(`${pluginDir}/sprites/${fileName}`);
                            
                            const adapter = this.app.vault.adapter;
                            const spritesDir = normalizePath(`${pluginDir}/sprites`);
                            
                            if (!(await adapter.exists(spritesDir))) {
                                await adapter.mkdir(spritesDir);
                            }

                            await adapter.writeBinary(destinationPath, content);
                            
                            this.editorConfig.spritePath = `sprites/${fileName}`;
                            new Notice(`${fileName} copied to plugin folder.`);
                            this.display();
                        };
                        reader.readAsArrayBuffer(file);
                    };
                    input.click();
                }));

        new Setting(containerEl).setName('Frame dimensions')
            .setDesc('Width and height (e.g., "32, 32").')
            .addText(t => t
            .setValue(this.editorConfig.sliceSize)
            .onChange(v => { this.editorConfig.sliceSize = v; }));

        new Setting(containerEl).setName('Frame scale').addText(t => t
            .setValue(String(this.editorConfig.scale))
            .onChange(v => { this.editorConfig.scale = Number(v); }));

        new Setting(containerEl).setName('Frames per second').addText(t => t
            .setValue(String(this.editorConfig.fps))
            .onChange(v => { this.editorConfig.fps = Number(v); }));

        new Setting(containerEl).setName('Frame axis')
            .addDropdown(d => d
                .addOption('rows', 'Rows')
                .addOption('columns', 'Columns')
                .setValue(this.editorConfig.frameAxis)
                .onChange(v => { this.editorConfig.frameAxis = v as 'rows' | 'columns'; }));

        new Setting(containerEl).setName('Frames JSON').addTextArea(t => t
            .setValue(this.editorConfig.framesJson)
            .setPlaceholder('{"rows": [...]}')
            .onChange(v => { this.editorConfig.framesJson = v; }));

        const saveSetting = new Setting(containerEl);

        if (this.editorConfig.name !== "Kitty" && this.editorConfig.name !== "Maneki Neko") {
            saveSetting.addButton(btn => btn
                .setIcon("trash-2")
                .setWarning()
                .setTooltip("Delete sprite from library")
                .onClick(() => {
                    const name = this.editorConfig.name;
                    new ConfirmModal(this.app, `Do you want to delete "${name}"?`, () => {
                        void (async () => {
                            delete this.plugin.settings.library[name];
                            if (this.plugin.settings.activeSprite === name) {
                                this.plugin.settings.activeSprite = "Kitty";
                            }
                            await this.plugin.saveSettings();
                            this.resetEditor();
                            this.display();
                            this.plugin.controller.refresh();
                            new Notice(`Deleted ${name}.`);
                        })();
                    }).open();
                }));
        }
        
        saveSetting.addButton(btn => btn
            .setButtonText('Reset to default')
            .onClick(async () => {
                const name = this.editorConfig.name;

                if (name === "Kitty") {
                    this.plugin.settings.library["Kitty"] = { ...KITTY_CONFIG };
                    new Notice("Kitty config restored to default settings.");
                } else if (name === "Maneki Neko") {
                    this.plugin.settings.library["Maneki Neko"] = { ...MANEKI_NEKO_CONFIG };
                    new Notice("Maneki neko config restored to default settings.");
                } else {
                    this.editorConfig.spritePath = "";
                    new Notice("Custom sprite path cleared.");
                    this.display();
                    return;
                }

                await this.plugin.saveSettings();
                this.resetEditor(); 
                this.display();
                this.plugin.controller.refresh();
            }));

        saveSetting.addButton(btn => btn
            .setButtonText('Save to library')
            .setCta()
            .onClick(async () => {
                const name = this.editorConfig.name || "Unnamed";
                this.plugin.settings.library[name] = { ...this.editorConfig };
                this.plugin.settings.activeSprite = name;
                await this.plugin.saveSettings();
                this.plugin.controller.refresh(this.plugin.controller.targetLeaf || undefined);
                new Notice(`Saved ${name}.`);
                this.display();
            }));
    }
}

export class ConfirmModal extends Modal {
    onConfirm: () => void;

    constructor(app: App, message: string, onConfirm: () => void) {
        super(app);
        this.onConfirm = onConfirm;
        this.setTitle("Are you sure?");
        this.contentEl.createEl("p", { text: message });
    }

    onOpen() {
        new Setting(this.contentEl)
            .addButton(btn => btn
                .setButtonText("Confirm")
                .setWarning()
                .onClick(() => {
                    this.onConfirm();
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText("Cancel")
                .onClick(() => this.close()));
    }
}