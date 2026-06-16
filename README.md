# Points and Leaderboard — YouTube Live Chat Helper

Automatically update a scoreboard and betting table during your YouTube live stream by reading chat commands. Serves a transparent OBS overlay at `http://localhost:3000/overlay`.

---

## Features

| Command in chat | What it does |
|---|---|
| `!addpoints <player> <amount>` | Adds (or subtracts) points for a player on the leaderboard |
| `!bet <color> <amount>` | Records a viewer bet on the betting table |

- Polls the YouTube Live Chat API every 5 seconds (configurable)
- Overlay auto-refreshes every 3 seconds — no manual entry needed
- Optional: bundle into a single Windows `.exe` with `npm run build`

---

## Requirements

- **Node.js 18+** — download from <https://nodejs.org/>
- A **YouTube Data API v3** key — see [Getting an API Key](#getting-an-api-key)
- Your **YouTube Channel ID** — see [Finding your Channel ID](#finding-your-channel-id)

---

## Setup

### 1 — Clone or download this project

```bash
git clone https://github.com/3wcircus/points-and-leaderboard.git
cd points-and-leaderboard
```

### 2 — Install dependencies

```bash
npm install
```

### 3 — Edit `config.json`

Open `config.json` and fill in your values:

```json
{
  "channelId": "UCxxxxxxxxxxxxxxxxxxxxxx",
  "apiKey": "AIzaSy...",
  "port": 3000,
  "pollIntervalMs": 5000,
  "moderatorOnlyCommands": false,
  "overlayTitle": "The Intellivision Gamer"
}
```

| Field | Description |
|---|---|
| `channelId` | Your YouTube channel ID (starts with `UC`) |
| `apiKey` | Your YouTube Data API v3 key |
| `port` | Port the Express server listens on (default `3000`) |
| `pollIntervalMs` | How often to poll the live chat in milliseconds (default `5000`) |
| `moderatorOnlyCommands` | Set to `true` to only accept commands from moderators/owner |
| `overlayTitle` | Text shown at the top of the leaderboard panel |

### 4 — Start the app

```bash
npm start
```

You should see:

```
Overlay running at http://localhost:3000/overlay
Scoreboard API: http://localhost:3000/api/scoreboard
Bets API:       http://localhost:3000/api/bets
Polling YouTube Live Chat every 5000ms…
Looking for active live broadcast…
Found live chat: LC1234567890
```

> **Note:** The app requires an active live stream to connect to. Start your stream before running the app, or the app will keep retrying until it finds one.

### 5 — Add the overlay to OBS

1. In OBS, click **+** under **Sources** and choose **Browser**.
2. Set the URL to `http://localhost:3000/overlay`.
3. Set Width / Height to match your canvas (e.g. 1920 × 1080).
4. Enable **"Shutdown source when not visible"** is **unchecked** so the overlay keeps updating.
5. Click **OK**.

The overlay has a transparent background and will float over your game capture layer.

---

## API endpoints

| Endpoint | Description |
|---|---|
| `GET /overlay` | OBS browser source HTML |
| `GET /api/scoreboard` | JSON array of `{ player, points }` sorted by points descending |
| `GET /api/bets` | JSON array of `{ user, color, amount, timestamp }` |
| `GET /api/config` | Returns `{ overlayTitle }` used by the overlay |

---

## Chat commands reference

### `!addpoints <player> <amount>`

Award or deduct points for a player. `amount` may be negative.

```
!addpoints PhillyG 100
!addpoints PhillyG -50
```

### `!bet <color> <amount>`

Record a bet for the current betting round.

```
!bet blue 200
!bet red 50
```

> **Tip:** You can reset bets between rounds by restarting the app, or add a moderator-only `!clearbets` command by extending `index.js`.

---

## Optional: Build a Windows EXE

Package the app into a standalone Windows executable (no Node.js required on the target machine):

```bash
npm run build
```

The output is written to `dist/points-and-leaderboard.exe`. Copy it alongside your `config.json` file and double-click to run.

> Requires the `pkg` devDependency and Node.js 18 on the build machine.

---

## Getting an API Key

1. Go to <https://console.cloud.google.com/>.
2. Create a new project (or select an existing one).
3. Enable the **YouTube Data API v3** library.
4. Under **Credentials**, create an **API key**.
5. (Recommended) Restrict the key to the YouTube Data API v3 and your server IP.

---

## Finding your Channel ID

1. Sign in to YouTube and go to your channel page.
2. Click **Customize channel** → **Basic info**.
3. Your Channel ID is listed under **Channel URL** — it starts with `UC`.

Alternatively, visit `https://www.youtube.com/channel/<YOUR_ID>` — the part after `/channel/` is your Channel ID.

---

## License

MIT
