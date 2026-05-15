// Platform information
const platform = {
    title: 'Nyane',
    url: 'https://nyane.online/',
    cdn: 'https://cdn.nyane.online/',
    icon: 'https://nyane.online/img/logo.png',
    description: 'Watch preserved video archives hosted on Nyane.'
}

// Supported resolution presets mapped from metadata definition values
const supportedResolutions = {
    '2160p': { width: 3840, height: 2160 },
    '1440p': { width: 2560, height: 1440 },
    '1080p': { width: 1920, height: 1080 },
    '720p': { width: 1280, height: 720 },
    '540p': { width: 960, height: 540 },
    '480p': { width: 854, height: 480 },
    '360p': { width: 640, height: 360 },
    '240p': { width: 426, height: 240 },
    '144p': { width: 256, height: 144 }
}

// Regex variables used for extracting details
const regex = {
    videoUrl: /^https:\/\/(?:www\.)?nyane\.online\/video\?id=[^&]+$/,
    channelUrl: /^https:\/\/(?:www\.)?nyane\.online\/channel\?id=[^&]+$/,
    videoIdFromUrl: /\/video\?id=([^&]+)/,
    youtubeVideoId: /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    channelIdFromUrl: /\/channel\?id=([^&]+)/,
    nextPageLink: /<a class='next-page' href='([^']+)'>Next<\/a>/,
    videoPageTitle: /<div class='video-title'>([^<]+)<\/div>/,
    videoDate: /<div class='video-date'[^>]*>(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)<\/div>/,
    videoPoster: /poster=["']([^"']+)["']/,
    channelLink: /<a id='channelLink' href='https:\/\/www\.nyane\.online\/channel\?id=([^']+)'>/,
    videoSourceTag: /<source[^>]*\ssrc=(["'])([^"']+)\1/,
}


let config = {};
let settings = {};



// Enable source
source.enable = function (conf, _settings) {
    config = conf;
    settings = _settings;
}

// Get home results
source.getHome = function () {
    const channels = getChannelList();

    // Return first channel's videos as home page if channels exist
    if (channels.length === 0)
        return new HomePager([], false);

    const videos = getChannelVideos(channels[0].id, channels[0].name, channels[0].avatar);

    return new HomePager(videos, false);
}

// Get search suggestions
source.searchSuggestions = function (query) {
    return [];
}

// Get search capabilities
source.getSearchCapabilities = function () {
    return {
        types: [Type.Feed.Mixed],
        sorts: [Type.Order.Chronological],
        filters: []
    };
}

// Get video search results
source.search = function (query, type, order, filters, continuationToken) {
    const hasMore = false;
    const context = { query: query, type: type, order: order, filters: filters, continuationToken: continuationToken };
    return new SearchResultsPager(getSearchResults(query), hasMore, context);
}

// Get search channel contents capabilities
source.getSearchChannelContentsCapabilities = function () {
    return {
        types: [Type.Feed.Mixed],
        sorts: [Type.Order.Chronological],
        filters: []
    };
}

// Search channel videos
source.searchChannelContents = function (url, query, type, order, filters, continuationToken) {
    return getChannelVideosPager(url, type, order, filters, continuationToken, query);
}

// Search channels
source.searchChannels = function (query, continuationToken) {
    const hasMore = false;
    const context = { query: query, continuationToken: continuationToken };
    return new SearchChannelsPager(getSearchChannelResults(query), hasMore, context);
}

// Detect channel URL
source.isChannelUrl = function (url) {
    return regex.channelUrl.test(url);
}

// Get channel details
source.getChannel = function (url) {
    const channelId = extractDetail(url, regex.channelIdFromUrl);
    const channels = getChannelList();
    const channel = channels.find(c => c.id === channelId);
    const name = channel ? channel.name : channelId;

    return new PlatformChannel({
        id: new PlatformID(platform.title, channelId, config.id),
        name: name,
        thumbnail: channel ? channel.avatar : channelAvatar(channelId),
        banner: channel ? channel.avatar : channelAvatar(channelId),
        subscribers: null,
        description: (channel ? channel.videoCount : '0') + ' videos',
        url: url,
        links: {}
    });
}

// Get channel videos
source.getChannelContents = function (url, type, order, filters, continuationToken) {
    return getChannelVideosPager(url, type, order, filters, continuationToken);
}

// Detect video URL
source.isContentDetailsUrl = function (url) {
    // Detect Nyane video URL
    if (regex.videoUrl.test(url))
        return true;

    // Detect YouTube video URL and check if it exists on Nyane
    const ytMatch = url.match(regex.youtubeVideoId);
    if (ytMatch) {
        const resp = http.GET(platform.url + 'video?id=' + ytMatch[1], {}, false);
        return resp.isOk;
    }

    return false;
}

// Get video details
source.getContentDetails = function (url) {
    // Normalize YouTube URLs to Nyane URLs
    const ytMatch = url.match(regex.youtubeVideoId);
    if (ytMatch)
        url = platform.url + 'video?id=' + ytMatch[1];

    const videoId = extractDetail(url, regex.videoIdFromUrl);
    const resp = http.GET(url, {}, false);

    if (!resp.isOk)
        throw new ScriptException('Failed to fetch video page [' + resp.code + ']');

    const body = resp.body;
    const title = extractDetail(body, regex.videoPageTitle) || 'Untitled';
    const dateStr = extractDetail(body, regex.videoDate);

    // Extract channel ID from channel link element
    const channelLinkMatch = body.match(regex.channelLink);
    const channelId = channelLinkMatch ? channelLinkMatch[1] : 'unknown';

    // Get channel name from channel list
    const channels = getChannelList();
    const channel = channels.find(c => c.id === channelId);
    const channelName = channel ? channel.name : channelId;

    // Get poster (video thumbnail)
    const posterMatch = body.match(regex.videoPoster);
    const poster = posterMatch ? posterMatch[1] : '';

    // Extract video source URL from the source tag
    let sourceUrl = null;
    const sourceMatch = body.match(regex.videoSourceTag);
    if (sourceMatch) {
        sourceUrl = sourceMatch[2];
    }

    if (!sourceUrl)
        throw new ScriptException('No video source found');

    // Fetch metadata JSON for duration, description, views, likes, and definition
    let duration = null;
    let description = '';
    let viewCount = null;
    let likeCount = null;
    let definition = null;

    if (channelId) {
        const metaUrl = platform.cdn + channelId + '/metadata/' + videoId + '.json';
        const metaResp = http.GET(metaUrl, {}, false);
        if (metaResp.isOk) {
            try {
                const meta = JSON.parse(metaResp.body);
                const item = meta.items && meta.items[0];
                if (item) {
                    if (item.contentDetails) {
                        if (item.contentDetails.duration)
                            duration = parseISO8601(item.contentDetails.duration);
                        if (item.contentDetails.definition)
                            definition = item.contentDetails.definition;
                    }
                    if (item.snippet && item.snippet.description)
                        description = item.snippet.description;
                    if (item.statistics) {
                        if (item.statistics.viewCount)
                            viewCount = parseInt(item.statistics.viewCount);
                        if (item.statistics.likeCount)
                            likeCount = parseInt(item.statistics.likeCount);
                    }
                }
            } catch (e) {}
        }
    }

    // Infer resolution from definition field
    let width = 0;
    let height = 0;
    if (definition === 'hd') {
        width = 1280;
        height = 720;
    } else if (definition === 'sd') {
        width = 854;
        height = 480;
    }

    // Build quality label from inferred resolution
    const qualLabel = getQualityLabel(width, height);

    // Parse upload date
    let uploadDate = dateStr && Math.round(new Date(dateStr).getTime() / 1000);

    const channelUrl = platform.url + 'channel?id=' + channelId;

    return new PlatformVideoDetails({
        id: new PlatformID(platform.title, videoId, config.id),
        name: title,
        thumbnails: new Thumbnails([new Thumbnail(poster || platform.icon, 0)]),
        author: getPlatformAuthor(channelId, channelName, channelUrl, channelAvatar(channelId)),
        url: url,
        uploadDate: uploadDate,
        duration: duration,
        viewCount: viewCount,
        rating: likeCount !== null ? new RatingLikes(likeCount) : null,
        description: description,
        isLive: false,
        video: new VideoSourceDescriptor([new VideoUrlSource({
            name: (qualLabel ? qualLabel + '/' : '') + 'video/mp4',
            url: sourceUrl,
            width: width,
            height: height,
            duration: duration || 0,
            container: 'video/mp4',
            codec: 'h264',
            bitrate: 0
        })])
    });
}

// Get video comments
source.getComments = function (url, continuationToken) {
    return new CommentsPager([], false, { url: url });
}

// Get sub comments
source.getSubComments = function (comment) {
    return new CommentPager([], false);
}


/**
 * Parse video card HTML elements into PlatformVideo objects
 * Uses DOMParser for reliable HTML entity decoding
 * @param {string} html - Raw HTML containing video cards
 * @returns {PlatformVideo[]} Parsed videos
 */
function parseVideoCards(html) {
    const videos = [];
    const doc = domParser.parseFromString(html);
    const containers = doc.querySelectorAll('.container');

    for (const el of containers) {
        const link = el.querySelector('a');
        if (!link) continue;

        const href = link.getAttribute('href') || '';
        const idMatch = href.match(/\/video\?id=([^&]+)/);
        if (!idMatch) continue;

        const img = el.querySelector('.container-thumbnail');
        const titleEl = el.querySelector('.container-video-title');
        const dateEl = el.querySelector('.container-video-date');

        if (!img || !titleEl) continue;

        const videoId = idMatch[1];
        const thumbnail = img.getAttribute('src') || '';
        const title = String(titleEl.textContent || '').trim();
        const dateStr = String(dateEl ? dateEl.textContent : '').trim();
        const date = dateStr ? Math.round(new Date(dateStr).getTime() / 1000) : 0;

        videos.push(new PlatformVideo({
            id: new PlatformID(platform.title, videoId, config.id),
            name: title,
            thumbnails: new Thumbnails([new Thumbnail(thumbnail, 0)]),
            author: null,
            datetime: date,
            duration: null,
            viewCount: null,
            url: platform.url + 'video?id=' + videoId,
            shareUrl: platform.url + 'video?id=' + videoId,
            isLive: false
        }));
    }

    return videos;
}

/**
 * Get the list of all channels from nyane.online browse page
 * @returns {{id: string, name: string, avatar: string, videoCount: number}[]}
 */
function getChannelList() {
    const resp = http.GET(platform.url + 'browse', {}, false);

    if (!resp.isOk)
        throw new ScriptException('Failed to fetch channels list [' + resp.code + ']');

    // Parse channel cards using DOMParser for reliable HTML entity decoding
    const doc = domParser.parseFromString(resp.body);
    const channelEls = doc.querySelectorAll('.channel-container');
    const channels = [];

    for (const el of channelEls) {
        const link = el.querySelector('a');
        if (!link) continue;

        const href = link.getAttribute('href') || '';
        const idMatch = href.match(/channel\?id=([^&]+)/);
        if (!idMatch) continue;

        const nameEl = el.querySelector('.channel-result-title');
        const imgEl = el.querySelector('.channel-result-img img');
        const countEl = el.querySelector('.channel-result-count');

        if (!nameEl || !imgEl || !countEl) continue;

        const countText = countEl.textContent || '0';
        const countMatch = countText.match(/(\d+)/);

        channels.push({
            id: idMatch[1],
            name: String(nameEl.textContent || '').trim(),
            avatar: imgEl.getAttribute('src') || '',
            videoCount: countMatch ? parseInt(countMatch[1]) : 0
        });
    }

    return channels;
}

/**
 * Get all videos for a channel
 * @param {string} channelId - Channel ID
 * @param {string} channelName - Channel display name
 * @param {string} channelAvatarUrl - Channel avatar URL
 * @returns {PlatformVideo[]}
 */
function getChannelVideos(channelId, channelName, channelAvatarUrl) {
    const url = platform.url + 'channel?id=' + channelId;
    const resp = http.GET(url, {}, false);

    if (!resp.isOk)
        return [];

    const channelUrl = platform.url + 'channel?id=' + channelId;
    const avatar = channelAvatarUrl || channelAvatar(channelId);
    const name = channelName || channelId;

    const videos = parseVideoCards(resp.body);

    // Attach author info to each video
    for (const video of videos) {
        video.author = getPlatformAuthor(channelId, name, channelUrl, avatar);
    }

    return videos;
}

/**
 * Get a pager for channel videos with optional search filtering and pagination
 * @param {string} url - Channel URL
 * @param {string} type - Feed type
 * @param {string} order - Sort order
 * @param {object[]} filters - Active filters
 * @param {*} continuationToken - Pagination token (next page URL)
 * @param {string} [query] - Optional search query
 * @returns {ChannelContentsPager}
 */
function getChannelVideosPager(url, type, order, filters, continuationToken, query) {
    const channelId = extractDetail(url, regex.channelIdFromUrl);
    const channels = getChannelList();
    const channel = channels.find(c => c.id === channelId);

    // Use continuation token URL for subsequent pages, original URL for first page
    const fetchUrl = continuationToken || url;
    const resp = http.GET(fetchUrl, {}, false);

    if (!resp.isOk)
        return new ChannelContentsPager([], false, { url: url, query: query, type: type, order: order, filters: filters, continuationToken: continuationToken });

    const channelUrl = platform.url + 'channel?id=' + channelId;
    const avatar = channel ? channel.avatar : channelAvatar(channelId);
    const name = channel ? channel.name : channelId;

    let videos = parseVideoCards(resp.body);

    // Attach author info
    for (const video of videos) {
        video.author = getPlatformAuthor(channelId, name, channelUrl, avatar);
    }

    // Filter by search query if provided
    if (query) {
        const lowerQuery = query.toLowerCase();
        videos = videos.filter(v => v.name.toLowerCase().includes(lowerQuery));
    }

    // Extract next page URL for pagination
    const nextPageMatch = resp.body.match(regex.nextPageLink);
    let nextToken = null;
    if (nextPageMatch) {
        const suffix = nextPageMatch[1].replace(/^\?/, 'channel?');
        nextToken = platform.url + suffix;
    }

    const context = { url: url, query: query, type: type, order: order, filters: filters, continuationToken: nextToken };
    return new ChannelContentsPager(videos, nextToken !== null, context);
}

/**
 * Search videos by query across all channels
 * @param {string} query - Search query
 * @returns {PlatformVideo[]}
 */
function getSearchResults(query) {
    const lowerQuery = query.toLowerCase();
    const channels = getChannelList();
    const results = [];

    // Iterate over all channels and search their videos
    for (const channel of channels) {
        const channelVideos = getChannelVideos(channel.id, channel.name, channel.avatar);
        for (const video of channelVideos) {
            if (video.name.toLowerCase().includes(lowerQuery))
                results.push(video);
        }
    }

    return results;
}

/**
 * Search channels by name
 * @param {string} query - Search query
 * @returns {PlatformChannel[]}
 */
function getSearchChannelResults(query) {
    const lowerQuery = query.toLowerCase();
    const channels = getChannelList();
    const results = [];

    for (const channel of channels) {
        if (channel.name.toLowerCase().includes(lowerQuery)) {
            results.push(new PlatformChannel({
                id: new PlatformID(platform.title, channel.id, config.id),
                name: channel.name,
                thumbnail: channel.avatar,
                banner: channel.avatar,
                subscribers: null,
                description: channel.videoCount + ' videos',
                url: platform.url + 'channel?id=' + channel.id,
                links: {}
            }));
        }
    }

    return results;
}

/**
 * Extract a detail from HTML using a regex capture group
 * @param {string} html - HTML content to search
 * @param {RegExp} regex - Regex pattern with one capture group
 * @returns {string|null} Captured value or null if no match
 */
function extractDetail(html, regex) {
    const match = html.match(regex);
    if (match) {
        return match[1];
    } else {
        return null;
    }
}

/**
 * Create a PlatformAuthorLink with auto-built PlatformID
 * @param {string} id - Channel/user identifier
 * @param {string} name - Display name
 * @param {string} url - Channel/profile URL
 * @param {string} avatar - Avatar image URL
 * @param {number} [subscribers] - Optional subscriber count
 * @returns {PlatformAuthorLink}
 */
function getPlatformAuthor(id, name, url, avatar, subscribers) {
    return new PlatformAuthorLink(
        new PlatformID(platform.title, id, config.id),
        name,
        url,
        avatar,
        subscribers
    );
}

/**
 * Generate a channel avatar URL from the CDN
 * @param {string} channelId - Channel ID
 * @returns {string} Avatar URL
 */
function channelAvatar(channelId) {
    return platform.cdn + 'profile_picture/' + channelId + '.jpg';
}

/**
 * Get a quality label (e.g. "720p") from width and height
 * @param {number} width - Video width in pixels
 * @param {number} height - Video height in pixels
 * @returns {string} Quality label or empty string
 */
function getQualityLabel(width, height) {
    const h = height || 0;

    if (h === 0)
        return '';

    // Match against known resolutions, highest to lowest
    for (const [label, res] of Object.entries(supportedResolutions)) {
        if (res.height <= h)
            return label;
    }

    return h + 'p';
}

/**
 * Parse ISO 8601 duration string to seconds
 * @param {string} duration - ISO 8601 duration (e.g. "PT48S", "PT10M8S")
 * @returns {number} Duration in seconds
 */
function parseISO8601(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
}


class CommentsPager extends CommentPager {
    constructor(results, hasMore, context) {
        super(results, hasMore, context);
    }

    nextPage() {
        this.hasMore = false;
        return this;
    }
}

class HomePager extends VideoPager {
    constructor(initialResults, hasMore) {
        super(initialResults, hasMore);
    }

    nextPage() {
        this.hasMore = false;
        return this;
    }
}

class SearchResultsPager extends VideoPager {
    constructor(results, hasMore, context) {
        super(results, hasMore, context);
    }

    nextPage() {
        return source.search(this.context.query, this.context.type, this.context.order, this.context.filters, this.context.continuationToken);
    }
}

class SearchChannelsPager extends ChannelPager {
    constructor(results, hasMore, context) {
        super(results, hasMore, context);
    }

    nextPage() {
        return source.searchChannels(this.context.query, this.context.continuationToken);
    }
}

class ChannelContentsPager extends VideoPager {
    constructor(results, hasMore, context) {
        super(results, hasMore, context);
    }

    nextPage() {
        return source.getChannelContents(this.context.url, this.context.type, this.context.order, this.context.filters, this.context.continuationToken);
    }
}
