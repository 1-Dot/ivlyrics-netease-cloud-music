/**
 * NetEase Cloud Music Lyrics Provider for ivLyrics.
 *
 * @addon-type lyrics
 * @name NetEase Cloud Music
 * @version 0.1.0
 * @supports karaoke: false
 * @supports synced: true
 * @supports unsynced: true
 */
(() => {
    'use strict';

    const scriptAddonId = document.currentScript?.dataset?.marketplaceAddon || '';
    const DEFAULT_ADDON_ID = 'netease-cloud-music';
    const ADDON_ID = scriptAddonId || DEFAULT_ADDON_ID;
    const STORAGE_KEY_PREFIX = 'ivLyrics:lyrics:addon:';
    const REQUEST_TIMEOUT_MS = 12000;
    const TRANSLATION_TIME_TOLERANCE_MS = 650;
    const translationCache = new Map();

    const ADDON_INFO = {
        id: ADDON_ID,
        name: 'NetEase Cloud Music',
        author: '1-Dot',
        version: '0.1.0',
        description: {
            en: 'Get synced lyrics and official translated lyrics from NetEase Cloud Music.',
            'zh-CN': '从网易云音乐获取同步歌词和官方翻译歌词。'
        },
        supports: {
            karaoke: false,
            synced: true,
            unsynced: true
        },
        useIvLyricsSync: true,
        cacheVersion: 1,
        icon: 'M12 2C7.03 2 3 6.03 3 11c0 2.4 1.2 4.52 3.03 5.79A4 4 0 0 1 10 13h4a4 4 0 0 1 3.97 3.79A6.98 6.98 0 0 0 21 11c0-4.97-4.03-9-9-9zm0 3a6 6 0 0 1 6 6c0 .68-.11 1.34-.32 1.95A6.96 6.96 0 0 0 14 12h-4a6.96 6.96 0 0 0-3.68.95A6 6 0 0 1 12 5zm-2 10h4a2 2 0 1 1 0 4h-4a2 2 0 1 1 0-4z'
    };

    function manager() {
        return window.LyricsAddonManager;
    }

    function getSetting(key, defaultValue) {
        if (manager()?.getAddonSetting) {
            return manager().getAddonSetting(ADDON_ID, key, defaultValue);
        }
        const raw = Spicetify?.LocalStorage?.get(`${STORAGE_KEY_PREFIX}${ADDON_ID}:${key}`);
        if (raw === null || raw === undefined) return defaultValue;
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    }

    function setSetting(key, value) {
        if (manager()?.setAddonSetting) {
            manager().setAddonSetting(ADDON_ID, key, value);
        }
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFKC')
            .replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）|【[^】]*】/g, ' ')
            .replace(/\b(feat|ft|with|remaster|remastered|explicit|version|edit|radio)\b/gi, ' ')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function compactText(value) {
        return normalizeText(value).replace(/\s+/g, '');
    }

    function splitArtists(value) {
        if (Array.isArray(value)) {
            return value.map(v => typeof v === 'string' ? v : v?.name).filter(Boolean);
        }
        return String(value || '')
            .split(/\s*(?:,|;|\/|&|\band\b|、|，| feat\.? | ft\.? | with )\s*/i)
            .map(v => v.trim())
            .filter(Boolean);
    }

    function getTrackId(info) {
        return info?.trackId || info?.uri?.split(':')?.[2] || info?.uri || '';
    }

    function getCandidateArtists(song) {
        const artists = song?.artists || song?.ar || [];
        return artists.map(artist => artist?.name).filter(Boolean);
    }

    function getCandidateAlbum(song) {
        return song?.album?.name || song?.al?.name || '';
    }

    function getCandidateDuration(song) {
        return Number(song?.duration || song?.dt || 0);
    }

    function textScore(source, candidate) {
        const a = normalizeText(source);
        const b = normalizeText(candidate);
        const ac = compactText(source);
        const bc = compactText(candidate);
        if (!a || !b) return 0;
        if (a === b || ac === bc) return 1;
        if (a.includes(b) || b.includes(a) || ac.includes(bc) || bc.includes(ac)) return 0.82;

        const aTokens = new Set(a.split(' ').filter(Boolean));
        const bTokens = new Set(b.split(' ').filter(Boolean));
        if (!aTokens.size || !bTokens.size) return 0;
        let overlap = 0;
        for (const token of aTokens) {
            if (bTokens.has(token)) overlap++;
        }
        return overlap / Math.max(aTokens.size, bTokens.size);
    }

    function artistScore(sourceArtists, candidateArtists) {
        const source = splitArtists(sourceArtists);
        const candidate = splitArtists(candidateArtists);
        if (!source.length || !candidate.length) return 0;
        let best = 0;
        for (const s of source) {
            for (const c of candidate) {
                best = Math.max(best, textScore(s, c));
            }
        }
        return best;
    }

    function scoreSong(info, song) {
        const title = textScore(info.title, song.name);
        const artists = artistScore(info.artist, getCandidateArtists(song));
        const album = textScore(info.album, getCandidateAlbum(song));

        let duration = 0;
        const infoDuration = Number(info.duration || 0);
        const candidateDuration = getCandidateDuration(song);
        if (infoDuration > 0 && candidateDuration > 0) {
            const diff = Math.abs(infoDuration - candidateDuration);
            if (diff <= 2500) duration = 1;
            else if (diff <= 5000) duration = 0.75;
            else if (diff <= 10000) duration = 0.35;
        }

        const total = Math.round((title * 52) + (artists * 33) + (album * 8) + (duration * 7));
        return {
            total,
            title,
            artists,
            album,
            duration,
            reason: `${Math.round(title * 100)}/${Math.round(artists * 100)}/${Math.round(album * 100)}/${Math.round(duration * 100)}`
        };
    }

    function buildNeteaseUrl(path, params) {
        const url = new URL(`https://music.163.com${path}`);
        Object.entries(params || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, String(value));
            }
        });
        return url.toString();
    }

    function proxiedUrl(url) {
        const proxy = String(getSetting('proxy_url', '') || '').trim();
        if (!proxy) return url;
        const encoded = encodeURIComponent(url);
        if (proxy.includes('{url}')) return proxy.replace('{url}', encoded);
        return proxy + encoded;
    }

    async function fetchJson(url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(proxiedUrl(url), {
                signal: controller.signal,
                cache: 'no-cache',
                headers: {
                    Accept: 'application/json,text/plain,*/*'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const text = await response.text();
            return JSON.parse(text);
        } finally {
            clearTimeout(timer);
        }
    }

    async function searchNetease(info) {
        const limit = clampInteger(getSetting('search_limit', 8), 1, 20);
        const query = [info.title, info.artist].filter(Boolean).join(' ');
        const url = buildNeteaseUrl('/api/search/get/web', {
            s: query,
            type: 1,
            offset: 0,
            total: 'false',
            limit
        });
        const data = await fetchJson(url);
        return data?.result?.songs || [];
    }

    async function fetchLyrics(songId) {
        const url = buildNeteaseUrl('/api/song/lyric', {
            id: songId,
            lv: -1,
            tv: -1,
            kv: -1,
            yv: -1
        });
        return fetchJson(url);
    }

    function clampInteger(value, min, max) {
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed)) return min;
        return Math.max(min, Math.min(max, parsed));
    }

    function parseTimestamp(raw) {
        const match = String(raw || '').match(/^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/);
        if (!match) return null;
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const fraction = match[3] || '0';
        const millis = parseInt(fraction.padEnd(3, '0').slice(0, 3), 10);
        return (minutes * 60 * 1000) + (seconds * 1000) + millis;
    }

    function parseLrc(raw) {
        const lines = [];
        String(raw || '').split(/\r?\n/).forEach(row => {
            const timestamps = [...row.matchAll(/\[(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)\]/g)];
            if (!timestamps.length) return;
            const text = row.replace(/\[[^\]]+\]/g, '').trim();
            timestamps.forEach(match => {
                const startTime = parseTimestamp(match[1]);
                if (startTime !== null) {
                    lines.push({ startTime, text });
                }
            });
        });
        return lines
            .sort((a, b) => a.startTime - b.startTime)
            .filter((line, index, arr) => {
                const previous = arr[index - 1];
                return !previous || previous.startTime !== line.startTime || previous.text !== line.text;
            });
    }

    function mergeTranslatedLines(baseLines, translatedLines) {
        if (!baseLines?.length || !translatedLines?.length) return baseLines || [];

        return baseLines.map(line => {
            let best = null;
            let bestDiff = Infinity;
            for (const translated of translatedLines) {
                const diff = Math.abs(Number(translated.startTime) - Number(line.startTime));
                if (diff < bestDiff) {
                    best = translated;
                    bestDiff = diff;
                }
            }
            const translatedText = best && bestDiff <= TRANSLATION_TIME_TOLERANCE_MS ? best.text : '';
            if (!translatedText) return line;
            return {
                ...line,
                originalText: line.text,
                text2: translatedText,
                translation: translatedText,
                translationText: translatedText
            };
        });
    }

    function linesToUnsynced(lines) {
        return (lines || []).map(line => {
            const item = { text: line.text || '' };
            if (line.text2) {
                item.originalText = line.originalText || line.text || '';
                item.text2 = line.text2;
                item.translation = line.text2;
                item.translationText = line.text2;
            }
            return item;
        });
    }

    function rememberTranslations(trackId, lines) {
        if (!trackId) return;
        const translations = (lines || []).map(line => line.text2 || line.translation || line.translationText || '');
        if (translations.some(Boolean)) {
            translationCache.set(trackId, translations);
            if (translationCache.size > 50) {
                const firstKey = translationCache.keys().next().value;
                translationCache.delete(firstKey);
            }
        }
    }

    function installTranslatorGuard() {
        const guardEnabled = getSetting('skip_ai_translation_when_netease_translation_exists', true) !== false;
        if (!guardEnabled || !window.Translator || typeof window.Translator.callGemini !== 'function') return;
        if (window.Translator.__ivLyricsNeteaseGuardInstalled) return;

        const originalCallGemini = window.Translator.callGemini.bind(window.Translator);
        window.Translator.callGemini = async function guardedCallGemini(payload) {
            const provider = String(payload?.provider || '');
            const wantsTranslation = payload && payload.wantSmartPhonetic !== true;
            const trackId = payload?.trackId || '';
            const skipAiNow = getSetting('skip_ai_translation_when_netease_translation_exists', true) !== false;
            if (skipAiNow && wantsTranslation && provider === ADDON_ID && translationCache.has(trackId)) {
                const translation = translationCache.get(trackId) || [];
                if (translation.some(Boolean)) {
                    return { translation };
                }
            }
            return originalCallGemini(payload);
        };
        window.Translator.__ivLyricsNeteaseGuardInstalled = true;
    }

    function createSettingsUI() {
        const React = Spicetify.React;
        return function NeteaseLyricsSettings() {
            const [searchLimit, setSearchLimit] = React.useState(String(getSetting('search_limit', 8)));
            const [minScore, setMinScore] = React.useState(String(getSetting('min_score', 58)));
            const [proxyUrl, setProxyUrl] = React.useState(String(getSetting('proxy_url', '') || ''));
            const [enableTranslation, setEnableTranslation] = React.useState(getSetting('enable_netease_translation', true) !== false);
            const [skipAiTranslation, setSkipAiTranslation] = React.useState(getSetting('skip_ai_translation_when_netease_translation_exists', true) !== false);

            const saveNumber = (key, value, min, max, setter) => {
                setter(value);
                const parsed = clampInteger(value, min, max);
                setSetting(key, parsed);
            };

            return React.createElement('div', { className: 'ai-addon-settings netease-settings' },
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('label', null, 'Search result limit'),
                    React.createElement('input', {
                        type: 'number',
                        min: 1,
                        max: 20,
                        value: searchLimit,
                        onChange: e => saveNumber('search_limit', e.target.value, 1, 20, setSearchLimit)
                    }),
                    React.createElement('small', null, 'How many NetEase candidates to inspect for each Spotify track.')
                ),
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('label', null, 'Minimum match score'),
                    React.createElement('input', {
                        type: 'number',
                        min: 1,
                        max: 100,
                        value: minScore,
                        onChange: e => saveNumber('min_score', e.target.value, 1, 100, setMinScore)
                    }),
                    React.createElement('small', null, 'Higher values reduce false matches. 58 is a balanced default.')
                ),
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('label', null,
                        React.createElement('input', {
                            type: 'checkbox',
                            checked: enableTranslation,
                            onChange: e => {
                                setEnableTranslation(e.target.checked);
                                setSetting('enable_netease_translation', e.target.checked);
                            }
                        }),
                        ' Use NetEase translated lyrics when available'
                    )
                ),
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('label', null,
                        React.createElement('input', {
                            type: 'checkbox',
                            checked: skipAiTranslation,
                            onChange: e => {
                                setSkipAiTranslation(e.target.checked);
                                setSetting('skip_ai_translation_when_netease_translation_exists', e.target.checked);
                            }
                        }),
                        ' Skip AI translation when NetEase translation exists'
                    ),
                    React.createElement('small', null, 'This intercepts ivLyrics translation requests only for this provider and only when tlyric was fetched.')
                ),
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('label', null, 'CORS proxy URL (optional)'),
                    React.createElement('input', {
                        type: 'text',
                        value: proxyUrl,
                        placeholder: 'https://your-proxy.example/raw?url=',
                        onChange: e => {
                            setProxyUrl(e.target.value);
                            setSetting('proxy_url', e.target.value);
                        }
                    }),
                    React.createElement('small', null, 'Leave empty for direct requests. Use {url} placeholder if your proxy needs it.')
                )
            );
        };
    }

    const NeteaseLyricsAddon = {
        ...ADDON_INFO,

        async init() {
            installTranslatorGuard();
            window.__ivLyricsDebugLog?.(`[NetEase Lyrics Addon] Initialized (${ADDON_ID})`);
        },

        getSettingsUI() {
            return createSettingsUI();
        },

        async getLyrics(info) {
            installTranslatorGuard();

            const result = {
                uri: info.uri,
                provider: ADDON_ID,
                karaoke: null,
                synced: null,
                unsynced: null,
                copyright: 'Lyrics from NetEase Cloud Music',
                error: null,
                netease: null
            };

            let songs;
            try {
                songs = await searchNetease(info);
            } catch (error) {
                result.error = `Search failed: ${error.message || error}`;
                result.skipCache = true;
                return result;
            }

            if (!songs.length) {
                result.error = 'No NetEase search results';
                return result;
            }

            const ranked = songs
                .map(song => ({ song, score: scoreSong(info, song) }))
                .sort((a, b) => b.score.total - a.score.total);

            const minScore = clampInteger(getSetting('min_score', 58), 1, 100);
            const best = ranked[0];
            if (!best || best.score.total < minScore) {
                result.error = `No confident match (${best?.score?.total || 0}/${minScore})`;
                result.skipCache = true;
                return result;
            }

            let lyricData;
            try {
                lyricData = await fetchLyrics(best.song.id);
            } catch (error) {
                result.error = `Lyrics request failed: ${error.message || error}`;
                result.skipCache = true;
                return result;
            }

            const lrcRaw = lyricData?.lrc?.lyric || '';
            if (!lrcRaw.trim()) {
                result.error = 'No lyrics';
                return result;
            }

            let synced = parseLrc(lrcRaw);
            if (!synced.length) {
                result.unsynced = String(lrcRaw)
                    .split(/\r?\n/)
                    .map(text => ({ text: text.replace(/\[[^\]]+\]/g, '').trim() }))
                    .filter(line => line.text);
            } else {
                const useTranslation = getSetting('enable_netease_translation', true) !== false;
                if (useTranslation) {
                    const translated = parseLrc(lyricData?.tlyric?.lyric || '');
                    synced = mergeTranslatedLines(synced, translated);
                    rememberTranslations(getTrackId(info), synced);
                }
                result.synced = synced;
                result.unsynced = linesToUnsynced(synced);
            }

            result.netease = {
                id: best.song.id,
                name: best.song.name,
                artists: getCandidateArtists(best.song),
                album: getCandidateAlbum(best.song),
                score: best.score.total,
                scoreReason: best.score.reason
            };

            if (!result.synced && !result.unsynced) {
                result.error = 'Parsed lyrics are empty';
            }

            return result;
        }
    };

    const registerAddon = () => {
        if (window.LyricsAddonManager) {
            window.LyricsAddonManager.register(NeteaseLyricsAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();
    window.__ivLyricsDebugLog?.('[NetEase Lyrics Addon] Module loaded');
})();
