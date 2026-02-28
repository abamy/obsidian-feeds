import {
  App,
  BasesEntry,
  Component,
  MarkdownView,
  Menu,
  WorkspaceLeaf,
} from "obsidian";
import { CardOptions, PropertyConfig } from "./types";

export class CardRenderer {
  private app: App;
  private component: Component;
  private activeLeaves: WeakMap<HTMLElement, WorkspaceLeaf> = new WeakMap();

  constructor(app: App, component: Component) {
    this.app = app;
    this.component = component;
  }

  render(
    el: HTMLElement,
    entry: BasesEntry,
    properties: PropertyConfig[],
    options: CardOptions,
  ): void {
    el.empty();
    el.className = "of-card" + (options.compactMode ? " of-compact" : "");

    // Header with title
    const header = el.createDiv({ cls: "of-card-header" });
    const titleEl = header.createEl("a", {
      cls: "of-card-title",
      text: entry.file.basename,
      href: "#",
    });
    titleEl.addEventListener("click", (evt) => {
      evt.preventDefault();
      const isModEvent = evt.ctrlKey || evt.metaKey;
      this.app.workspace.openLinkText(entry.file.path, "", isModEvent);
    });
    titleEl.addEventListener("mouseenter", (evt) => {
      this.app.workspace.trigger("hover-link", {
        event: evt,
        source: "obsidian-feeds",
        hoverParent: this.component,
        targetEl: evt.currentTarget,
        linktext: entry.file.path,
      });
    });
    titleEl.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      const menu = Menu.forEvent(evt);
      this.app.workspace.handleLinkContextMenu(menu, entry.file.path, "");
    });

    // Inline properties below title
    if (options.showProperties && properties.length > 0) {
      const propsRow = header.createDiv({ cls: "of-card-properties" });
      for (const prop of properties) {
        const valueEl = propsRow.createSpan({ cls: "of-property-value" });
        try {
          const value = entry.getValue(prop.id);
          if (value) {
            if (typeof value.renderTo === "function") {
              value.renderTo(valueEl, this.app.renderContext);
            } else {
              const str = value.toString();
              if (str) valueEl.textContent = str;
            }
          }
        } catch {
          // skip property if it fails
        }
        // Remove empty value elements
        if (!valueEl.textContent?.trim() && valueEl.childElementCount === 0) {
          valueEl.remove();
        }
      }
    }

    // Collapsible container with inline editor
    const collapse = el.createDiv({ cls: "of-card-collapse" });
    const inner = collapse.createDiv({ cls: "of-card-collapse-inner" });
    const editorEl = inner.createDiv({ cls: "of-card-editor" });

    // "See more" overlay -- initially hidden, shown only if content overflows
    const overlay = collapse.createDiv({ cls: "of-card-fade" });
    overlay.style.display = "none";
    const btn = overlay.createEl("button", {
      cls: "of-see-more",
      text: "See more",
    });
    btn.addEventListener("click", () => {
      collapse.classList.toggle("is-expanded");
      const expanded = collapse.classList.contains("is-expanded");
      btn.textContent = expanded ? "See less" : "See more";
      if (!expanded) {
        overlay.style.display = "";
      }
    });

    // Render the editor (async), then check overflow
    this.renderEditor(editorEl, entry, el).then(() => {
      requestAnimationFrame(() => {
        if (inner.scrollHeight > inner.clientHeight) {
          overlay.style.display = "";
        } else {
          overlay.style.display = "none";
        }
      });
    });
  }

  cleanup(el: HTMLElement): void {
    const leaf = this.activeLeaves.get(el);
    if (leaf) {
      leaf.detach();
      this.activeLeaves.delete(el);
    }
  }

  cleanupAll(els: Iterable<HTMLElement>): void {
    for (const el of els) {
      this.cleanup(el);
    }
  }

  private async renderEditor(
    container: HTMLElement,
    entry: BasesEntry,
    cardEl: HTMLElement,
  ): Promise<void> {
    try {
      this.cleanup(cardEl);

      const leaf = new (WorkspaceLeaf as any)(this.app) as WorkspaceLeaf;
      await leaf.openFile(entry.file, {
        state: { mode: "source", source: false },
      });

      if (!(leaf.view instanceof MarkdownView)) {
        leaf.detach();
        return;
      }

      container.appendChild(leaf.view.containerEl);
      this.activeLeaves.set(cardEl, leaf);
    } catch {
      container.createSpan({
        text: "Unable to load editor",
        cls: "of-content-error",
      });
    }
  }
}
