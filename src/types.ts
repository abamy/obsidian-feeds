import { BasesPropertyId } from "obsidian";

export interface PropertyConfig {
  id: BasesPropertyId;
  name: string;
  type: string;
}

export interface CardOptions {
  showProperties: boolean;
  compactMode: boolean;
  matchContentWidth: boolean;
  cardWidth: number;
  visibleProperties: string[];
  dateFormat: string;
}
