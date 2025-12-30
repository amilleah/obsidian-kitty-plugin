import { App, Component, WorkspaceLeaf, View, normalizePath } from "obsidian";
import { SpriteConfig, FrameDef, KITTY_CONFIG } from "./types";
import { ASSETS } from "./assets"
import Kitty from "./main";

interface InternalLeaf extends WorkspaceLeaf {
    id: string;
}

interface InternalWorkspace {
    getLeafById(id: string): WorkspaceLeaf | null;
}

export class KittyController extends Component {
    plugin: Kitty;
    app: App;
    targetLeaf: WorkspaceLeaf | null = null;
    containerEl: HTMLElement | null = null;
    canvas: HTMLCanvasElement | null = null;
    ctx: CanvasRenderingContext2D | null = null;
    config: SpriteConfig;
    img: HTMLImageElement;
    frameDefs: FrameDef[] = [];
    currentFrameDef: FrameDef | undefined;
    frameIndex = 0;
    rowIndex = 0;
    lastFrameTime = 0;
    animationReqId: number | null = null;
    isDragging = false;
    posX = 50; 
    posY: number | null = null;
    velocity = 1; 
    movingRight = true;
    sliceW = 32;
    sliceH = 32;

    private _onMove: ((e: PointerEvent) => void) | null = null;
    private _onUp: (() => void) | null = null;

    constructor(plugin: Kitty) {
        super();
        this.plugin = plugin;
        this.app = plugin.app;
    }

    onunload() {
        this.cleanup();
    }

    public initializeFromSave() {
        if (!this.plugin.settings.isEnabled) return;
        const savedId = this.plugin.settings.activeLeafId;
        
        let leaf: WorkspaceLeaf | null = null;
        
        if (savedId) {
            const workspace = this.app.workspace as InternalWorkspace;
            if (typeof workspace.getLeafById === 'function') {
                leaf = workspace.getLeafById(savedId);
            }
        }

        if (!leaf) {
            const activeView = this.app.workspace.getActiveViewOfType(View);
            leaf = activeView?.leaf ?? null;
        }
        
        this.refresh(leaf ?? undefined);
    }

    public refresh(leaf?: WorkspaceLeaf) {
        this.cleanup();
        if (!this.plugin.settings.isEnabled) return;
        if (leaf) this.targetLeaf = leaf;
        const activeKey = this.plugin.settings.activeSprite;
        this.config = this.plugin.settings.library[activeKey] || KITTY_CONFIG;
        if (this.targetLeaf) {
            void this.initialize(); 
        }
    }

    public cleanup() {
        if (this.animationReqId) {
            window.cancelAnimationFrame(this.animationReqId);
            this.animationReqId = null;
        }
        if (this._onMove) window.removeEventListener("pointermove", this._onMove);
        if (this._onUp) window.removeEventListener("pointerup", this._onUp);
        
        if (this.containerEl) {
            this.containerEl.remove();
            this.containerEl = null;
        }
        this.canvas = null;
        this.ctx = null;
        this.isDragging = false;
    }

    private async initialize() {
        try {
            const parsed = JSON.parse(this.config.framesJson) as Record<string, unknown>;
            const list = (parsed.rows || parsed.cols || parsed.columns || parsed) as FrameDef[];
            this.frameDefs = Array.isArray(list) ? list : [{ id: "0", frames: 1, move: false }];
        } catch {
            this.frameDefs = [{ id: "0", frames: 1, move: false }];
        }

        const parts = this.config.sliceSize.split(',').map(s => parseInt(s.trim()));
        this.sliceW = parts[0] || 32;
        this.sliceH = parts[1] || parts[0] || 32;

        this.img = new Image();
        this.img.onload = () => {
            this.pickNewAction();
            this.reattach();
            this.startLoop();
        };

        const path = this.config.spritePath;
        const embeddedBase64 = ASSETS[this.config.name];

        if (path) {
            const pluginDir = this.plugin.manifest.dir ?? "";
            const fullPath = normalizePath(`${pluginDir}/${path}`);
            const adapter = this.app.vault.adapter;

            if (await adapter.exists(fullPath)) {
                this.img.src = adapter.getResourcePath(fullPath);
                return;
            }
        }

        if (embeddedBase64) {
            this.img.src = embeddedBase64;
        } else {
            this.img.src = ASSETS["Kitty"]!;
        }
    }

