# FSAE tools directory

`tools.html` is the collection landing page at `/frame-order-studio/tools.html`. It links to the six live tools without changing their workflows.

## Adding a tool

1. Add a linked `.tool-card` to the appropriate section in `tools.html`, using the tool's actual name, function, and URL.
2. Add an “All tools” link to the new tool's header, pointing to `https://sida0.github.io/frame-order-studio/tools.html`.
3. Copy `studio-theme.css` into the new tool repository and load it after that app's stylesheets. Adjust only selectors specific to the new app.
4. Update the count in the directory navigation and page description, then check at 1440 px and 390 px widths.

The shared theme uses a dark neutral ground, warm copper accent, DM Sans for body text, and Space Grotesk for display text. Each repository holds a copy so its GitHub Pages site can serve independently.
