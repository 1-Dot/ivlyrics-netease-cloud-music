# 🎧 ivLyrics NetEase Cloud Music

> 给 ivLyrics 用的网易云音乐歌词源插件。  
> 通过用户自行填写的 CORS Proxy 请求网易云官方 Web 接口。不再默认使用任何公开镜像站。

<p>
  <a href="./README.md">English</a>
</p>

<p>
  <img alt="ivLyrics" src="https://img.shields.io/badge/ivLyrics-Lyrics%20Provider-e60026?style=for-the-badge">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.7-2ea44f?style=for-the-badge">
  <img alt="CORS Proxy" src="https://img.shields.io/badge/CORS%20proxy-required-f97316?style=for-the-badge">
</p>

## ✨ 功能

- 🎵 根据当前 Spotify 歌曲匹配网易云音乐曲目
- 🕒 获取逐行同步歌词 `lrc`
- 🌏 合并网易云翻译歌词 `ytlrc` / `tlyric`
- 🧹 自动去掉开头的作词、作曲、编曲、制作人、发行等 credit 行
- 🧠 当网易云翻译歌词已存在时，跳过 ivLyrics AI 翻译，减少请求消耗
- 🔤 支持本地罗马音 / 拼音生成，尽量不走 AI 发音生成

## 🚦 请求策略

插件只有一种请求模式：

| 设置状态          | 使用接口                              | 说明                                      |
| ----------------- | ------------------------------------- | ----------------------------------------- |
| 已填写 CORS Proxy | `https://music.163.com` 官方 Web 接口 | 必填。代理必须直接返回网易云原始 JSON。 |
| 未填写 CORS Proxy | 无                                    | 插件直接报错，不再使用公开镜像站。       |

通过 CORS Proxy 请求的官方接口：

```txt
https://music.163.com/api/cloudsearch/pc
https://music.163.com/api/song/lyric/v1
```

## ⚙️ CORS Proxy

`CORS proxy URL` 为必填。留空时，插件会直接报错。

代理需要直接返回原始 JSON 响应，不要包成 `data`、`contents`，也不要返回 HTML。

支持两种格式：

```txt
https://your-proxy.example/raw?url=
```

插件会把编码后的目标 URL 拼接在后面。

```txt
https://your-proxy.example/raw?url={url}
```

插件会把 `{url}` 替换为编码后的目标 URL。

最终请求示例：

```txt
https://your-proxy.example/raw?url=https%3A%2F%2Fmusic.163.com%2Fapi%2Fsong%2Flyric%2Fv1%3Fid%3D1878313261%26cp%3Dfalse%26lv%3D0%26tv%3D0%26rv%3D0%26kv%3D0%26yv%3D0%26ytv%3D0%26yrv%3D0
```

## 📦 安装

1. 保持仓库公开
2. 给仓库添加 GitHub topic：`ivlyrics-addon`
3. 保持 `manifest.json` 在仓库根目录
4. 确保 `manifest.json` 的 `downloadUrl` 指向 raw 格式的 `Addon_Lyrics_Netease.js`
5. 打开 ivLyrics Marketplace
6. 刷新后搜索 `NetEase Cloud Music` 并安装

## 🛠️ 设置项

| 设置项                                                   | 说明                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| CORS proxy URL                                           | 必填。通过你的代理请求网易云官方接口。                                     |
| Search result limit                                      | 每首 Spotify 歌曲检查多少个网易云候选结果。                                |
| Minimum match score                                      | 匹配阈值。越高越不容易误匹配。                                             |
| Use NetEase translated lyrics                            | 使用网易云翻译歌词并写入 ivLyrics 翻译字段。                               |
| Skip AI translation when NetEase translation exists      | 已有网易云翻译时跳过 AI 翻译。                                             |
| Use local romanization instead of AI phonetic generation | 尽量使用本地罗马音 / 拼音生成。                                            |
| Local romanization language                              | 自动检测、日语罗马音、韩语罗马字或中文拼音。                               |
| Allow AI fallback if local romanization fails            | 默认关闭。本地生成失败时是否允许回退到 AI。                                |

## 🧪 开发检查

```bash
node --check Addon_Lyrics_Netease.js
npm run validate
```

## 📝 备注

本插件使用的网易云相关接口并非正式公开 API，可能会受地区、风控和 CORS 策略影响。

本插件不再默认使用任何公开镜像站，用户必须自行提供 CORS Proxy。
