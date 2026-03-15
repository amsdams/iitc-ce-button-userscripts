# IITC CE Button Userscripts

A collection of custom plugins designed for **IITC-CE**, optimized for both **Desktop (IITC Button extension)** and **IITC Mobile (IITCM)**.

## Project Structure

- `src/`: Plugin source code. Each plugin has its own directory with:
  - `index.ts`: The TypeScript logic.
  - `header.json`: Userscript metadata (name, version, etc.).
- `plugins/`: Compiled `.user.js` files ready for installation.
- `scripts/`: Internal tools for version syncing.

## Features

- **Universal Support**: Works on Desktop browsers and the IITC Mobile app.
- **TypeScript & Rollup**: Modern development workflow with type safety and efficient bundling.
- **Auto-Sync**: Versions are automatically synchronized from `package.json` to plugin headers.

## Development

1. **Install dependencies**: `npm install`
2. **Build all plugins**: `npm run build`
3. **Watch mode**: `npm run watch`
4. **Update version**: `npm version <patch|minor|major>` (automatically updates all `header.json` files).

## Installation

Install the generated scripts from the `plugins/` directory into your favorite userscript manager (Tampermonkey, Greasemonkey) or directly into IITC Mobile.
