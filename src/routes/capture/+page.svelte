<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    let videos = $state([]);
    let currentIndex = $state(0);
    let videoEl = $state();
    let isLoading = $state(true);
    let error = $state(null);

    onMount(async () => {
        await loadVideos();
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const v = urlParams.get('v');
            if (v != null) {
                const n = parseInt(v);
                if (!isNaN(n)) currentIndex = Math.max(0, Math.min(n, videos.length - 1));
                else {
                    const base = v.toLowerCase();
                    const found = videos.findIndex(x => x.name.replace(/\.[^/.]+$/, '').toLowerCase() === base);
                    if (found >= 0) currentIndex = found;
                }
            }
        }
        isLoading = false;
    });

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

    function fileBaseName(name) {
        return name.replace(/\.[^/.]+$/, '');
    }

    async function captureFrame() {
        if (!videoEl) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

        const base = videos[currentIndex]?.name?.replace(/\.[^/.]+$/, '') || `capture_${Date.now()}`;
        try {
            const resp = await fetch('/api/gallery_thumbs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: base, dataUrl })
            });
            if (!resp.ok) throw new Error('썸네일 저장 실패');
            alert('썸네일이 저장되었습니다.');
        } catch (e) {
            console.error(e);
            alert('썸네일 저장에 실패했습니다.');
        }
    }

    function next() {
        currentIndex = (currentIndex + 1) % videos.length;
    }
    function prev() {
        currentIndex = (currentIndex - 1 + videos.length) % videos.length;
    }
    function openPlayer() {
        const base = fileBaseName(videos[currentIndex].name);
        if (typeof window !== 'undefined') {
            window.location.href = `player/index.html?v=${encodeURIComponent(base)}`;
        }
    }
</script>

<div class="min-h-screen bg-black text-white border border-white">
    <div class="max-w-6xl mx-auto py-6 px-4 border border-white">
        <div class="flex items-center justify-between mb-4">
            <h1 class="text-xl">캡처 도구</h1>
            <div class="flex gap-2">
                <button class="px-3 py-2 bg-gray-800 border border-white text-white hover:bg-gray-700 transition" onclick={prev}>이전</button>
                <button class="px-3 py-2 bg-gray-800 border border-white text-white hover:bg-gray-700 transition" onclick={next}>다음</button>
                <button class="px-3 py-2 bg-gray-600 border border-white text-white hover:bg-gray-500 transition" onclick={openPlayer}>플레이어로 이동</button>
                <button class="px-3 py-2 bg-white border border-white text-black hover:bg-gray-200 transition" onclick={captureFrame}>캡처</button>
            </div>
        </div>

        {#if isLoading}
            <div class="p-8 text-center text-white">로딩 중...</div>
        {:else if error}
            <div class="p-8 text-center text-red-400">{error}</div>
        {:else if videos.length === 0}
            <div class="p-8 text-center text-white">비디오 없음</div>
        {:else}
            <div class="bg-black aspect-video w-full border border-white">
                <video bind:this={videoEl} src={videos[currentIndex] ? `/videos/${videos[currentIndex].name}` : ''} controls autoplay playsinline class="w-full h-full object-contain"></video>
            </div>
            <div class="mt-3 text-sm text-white">{videos[currentIndex]?.displayName}</div>
        {/if}
    </div>
</div>

<style>
</style>

