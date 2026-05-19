# 🎧 ivLyrics NetEase Cloud Music

> 给 ivLyrics 用的网易云音乐歌词源插件。  
> 默认使用 `netease.happyking.top`，填写 CORS Proxy 后切换到网易云官方接口。

<p>
  <a href="./README.md">English</a>
</p>

<p>
  <img alt="ivLyrics" src="https://img.shields.io/badge/ivLyrics-Lyrics%20Provider-e60026?style=for-the-badge">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.5-2ea44f?style=for-the-badge">
  <img alt="Default Source" src="https://img.shields.io/badge/default-happyking%20mirror-f97316?style=for-the-badge">
</p>

## ✨ 功能

- 🎵 根据当前 Spotify 歌曲匹配网易云音乐曲目
- 🕒 获取逐行同步歌词 `lrc`
- 🌏 合并网易云翻译歌词 `ytlrc` / `tlyric`
- 🧹 自动去掉开头的作词、作曲、编曲、制作人、发行等 credit 行
- 🧠 当网易云翻译歌词已存在时，跳过 ivLyrics AI 翻译，减少请求消耗
- 🔤 支持本地罗马音 / 拼音生成，尽量不走 AI 发音生成

## 🚦 请求策略

插件有两种请求模式：

| 设置状态          | 使用接口                              | 说明                                             |
| ----------------- | ------------------------------------- | ------------------------------------------------ |
| 未填写 CORS Proxy | `https://netease.happyking.top`       | 默认模式。能否直连取决于镜像站状态和 CORS 策略。 |
| 已填写 CORS Proxy | `https://music.163.com` 官方 Web 接口 | 推荐有条件的用户使用，自建代理更可控、更稳定。   |

默认镜像接口：

```txt
https://netease.happyking.top/cloudsearch
https://netease.happyking.top/lyric/new
```

填写 CORS Proxy 后使用官方接口：

```txt
https://music.163.com/api/cloudsearch/pc
https://music.163.com/api/song/lyric
```

## ⚙️ CORS Proxy

`CORS proxy URL` 可以留空。

留空时，插件会使用默认的 `netease.happyking.top` 镜像。

填写后，插件会切换为通过你的代理请求网易云官方 Web 接口。

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
https://your-proxy.example/raw?url=https%3A%2F%2Fmusic.163.com%2Fapi%2Fsong%2Flyric%3Fid%3D1878313261%26lv%3D-1%26tv%3D-1%26kv%3D-1%26yv%3D-1
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
| CORS proxy URL                                           | 可选。留空使用 `netease.happyking.top`；填写后通过代理请求网易云官方接口。 |
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

本插件使用的网易云相关接口并非正式公开 API，可能会受地区、风控、镜像站状态、CORS 策略影响。

如果默认镜像突然不可用，建议自建 CORS Proxy，并让插件通过代理请求网易云官方接口。
