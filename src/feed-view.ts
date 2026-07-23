import {
  BasesEntry,
  BasesPropertyId,
  BasesView,
  Menu,
  QueryController,
  parsePropertyId,
} from "obsidian";
import { VirtualScroller } from "./virtual-scroller";
import { CardRenderer } from "./card-renderer";
import { CardOptions, PropertyConfig } from "./types";

export const FeedViewType = "obsidian-feed";

export class FeedView extends BasesView {
  type = FeedViewType;
  scrollEl: HTMLElement;
  containerEl: HTMLElement;

  // Implements HoverParent for hover previews
  hoverPopover: any = null;

  private entries: BasesEntry[] = [];
  private properties: PropertyConfig[] = [];
  private options: CardOptions = {
    showProperties: true,
    compactMode: false,
    matchContentWidth: true,
    cardWidth: 500,
    visibleProperties: [],
    dateFormat: "",
  };

  private scroller: VirtualScroller | null = null;
  private cardRenderer: CardRenderer | null = null;
  private wrapperEl: HTMLElement;
  private prevOptionsKey = "";
  private prevEntryPaths = "";
  private updateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(controller: QueryController, scrollEl: HTMLElement) {
    super(controller);
    this.scrollEl = scrollEl;
    this.containerEl = scrollEl.createDiv({
      cls: "of-container is-loading",
      attr: { tabIndex: 0 },
    });
    this.wrapperEl = this.containerEl.createDiv({ cls: "of-wrapper" });
  }

  onload(): void {
    this.cardRenderer = new CardRenderer(this.app, this);
  }

  onunload(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    if (this.scroller) {
      this.scroller.destroy();
      this.scroller = null;
    }
    this.entries = [];
    this.properties = [];
    this.cardRenderer = null;
  }

  onResize(): void {
    this.scroller?.recalculate();
  }

  public focus(): void {
    this.containerEl.focus({ preventScroll: true });
  }

