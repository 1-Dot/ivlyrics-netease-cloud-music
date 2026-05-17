# ivLyrics NetEase Cloud Music Lyrics Provider

An ivLyrics Marketplace addon that searches NetEase Cloud Music, fetches synced LRC lyrics, and uses NetEase's translated lyrics (`tlyric`) when available.

> Important: a CORS proxy is required. NetEase Cloud Music's official web APIs cannot be fetched directly from Spotify/Spicetify because browsers enforce CORS. In addition, NetEase may return encrypted or unusable responses for non-Mainland-China exit IPs. For reliable results, use a CORS proxy with a Mainland China exit IP.

## What it does

- Searches NetEase Cloud Music by the current Spotify title and artist.
- Scores candidates by title, artist, album, and duration.
- Fetches original lyrics from `lrc.lyric`.
- Fetches translated lyrics from `tlyric.lyric`.
- Removes leading NetEase credit lines such as `作词: ...`, `作曲: ...`, arranger, producer, label, and similar metadata before returning lyrics to ivLyrics.
- Merges translation lines into ivLyrics `text2` fields.
- Intercepts ivLyrics AI translation calls for this provider when a NetEase translation is already available, including after ivLyrics serves lyrics from cache, so matched songs do not spend AI translation requests.
- Intercepts ivLyrics phonetic requests for this provider and generates local romanization instead of using AI. Japanese uses Kuroshiro/Kuromoji Hepburn romaji, Korean uses Aromanize RR, and Chinese uses pinyin. NetEase phonetic data is not used.

It does not implement word-by-word karaoke lyrics. ivLyrics can still synthesize pseudo karaoke from line-synced lyrics when configured.

## Required CORS proxy

This addon intentionally does not try to call NetEase directly when the proxy setting is empty. Without a CORS proxy, the provider will return an error and no lyrics will be loaded.

Your proxy must:

- Accept a fully encoded NetEase URL from the addon.
- Request the official NetEase endpoint server-side.
- Return the raw NetEase JSON body directly, without wrapping it in `{ contents: ... }`, `{ data: ... }`, or HTML.
- Preferably use a Mainland China exit IP, otherwise NetEase may return encrypted or unusable content.

Supported proxy URL formats:

```text
https://your-proxy.example/raw?url=
```

The addon appends `encodeURIComponent(neteaseUrl)` after the prefix.

```text
https://your-proxy.example/raw?url={url}
```

The addon replaces `{url}` with `encodeURIComponent(neteaseUrl)`.

Example final request shape:

```text
https://your-proxy.example/raw?url=https%3A%2F%2Fmusic.163.com%2Fapi%2Fsong%2Flyric%3Fid%3D1878313261%26lv%3D-1%26tv%3D-1%26kv%3D-1%26yv%3D-1
```

The response body must be the original NetEase JSON, for example:

```json
{
  "lrc": {
    "lyric": "[00:00.00] ..."
  },
  "tlyric": {
    "lyric": "[00:00.00] ..."
  },
  "code": 200
}
```

## Marketplace installation

This repository is designed for ivLyrics Marketplace discovery.

1. Keep the repository public.
2. Add the GitHub topic `ivlyrics-addon`.
3. Keep `manifest.json` in the repository root.
4. Make sure `manifest.json` points `downloadUrl` to the raw `Addon_Lyrics_Netease.js` file on the default branch.
5. Open ivLyrics Marketplace, refresh, search for `NetEase Cloud Music`, and install.
6. Open the provider settings and fill in `CORS proxy URL`. The addon will not work without it.

Marketplace discovery is based on GitHub topic search, so new repositories can take a few minutes to appear.

## Settings

The addon exposes these settings inside ivLyrics lyrics provider settings:

- CORS proxy URL: required. Use a proxy that returns raw NetEase JSON, preferably with a Mainland China exit IP.
- Search result limit: number of NetEase candidates to inspect.
- Minimum match score: stricter values reduce false matches.
- Use NetEase translated lyrics: merge `tlyric` into displayed translation.
- Skip AI translation when NetEase translation exists: returns cached `tlyric` to ivLyrics translation flow instead of calling AI.
- Use local romanization instead of AI phonetic generation: enabled by default.
- Local romanization language: auto detect, Japanese romaji, Korean romaja, or Chinese pinyin.
- Allow AI fallback if local romanization fails: disabled by default, so phonetic requests do not call AI.

## Development

```bash
npm run validate
```

This validates the Marketplace manifest and checks that the addon contains the expected registration points.

## Notes

NetEase Cloud Music endpoints used by this addon are unofficial web endpoints and may change, throttle, require regional access, or be blocked by CORS in browser environments. This addon only uses the official NetEase web endpoints through the user-provided proxy; it does not bundle or default to third-party NetEase API services.
