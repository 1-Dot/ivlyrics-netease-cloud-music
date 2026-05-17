/**
 * NetEase Cloud Music Lyrics Provider for ivLyrics.
 *
 * Diagnostic build: verbose request / matching / parsing logs are enabled by default.
 *
 * @addon-type lyrics
 * @name NetEase Cloud Music
 * @version 0.1.1
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
    const ADDON_VERSION = '0.1.1';
    const CACHE_VERSION = '2026-05-18-diagnostic-verbose-1';
    const DEBUG_NAMESPACE = '[NetEase Lyrics Addon]';
    const translationCache = new Map();

    const ADDON_INFO = {
        id: ADDON_ID,
        name: 'NetEase Cloud Music',
        author: '1-Dot',
        version: ADDON_VERSION,
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
        cacheVersion: CACHE_VERSION,
        icon: 'M12 2C7.03 2 3 6.03 3 11c0 2.4 1.2 4.52 3.03 5.79A4 4 0 0 1 10 13h4a4 4 0 0 1 3.97 3.79A6.98 6.98 0 0 0 21 11c0-4.97-4.03-9-9-9zm0 3a6 6 0 0 1 6 6c0 .68-.11 1.34-.32 1.95A6.96 6.96 0 0 0 14 12h-4a6.96 6.96 0 0 0-3.68.95A6 6 0 0 1 12 5zm-2 10h4a2 2 0 1 1 0 4h-4a2 2 0 1 1 0-4z'
    };

    const debugState = window.__ivLyricsNeteaseDebug || {};
    Object.assign(debugState, {
        addonId: ADDON_ID,
        fallbackAddonId: DEFAULT_ADDON_ID,
        version: ADDON_VERSION,
        cacheVersion: CACHE_VERSION,
        scriptAddonId,
        loadedAt: new Date().toISOString(),
        requestSeq: debugState.requestSeq || 0,
        requests: debugState.requests || [],
        lastResult: debugState.lastResult || null,
        lastError: debugState.lastError || null,
        lastCandidates: debugState.lastCandidates || [],
        translationCache,
        settingsSnapshot: {}
    });
    window.__ivLyricsNeteaseDebug = debugState;

    function manager() {
        return window.LyricsAddonManager;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function safePreview(value, max = 600) {
        if (value === null || value === undefined) return value;
        const text = typeof value === 'string' ? value : (() => {
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        })();
        return text.length > max ? `${text.slice(0, max)}… <${text.length} chars>` : text;
    }

    function pushDebugRecord(record) {
        debugState.requests.push(record);
        if (debugState.requests.length > 80) {
            debugState.requests.splice(0, debugState.requests.length - 80);
        }
    }

    function isDebugEnabled() {
        return getSetting('enable_debug_logs', true) !== false;
    }

    function debugLog(...args) {
        if (!isDebugEnabled()) return;
        const prefix = `${DEBUG_NAMESPACE} ${nowIso()}`;
        try {
            console.log(prefix, ...args);
        } catch {
            // Ignore logging failures.
        }
        try {
            window.__ivLyricsDebugLog?.(`${prefix} ${args.map(arg => {
                if (typeof arg === 'string') return arg;
                try {
                    return JSON.stringify(arg);
                } catch {
                    return String(arg);
                }
            }).join(' ')}`);
        } catch {
            // Ignore logging bridge failures.
        }
    }

    function debugWarn(...args) {
        if (!isDebugEnabled()) return;
        const prefix = `${DEBUG_NAMESPACE} ${nowIso()}`;
        try {
            console.warn(prefix, ...args);
        } catch {
            // Ignore logging failures.
        }
        try {
            window.__ivLyricsDebugLog?.(`${prefix} WARN ${args.map(arg => {
                if (typeof arg === 'string') return arg;
                try {
                    return JSON.stringify(arg);
                } catch {
                    return String(arg);
                }
            }).join(' ')}`);
        } catch {
            // Ignore logging bridge failures.
        }
    }

    function debugError(...args) {
        const prefix = `${DEBUG_NAMESPACE} ${nowIso()}`;
        try {
            console.error(prefix, ...args);
        } catch {
            // Ignore logging failures.
        }
        try {
            window.__ivLyricsDebugLog?.(`${prefix} ERROR ${args.map(arg => {
                if (typeof arg === 'string') return arg;
                try {
                    return JSON.stringify(arg);
                } catch {
                    return String(arg);
                }
            }).join(' ')}`);
        } catch {
            // Ignore logging bridge failures.
        }
    }

    function getStorageKey(key) {
        return `${STORAGE_KEY_PREFIX}${ADDON_ID}:${key}`;
    }

    function getSetting(key, defaultValue) {
        if (manager()?.getAddonSetting) {
            return manager().getAddonSetting(ADDON_ID, key, defaultValue);
        }
        const raw = Spicetify?.LocalStorage?.get?.(getStorageKey(key));
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
            return;
        }
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        Spicetify?.LocalStorage?.set?.(getStorageKey(key), serialized);
    }

    function getSettingsSnapshot() {
        const snapshot = {
            addonId: ADDON_ID,
            providerRegistered: !!manager()?.getAddon?.(ADDON_ID),
            providerOrder: manager()?.getProviderOrder?.() || [],
            enabledProviders: manager()?.getEnabledProviders?.()?.map(provider => provider.id) || [],
            searchLimit: clampInteger(getSetting('search_limit', 8), 1, 20),
            minScore: clampInteger(getSetting('min_score', 58), 1, 100),
            proxyUrl: String(getSetting('proxy_url', '') || ''),
            enableTranslation: getSetting('enable_netease_translation', true) !== false,
            skipAiTranslation: getSetting('skip_ai_translation_when_netease_translation_exists', true) !== false,
            enableDebugLogs: getSetting('enable_debug_logs', true) !== false
        };
        debugState.settingsSnapshot = snapshot;
        return snapshot;
    }

    function scheduleLyricsReload(reason) {
        debugLog('scheduleLyricsReload()', { reason });
        setTimeout(() => {
            try {
                if (typeof window.reloadLyrics === 'function') {
                    debugLog('Calling window.reloadLyrics(true)', { reason });
                    window.reloadLyrics(true);
                    return;
                }
                if (window.lyricContainer?.reloadLyrics) {
                    debugLog('Calling lyricContainer.reloadLyrics(true)', { reason });
                    window.lyricContainer.reloadLyrics(true);
                    return;
                }
                if (window.lyricContainer?.fetchLyrics && Spicetify?.Player?.data?.item) {
                    debugLog('Calling lyricContainer.fetchLyrics(currentTrack, -1, true)', { reason });
                    window.lyricContainer.fetchLyrics(Spicetify.Player.data.item, -1, true);
                    return;
                }
                debugWarn('No reload hook available', { reason });
            } catch (error) {
                debugError('Reload failed', error);
            }
        }, 120);
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
        let durationDiff = null;
        if (infoDuration > 0 && candidateDuration > 0) {
            const diff = Math.abs(infoDuration - candidateDuration);
            durationDiff = diff;
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
            durationDiff,
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

    async function fetchJson(url, context = {}) {
        const requestId = ++debugState.requestSeq;
        const startedAt = performance.now();
        const finalUrl = proxiedUrl(url);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const record = {
            requestId,
            context,
            originalUrl: url,
            finalUrl,
            startedAt: nowIso(),
            status: 'pending'
        };
        pushDebugRecord(record);

        debugLog(`#${requestId} fetchJson:start`, {
            context,
            originalUrl: url,
            finalUrl,
            proxied: finalUrl !== url,
            timeoutMs: REQUEST_TIMEOUT_MS
        });

        try {
            const response = await fetch(finalUrl, {
                signal: controller.signal,
                cache: 'no-cache',
                headers: {
                    Accept: 'application/json,text/plain,*/*'
                }
            });
            const text = await response.text();
            const elapsedMs = Math.round(performance.now() - startedAt);

            Object.assign(record, {
                status: response.ok ? 'http-ok' : 'http-error',
                httpStatus: response.status,
                elapsedMs,
                contentType: response.headers?.get?.('content-type') || '',
                bodyLength: text.length,
                bodyPreview: safePreview(text, 1000)
            });

            debugLog(`#${requestId} fetchJson:response`, {
                context,
                httpStatus: response.status,
                ok: response.ok,
                elapsedMs,
                contentType: record.contentType,
                bodyLength: text.length,
                bodyPreview: safePreview(text, 600)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (error) {
                record.status = 'json-parse-error';
                record.error = error?.message || String(error);
                debugError(`#${requestId} JSON.parse failed`, {
                    error: record.error,
                    bodyPreview: safePreview(text, 1000)
                });
                throw error;
            }

            record.status = 'parsed';
            record.parsedKeys = parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 30) : [];
            debugLog(`#${requestId} fetchJson:parsed`, {
                context,
                keys: record.parsedKeys,
                code: parsed?.code,
                resultKeys: parsed?.result ? Object.keys(parsed.result).slice(0, 30) : []
            });

            return parsed;
        } catch (error) {
            record.status = 'failed';
            record.error = error?.name === 'AbortError'
                ? `AbortError after ${REQUEST_TIMEOUT_MS}ms`
                : (error?.message || String(error));
            record.elapsedMs = Math.round(performance.now() - startedAt);
            debugState.lastError = record;
            debugError(`#${requestId} fetchJson:failed`, record);
            throw error;
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

        debugLog('searchNetease:start', {
            query,
            limit,
            title: info?.title,
            artist: info?.artist,
            album: info?.album,
            duration: info?.duration
        });

        const data = await fetchJson(url, { type: 'search', query, limit });
        const songs = data?.result?.songs || [];

        debugLog('searchNetease:done', {
            code: data?.code,
            songCount: data?.result?.songCount,
            returnedCount: songs.length,
            firstSongs: songs.slice(0, 8).map(song => summarizeSong(song))
        });

        return songs;
    }

    async function fetchLyrics(songId) {
        const url = buildNeteaseUrl('/api/song/lyric', {
            id: songId,
            lv: -1,
            tv: -1,
            kv: -1,
            yv: -1
        });

        debugLog('fetchLyrics:start', { songId, url });
        const data = await fetchJson(url, { type: 'lyrics', songId });

        debugLog('fetchLyrics:done', {
            songId,
            code: data?.code,
            keys: data && typeof data === 'object' ? Object.keys(data) : [],
            hasLrc: !!data?.lrc?.lyric,
            lrcLength: data?.lrc?.lyric?.length || 0,
            tlyricLength: data?.tlyric?.lyric?.length || 0,
            yrcLength: data?.yrc?.lyric?.length || 0,
            yromalrcLength: data?.yromalrc?.lyric?.length || 0,
            nolyric: data?.nolyric,
            uncollected: data?.uncollected,
            lrcPreview: safePreview(data?.lrc?.lyric || '', 220),
            tlyricPreview: safePreview(data?.tlyric?.lyric || '', 220)
        });

        return data;
    }

    function clampInteger(value, min, max) {
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed)) return min;
        return Math.max(min, Math.min(max, parsed));
    }

    function parseTimestamp(raw) {
        const match = String(raw || '').match(/^(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?$/);
        if (!match) return null;
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const fraction = match[3] || '0';
        const millis = parseInt(fraction.padEnd(3, '0').slice(0, 3), 10);
        return (minutes * 60 * 1000) + (seconds * 1000) + millis;
    }

    function parseLrc(raw, label = 'lrc') {
        const input = String(raw || '');
        const lines = [];
        let rawRows = 0;
        let timestampRows = 0;
        let skippedRows = 0;

        input.split(/\r?\n/).forEach(row => {
            rawRows++;
            const timestamps = [...row.matchAll(/\[(\d{1,3}:\d{2}(?:[.:]\d{1,3})?)\]/g)];
            if (!timestamps.length) {
                if (row.trim()) skippedRows++;
                return;
            }
            timestampRows++;
            const text = row.replace(/\[[^\]]+\]/g, '').trim();
            timestamps.forEach(match => {
                const startTime = parseTimestamp(match[1]);
                if (startTime !== null) {
                    lines.push({ startTime, text });
                }
            });
        });

        const output = lines
            .sort((a, b) => a.startTime - b.startTime)
            .filter((line, index, arr) => {
                const previous = arr[index - 1];
                return !previous || previous.startTime !== line.startTime || previous.text !== line.text;
            });

        debugLog('parseLrc()', {
            label,
            rawLength: input.length,
            rawRows,
            timestampRows,
            skippedRows,
            parsedLines: output.length,
            firstLine: output[0],
            lastLine: output[output.length - 1]
        });

        return output;
    }

    function mergeTranslatedLines(baseLines, translatedLines) {
        if (!baseLines?.length || !translatedLines?.length) {
            debugLog('mergeTranslatedLines:skip', {
                baseCount: baseLines?.length || 0,
                translatedCount: translatedLines?.length || 0
            });
            return baseLines || [];
        }

        let matched = 0;
        let unmatched = 0;
        let maxMatchedDiff = 0;

        const output = baseLines.map(line => {
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
            if (!translatedText) {
                unmatched++;
                return line;
            }
            matched++;
            maxMatchedDiff = Math.max(maxMatchedDiff, bestDiff);
            return {
                ...line,
                originalText: line.text,
                text2: translatedText,
                translation: translatedText,
                translationText: translatedText
            };
        });

        debugLog('mergeTranslatedLines:done', {
            baseCount: baseLines.length,
            translatedCount: translatedLines.length,
            matched,
            unmatched,
            toleranceMs: TRANSLATION_TIME_TOLERANCE_MS,
            maxMatchedDiff
        });

        return output;
    }

    function linesToUnsynced(lines) {
        const unsynced = (lines || []).map(line => {
            const item = { text: line.text || '' };
            if (line.text2) {
                item.originalText = line.originalText || line.text || '';
                item.text2 = line.text2;
                item.translation = line.text2;
                item.translationText = line.text2;
            }
            return item;
        });

        debugLog('linesToUnsynced()', {
            inputCount: lines?.length || 0,
            outputCount: unsynced.length,
            translatedCount: unsynced.filter(line => line.text2).length
        });

        return unsynced;
    }

    function summarizeSong(song, score = null) {
        return {
            id: song?.id,
            name: song?.name,
            artists: getCandidateArtists(song).join(', '),
            album: getCandidateAlbum(song),
            duration: getCandidateDuration(song),
            fee: song?.fee,
            status: song?.status,
            copyrightId: song?.copyrightId,
            transNames: song?.transNames,
            score: score?.total,
            reason: score?.reason,
            subScores: score ? {
                title: Number(score.title.toFixed(3)),
                artists: Number(score.artists.toFixed(3)),
                album: Number(score.album.toFixed(3)),
                duration: Number(score.duration.toFixed(3)),
                durationDiff: score.durationDiff
            } : undefined
        };
    }

    function rememberTranslations(trackId, lines) {
        if (!trackId) {
            debugWarn('rememberTranslations: missing trackId');
            return;
        }
        const translations = (lines || []).map(line => line.text2 || line.translation || line.translationText || '');
        if (translations.some(Boolean)) {
            translationCache.set(trackId, translations);
            if (translationCache.size > 50) {
                const firstKey = translationCache.keys().next().value;
                translationCache.delete(firstKey);
            }
            debugLog('rememberTranslations:cached', {
                trackId,
                lines: translations.length,
                nonEmpty: translations.filter(Boolean).length,
                cacheSize: translationCache.size
            });
        } else {
            debugLog('rememberTranslations:no translated lines', { trackId, lines: translations.length });
        }
    }

    function installTranslatorGuard() {
        const guardEnabled = getSetting('skip_ai_translation_when_netease_translation_exists', true) !== false;
        if (!guardEnabled || !window.Translator || typeof window.Translator.callGemini !== 'function') {
            debugLog('installTranslatorGuard:skip', {
                guardEnabled,
                hasTranslator: !!window.Translator,
                hasCallGemini: typeof window.Translator?.callGemini === 'function',
                installed: !!window.Translator?.__ivLyricsNeteaseGuardInstalled
            });
            return;
        }
        if (window.Translator.__ivLyricsNeteaseGuardInstalled) return;

        const originalCallGemini = window.Translator.callGemini.bind(window.Translator);
        window.Translator.callGemini = async function guardedCallGemini(payload) {
            const provider = String(payload?.provider || '');
            const wantsTranslation = payload && payload.wantSmartPhonetic !== true;
            const trackId = payload?.trackId || '';
            const skipAiNow = getSetting('skip_ai_translation_when_netease_translation_exists', true) !== false;
            debugLog('Translator.callGemini intercepted', {
                provider,
                addonId: ADDON_ID,
                wantsTranslation,
                trackId,
                skipAiNow,
                hasNeteaseTranslationCache: translationCache.has(trackId)
            });

            if (skipAiNow && wantsTranslation && provider === ADDON_ID && translationCache.has(trackId)) {
                const translation = translationCache.get(trackId) || [];
                if (translation.some(Boolean)) {
                    debugLog('Translator.callGemini returning NetEase translation cache', {
                        trackId,
                        lines: translation.length,
                        nonEmpty: translation.filter(Boolean).length
                    });
                    return { translation };
                }
            }
            return originalCallGemini(payload);
        };
        window.Translator.__ivLyricsNeteaseGuardInstalled = true;
        debugLog('installTranslatorGuard:installed');
    }

    function createSettingsUI() {
        const React = Spicetify.React;
        return function NeteaseLyricsSettings() {
            const [searchLimit, setSearchLimit] = React.useState(String(getSetting('search_limit', 8)));
            const [minScore, setMinScore] = React.useState(String(getSetting('min_score', 58)));
            const [proxyUrl, setProxyUrl] = React.useState(String(getSetting('proxy_url', '') || ''));
            const [enableTranslation, setEnableTranslation] = React.useState(getSetting('enable_netease_translation', true) !== false);
            const [skipAiTranslation, setSkipAiTranslation] = React.useState(getSetting('skip_ai_translation_when_netease_translation_exists', true) !== false);
            const [enableDebugLogs, setEnableDebugLogs] = React.useState(getSetting('enable_debug_logs', true) !== false);

            const saveNumber = (key, value, min, max, setter) => {
                setter(value);
                const parsed = clampInteger(value, min, max);
                setSetting(key, parsed);
                debugLog('Setting changed', { key, value: parsed });
                scheduleLyricsReload(`setting:${key}`);
            };

            const saveBoolean = (key, value, setter) => {
                setter(value);
                setSetting(key, value);
                debugLog('Setting changed', { key, value });
                scheduleLyricsReload(`setting:${key}`);
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
                            onChange: e => saveBoolean('enable_netease_translation', e.target.checked, setEnableTranslation)
                        }),
                        ' Use NetEase translated lyrics when available'
                    )
                ),
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('label', null,
                        React.createElement('input', {
                            type: 'checkbox',
                            checked: skipAiTranslation,
                            onChange: e => saveBoolean('skip_ai_translation_when_netease_translation_exists', e.target.checked, setSkipAiTranslation)
                        }),
                        ' Skip AI translation when NetEase translation exists'
                    ),
                    React.createElement('small', null, 'This intercepts ivLyrics translation requests only for this provider and only when tlyric was fetched.')
                ),
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('label', null,
                        React.createElement('input', {
                            type: 'checkbox',
                            checked: enableDebugLogs,
                            onChange: e => {
                                setEnableDebugLogs(e.target.checked);
                                setSetting('enable_debug_logs', e.target.checked);
                                console.log(DEBUG_NAMESPACE, 'Debug logs toggled:', e.target.checked);
                            }
                        }),
                        ' Enable verbose debug logs'
                    ),
                    React.createElement('small', null, 'Logs are written to the DevTools console and window.__ivLyricsNeteaseDebug.')
                ),
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('label', null, 'CORS proxy URL (optional)'),
                    React.createElement('input', {
                        type: 'text',
                        value: proxyUrl,
                        placeholder: 'https://api.codetabs.com/v1/proxy/?quest=',
                        onChange: e => {
                            setProxyUrl(e.target.value);
                            setSetting('proxy_url', e.target.value);
                            debugLog('Setting changed', { key: 'proxy_url', value: e.target.value });
                        },
                        onBlur: () => scheduleLyricsReload('setting:proxy_url:onBlur')
                    }),
                    React.createElement('small', null, 'Leave empty for direct requests. Use {url} placeholder if your proxy needs it. Codetabs example: https://api.codetabs.com/v1/proxy/?quest=')
                ),
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('button', {
                        type: 'button',
                        onClick: () => {
                            debugLog('Manual reload button clicked');
                            scheduleLyricsReload('manual-button');
                        }
                    }, 'Reload lyrics now'),
                    React.createElement('button', {
                        type: 'button',
                        style: { marginLeft: '8px' },
                        onClick: () => {
                            const snapshot = getSettingsSnapshot();
                            console.log(DEBUG_NAMESPACE, 'Debug snapshot:', {
                                snapshot,
                                debugState,
                                addon: manager()?.getAddon?.(ADDON_ID)
                            });
                        }
                    }, 'Print debug snapshot')
                )
            );
        };
    }

    const NeteaseLyricsAddon = {
        ...ADDON_INFO,

        async init() {
            debugLog('init:start', {
                addonId: ADDON_ID,
                scriptAddonId,
                currentScriptDataset: document.currentScript?.dataset ? { ...document.currentScript.dataset } : null,
                version: ADDON_VERSION,
                cacheVersion: CACHE_VERSION
            });
            getSettingsSnapshot();
            installTranslatorGuard();
            debugLog('init:done', getSettingsSnapshot());
        },

        getSettingsUI() {
            return createSettingsUI();
        },

        async getLyrics(info) {
            const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const startedAt = performance.now();
            installTranslatorGuard();

            const result = {
                uri: info?.uri,
                provider: ADDON_ID,
                cacheVersion: CACHE_VERSION,
                karaoke: null,
                synced: null,
                unsynced: null,
                copyright: 'Lyrics from NetEase Cloud Music',
                error: null,
                netease: null,
                debugRunId: runId
            };

            debugState.lastResult = null;
            debugState.lastError = null;

            debugLog(`getLyrics:start run=${runId}`, {
                info,
                normalized: {
                    title: normalizeText(info?.title),
                    artist: normalizeText(info?.artist),
                    album: normalizeText(info?.album),
                    duration: Number(info?.duration || 0),
                    trackId: getTrackId(info)
                },
                settings: getSettingsSnapshot()
            });

            let songs;
            try {
                songs = await searchNetease(info);
            } catch (error) {
                result.error = `Search failed: ${error.message || error}`;
                result.skipCache = true;
                debugState.lastResult = result;
                debugState.lastError = { stage: 'search', error: result.error };
                debugError(`getLyrics:search failed run=${runId}`, {
                    error: result.error,
                    elapsedMs: Math.round(performance.now() - startedAt)
                });
                return result;
            }

            if (!songs.length) {
                result.error = 'No NetEase search results';
                result.skipCache = true;
                debugState.lastResult = result;
                debugWarn(`getLyrics:no search results run=${runId}`, {
                    elapsedMs: Math.round(performance.now() - startedAt)
                });
                return result;
            }

            const ranked = songs
                .map(song => ({ song, score: scoreSong(info, song) }))
                .sort((a, b) => b.score.total - a.score.total);

            const candidateSummary = ranked.map(item => summarizeSong(item.song, item.score));
            debugState.lastCandidates = candidateSummary;

            debugLog(`getLyrics:ranked candidates run=${runId}`, {
                minScore: clampInteger(getSetting('min_score', 58), 1, 100),
                candidates: candidateSummary
            });
            try {
                console.table?.(candidateSummary.map(item => ({
                    id: item.id,
                    name: item.name,
                    artists: item.artists,
                    album: item.album,
                    duration: item.duration,
                    score: item.score,
                    reason: item.reason,
                    durationDiff: item.subScores?.durationDiff
                })));
            } catch {
                // console.table may not exist.
            }

            const minScore = clampInteger(getSetting('min_score', 58), 1, 100);
            const best = ranked[0];
            if (!best || best.score.total < minScore) {
                result.error = `No confident match (${best?.score?.total || 0}/${minScore})`;
                result.skipCache = true;
                result.netease = best ? summarizeSong(best.song, best.score) : null;
                debugState.lastResult = result;
                debugWarn(`getLyrics:low confidence run=${runId}`, {
                    best: result.netease,
                    minScore,
                    elapsedMs: Math.round(performance.now() - startedAt)
                });
                return result;
            }

            debugLog(`getLyrics:selected candidate run=${runId}`, summarizeSong(best.song, best.score));

            let lyricData;
            try {
                lyricData = await fetchLyrics(best.song.id);
            } catch (error) {
                result.error = `Lyrics request failed: ${error.message || error}`;
                result.skipCache = true;
                result.netease = summarizeSong(best.song, best.score);
                debugState.lastResult = result;
                debugState.lastError = { stage: 'lyrics', error: result.error };
                debugError(`getLyrics:lyrics request failed run=${runId}`, {
                    error: result.error,
                    selected: result.netease,
                    elapsedMs: Math.round(performance.now() - startedAt)
                });
                return result;
            }

            const lrcRaw = lyricData?.lrc?.lyric || '';
            if (!lrcRaw.trim()) {
                result.error = 'No lyrics';
                result.skipCache = true;
                result.netease = {
                    ...summarizeSong(best.song, best.score),
                    lyricKeys: lyricData && typeof lyricData === 'object' ? Object.keys(lyricData) : [],
                    lyricCode: lyricData?.code,
                    nolyric: lyricData?.nolyric,
                    uncollected: lyricData?.uncollected,
                    rawPreview: safePreview(lyricData, 1000)
                };
                debugState.lastResult = result;
                debugWarn(`getLyrics:no lrc.lyric run=${runId}`, result.netease);
                return result;
            }

            let synced = parseLrc(lrcRaw, 'lrc');
            if (!synced.length) {
                result.unsynced = String(lrcRaw)
                    .split(/\r?\n/)
                    .map(text => ({ text: text.replace(/\[[^\]]+\]/g, '').trim() }))
                    .filter(line => line.text);

                debugWarn(`getLyrics:lrc parse empty, using unsynced fallback run=${runId}`, {
                    unsyncedCount: result.unsynced.length
                });
            } else {
                const useTranslation = getSetting('enable_netease_translation', true) !== false;
                if (useTranslation) {
                    const translated = parseLrc(lyricData?.tlyric?.lyric || '', 'tlyric');
                    synced = mergeTranslatedLines(synced, translated);
                    rememberTranslations(getTrackId(info), synced);
                } else {
                    debugLog(`getLyrics:translation disabled run=${runId}`);
                }
                result.synced = synced;
                result.unsynced = linesToUnsynced(synced);
            }

            result.netease = {
                ...summarizeSong(best.song, best.score),
                lyricKeys: lyricData && typeof lyricData === 'object' ? Object.keys(lyricData) : [],
                lyricCode: lyricData?.code,
                lrcVersion: lyricData?.lrc?.version,
                tlyricVersion: lyricData?.tlyric?.version,
                yrcVersion: lyricData?.yrc?.version,
                yromalrcVersion: lyricData?.yromalrc?.version,
                lrcLength: lyricData?.lrc?.lyric?.length || 0,
                tlyricLength: lyricData?.tlyric?.lyric?.length || 0,
                yrcLength: lyricData?.yrc?.lyric?.length || 0,
                yromalrcLength: lyricData?.yromalrc?.lyric?.length || 0
            };

            if (!result.synced && !result.unsynced) {
                result.error = 'Parsed lyrics are empty';
                result.skipCache = true;
                debugWarn(`getLyrics:parsed lyrics empty run=${runId}`, result.netease);
            }

            debugState.lastResult = result;
            debugLog(`getLyrics:done run=${runId}`, {
                elapsedMs: Math.round(performance.now() - startedAt),
                provider: result.provider,
                hasSynced: !!result.synced,
                syncedCount: result.synced?.length || 0,
                hasUnsynced: !!result.unsynced,
                unsyncedCount: result.unsynced?.length || 0,
                translatedLines: (result.synced || result.unsynced || []).filter(line => line?.text2 || line?.translation || line?.translationText).length,
                error: result.error,
                netease: result.netease
            });

            return result;
        }
    };

    const registerAddon = () => {
        if (window.LyricsAddonManager) {
            debugLog('registerAddon:start', {
                addonId: ADDON_ID,
                version: ADDON_VERSION,
                cacheVersion: CACHE_VERSION,
                existingIds: window.LyricsAddonManager.getAddonIds?.() || []
            });
            const registered = window.LyricsAddonManager.register(NeteaseLyricsAddon);
            debugLog('registerAddon:done', {
                registered,
                addonId: ADDON_ID,
                ids: window.LyricsAddonManager.getAddonIds?.() || [],
                providerOrder: window.LyricsAddonManager.getProviderOrder?.() || []
            });
        } else {
            debugLog('registerAddon:LyricsAddonManager not ready; retrying');
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();
    debugLog('module loaded', {
        addonId: ADDON_ID,
        fallbackAddonId: DEFAULT_ADDON_ID,
        scriptAddonId,
        version: ADDON_VERSION,
        cacheVersion: CACHE_VERSION
    });
})();