    private reattach() {
        const parent = this.getLeafHostContainer(this.targetLeaf);
        if (!parent) return;
        parent.classList.add("kitty-leaf-host");

        if (!this.containerEl) {
            this.containerEl = parent.createDiv({ cls: "kitty-host" });
            this.canvas = this.containerEl.createEl("canvas", { cls: "kitty-canvas" });
            this.ctx = this.canvas.getContext("2d");
            this.plugin.registerDomEvent(this.canvas, "pointerdown", (e) => this.onPointerDown(e));
        } else if (this.containerEl.parentElement !== parent) {
            parent.appendChild(this.containerEl);
        }

        if (this.canvas) {
            this.canvas.width = this.sliceW * this.config.scale;
            this.canvas.height = this.sliceH * this.config.scale;
            this.canvas.style.setProperty('width', `${this.canvas.width}px`);
            this.canvas.style.setProperty('height', `${this.canvas.height}px`);
        }

        this.updatePosition();
    }

    private startLoop() {
        const loop = (timestamp: number) => {
            if (!this.lastFrameTime) this.lastFrameTime = timestamp;
            const elapsed = timestamp - this.lastFrameTime;
            const interval = 1000 / this.config.fps;
            
            if (this.targetLeaf) {
                const host = this.getLeafHostContainer(this.targetLeaf);
                if (host && (!this.containerEl || !this.containerEl.isConnected || !host.contains(this.containerEl))) {
                    this.reattach();
                }
            }

            if (!this.isDragging && elapsed > interval) {
                this.lastFrameTime = timestamp - (elapsed % interval);
                this.frameIndex++;
                if (this.currentFrameDef && this.frameIndex >= this.currentFrameDef.frames) {
                    this.frameIndex = 0;
                    this.pickNewAction();
                }
            }
            if (!this.isDragging) this.updateMovement();
            this.draw();
            this.animationReqId = window.requestAnimationFrame(loop);
        };
        this.animationReqId = window.requestAnimationFrame(loop);
    }

    private updateMovement() {
        if (!this.plugin.settings.globalMovement || !this.currentFrameDef?.move) return;
        
        const spriteWidth = this.sliceW * this.config.scale;
        const parentWidth = this.containerEl?.parentElement?.clientWidth || 0;
        const buffer = 1;

        if (this.movingRight) {
            this.posX += this.velocity;
            if (this.posX >= (parentWidth - spriteWidth - buffer)) {
                this.posX = parentWidth - spriteWidth - buffer;
                this.movingRight = false;
            }
        } else {
            this.posX -= this.velocity;
            if (this.posX <= buffer) {
                this.posX = buffer;
                this.movingRight = true;
            }
        }
        this.updatePosition();
    }

    private updatePosition() {
        if (!this.containerEl) return;
        const gridStep = this.config.scale;
        const visualX = Math.round(this.posX / gridStep) * gridStep;
        
        const props: Record<string, string> = {
            "--kitty-left": `${visualX}px`,
            "--kitty-transform": this.movingRight ? 'scaleX(1)' : 'scaleX(-1)'
        };

        if (this.posY === null) {
            props["--kitty-bottom"] = '0px';
            props["--kitty-top"] = 'auto';
        } else {
            const visualY = Math.round(this.posY / gridStep) * gridStep;
            props["--kitty-bottom"] = 'auto';
            props["--kitty-top"] = `${visualY}px`;
        }

        this.containerEl.setCssProps(props);
    }

