/**
 * NetEase Cloud Music Lyrics Provider for ivLyrics.
 *
 * @addon-type lyrics
 * @name NetEase Cloud Music
 * @version 0.1.3
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
    const TRANSLATION_CACHE_PREFIX = `${STORAGE_KEY_PREFIX}${ADDON_ID}:netease-translation:`;
    const PHONETIC_CACHE_PREFIX = `${STORAGE_KEY_PREFIX}${ADDON_ID}:local-phonetic:`;
    const REQUEST_TIMEOUT_MS = 12000;
    const TRANSLATION_TIME_TOLERANCE_MS = 650;
    const REQUIRED_PROXY_ERROR = 'CORS proxy URL is required. NetEase Cloud Music official APIs cannot be read directly from Spotify/Spicetify because of browser CORS restrictions. Please configure a CORS proxy, preferably with a Mainland China exit IP.';
    const translationCache = new Map();
    let translatorGuardRetryTimer = null;

    const ADDON_INFO = {
        id: ADDON_ID,
        name: 'NetEase Cloud Music',
        author: '1-Dot',
        version: '0.1.3',
        description: {
            en: 'Get synced lyrics and official translated lyrics from NetEase Cloud Music. A CORS proxy is required.',
            'zh-CN': '从网易云音乐获取同步歌词和官方翻译歌词。必须配置 CORS 代理。'
        },
        supports: {
            karaoke: false,
            synced: true,
            unsynced: true
        },
        useIvLyricsSync: true,
        cacheVersion: 4,
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

    function getProxyUrl() {
        return String(getSetting('proxy_url', '') || '').trim();
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

    function hashText(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
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

    function getCurrentTrackKeys() {
        const uri = Spicetify?.Player?.data?.item?.uri || '';
        return [uri?.split(':')?.[2], uri].filter(Boolean);
    }

    function detectRomanizationLanguage(text) {
        const mode = String(getSetting('local_phonetic_language', 'auto') || 'auto');
        if (mode !== 'auto') return mode;

        const content = String(text || '');
        if (/[\u3040-\u30ff]/.test(content)) return 'ja';
        if (/[\uac00-\ud7af]/.test(content)) return 'ko';
        if (/[\u3400-\u9fff]/.test(content)) return 'zh';
        return 'unsupported';
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
        const proxy = getProxyUrl();
        const encoded = encodeURIComponent(url);
        if (proxy.includes('{url}')) return proxy.replace('{url}', encoded);
        return proxy + encoded;
    }

    async function fetchJson(url) {
        const proxy = getProxyUrl();
        if (!proxy) {
            throw new Error(REQUIRED_PROXY_ERROR);
        }

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

    function isLeadingCreditText(text) {
        const normalized = String(text || '')
            .normalize('NFKC')
            .replace(/\s+/g, '')
            .replace(/[：:]/g, ':');

        if (!normalized) return true;

        return /^(作词|作詞|词|詞|填词|填詞|作曲|曲|编曲|編曲|制作人|製作人|制片人|製片人|监制|監製|出品|发行|發行|唱片公司|OP|SP|企划|企劃|统筹|統籌|录音|錄音|混音|母带|母帶|和声|和聲|吉他|贝斯|貝斯|鼓|键盘|鍵盤|弦乐|弦樂|配唱|人声编辑|人聲編輯|音频编辑|音頻編輯|录音室|錄音室|混音室|母带室|母帶室|版权|版權|Lyrics(?:by)?|Lyricist|Composer|Composedby|Arranger|Producer|Producedby|Mixing|Mixedby|Mastering|Masteredby|Recording|Recordedby|Vocals?|Guitars?|Bass|Drums?|Keyboard|Publisher|Copyright|Label)[:：／/|-]/i.test(normalized);
    }

    function trimLeadingCreditLines(lines) {
        const cleaned = [...(lines || [])];
        while (cleaned.length && isLeadingCreditText(cleaned[0].text)) {
            cleaned.shift();
        }
        return cleaned;
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

    function persistTranslations(trackId, translations) {
        if (!trackId || !translations?.some(Boolean)) return;
        try {
            Spicetify?.LocalStorage?.set(`${TRANSLATION_CACHE_PREFIX}${trackId}`, JSON.stringify(translations));
        } catch {
            try {
                localStorage.setItem(`${TRANSLATION_CACHE_PREFIX}${trackId}`, JSON.stringify(translations));
            } catch {
                // Ignore storage errors; in-memory cache still works for the current session.
            }
        }
    }

    function readPersistedTranslations(trackId) {
        if (!trackId) return null;
        let raw = null;
        try {
            raw = Spicetify?.LocalStorage?.get(`${TRANSLATION_CACHE_PREFIX}${trackId}`);
        } catch {
            raw = null;
        }
        if (raw === null || raw === undefined) {
            try {
                raw = localStorage.getItem(`${TRANSLATION_CACHE_PREFIX}${trackId}`);
            } catch {
                raw = null;
            }
        }
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) && parsed.some(Boolean) ? parsed : null;
        } catch {
            return null;
        }
    }

    function rememberTranslations(trackIds, lines) {
        const ids = Array.isArray(trackIds) ? trackIds : [trackIds];
        const translations = (lines || []).map(line => line.text2 || line.translation || line.translationText || '');
        if (translations.some(Boolean)) {
            for (const trackId of ids.filter(Boolean)) {
                translationCache.set(trackId, translations);
                persistTranslations(trackId, translations);
                if (translationCache.size > 50) {
                    const firstKey = translationCache.keys().next().value;
                    translationCache.delete(firstKey);
                }
            }
        }
    }

    function getRememberedTranslations(keys) {
        for (const key of keys.filter(Boolean)) {
            if (translationCache.has(key)) {
                const translation = translationCache.get(key);
                if (translation?.some(Boolean)) return translation;
            }
            const persisted = readPersistedTranslations(key);
            if (persisted?.some(Boolean)) {
                translationCache.set(key, persisted);
                return persisted;
            }
        }
        return null;
    }

    function readPersistedPhonetic(trackId, textHash) {
        if (!trackId || !textHash) return null;
        let raw = null;
        try {
            raw = Spicetify?.LocalStorage?.get(`${PHONETIC_CACHE_PREFIX}${trackId}`);
        } catch {
            raw = null;
        }
        if (raw === null || raw === undefined) {
            try {
                raw = localStorage.getItem(`${PHONETIC_CACHE_PREFIX}${trackId}`);
            } catch {
                raw = null;
            }
        }
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (parsed?.hash === textHash && Array.isArray(parsed.phonetic) && parsed.phonetic.some(Boolean)) {
                return parsed.phonetic;
            }
        } catch {
            return null;
        }
        return null;
    }

    function persistPhonetic(trackIds, textHash, phonetic) {
        if (!textHash || !phonetic?.some(Boolean)) return;
        const payload = JSON.stringify({ hash: textHash, phonetic });
        for (const trackId of (Array.isArray(trackIds) ? trackIds : [trackIds]).filter(Boolean)) {
            try {
                Spicetify?.LocalStorage?.set(`${PHONETIC_CACHE_PREFIX}${trackId}`, payload);
            } catch {
                try {
                    localStorage.setItem(`${PHONETIC_CACHE_PREFIX}${trackId}`, payload);
                } catch {
                    // Ignore storage errors; the generated value is still returned for this request.
                }
            }
        }
    }

    async function generateLocalPhoneticLines(text) {
        if (!window.Translator) {
            throw new Error('Translator is not available');
        }

        const sourceText = String(text || '');
        const lines = sourceText.split(/\r?\n/);
        const language = detectRomanizationLanguage(sourceText);
        if (language === 'unsupported') {
            return lines.map(() => '');
        }

        const translator = new window.Translator(language === 'zh' ? 'zh-hans' : language);

        if (language === 'ja') {
            return Promise.all(lines.map(line => translator.romajifyText(line || '', 'romaji', 'spaced')));
        }
        if (language === 'ko') {
            return Promise.all(lines.map(line => translator.convertToRomaja(line || '', 'romaja')));
        }
        if (language === 'zh') {
            return Promise.all(lines.map(line => translator.convertToPinyin(line || '', {
                toneType: getSetting('local_phonetic_pinyin_tone', 'mark') || 'mark',
                type: 'string'
            })));
        }

        return lines.map(() => '');
    }

    async function getLocalPhonetic(payload) {
        const text = String(payload?.text || '');
        const textHash = hashText(text);
        const keys = [payload?.trackId, payload?.uri, ...getCurrentTrackKeys()];

        for (const key of keys.filter(Boolean)) {
            const cached = readPersistedPhonetic(key, textHash);
            if (cached) return cached;
        }

        const phonetic = await generateLocalPhoneticLines(text);
        if (phonetic?.some(Boolean)) {
            persistPhonetic(keys, textHash, phonetic);
        }
        return phonetic;
    }

    function installTranslatorGuard() {
        const guardEnabled = getSetting('skip_ai_translation_when_netease_translation_exists', true) !== false;
        const localPhoneticEnabled = getSetting('enable_local_phonetic', true) !== false;
        if (!guardEnabled && !localPhoneticEnabled) return;
        if (!window.Translator || typeof window.Translator.callGemini !== 'function') {
            if (!translatorGuardRetryTimer) {
                translatorGuardRetryTimer = setTimeout(() => {
                    translatorGuardRetryTimer = null;
                    installTranslatorGuard();
                }, 300);
            }
            return;
        }
        if (window.Translator.__ivLyricsNeteaseGuardVersion === ADDON_INFO.version) return;

        const originalCallGemini = window.Translator.callGemini.bind(window.Translator);
        window.Translator.callGemini = async function guardedCallGemini(payload) {
            const provider = String(payload?.provider || '');
            const wantsPhonetic = payload && payload.wantSmartPhonetic === true;
            const wantsTranslation = payload && payload.wantSmartPhonetic !== true;
            const localPhoneticNow = getSetting('enable_local_phonetic', true) !== false;

            if (localPhoneticNow && wantsPhonetic && provider === ADDON_ID) {
                try {
                    const phonetic = await getLocalPhonetic(payload);
                    return { phonetic };
                } catch (error) {
                    console.warn('[NetEase Lyrics Addon] Local romanization failed:', error);
                    const allowAiFallback = getSetting('local_phonetic_fallback_to_ai', false) === true;
                    if (!allowAiFallback) {
                        const fallbackLines = String(payload?.text || '').split(/\r?\n/).map(() => '');
                        return { phonetic: fallbackLines };
                    }
                }
            }

            const skipAiNow = getSetting('skip_ai_translation_when_netease_translation_exists', true) !== false;
            if (skipAiNow && wantsTranslation && provider === ADDON_ID) {
                const keys = [payload?.trackId, payload?.uri, ...getCurrentTrackKeys()];
                const translation = getRememberedTranslations(keys);
                if (translation?.some(Boolean)) {
                    return { translation };
                }
            }
            return originalCallGemini(payload);
        };
        window.Translator.__ivLyricsNeteaseGuardInstalled = true;
        window.Translator.__ivLyricsNeteaseGuardVersion = ADDON_INFO.version;
    }

    function createSettingsUI() {
        const React = Spicetify.React;
        return function NeteaseLyricsSettings() {
            const [searchLimit, setSearchLimit] = React.useState(String(getSetting('search_limit', 8)));
            const [minScore, setMinScore] = React.useState(String(getSetting('min_score', 58)));
            const [proxyUrl, setProxyUrl] = React.useState(String(getSetting('proxy_url', '') || ''));
            const [enableTranslation, setEnableTranslation] = React.useState(getSetting('enable_netease_translation', true) !== false);
            const [skipAiTranslation, setSkipAiTranslation] = React.useState(getSetting('skip_ai_translation_when_netease_translation_exists', true) !== false);
            const [enableLocalPhonetic, setEnableLocalPhonetic] = React.useState(getSetting('enable_local_phonetic', true) !== false);
            const [localPhoneticLanguage, setLocalPhoneticLanguage] = React.useState(String(getSetting('local_phonetic_language', 'auto') || 'auto'));
            const [localPhoneticFallbackToAi, setLocalPhoneticFallbackToAi] = React.useState(getSetting('local_phonetic_fallback_to_ai', false) === true);

            const saveNumber = (key, value, min, max, setter) => {
                setter(value);
                const parsed = clampInteger(value, min, max);
                setSetting(key, parsed);
            };

            return React.createElement('div', { className: 'ai-addon-settings netease-settings' },
                React.createElement('div', {
                    className: 'ai-addon-setting',
                    style: {
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'rgba(255, 193, 7, 0.12)',
                        border: '1px solid rgba(255, 193, 7, 0.45)'
                    }
                },
                    React.createElement('strong', null, 'CORS proxy is required'),
                    React.createElement('p', { style: { margin: '6px 0 0' } },
                        'NetEase Cloud Music official APIs cannot be read directly from Spotify/Spicetify due to browser CORS restrictions. This addon will not work until you configure a CORS proxy. The proxy should return the raw NetEase JSON response and should preferably use a Mainland China exit IP.'
                    )
                ),
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('label', null, 'CORS proxy URL (required)'),
                    React.createElement('input', {
                        type: 'text',
                        value: proxyUrl,
                        placeholder: 'https://your-proxy.example/raw?url=',
                        onChange: e => {
                            setProxyUrl(e.target.value);
                            setSetting('proxy_url', e.target.value);
                        }
                    }),
                    React.createElement('small', null, 'Required. Use {url} placeholder if your proxy needs it. Without this value, the provider intentionally returns an error instead of trying direct requests.')
                ),
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
                    React.createElement('label', null,
                        React.createElement('input', {
                            type: 'checkbox',
                            checked: enableLocalPhonetic,
                            onChange: e => {
                                setEnableLocalPhonetic(e.target.checked);
                                setSetting('enable_local_phonetic', e.target.checked);
                                installTranslatorGuard();
                            }
                        }),
                        ' Use local romanization instead of AI phonetic generation'
                    ),
                    React.createElement('small', null, 'Japanese uses Kuroshiro/Kuromoji Hepburn romaji, Korean uses Aromanize RR, and Chinese uses pinyin. NetEase phonetic data is not used.')
                ),
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('label', null, 'Local romanization language'),
                    React.createElement('select', {
                        value: localPhoneticLanguage,
                        onChange: e => {
                            setLocalPhoneticLanguage(e.target.value);
                            setSetting('local_phonetic_language', e.target.value);
                        }
                    },
                        React.createElement('option', { value: 'auto' }, 'Auto detect'),
                        React.createElement('option', { value: 'ja' }, 'Japanese romaji'),
                        React.createElement('option', { value: 'ko' }, 'Korean romaja'),
                        React.createElement('option', { value: 'zh' }, 'Chinese pinyin')
                    ),
                    React.createElement('small', null, 'Use a fixed language if auto detection chooses the wrong converter for mixed-language songs.')
                ),
                React.createElement('div', { className: 'ai-addon-setting' },
                    React.createElement('label', null,
                        React.createElement('input', {
                            type: 'checkbox',
                            checked: localPhoneticFallbackToAi,
                            onChange: e => {
                                setLocalPhoneticFallbackToAi(e.target.checked);
                                setSetting('local_phonetic_fallback_to_ai', e.target.checked);
                            }
                        }),
                        ' Allow AI fallback if local romanization fails'
                    ),
                    React.createElement('small', null, 'Off by default. When off, local failures return empty phonetic lines and do not call AI.')
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
                cacheVersion: ADDON_INFO.cacheVersion,
                karaoke: null,
                synced: null,
                unsynced: null,
                copyright: 'Lyrics from NetEase Cloud Music',
                error: null,
                netease: null
            };

            if (!getProxyUrl()) {
                result.error = REQUIRED_PROXY_ERROR;
                result.skipCache = true;
                return result;
            }

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

            let synced = trimLeadingCreditLines(parseLrc(lrcRaw));
            if (!synced.length) {
                result.unsynced = trimLeadingCreditLines(String(lrcRaw)
                    .split(/\r?\n/)
                    .map(text => ({ text: text.replace(/\[[^\]]+\]/g, '').trim() }))
                    .filter(line => line.text))
                    .filter(line => line.text);
            } else {
                const useTranslation = getSetting('enable_netease_translation', true) !== false;
                if (useTranslation) {
                    const translated = trimLeadingCreditLines(parseLrc(lyricData?.tlyric?.lyric || ''));
                    synced = mergeTranslatedLines(synced, translated);
                    rememberTranslations([getTrackId(info), info.uri], synced);
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
