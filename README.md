# ivLyrics NetEase Cloud Music Lyrics Provider

An ivLyrics Marketplace addon that searches NetEase Cloud Music, fetches synced LRC lyrics, and uses NetEase's translated lyrics (`tlyric`) when available.

## What it does

- Searches NetEase Cloud Music by the current Spotify title and artist.
- Scores candidates by title, artist, album, and duration.
- Fetches original lyrics from `lrc.lyric`.
- Fetches translated lyrics from `tlyric.lyric`.
- Merges translation lines into ivLyrics `text2` fields.
- Intercepts ivLyrics AI translation calls for this provider when a NetEase translation is already available, so matched songs do not spend AI translation requests.

It does not implement word-by-word karaoke lyrics. ivLyrics can still synthesize pseudo karaoke from line-synced lyrics when configured.

## Marketplace installation

This repository is designed for ivLyrics Marketplace discovery.

1. Keep the repository public.
2. Add the GitHub topic `ivlyrics-addon`.
3. Keep `manifest.json` in the repository root.
4. Make sure `manifest.json` points `downloadUrl` to the raw `Addon_Lyrics_Netease.js` file on the default branch.
5. Open ivLyrics Marketplace, refresh, search for `NetEase Cloud Music`, and install.

Marketplace discovery is based on GitHub topic search, so new repositories can take a few minutes to appear.

## Settings

The addon exposes these settings inside ivLyrics lyrics provider settings:

- Search result limit: number of NetEase candidates to inspect.
- Minimum match score: stricter values reduce false matches.
- Use NetEase translated lyrics: merge `tlyric` into displayed translation.
- Skip AI translation when NetEase translation exists: returns cached `tlyric` to ivLyrics translation flow instead of calling AI.
- CORS proxy URL: optional. Use this only if direct NetEase requests are blocked in your Spotify/Spicetify environment.

Proxy URL formats:

- `https://your-proxy.example/raw?url=` appends the encoded NetEase URL.
- `https://your-proxy.example/raw?url={url}` replaces `{url}` with the encoded NetEase URL.

## Development

```bash
npm run validate
```

This validates the Marketplace manifest and checks that the addon contains the expected registration points.

## Notes

NetEase Cloud Music endpoints used by this addon are unofficial web endpoints and may change, throttle, require regional access, or be blocked by CORS in some environments. The optional proxy setting exists for that reason.
