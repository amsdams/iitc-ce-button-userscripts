# IITC Plugins Collection

A collection of custom plugins designed for use with the **IITC Button** browser plugin.

## How to Install Scripts

To add these plugins to your IITC environment:

1.  **Open IITC Button:** Click the IITC Button icon in your browser's extension toolbar.
2.  **Access Plugins:** Navigate to the **Plugins** or **User Scripts** section within the IITC Button interface.
3.  **Add a Script:**
    - Click **Add New** or **Import**.
    - Find the `.user.js` file you want in this repository.
    - Click the **Raw** button on the GitHub file page to get the direct script URL.
    - Copy and paste this URL into the IITC Button import field.
4.  **Save and Refresh:** Enable the script and refresh the [Ingress Intel Map](https://intel.ingress.com/) to see the changes.

## Development & Formatting

To maintain a consistent coding style, this project uses **EditorConfig** and **Prettier**.

### Automatic Formatting
You can format all files in the project to match the standard style by running:
```bash
npm run format
```

### Editor Integration
- **EditorConfig:** Most editors will automatically respect the `.editorconfig` file (2-space indentation, LF line endings).
- **Prettier:** It is recommended to install the Prettier extension for your editor and enable "Format on Save".

## Featured Plugins

- **Capture Counter:** Track capture events from comms and see a leaderboard of agent activity.
