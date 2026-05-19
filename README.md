# 🎧 ivLyrics NetEase Cloud Music

> 给 ivLyrics 用的网易云歌词源插件。  
> 默认使用 `netease.happyking.top` 镜像；填写 CORS Proxy 后切换到网易云官方接口。

<p>
  <img alt="Addon Type" src="https://img.shields.io/badge/ivLyrics-Lyrics%20Provider-e60026?style=for-the-badge">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.5-2ea44f?style=for-the-badge">
  <img alt="Source" src="https://img.shields.io/badge/default-happyking%20mirror-f97316?style=for-the-badge">
</p>

## ✨ 功能

- 🎵 从网易云匹配当前 Spotify 歌曲
- 🕒 获取逐行同步歌词 `lrc`
- 🌏 合并网易云翻译歌词 `ytlrc / tlyric`
- 🧹 自动去掉开头的作词、作曲、编曲等 credit 行
- 🧠 有网易云翻译时跳过 ivLyrics AI 翻译，省请求次数
- 🔤 支持本地罗马音 / 拼音生成，默认不走 AI

## 🚦 请求策略

这个插件有两种模式：

| 状态              | 使用接口                         | 说明                                                  |
| ----------------- | -------------------------------- | ----------------------------------------------------- |
| 未填写 CORS Proxy | `https://netease.happyking.top`  | 默认模式，开箱即用性最好，但仍取决于镜像站状态和 CORS |
| 已填写 CORS Proxy | `https://music.163.com` 官方接口 | 推荐有条件的用户使用，自建代理更稳定                  |

默认第三方接口：

```txt
https://netease.happyking.top/cloudsearch
https://netease.happyking.top/lyric/new
```

填写 CORS Proxy 后使用官方接口：

```txt
https://music.163.com/api/cloudsearch/pc
https://music.163.com/api/song/lyric
```

## ⚙️ CORS Proxy 格式

插件设置里的 `CORS proxy URL` 可以留空。  
留空时会直接请求 `netease.happyking.top`。

如果你填写了代理，代理需要返回**原始 JSON**，不要包一层 `data`、`contents` 或 HTML。

支持两种写法：

```txt
https://your-proxy.example/raw?url=
```

插件会把编码后的目标 URL 拼到后面。

```txt
https://your-proxy.example/raw?url={url}
```

插件会把 `{url}` 替换为编码后的目标 URL。

## 📦 安装

1. 确保仓库公开
2. 给仓库添加 GitHub topic：`ivlyrics-addon`
3. 保持 `manifest.json` 在仓库根目录
4. 在 ivLyrics Marketplace 刷新并搜索 `NetEase Cloud Music`
5. 安装后进入歌词源设置页按需配置

## 🧪 开发检查

```bash
node --check Addon_Lyrics_Netease.js
npm run validate
```

## 📝 备注

网易云相关接口都不是正式公开 API，可能会受地区、风控、镜像站状态、CORS 策略影响。  
如果默认镜像突然抽风，优先建议自建 CORS Proxy 后走官方接口。
