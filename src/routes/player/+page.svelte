<script>
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';
    import VideoPlayer from '$lib/VideoPlayer.svelte';
    
    let videos = $state([]);
    let currentVideoIndex = $state(0);
    let isLoading = $state(true);
    let error = $state(null);

    onMount(async () => {
        await loadVideos();
        
        // 비디오 로드 완료 후 URL 파라미터에서 비디오 인덱스/코드 확인 (v 또는 video)
        if (typeof window !== 'undefined' && videos.length > 0) {
            const urlParams = new URLSearchParams(window.location.search);
            const vParam = urlParams.get('v');
            const videoParam = urlParams.get('video');

            // 우선순위: v > video
            const raw = vParam ?? videoParam;
            if (raw != null) {
                // 숫자면 인덱스로 처리
                const asNum = parseInt(raw);
                if (!isNaN(asNum)) {
                    currentVideoIndex = Math.max(0, Math.min(asNum, videos.length - 1));
                } else {
                    // 문자열이면 파일명(확장자 제외)으로 매칭
                    const targetBase = raw.toString().toLowerCase();
                    const found = videos.findIndex(v => v.name.replace(/\.[^/.]+$/, '').toLowerCase() === targetBase);
                    if (found >= 0) currentVideoIndex = found;
                }
            }
            
            console.log('URL 파라미터 처리 완료:', { vParam, videoParam, raw, currentVideoIndex });
        }
        
        // ESC 키 이벤트 리스너 추가
        document.addEventListener('keydown', handleKeydown);
    });
    
    onDestroy(() => {
        if (typeof document !== 'undefined') {
            document.removeEventListener('keydown', handleKeydown);
        }
    });
    
    function handleKeydown(event) {
        if (event.key === 'Escape') {
            goto('/');
        }
    }

    async function loadVideos() {
        try {
            const response = await fetch('api/videos');
            if (!response.ok) throw new Error('비디오 목록을 불러올 수 없습니다.');
            const data = await response.json();
            videos = Array.isArray(data) ? data : [];
        } catch (err) {
            console.error('비디오 로드 실패:', err);
            videos = [];
        }
    }

    function handleVideoChange(index) {
        currentVideoIndex = index;
        // URL 업데이트
        if (typeof window !== 'undefined') {
            const url = new URL(window.location);
            url.searchParams.set('video', index.toString());
            window.history.replaceState({}, '', url);
        }
    }
</script>

<div class="w-screen h-screen bg-black fixed top-0 left-0 z-50 overflow-hidden">
    {#if isLoading}
        <div class="flex items-center justify-center w-full h-full">
            <div class="text-white text-xl">비디오 로딩 중...</div>
        </div>
    {:else if error}
        <div class="flex items-center justify-center w-full h-full">
            <div class="text-red-400 text-xl">{error}</div>
        </div>
    {:else if videos.length > 0}
        <VideoPlayer 
            {videos}
            {currentVideoIndex}
            onVideoChange={handleVideoChange}
            showUI={false}
            forceAspectRatio={false}
            fullscreen={true}
        />
    {:else}
        <div class="flex items-center justify-center w-full h-full">
            <div class="text-white text-xl">비디오가 없습니다.</div>
        </div>
    {/if}
</div>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        overflow: hidden;
    }
</style> 