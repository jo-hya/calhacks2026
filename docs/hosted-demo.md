# Hosted Lila demo (no laptop needed)

`render.yaml` runs the server and the built web app on Render. Phones open the
Render URL, add Lila to their home screen, and the laptop can be off.

## One-time setup

1. Push the repo to GitHub. `.env` is gitignored, so secrets stay out of the repo.
2. In Render: **New → Blueprint**, pick the repo. Render reads `render.yaml`.
3. Fill in every `sync: false` variable in the dashboard, using the same values as your local `.env`.
   `VITE_*` values are needed at build time, so set them before the first deploy.
4. Deploy. Check `https://YOUR-APP.onrender.com/health` returns `{"ok":true}`.
5. In the Bandwidth dashboard, change the application's inbound callback to
   `https://YOUR-APP.onrender.com/webhooks/bandwidth?token=YOUR_BANDWIDTH_WEBHOOK_TOKEN`.
   ngrok is no longer needed.

## Using it

- Open the pairing link printed in the Render logs (`/pair/<token>`). Render's
  Logs tab shows it. Replace the host with your Render URL.
- On a phone, open the same link in Chrome or Safari, then install Lila to the home screen
  (see [phone demo](phone-demo.md)).

## Things to know

- **Restarts change the pairing token.** Grab the new link from the logs and reopen it.
  Phones paired with the old token will need to pair again.
- **Free plan sleeps** after about 15 minutes with no traffic. The first request after that
  takes a while to wake up. Open the link a minute before a demo.
- **State is not durable on the free plan.** `.pocket/state.json` lives on the instance's
  disk, so redeploys and restarts reset the demo data. For durable state, add a Render
  persistent disk mounted at `/opt/render/project/src/.pocket` (paid plan).
- **Hosted Node 22.18+** is pinned by `NODE_VERSION` in `render.yaml`.
