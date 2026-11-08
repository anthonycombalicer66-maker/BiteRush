# BiteRush

BiteRush is a static food-ordering demo built with HTML, CSS, and browser JavaScript.

## Run locally

Serve the project folder with any static server:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In **Settings > Pages**, set **Source** to **GitHub Actions**.
3. Push to the `main` branch or run the **Deploy BiteRush to GitHub Pages** workflow manually.

The workflow publishes the repository root automatically. Authentication, cart data, favorites, orders, and admin settings are browser-local demos and are not connected to a server.