  public onDataUpdated(): void {
    this.containerEl.removeClass("is-loading");

    // First render: process immediately
    if (!this.scroller) {
      this.doUpdate();
      return;
    }

    // Subsequent calls: debounce 1s so the cascade of onDataUpdated
    // calls triggered by openFile collapses into a single no-op check.
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => {
      this.updateTimer = null;
      this.doUpdate();
    }, 1000);
  }

  private doUpdate(): void {
    if (!this.data) {
      this.wrapperEl.empty();
      this.wrapperEl.createDiv({ cls: "of-empty", text: "No entries to display" });
      if (this.scroller) {
        this.scroller.destroy();
        this.scroller = null;
      }
      this.prevOptionsKey = "";
      this.prevEntryPaths = "";
      return;
    }

    // Read options from config
    const visibleProperties = (this.config.get("visibleProperties") as string[] | undefined) ?? [];
    this.options = {
      showProperties: (this.config.get("showProperties") as boolean | undefined) ?? true,
      compactMode: (this.config.get("compactMode") as boolean | undefined) ?? false,
      matchContentWidth: (this.config.get("matchContentWidth") as boolean | undefined) ?? true,
      cardWidth: (this.config.get("cardWidth") as number | undefined) ?? 500,
      visibleProperties,
      dateFormat: (this.config.get("dateFormat") as string | undefined) ?? "",
    };

    // Apply card width -- match the surrounding note's content width by default,
    // otherwise use the explicit slider value
    this.wrapperEl.style.maxWidth = this.options.matchContentWidth
      ? ""
      : this.options.cardWidth + "px";

    // Filter to markdown files
    this.entries = [...this.data.data].filter(
      (entry) => entry.file.extension === "md",
    );

    // Sort
    const sort = this.config.getSort();
    const firstSortProperty = sort?.[0]?.property;
    const firstSortDirection = sort?.[0]?.direction ?? "ASC";
    this.entries.sort(
      this.getEntryComparator(firstSortProperty, firstSortDirection),
    );

    // Parse property order from Bases view columns, excluding "name" (title is already shown)
    this.properties = [];
    const order = this.config.getOrder();
    if (order) {
      for (const propId of order) {
        try {
          const parsed = parsePropertyId(propId);
          if (parsed.name === "name") continue;
          const prop = {
            id: propId,
            name: this.config.getDisplayName(propId) ?? parsed.name,
            type: parsed.type,
          };
          console.log("[OF] property:", prop.name, "type:", prop.type, "id:", propId);
          this.properties.push(prop);
        } catch {
          // Skip unparseable properties
        }
      }
    }

    // Filter to only visible properties if specified
    if (visibleProperties.length > 0) {
      const lowerVisible = new Set(visibleProperties.map((v) => v.toLowerCase()));
      this.properties = this.properties.filter((p) =>
        lowerVisible.has(p.name.toLowerCase()),
      );
    }

    // Toggle compact class
    if (this.options.compactMode) {
      this.containerEl.addClass("of-compact-mode");
    } else {
      this.containerEl.removeClass("of-compact-mode");
    }

    // Detect whether config or entries actually changed
    const optionsKey = JSON.stringify(this.options) + "|" + this.properties.map((p) => p.id).join(",");
    const entryPaths = this.entries.map((e) => e.file.path).join("\n");
    const configChanged = optionsKey !== this.prevOptionsKey;
    const entriesChanged = entryPaths !== this.prevEntryPaths;
    this.prevOptionsKey = optionsKey;
    this.prevEntryPaths = entryPaths;

    // Initialize or update scroller
    if (!this.scroller) {
      this.wrapperEl.empty();
      this.scroller = new VirtualScroller({
        scrollEl: this.scrollEl,
        containerEl: this.wrapperEl,
        estimatedHeight: this.options.compactMode ? 120 : 180,
        overscan: 8,
        gap: 18,
        onRender: (index, el) => this.renderCard(index, el),
        onRecycle: (_index, el) => this.recycleCard(el),
      });
      this.scroller.setItemCount(this.entries.length, true);
      this.scroller.refresh();
    } else if (configChanged || entriesChanged) {
      this.scroller.setItemCount(this.entries.length, true);
      this.scroller.refresh();
    }
  }

  private renderCard(index: number, el: HTMLElement): void {
    const entry = this.entries[index];
    if (!entry || !this.cardRenderer) return;
    this.cardRenderer.render(el, entry, this.properties, this.options);

    el.oncontextmenu = (evt) => {
      evt.preventDefault();
      this.showEntryContextMenu(evt, entry);
    };
  }

  private recycleCard(el: HTMLElement): void {
    this.cardRenderer?.cleanup(el);
  }

  private showEntryContextMenu(evt: MouseEvent, entry: BasesEntry): void {
    const menu = Menu.forEvent(evt);
    this.app.workspace.handleLinkContextMenu(menu, entry.file.path, "");
  }

  private getEntryComparator(
    property?: BasesPropertyId,
    direction: "ASC" | "DESC" = "ASC",
  ): (a: BasesEntry, b: BasesEntry) => number {
    if (property) {
      return (a: BasesEntry, b: BasesEntry) => {
        const valueA = this.getPropertyValue(a, property);
        const valueB = this.getPropertyValue(b, property);

        let cmp = 0;
        if (valueA === null && valueB === null) {
          cmp = 0;
        } else if (valueA === null) {
          cmp = 1;
        } else if (valueB === null) {
          cmp = -1;
        } else if (typeof valueA === "number" && typeof valueB === "number") {
          cmp = valueA - valueB;
        } else {
          cmp = String(valueA).localeCompare(String(valueB), undefined, {
            numeric: true,
            sensitivity: "base",
          });
        }

        return direction === "ASC" ? cmp : -cmp;
      };
    }

    return (a: BasesEntry, b: BasesEntry) =>
      a.file.basename.localeCompare(b.file.basename, undefined, {
        numeric: true,
        sensitivity: "base",
      });
  }

  private getPropertyValue(entry: BasesEntry, propId: BasesPropertyId): any {
    try {
      const value = entry.getValue(propId);
      if (!value || !value.isTruthy()) return null;

      const valueObj = value as any;
      if (valueObj instanceof Date) return valueObj.getTime();
      if (typeof valueObj === "object" && "valueOf" in valueObj) {
        return valueObj.valueOf();
      }
      const str = value.toString();
      return str && str.trim().length > 0 ? str : null;
    } catch {
      return null;
    }
  }
}
