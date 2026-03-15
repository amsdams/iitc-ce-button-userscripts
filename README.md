# IITC-CE Button Userscripts

A collection of custom plugins designed for **IITC-CE**, optimized for both **Desktop (IITC Button extension)** and **IITC Mobile (IITCM)**.

This project uses a modern build pipeline with **Rollup** and **TypeScript** to generate standard `.user.js` files.

## Features
- **Universal Support**: Works on Desktop browsers and the IITC Mobile app.
- **TypeScript & Rollup**: Modern development workflow with type safety and efficient bundling.
- **Auto-Sync**: Versions are automatically synchronized from `package.json` to plugin headers.

## Architecture & Project Structure
*   **`src/`**: Contains the source code for all plugins. Each plugin resides in its own subdirectory (e.g., `src/capture-counter/`).
    *   **`index.ts`**: The main entry point for the plugin logic (TypeScript).
    *   **`header.json`**: Defines the userscript metadata block (Name, Version, Match patterns, etc.).
*   **`plugins/`**: The destination directory for compiled userscripts (`.user.js`). These are the files ready for installation.
*   **`scripts/`**: Maintenance scripts, primarily for version synchronization (`sync-version.mjs`).
*   **`rollup.config.mjs`**: Configures the build process, automatically mapping each folder in `src/` to a corresponding output file in `plugins/`.

## Key Plugins
*   **Capture Counter** (`src/capture-counter`): Tracks portal captures, deduplicates by GUID, and provides a summary UI with sorting and filtering.
*   **Invite Agent** (`src/invite-agent`): Adds functionality to pre-populate the chat with a custom invitation message when clicking an agent's name.

## Installation (For Users)
Install the generated scripts from the `plugins/` directory into your favorite userscript manager (Tampermonkey, Greasemonkey) or directly into IITC Mobile.

## Development Workflow

### Prerequisites
*   Node.js and npm

### Key Commands
*   **Install Dependencies:**
    ```bash
    npm install
    ```
*   **Build All Plugins:**
    ```bash
    npm run build
    ```
    This compiles TS files from `src/` and generates `.user.js` files in `plugins/` with the correct metadata headers.
*   **Watch Mode:**
    ```bash
    npm run watch
    ```
    Rebuilds plugins automatically on file changes.
*   **Linting & Formatting:**
    ```bash
    npm run lint       # Check for issues
    npm run lint:fix   # Fix issues automatically
    npm run format     # Format code with Prettier
    ```

### Versioning
Versioning is centralized in `package.json`. To update the version for all plugins:
1.  Run `npm version <patch|minor|major>`.
2.  This automatically triggers `scripts/sync-version.mjs`, which updates the `version` field in every `src/*/header.json` file to match `package.json`.

## Contribution Guidelines
*   **New Plugins:** Create a new folder in `src/` with an `index.ts` and `header.json`. The Rollup config will automatically detect and build it.
*   **Code Style:** Follow the existing TypeScript conventions. Prettier and ESLint are configured to enforce code style.
