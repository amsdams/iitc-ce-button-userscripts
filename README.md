# IITC Plugins Collection

A collection of custom plugins designed for use with the **IITC Button** browser plugin.

## How to Install Scripts

To add these plugins to your IITC environment:

1.  **Open IITC Button:** Click the IITC Button icon in your browser's extension toolbar.
2.  **Access Plugins:** Navigate to the **Plugins** or **User Scripts** section within the IITC Button interface.
3.  **Add a Script:**
    - Click **Add New** or **Import**.
    - Find the `.user.js` file you want in the `plugins/` folder of this repository.
    - Click the **Raw** button on the GitHub file page to get the direct script URL.
    - Copy and paste this URL into the IITC Button import field.
4.  **Save and Refresh:** Enable the script and refresh the [Ingress Intel Map](https://intel.ingress.com/) to see the changes.

## Development & Formatting

To maintain a consistent coding style and catch bugs early, this project uses **ESLint**, **Prettier**, and **EditorConfig**.

### Available Commands
- **Check for bugs (Lint):** Run `npm run lint` to find potential logic errors or unused variables.
- **Auto-fix code issues:** Run `npm run lint:fix` to automatically resolve stylistic and simple code issues identified by ESLint.
- **Auto-format layout:** Run `npm run format` to automatically clean up indentation and style across all files.

### Editor Integration
- **EditorConfig:** Most editors will automatically respect the `.editorconfig` file (2-space indentation, LF line endings).
- **ESLint & Prettier:** For the best experience, install the ESLint and Prettier extensions in your editor (like VS Code or IntelliJ) and enable "Format on Save" and "Fix on Save".

## Featured Plugins

- **Capture Counter (`plugins/iitc-plugin-capture-counter.user.js`):** Track capture events from comms and see a leaderboard of agent activity. Includes deduplication, faction filtering, and search.
