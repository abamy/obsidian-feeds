import { Plugin } from "obsidian";
import { FeedView, FeedViewType } from "./feed-view";

export default class ObsidianFeedsPlugin extends Plugin {
  async onload() {
    this.registerBasesView(FeedViewType, {
      name: "Feed",
      icon: "lucide-layout-list",
      factory: (controller, containerEl) =>
        new FeedView(controller, containerEl),
      options: () => [
        {
          key: "matchContentWidth",
          type: "toggle",
          displayName: "Match content width",
          default: true,
        },
        {
          key: "cardWidth",
          type: "slider",
          displayName: "Card width",
          default: 500,
          min: 300,
          max: 900,
          step: 10,
        },
        {
          key: "showProperties",
          type: "toggle",
          displayName: "Show properties",
          default: true,
        },
        {
          key: "compactMode",
          type: "toggle",
          displayName: "Compact mode",
          default: false,
        },
        {
          key: "visibleProperties",
          type: "multitext",
          displayName: "Visible properties (empty = all)",
          default: [],
        },
        {
          key: "dateFormat",
          type: "text",
          displayName: "Date format (e.g. DD/MM/YYYY, MMM DD YYYY, empty = locale)",
          default: "",
        },
      ],
    });
  }

  onunload() {}
}
