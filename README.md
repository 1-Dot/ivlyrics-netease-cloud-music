# 🎧 ivLyrics NetEase Cloud Music

> NetEase Cloud Music lyrics provider for ivLyrics.  
> Uses `netease.happyking.top` by default, and switches to official NetEase APIs when a CORS proxy is configured.

<p>
  <a href="./README.zh-CN.md">简体中文</a>
</p>

<p>
  <img alt="ivLyrics" src="https://img.shields.io/badge/ivLyrics-Lyrics%20Provider-e60026?style=for-the-badge">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.5-2ea44f?style=for-the-badge">
  <img alt="Default Source" src="https://img.shields.io/badge/default-happyking%20mirror-f97316?style=for-the-badge">
</p>

## ✨ Features

- 🎵 Match the current Spotify track on NetEase Cloud Music
- 🕒 Fetch line-synced lyrics from `lrc`
- 🌏 Merge translated lyrics from `ytlrc` / `tlyric`
- 🧹 Remove leading credit lines such as lyricist, composer, arranger, producer, and label metadata
- 🧠 Skip ivLyrics AI translation when NetEase translated lyrics are already available
- 🔤 Generate local romanization / pinyin instead of using AI phonetic generation

## 🚦 Request Strategy

This addon has two request modes:

| Setting               | API Source                                | Notes                                                                                  |
| --------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| CORS proxy empty      | `https://netease.happyking.top`           | Default mode. Works out of the box when the mirror and its CORS policy are available.  |
| CORS proxy configured | `https://music.163.com` official web APIs | Recommended for users who can self-host a proxy. Usually more controllable and stable. |

Default mirror endpoints:

```txt
https://netease.happyking.top/cloudsearch
https://netease.happyking.top/lyric/new
```

Official endpoints used through your CORS proxy:

```txt
https://music.163.com/api/cloudsearch/pc
https://music.163.com/api/song/lyric
```

## ⚙️ CORS Proxy

The `CORS proxy URL` setting is optional.

Leave it empty to use the default `netease.happyking.top` mirror.

Fill it in to switch to official NetEase Cloud Music web APIs through your proxy.

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
https://your-proxy.example/raw?url=https%3A%2F%2Fmusic.163.com%2Fapi%2Fsong%2Flyric%3Fid%3D1878313261%26lv%3D-1%26tv%3D-1%26kv%3D-1%26yv%3D-1
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
| CORS proxy URL                                           | Optional. Empty uses `netease.happyking.top`; filled uses official NetEase APIs through your proxy. |
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

If the default mirror stops working, configure a self-hosted CORS proxy and let the addon use the official NetEase web APIs instead.
