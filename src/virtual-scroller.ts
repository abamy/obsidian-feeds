interface VirtualScrollerOptions {
  scrollEl: HTMLElement;
  containerEl: HTMLElement;
  estimatedHeight: number;
  overscan: number;
  onRender: (index: number, el: HTMLElement) => void;
  onRecycle: (index: number, el: HTMLElement) => void;
}

export class VirtualScroller {
  private scrollEl: HTMLElement;
  private containerEl: HTMLElement;
  private estimatedHeight: number;
  private overscan: number;
  private onRender: (index: number, el: HTMLElement) => void;
  private onRecycle: (index: number, el: HTMLElement) => void;

  private itemCount = 0;
  private heights: number[];         // measured or estimated height per item
  private cumOffsets: number[];       // cumulative offset array for binary search
  private pool: HTMLElement[] = [];   // recycled DOM elements
  private activeItems: Map<number, HTMLElement> = new Map(); // index -> el
  private elToIndex: Map<HTMLElement, number> = new Map();   // reverse lookup for ResizeObserver
  private rafId = 0;
  private resizeRafId = 0;
  private spacerEl: HTMLElement;
  private destroyed = false;
  private resizeObserver: ResizeObserver;

  // Track currently rendered range to avoid redundant work
  private renderedStart = -1;
  private renderedEnd = -1;

