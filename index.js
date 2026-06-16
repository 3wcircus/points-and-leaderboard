'use strict';

const express = require('express');
const path = require('path');
const { google } = require('googleapis');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
let config;
try {
  config = require('./config.json');
} catch (err) {
  console.error('Could not load config.json:', err.message);
  process.exit(1);
}

const {
  channelId,
  apiKey,
  port = 3000,
  pollIntervalMs = 5000,
  moderatorOnlyCommands = false,
  overlayTitle = 'The Intellivision Gamer',
} = config;

if (!channelId || channelId === 'YOUR_CHANNEL_ID') {
  console.error('Please set a valid channelId in config.json');
  process.exit(1);
}
if (!apiKey || apiKey === 'YOUR_YOUTUBE_DATA_API_V3_KEY') {
  console.error('Please set a valid apiKey in config.json');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/** @type {Object.<string, number>} player name → point total */
const scoreboard = {};

/** @type {Array<{user: string, color: string, amount: number, timestamp: string}>} */
const bets = [];

/** @type {string|null} */
let liveChatId = null;

/** @type {string|null} pageToken used for paginating live chat messages */
let nextPageToken = null;

/** @type {Set<string>} already-processed message IDs */
const processedIds = new Set();

// ---------------------------------------------------------------------------
// YouTube Data API v3 client
// ---------------------------------------------------------------------------
const youtube = google.youtube({ version: 'v3', auth: apiKey });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the active live broadcast for the configured channel and return its
 * liveChatId, or null when the channel is not currently live.
 * @returns {Promise<string|null>}
 */
async function fetchLiveChatId() {
  // Step 1: find the active live video for the channel
  const searchRes = await youtube.search.list({
    part: ['id'],
    channelId,
    eventType: 'live',
    type: ['video'],
    maxResults: 1,
  });

  const items = searchRes.data.items || [];
  if (items.length === 0) {
    return null;
  }

  const videoId = items[0].id.videoId;

  // Step 2: get the liveStreamingDetails to obtain the liveChatId
  const videoRes = await youtube.videos.list({
    part: ['liveStreamingDetails'],
    id: [videoId],
  });

  const video = (videoRes.data.items || [])[0];
  if (!video || !video.liveStreamingDetails) {
    return null;
  }

  return video.liveStreamingDetails.activeLiveChatId || null;
}

/**
 * Fetch the next batch of live chat messages using the stored pageToken.
 * Returns the list of message items.
 * @returns {Promise<Array>}
 */
async function fetchChatMessages() {
  const params = {
    part: ['snippet', 'authorDetails'],
    liveChatId,
    maxResults: 200,
  };
  if (nextPageToken) {
    params.pageToken = nextPageToken;
  }

  const res = await youtube.liveChatMessages.list(params);
  nextPageToken = res.data.nextPageToken || null;
  return res.data.items || [];
}

// ---------------------------------------------------------------------------
// Command parsers
// ---------------------------------------------------------------------------

/**
 * Parse and handle a single chat message item.
 * @param {{snippet: object, authorDetails: object}} item
 */
function handleMessage(item) {
  const { snippet, authorDetails } = item;
  if (!snippet || snippet.type !== 'textMessageEvent') return;

  const text = (snippet.textMessageEvent && snippet.textMessageEvent.messageText) || '';
  const isModerator = authorDetails.isChatModerator || authorDetails.isChatOwner;

  if (moderatorOnlyCommands && !isModerator) return;

  const trimmed = text.trim();

  // !addpoints <player> <amount>
  const addPointsMatch = trimmed.match(/^!addpoints\s+(\S+)\s+(-?\d+(?:\.\d+)?)$/i);
  if (addPointsMatch) {
    const player = addPointsMatch[1];
    const amount = parseFloat(addPointsMatch[2]);
    scoreboard[player] = (scoreboard[player] || 0) + amount;
    console.log(`[addpoints] ${player} → ${scoreboard[player]} (${amount >= 0 ? '+' : ''}${amount})`);
    return;
  }

  // !bet <color> <amount>
  const betMatch = trimmed.match(/^!bet\s+(\S+)\s+(\d+(?:\.\d+)?)$/i);
  if (betMatch) {
    const color = betMatch[1].toLowerCase();
    const amount = parseFloat(betMatch[2]);
    const user = authorDetails.displayName || 'unknown';
    const timestamp = snippet.publishedAt || new Date().toISOString();
    bets.push({ user, color, amount, timestamp });
    console.log(`[bet] ${user} bet ${amount} on ${color}`);
    return;
  }
}

// ---------------------------------------------------------------------------
// Main polling loop
// ---------------------------------------------------------------------------

async function poll() {
  try {
    // (Re-)discover the live chat ID if we don't have one
    if (!liveChatId) {
      console.log('Looking for active live broadcast…');
      liveChatId = await fetchLiveChatId();
      if (!liveChatId) {
        console.log('No active live broadcast found. Retrying…');
        return;
      }
      console.log(`Found live chat: ${liveChatId}`);
    }

    const messages = await fetchChatMessages();
    for (const item of messages) {
      const id = item.id;
      if (processedIds.has(id)) continue;
      processedIds.add(id);
      handleMessage(item);
    }
  } catch (err) {
    // If we get a 403/404 the broadcast probably ended; reset so we search again
    if (err.code === 403 || err.code === 404) {
      console.warn('Live chat ended or access denied. Will search for next broadcast.');
      liveChatId = null;
      nextPageToken = null;
    } else {
      console.error('Poll error:', err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Express server
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/** Scoreboard JSON API */
app.get('/api/scoreboard', (_req, res) => {
  const sorted = Object.entries(scoreboard)
    .sort((a, b) => b[1] - a[1])
    .map(([player, points]) => ({ player, points }));
  res.json(sorted);
});

/** Betting table JSON API */
app.get('/api/bets', (_req, res) => {
  res.json(bets);
});

/** Config subset for the overlay */
app.get('/api/config', (_req, res) => {
  res.json({ overlayTitle });
});

/** OBS browser source overlay */
app.get('/overlay', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(port, () => {
  console.log(`Overlay running at http://localhost:${port}/overlay`);
  console.log(`Scoreboard API: http://localhost:${port}/api/scoreboard`);
  console.log(`Bets API:       http://localhost:${port}/api/bets`);
  console.log(`Polling YouTube Live Chat every ${pollIntervalMs}ms…`);

  // Kick off the first poll immediately, then repeat
  poll();
  setInterval(poll, pollIntervalMs);
});
