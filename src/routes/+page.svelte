<script>
    import { goto } from '$app/navigation';
    import VideoPlayer from '$lib/VideoPlayer.svelte';
    import VideoThumbnails from '$lib/VideoThumbnails.svelte';
    
    let isVideoPlaying = $state(false);
    let videoPlayerRef;
    let playerSection;
    let videos = $state([]);
    let thumbnailInfo = $state(null);
    let galleryItems = $state([]);
    let galleryMap = $state({}); // base filename -> encoded URL

    $effect(async () => {
        // 메인 진입 시 비디오/썸네일/갤러리 정보 준비
        await Promise.all([loadVideos(), loadThumbnailInfo(), loadGalleryManifest()]);
        buildGalleryItems();
    });
    
    function handleVideoSelect(videoIndex) {
        if (videoPlayerRef && typeof videoPlayerRef.playIndexImmediately === 'function') {
            videoPlayerRef.playIndexImmediately(videoIndex);
            if (playerSection && typeof playerSection.scrollIntoView === 'function') {
                playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            if (typeof window !== 'undefined') {
                window.location.href = `player/index.html?video=${videoIndex}`;
            }
        }
    }

    async function loadVideos() {
        try {
            const res = await fetch('/api/videos');
            if (!res.ok) throw new Error('비디오 목록을 불러올 수 없습니다');
            const data = await res.json();
            videos = Array.isArray(data) ? data : [];
        } catch (e) {
            console.error(e);
            videos = [];
        }
    }

    async function loadThumbnailInfo() {
        try {
            const res = await fetch('/api/thumbnails');
            if (!res.ok) throw new Error('썸네일 정보를 불러올 수 없습니다');
            thumbnailInfo = await res.json();
        } catch (e) {
            console.error(e);
            thumbnailInfo = null;
        }
    }

    async function loadGalleryManifest() {
        try {
            const res = await fetch('/api/gallery_thumbs');
            if (!res.ok) throw new Error('갤러리 썸네일 목록을 불러올 수 없습니다');
            const data = await res.json();
            galleryMap = data?.map || {};
        } catch (e) {
            console.error(e);
            galleryMap = {};
        }
    }

    async function checkImage(url) {
        try {
            const res = await fetch(url, { method: 'HEAD' });
            return res.ok;
        } catch {
            return false;
        }
    }

    async function resolveGalleryThumb(video, index) {
        const base = video.name.replace(/\.[^/.]+$/, '');
        
        // 매니페스트에 있으면 그대로 사용 (확장자/인코딩 문제 해결)
        const mapped = galleryMap[base];
        if (mapped) {
            return { type: 'image', url: mapped };
        }

        // fallback: atlas의 가운데 타임샷(10초) 사용 (index*3 + 1)
        if (thumbnailInfo && thumbnailInfo.hasAtlas && thumbnailInfo.thumbnailCount > 0) {
            const tileIndex = index * 3 + 1;
            const imageCount = thumbnailInfo.thumbnailCount;
            const positionPercent = imageCount > 1 ? (tileIndex / (imageCount - 1)) * 100 : 0;
            return {
                type: 'atlas',
                url: thumbnailInfo.atlasUrl,
                imageCount,
                positionPercent
            };
        }
        
        // 아틀라스도 없으면 기본 플레이스홀더
        return {
            type: 'placeholder',
            text: base
        };
    }

    async function buildGalleryItems() {
        if (!videos || videos.length === 0) {
            galleryItems = [];
            return;
        }
        const results = [];
        for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            const thumb = await resolveGalleryThumb(video, i);
            results.push({ video, thumb });
        }
        galleryItems = results;
    }

    function openVideo(video, index) {
        if (videoPlayerRef && typeof videoPlayerRef.playIndexImmediately === 'function') {
            videoPlayerRef.playIndexImmediately(index);
            if (playerSection && typeof playerSection.scrollIntoView === 'function') {
                playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            const base = video.name.replace(/\.[^/.]+$/, '');
            if (typeof window !== 'undefined') {
                window.location.href = `player/index.html?v=${encodeURIComponent(base)}`;
            }
        }
    }
</script>

<svelte:head>
    <title>비디오 플레이어</title>
    <meta name="description" content="자동 재생 비디오 플레이어" />
</svelte:head>

<VideoThumbnails {isVideoPlaying} onVideoSelect={handleVideoSelect} />
<main class="min-h-screen bg-black">
    <div class="container mx-auto py-4 flex flex-col gap-8">
        <!-- 4열 갤러리 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {#each galleryItems as item, i}
                <div class="bg-black border border-white shadow-lg hover:shadow-white/20 transition cursor-pointer" onclick={() => openVideo(item.video, i)}>
                    {#if item.thumb && item.thumb.type === 'image'}
                        <img src={item.thumb.url} alt={item.video.displayName} class="w-full aspect-video object-cover" loading="lazy" />
                    {:else if item.thumb && item.thumb.type === 'atlas'}
                        <div 
                            class="w-full aspect-video"
                            style="background-image: url('{item.thumb.url}'); background-size: {item.thumb.imageCount * 100}% 100%; background-position: {item.thumb.positionPercent}% 50%; background-repeat: no-repeat;"
                        ></div>
                    {:else if item.thumb && item.thumb.type === 'placeholder'}
                        <div class="w-full aspect-video bg-gray-800 border border-gray-600 flex items-center justify-center">
                            <div class="text-center text-gray-400">
                                <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                </svg>
                                <p class="text-xs">{item.thumb.text}</p>
                            </div>
                        </div>
                    {:else}
                        <div class="w-full aspect-video bg-gray-800 border border-gray-600"></div>
                    {/if}
                    <div class="p-3">
                        <div class="text-sm text-white truncate">{item.video.displayName}</div>
                    </div>
                </div>
            {/each}
        </div>
        <div bind:this={playerSection}>
            <VideoPlayer bind:this={videoPlayerRef} bind:isPlaying={isVideoPlaying} {videos} autoStart={false} />
        </div>
    </div>
</main>

<style>
    main {
        padding: 20px;
        max-width: 100vw;
        width: 100%;
        margin: 0 auto;
        overflow-x: hidden;
        box-sizing: border-box;
    }
    
    h1 {
        text-align: center;
        color: white;
        margin-bottom: 30px;
        font-size: 2.5rem;
        font-weight: 300;
    }
</style>