  constructor(options: VirtualScrollerOptions) {
    this.scrollEl = options.scrollEl;
    this.containerEl = options.containerEl;
    this.estimatedHeight = options.estimatedHeight;
    this.overscan = options.overscan;
    this.onRender = options.onRender;
    this.onRecycle = options.onRecycle;

    this.heights = [];
    this.cumOffsets = [];

    // Spacer element to set total scroll height
    this.spacerEl = document.createElement("div");
    this.spacerEl.className = "of-scroller-spacer";
    this.spacerEl.style.position = "relative";
    this.spacerEl.style.width = "100%";
    this.containerEl.appendChild(this.spacerEl);

    // ResizeObserver for dynamic height measurement
    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.destroyed) return;
      let changed = false;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const idx = this.elToIndex.get(el);
        if (idx === undefined) continue;
        const h = entry.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height;
        if (h > 0 && Math.abs(this.heights[idx] - h) > 1) {
          this.heights[idx] = h;
          changed = true;
        }
      }
      if (changed) {
        if (this.resizeRafId) return;
        this.resizeRafId = requestAnimationFrame(() => {
          this.resizeRafId = 0;
          if (this.destroyed) return;
          this.rebuildOffsets();
          this.repositionActive();
        });
      }
    });

    this.handleScroll = this.handleScroll.bind(this);
    this.scrollEl.addEventListener("scroll", this.handleScroll, { passive: true });
  }

  setItemCount(count: number, skipRender = false): void {
    this.itemCount = count;

    // Preserve already-measured heights, fill new items with estimate
    const oldLen = this.heights.length;
    if (count > oldLen) {
      this.heights.length = count;
      for (let i = oldLen; i < count; i++) {
        this.heights[i] = this.estimatedHeight;
      }
    } else {
      this.heights.length = count;
    }

    this.rebuildOffsets();
    if (!skipRender) {
      this.renderedStart = -1;
      this.renderedEnd = -1;
      this.renderVisible();
    }
  }

  refresh(): void {
    // Force all active items to re-render by recycling them first
    for (const [idx, el] of this.activeItems) {
      this.resizeObserver.unobserve(el);
      this.elToIndex.delete(el);
      this.onRecycle(idx, el);
      el.style.display = "none";
      this.pool.push(el);
    }
    this.activeItems.clear();
    this.renderedStart = -1;
    this.renderedEnd = -1;
    this.renderVisible();
  }

  /** Recheck the visible range without recycling existing items. */
  recalculate(): void {
    this.renderedStart = -1;
    this.renderedEnd = -1;
    this.renderVisible();
  }

  getActiveElements(): HTMLElement[] {
    return [...this.activeItems.values()];
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.scrollEl.removeEventListener("scroll", this.handleScroll);
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.resizeRafId) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = 0;
    }
    // Recycle all active items so callers can clean up (e.g. editor leaves)
    for (const [idx, el] of this.activeItems) {
      this.onRecycle(idx, el);
    }
    this.activeItems.clear();
    this.elToIndex.clear();
    this.pool.length = 0;
    this.spacerEl.remove();
  }

  private handleScroll(): void {
    if (this.destroyed) return;
    if (this.rafId) return; // already scheduled
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      if (!this.destroyed) this.renderVisible();
    });
  }

  private rebuildOffsets(): void {
    this.cumOffsets.length = this.itemCount;
    let sum = 0;
    for (let i = 0; i < this.itemCount; i++) {
      sum += this.heights[i];
      this.cumOffsets[i] = sum;
    }
    this.spacerEl.style.height = sum + "px";
  }

  private repositionActive(): void {
    for (const [i, el] of this.activeItems) {
      const top = i === 0 ? 0 : this.cumOffsets[i - 1];
      el.style.transform = `translateY(${top}px)`;
    }
  }

  // Binary search: find first item whose cumOffset > scrollTop
  private findStartIndex(scrollTop: number): number {
    let lo = 0;
    let hi = this.itemCount - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.cumOffsets[mid] <= scrollTop) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  private renderVisible(): void {
    if (this.itemCount === 0) {
      // Recycle all active items
      for (const [idx, el] of this.activeItems) {
        this.resizeObserver.unobserve(el);
        this.elToIndex.delete(el);
        this.onRecycle(idx, el);
        el.style.display = "none";
        this.pool.push(el);
      }
      this.activeItems.clear();
      this.renderedStart = -1;
      this.renderedEnd = -1;
      return;
    }

    const scrollTop = this.scrollEl.scrollTop;
    const viewportHeight = this.scrollEl.clientHeight;
    const scrollBottom = scrollTop + viewportHeight;

    let startIdx = this.findStartIndex(scrollTop);
    startIdx = Math.max(0, startIdx - this.overscan);

    // Find end index: first item whose top offset >= scrollBottom, plus overscan
    let endIdx = this.findStartIndex(scrollBottom);
    endIdx = Math.min(this.itemCount - 1, endIdx + this.overscan);

    // Skip re-render if range hasn't changed
    if (startIdx === this.renderedStart && endIdx === this.renderedEnd) {
      return;
    }

    // Recycle items that are no longer visible
    const toRecycle: number[] = [];
    for (const idx of this.activeItems.keys()) {
      if (idx < startIdx || idx > endIdx) {
        toRecycle.push(idx);
      }
    }
    for (const idx of toRecycle) {
      const el = this.activeItems.get(idx)!;
      this.resizeObserver.unobserve(el);
      this.elToIndex.delete(el);
      this.onRecycle(idx, el);
      el.style.display = "none";
      this.pool.push(el);
      this.activeItems.delete(idx);
    }

    // Render items in the visible range
    for (let i = startIdx; i <= endIdx; i++) {
      let el = this.activeItems.get(i);
      if (!el) {
        el = this.pool.pop() || this.createElement();
        el.style.display = "";
        this.activeItems.set(i, el);
        this.elToIndex.set(el, i);
        this.onRender(i, el);
        this.resizeObserver.observe(el);
      }

      // Position the element
      const top = i === 0 ? 0 : this.cumOffsets[i - 1];
      el.style.transform = `translateY(${top}px)`;
    }

    this.renderedStart = startIdx;
    this.renderedEnd = endIdx;
  }

  private createElement(): HTMLElement {
    const el = document.createElement("div");
    el.className = "of-virtual-item";
    el.style.position = "absolute";
    el.style.top = "0";
    el.style.left = "0";
    el.style.width = "100%";
    el.style.boxSizing = "border-box";
    this.spacerEl.appendChild(el);
    return el;
  }
}
