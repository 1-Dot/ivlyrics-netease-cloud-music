# 🎧 ivLyrics NetEase Cloud Music

> NetEase Cloud Music lyrics provider for ivLyrics.  
> Uses official NetEase Cloud Music web APIs through a user-provided CORS proxy. No public mirror is used by default.

<p>
  <a href="./README.zh-CN.md">简体中文</a>
</p>

<p>
  <img alt="ivLyrics" src="https://img.shields.io/badge/ivLyrics-Lyrics%20Provider-e60026?style=for-the-badge">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.7-2ea44f?style=for-the-badge">
  <img alt="CORS Proxy" src="https://img.shields.io/badge/CORS%20proxy-required-f97316?style=for-the-badge">
</p>

## ✨ Features

- 🎵 Match the current Spotify track on NetEase Cloud Music
- 🕒 Fetch line-synced lyrics from `lrc`
- 🌏 Merge translated lyrics from `ytlrc` / `tlyric`
- 🧹 Remove leading credit lines such as lyricist, composer, arranger, producer, and label metadata
- 🧠 Skip ivLyrics AI translation when NetEase translated lyrics are already available
- 🔤 Generate local romanization / pinyin instead of using AI phonetic generation

## 🚦 Request Strategy

This addon has one request mode:

| Setting               | API Source                                | Notes                                                |
| --------------------- | ----------------------------------------- | ---------------------------------------------------- |
| CORS proxy configured | `https://music.163.com` official web APIs | Required. The proxy must return raw NetEase JSON.    |
| CORS proxy empty      | none                                      | The addon returns an error instead of using mirrors. |

Official endpoints used through your CORS proxy:

```txt
https://music.163.com/api/cloudsearch/pc
https://music.163.com/api/song/lyric/v1
```

## ⚙️ CORS Proxy

The `CORS proxy URL` setting is required. Leave it empty and the provider intentionally returns an error.

Your proxy should return the raw JSON response body directly. Do not wrap it in `data`, `contents`, HTML, or any other custom structure.

Supported formats:

```txt
https://your-proxy.example/raw?url=
```

The addon appends the encoded target URL after the prefix.

```txt
https://your-proxy.example/raw?url={url}
```

The addon replaces `{url}` with the encoded target URL.

Example final request shape:

```txt
https://your-proxy.example/raw?url=https%3A%2F%2Fmusic.163.com%2Fapi%2Fsong%2Flyric%2Fv1%3Fid%3D1878313261%26cp%3Dfalse%26lv%3D0%26tv%3D0%26rv%3D0%26kv%3D0%26yv%3D0%26ytv%3D0%26yrv%3D0
```

## 📦 Installation

1. Keep this repository public.
2. Add the GitHub topic `ivlyrics-addon`.
3. Keep `manifest.json` in the repository root.
4. Make sure `manifest.json` points `downloadUrl` to the raw `Addon_Lyrics_Netease.js` file.
5. Open ivLyrics Marketplace.
6. Refresh, search for `NetEase Cloud Music`, and install.

## 🛠️ Settings

| Setting                                                  | Description                                                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| CORS proxy URL                                           | Required. Requests official NetEase APIs through your proxy.                                        |
| Search result limit                                      | Number of NetEase candidates to inspect for each Spotify track.                                     |
| Minimum match score                                      | Higher values reduce false matches.                                                                 |
| Use NetEase translated lyrics                            | Merge NetEase translated lyrics into ivLyrics translation fields.                                   |
| Skip AI translation when NetEase translation exists      | Return cached NetEase translations instead of calling AI translation.                               |
| Use local romanization instead of AI phonetic generation | Generate phonetic lines locally when possible.                                                      |
| Local romanization language                              | Auto detect, Japanese romaji, Korean romaja, or Chinese pinyin.                                     |
| Allow AI fallback if local romanization fails            | Disabled by default.                                                                                |

## 🧪 Development

```bash
node --check Addon_Lyrics_Netease.js
npm run validate
```

## 📝 Notes

NetEase Cloud Music endpoints used by this addon are unofficial web endpoints and may change, throttle, block requests, or return unusable responses depending on region and network conditions.

This addon does not default to any public mirror. Users must provide their own CORS proxy.
