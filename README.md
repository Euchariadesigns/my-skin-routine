# My Skin Routine

A web app you install on your phone. It helps you remember which skincare routine you planned for each morning and evening, and keeps track of what you actually used.

- Add the products you own
- Build morning and evening routines, with your products in your own order
- Schedule routines by weekday, or set up a rotation
- Get a reminder at your chosen times, and log each routine as done or skipped

The app only shows your own plan back to you. It doesn't recommend products, judge ingredients, or give skincare advice.

**Status:** in progress.

## Development

```sh
npm install
npm run dev      # local app at http://localhost:5173
npm test         # scheduling rules
npm run build    # production build in dist/
```

Everything a person enters (products, photos, routines, history) is stored on their own phone in IndexedDB. Nothing is sent to a server.

## Deploying

The app is a static site served by Cloudflare (see `wrangler.jsonc`). With the GitHub repo connected to Cloudflare Workers Builds, every push to `main` builds with `npm run build` and deploys with `npx wrangler deploy`.

People install it from the browser: on iPhone, open it in Safari and tap Share, then Add to Home Screen; on Android, Chrome offers to install it.