    private onPointerDown(evt: PointerEvent) {
        this.isDragging = true;
        this.containerEl?.classList.add("is-dragging");
        
        const target = evt.target as HTMLElement;
        target.setPointerCapture(evt.pointerId);

        this.updateDragPosition(evt.clientX, evt.clientY);

        this._onMove = (e: PointerEvent) => {
            if (!this.isDragging) return;

            const leaf = this.getLeafFromPoint(e.clientX, e.clientY);
            
            if (leaf && leaf !== this.targetLeaf) {
                const oldHostRect = this.containerEl?.parentElement?.getBoundingClientRect();
                
                this.targetLeaf = leaf;
                this.reattach();
                
                const newHostRect = this.containerEl?.parentElement?.getBoundingClientRect();

                if (oldHostRect && newHostRect) {
                    this.posX += (oldHostRect.left - newHostRect.left);
                    if (this.posY !== null) {
                        this.posY += (oldHostRect.top - newHostRect.top);
                    }
                }
            }
            
            this.updateDragPosition(e.clientX, e.clientY);
        };

        this._onUp = () => {
            this.isDragging = false;
            this.containerEl?.classList.remove("is-dragging");
            this.posY = null;
            this.updatePosition();
            void this.persistTargetLeaf();

            if (this._onMove) window.removeEventListener("pointermove", this._onMove);
            if (this._onUp) window.removeEventListener("pointerup", this._onUp);
            
            this._onMove = null;
            this._onUp = null;
        };

        window.addEventListener("pointermove", this._onMove);
        window.addEventListener("pointerup", this._onUp);
    }

    private updateDragPosition(clientX: number, clientY: number) {
        if (!this.containerEl?.parentElement) return;
        const rect = this.containerEl.parentElement.getBoundingClientRect();
        const spriteWidth = this.sliceW * this.config.scale;
        const spriteHeight = this.sliceH * this.config.scale;
        const buffer = 1; 

        const targetX = clientX - rect.left - (spriteWidth / 2);
        const targetY = clientY - rect.top - (spriteHeight / 2);
        
        this.posX = Math.max(buffer, Math.min(targetX, rect.width - spriteWidth - buffer));
        this.posY = Math.max(buffer, Math.min(targetY, rect.height - spriteHeight - buffer));
        
        this.updatePosition();
    }

    private getLeafFromPoint(x: number, y: number): WorkspaceLeaf | null {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        
        const leafEl = el.closest('.workspace-leaf');
        if (!leafEl) return null;

        let found: WorkspaceLeaf | null = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            const internalLeaf = leaf as WorkspaceLeaf & { containerEl: HTMLElement };
            
            if (internalLeaf.containerEl === leafEl) {
                found = leaf;
            }
        });
        return found;
    }

    private getLeafHostContainer(leaf: WorkspaceLeaf | null): HTMLElement | null {
        if (!leaf) return null;
        const tabGroup = leaf.view.containerEl.closest(".workspace-tabs");
        const container = tabGroup?.querySelector(".workspace-tab-container");
        return (container as HTMLElement) || leaf.view.containerEl;
    }

    private pickNewAction() {
        if (this.frameDefs.length > 0) {
            this.rowIndex = Math.floor(Math.random() * this.frameDefs.length);
            this.currentFrameDef = this.frameDefs[this.rowIndex];
            this.frameIndex = 0;
        }
    }

    private draw() {
        if (!this.ctx || !this.img || !this.currentFrameDef || !this.canvas) return;
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const sx = this.config.frameAxis === 'rows' ? this.frameIndex * this.sliceW : this.rowIndex * this.sliceW;
        const sy = this.config.frameAxis === 'rows' ? this.rowIndex * this.sliceH : this.frameIndex * this.sliceH;
        this.ctx.drawImage(this.img, sx, sy, this.sliceW, this.sliceH, 0, 0, this.canvas.width, this.canvas.height);
    }

    private async persistTargetLeaf() {
        if (!this.targetLeaf) return;
        const leafWithId = this.targetLeaf as InternalLeaf;
        if (leafWithId.id) {
            this.plugin.settings.activeLeafId = leafWithId.id;
            await this.plugin.saveSettings();
        }
    }
}