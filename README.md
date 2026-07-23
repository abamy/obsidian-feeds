# Obsidian Feeds

A feed/card layout for [Obsidian Bases](https://obsidian.md) that renders each entry as an editable Live Preview card with inline properties.

## Features

- **Editable cards** -- each card embeds a full Live Preview editor, not read-only rendered markdown
- **Inline properties** -- displays Bases columns (date, type, etc.) below the card title
- **Virtual scrolling** -- renders only visible cards for smooth performance with large datasets
- **Collapsible content** -- long cards show a "See more" button; short cards don't
- **Compact mode** -- denser layout with smaller cards

## Installation

Copy `main.js`, `styles.css`, and `manifest.json` to your vault's `.obsidian/plugins/obsidian-feeds/` directory.

## Configuration

In any Bases block, switch the view to **Feed** to use this plugin. View options:

| Option | Description |
|---|---|
| Match content width | Cards fill the note's content width (default: on) |
| Card width | Width of each card (300-900px), used when Match content width is off |
| Show properties | Toggle inline property display below titles |
| Compact mode | Smaller padding and font sizes |
| Visible properties | Filter which properties appear (empty = all columns) |

Properties shown on cards are determined by the columns you add to the Bases view.

## Development

```bash
bun install
bun run dev    # watch mode
bun run build  # production build
```

## License

MIT
