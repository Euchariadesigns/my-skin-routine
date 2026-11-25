# My Skin Routine

A web app you install on your phone. It helps you remember which skincare routine you planned for each morning and evening, and keeps track of what you actually used.

- Add the products you own
- Build morning and evening routines, with your products in your own order
- Schedule routines by weekday, or set up a rotation
- Get a reminder at your chosen times, and log each routine as done or skipped

The app only shows your own plan back to you. It doesn't recommend products, judge ingredients, or give skincare advice.

**Live:** https://my-skin-routine.trymargin.workers.dev

**Status:** in progress.

## Development

```sh
npm install
npm run dev      # local app at http://localhost:5173
npm test         # scheduling, reminder times and web push encryption
npm run build    # production build in dist/ (app, then the service worker)
npx wrangler dev # the built app plus the reminder server, at http://localhost:8787
```

Everything a person enters (products, photos, routines, history) is stored on their own phone in IndexedDB.

## Phone reminders while the app is closed

`worker/` is a small Cloudflare Worker that only answers `/api/*`. When someone turns on phone reminders:

1. The phone subscribes to web push and sends `/api/push/subscription` its plan: time zone, morning and evening times, which weekdays have a routine, and which of today's reminders are no longer needed. Never product or routine names.
2. A Durable Object (`Reminders`, SQLite storage) keeps those plans and sets an alarm for the next reminder due.
3. At that time it sends an encrypted push that only says which morning or evening it is.
4. The service worker (`src/sw/sw.ts`) looks up that routine on the phone, adds it to Alerts and shows the notification.

The VAPID keys are made by the Durable Object the first time they're needed and kept in its storage, so there's nothing to set up by hand. It all fits in Cloudflare's free plan.

## Deploying

The app is served by Cloudflare Workers: static files from `dist/`, plus the reminder server in `worker/` (see `wrangler.jsonc`). With the GitHub repo connected to Cloudflare Workers Builds, every push to `main` builds with `npm run build` and deploys with `npx wrangler deploy`.

People install it from the browser: on iPhone, open it in Safari and tap Share, then Add to Home Screen; on Android, Chrome offers to install it.
