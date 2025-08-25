<script>
    import { onMount } from 'svelte';
    
    // Props
    let { 
        isPlaying = $bindable(false),
        showUI = true, // UI 표시 여부 (재생목록, 단축키 등)
        forceAspectRatio = true, // 16:9 비율 강제 여부
        fullscreen = false, // 전체화면 모드 여부
        autoStart = false, // 자동 재생 여부
        // 부모에서 전달되는 비디오 목록 및 시작 인덱스 (선택)
        videos: parentVideos = null,
        currentVideoIndex: parentCurrentIndex = null
    } = $props();
    
    let videos = $state([]);
    let currentVideoIndex = $state(0);
    let videoElement = $state();
    let isLoading = $state(true);
    let error = $state(null);

    let videoOpacity = $state(0);
    let textOpacity = $state(0);
    let isPaused = $state(false);
    let isFullscreen = $state(false);
    let videoContainer = $state();
    let hasStartedOnce = $state(false); // 한 번이라도 재생이 시작되었는지 추적

    // 현재 비디오 정보
    const currentVideo = $derived(videos[currentVideoIndex]);

    onMount(async () => {
        // 부모에서 비디오 리스트를 제공한 경우 이를 사용하고 내부 로드를 건너뜀
        if (Array.isArray(parentVideos) && parentVideos.length > 0) {
            videos = parentVideos;
            if (typeof parentCurrentIndex === 'number' && parentCurrentIndex >= 0 && parentCurrentIndex < videos.length) {
                currentVideoIndex = parentCurrentIndex;
            }
            if (videos.length > 0 && autoStart) {
                await startVideoImmediately();
            }
            isLoading = false;
        } else {
            await loadVideos();
            // autoStart가 false면 비디오 로드만 하고 시작하지 않음
            if (autoStart && videos.length > 0) {
                startVideo();
            }
        }
        
        // 키보드 이벤트 리스너 추가
        document.addEventListener('keydown', handleKeydown);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        
        return () => {
            document.removeEventListener('keydown', handleKeydown);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    });

    // 부모에서 전달한 비디오/인덱스가 나중에 변경되는 경우 동기화
    $effect(() => {
        if (Array.isArray(parentVideos) && parentVideos.length > 0) {
            const shouldReplace = videos.length === 0 || videos !== parentVideos;
            if (shouldReplace) {
                videos = parentVideos;
                // 부모에서 비디오가 전달되면 로딩 상태 해제 및 자동 재생 처리
                isLoading = false;
                if (autoStart && videos.length > 0 && !isPlaying && !hasStartedOnce) {
                    if (typeof parentCurrentIndex === 'number' && parentCurrentIndex >= 0 && parentCurrentIndex < videos.length) {
                        currentVideoIndex = parentCurrentIndex;
                    }
                    // autoStart가 true일 때만 자동 시작
                    startVideoImmediately();
                }
            }
        }
    });

    $effect(() => {
        if (
            autoStart && // autoStart가 true일 때만 자동 선택
            Array.isArray(videos) && videos.length > 0 &&
            typeof parentCurrentIndex === 'number' && parentCurrentIndex >= 0 && parentCurrentIndex < videos.length &&
            parentCurrentIndex !== currentVideoIndex
        ) {
            selectVideo(parentCurrentIndex);
        }
    });

    // API 기본 경로 설정 (빌드 시 /build 추가)
    const API_BASE = import.meta.env.DEV ? '' : '/build';
    
    async function loadVideos() {
        try {
            isLoading = true;
            const response = await fetch(`${API_BASE}/api/videos`);
            if (!response.ok) throw new Error('비디오 목록을 불러올 수 없습니다.');
            const data = await response.json();
            videos = Array.isArray(data) ? data : [];
        } catch (err) {
            console.error('비디오 목록 로드 실패:', err);
            videos = [];
        } finally {
            isLoading = false;
            // autoStart가 true일 때만 비디오 시작
            if (autoStart && videos.length > 0 && !isPlaying && !hasStartedOnce) {
                startVideoImmediately();
            }
        }
    }

    async function startVideo() {
        if (!currentVideo || !videoElement) {
            console.log('비디오 시작 실패 - currentVideo:', currentVideo, 'videoElement:', videoElement);
            return;
        }
        
        console.log('비디오 시작:', currentVideo.displayName);
        
        // 초기 상태 설정
        videoOpacity = 0;
        textOpacity = 1;
        isPlaying = false;
        isPaused = false;
        
        // 비디오 로드
        videoElement.load();
        
        // 비디오가 로드될 때까지 기다림
        try {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('로딩 타임아웃')), 10000);
                videoElement.addEventListener('loadeddata', () => {
                    clearTimeout(timeout);
                    resolve();
                }, { once: true });
            });
            
            console.log('비디오 로드 완료, 5초 후 재생 시작...');
            
            // 5초 후 비디오 시작
            setTimeout(async () => {
                if (videoElement) {
                    try {
                        console.log('비디오 재생 시도...');
                        
                        // 사운드와 함께 재생 시도
                        videoElement.muted = false;
                        await videoElement.play();
                        
                        videoOpacity = 1;
                        textOpacity = 0;
                        isPlaying = true;
                        console.log('비디오 재생 성공!');
                    } catch (playError) {
                        console.error('비디오 재생 실패:', playError);
                        console.log('자동재생이 차단되었습니다. 수동 재생 버튼을 클릭하세요.');
                        
                        // 자동재생 실패 시 텍스트 오버레이 유지하고 재생 버튼 표시
                        videoOpacity = 0.3; // 비디오를 약간 보이게 함
                        textOpacity = 0.5;  // 텍스트도 약간 투명하게
                    }
                }
            }, 5000);
            
        } catch (loadError) {
            console.error('비디오 로딩 실패:', loadError);
            error = '비디오를 로드할 수 없습니다: ' + loadError.message;
        }
    }

    function onVideoEnded() {
        console.log('비디오 종료됨');
        if (!isPlaying) return;
        
        // 비디오 종료 처리
        isPlaying = false;
        videoOpacity = 0;
        
        // 1초 후 다음 비디오로 전환
        setTimeout(() => {
            nextVideo();
        }, 1000);
    }

    function nextVideo() {
        console.log('다음 비디오로 전환');
        currentVideoIndex = (currentVideoIndex + 1) % videos.length;
        startVideo();
    }

    function togglePlayPause() {
        console.log('재생/일시정지 토글 - isPlaying:', isPlaying, 'isPaused:', isPaused);
        
        if (!videoElement) {
            console.log('비디오 엘리먼트가 없습니다.');
            return;
        }
        
        if (!isPlaying) {
            console.log('아직 재생이 시작되지 않았습니다.');
            return;
        }
        
        if (isPaused) {
            console.log('재생 재개');
            videoElement.play();
            isPaused = false;
        } else {
            console.log('일시정지');
            videoElement.pause();
            isPaused = true;
        }
    }

    function skipToEnd() {
        console.log('다음 비디오로 건너뛰기');
        if (!videoElement || !isPlaying) return;
        
        // 비디오 종료 시뮬레이션
        isPlaying = false;
        videoOpacity = 0;
        
        setTimeout(() => {
            nextVideo();
        }, 300);
    }

    function toggleFullscreen() {
        if (!videoContainer) return;
        
        if (!document.fullscreenElement) {
            videoContainer.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    function handleFullscreenChange() {
        isFullscreen = !!document.fullscreenElement;
    }

    function handleKeydown(event) {
        console.log('키 입력:', event.key, event.code);
        
        // Cmd+E (Mac) 또는 Ctrl+E (Windows/Linux)
        if ((event.metaKey || event.ctrlKey) && event.key === 'e') {
            event.preventDefault();
            skipToEnd();
        }
        
        // Space bar
        if (event.code === 'Space') {
            event.preventDefault();
            togglePlayPause();
        }
        
        // ESC key
        if (event.key === 'Escape' && isFullscreen) {
            toggleFullscreen();
        }
        
        // F key for fullscreen
        if (event.key === 'f' || event.key === 'F') {
            event.preventDefault();
            toggleFullscreen();
        }
    }

    // 비디오 클릭으로 재생/일시정지
    function handleVideoClick() {
        console.log('비디오 클릭됨');
        togglePlayPause();
    }

    // 수동으로 비디오 시작하는 함수 (사용자 상호작용용)
    async function manualStart() {
        if (!videoElement || !currentVideo) return;
        
        try {
            console.log('수동 재생 시도...');
            await videoElement.play();
            videoOpacity = 1;
            textOpacity = 0;
            isPlaying = true;
            console.log('수동 재생 성공!');
        } catch (error) {
            console.error('수동 재생 실패:', error);
        }
    }

    // 특정 비디오로 이동하는 함수
    function selectVideo(index) {
        console.log('비디오 선택:', index);
        if (index < 0 || index >= videos.length) return;
        
        // 현재 재생 중이면 중단
        if (isPlaying && videoElement) {
            videoElement.pause();
        }
        
        // 새로운 비디오 인덱스 설정
        currentVideoIndex = index;
        
        // 비디오 시작
        startVideo();
    }

    // 즉시 비디오 시작하는 함수 (사용자 클릭용)
    async function startVideoImmediately() {
        if (!currentVideo || !videoElement) {
            console.log('비디오 시작 실패 - currentVideo:', currentVideo, 'videoElement:', videoElement);
            return;
        }
        
        console.log('즉시 비디오 시작:', currentVideo.displayName);
        
        // 클릭 즉시 상태 변경 - 클릭 문구 사라지고 타이틀 표시
        videoOpacity = 0;
        textOpacity = 1;
        isPlaying = true; // 클릭 문구를 바로 사라지게 하기 위해 true로 설정
        isPaused = false;
        hasStartedOnce = true; // 한 번 시작되었음을 표시
        
        // 비디오 로드
        videoElement.load();
        
        try {
            // 비디오 로드 대기
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('로딩 타임아웃')), 10000);
                videoElement.addEventListener('loadeddata', () => {
                    clearTimeout(timeout);
                    resolve();
                }, { once: true });
            });
            
            console.log('비디오 로드 완료, 즉시 재생 시작...');
            
            // 3초간 타이틀 표시 후 재생
            setTimeout(async () => {
                if (videoElement) {
                    try {
                        console.log('비디오 재생 시도...');
                        videoElement.muted = false;
                        await videoElement.play();
                        
                        videoOpacity = 1;
                        textOpacity = 0;
                        isPlaying = true;
                        console.log('비디오 재생 성공!');
                    } catch (playError) {
                        console.error('비디오 재생 실패:', playError);
                        // 재생 실패 시에도 타이틀은 유지
                        videoOpacity = 0.3;
                        textOpacity = 0.8;
                    }
                }
            }, 3000); // 3초 후 재생
            
        } catch (loadError) {
            console.error('비디오 로딩 실패:', loadError);
            error = '비디오를 로드할 수 없습니다: ' + loadError.message;
        }
    }
    
    // 부모에서 특정 인덱스 재생을 요청할 때 사용 (지연 시작 버전)
    export function playIndex(index) {
        if (!Array.isArray(videos) || videos.length === 0) return;
        if (index < 0 || index >= videos.length) return;
        if (isPlaying && videoElement) {
            videoElement.pause();
        }
        currentVideoIndex = index;
        startVideo();
    }

    // 부모에서 즉시 재생을 요청할 때 사용 (오버레이 스킵 버전)
    export async function playIndexImmediately(index) {
        if (!Array.isArray(videos) || videos.length === 0) return;
        if (index < 0 || index >= videos.length) return;
        if (isPlaying && videoElement) {
            videoElement.pause();
        }
        currentVideoIndex = index;
        await startVideoImmediately();
    }
</script>

<div class="{fullscreen ? 'w-full h-full overflow-hidden' : 'min-h-screen bg-black'}">
    <div class="{fullscreen ? 'w-full h-full overflow-hidden' : 'max-w-7xl mx-auto'}">
        {#if isLoading}
            <div class="flex justify-center items-center h-64">
                <div class="text-xl text-white">비디오 목록을 불러오는 중...</div>
            </div>
        {:else if error}
            <div class="bg-red-900 border border-red-400 text-red-200 px-4 py-3 text-center">
                <p class="font-bold">오류 발생</p>
                <p>{error}</p>
            </div>
        {:else if videos.length === 0}
            <div class="bg-yellow-900 border border-yellow-400 text-yellow-200 px-4 py-3 text-center">
                <p class="font-bold">비디오 없음</p>
                <p>static/videos 폴더에 비디오 파일을 추가해주세요.</p>
            </div>
        {:else}
            <div class="flex flex-col lg:flex-row gap-6 {fullscreen ? 'h-screen' : 'h-full'}">
                <!-- 비디오 플레이어 -->
                <div class="{showUI ? 'flex-1' : 'w-full h-full'}">
                    <div class="flex flex-col gap-4 {fullscreen ? 'h-full' : ''}">
                                                  <div 
                              bind:this={videoContainer}
                              class="relative w-full bg-black overflow-hidden shadow-lg {forceAspectRatio ? 'aspect-video' : fullscreen ? 'h-full max-h-screen' : 'h-full'}"
                          >
                            <!-- 비디오 엘리먼트 -->
                            <video
                                bind:this={videoElement}
                                src={currentVideo ? `${API_BASE}/videos/${currentVideo.name}` : ''}
                                class="w-full h-full object-contain transition-opacity duration-300 cursor-pointer"
                                style="opacity: {videoOpacity}"
                                onended={onVideoEnded}
                                onclick={handleVideoClick}
                                preload="metadata"
                                playsinline
                                onplay={() => { isPlaying = true; isPaused = false; videoOpacity = 1; textOpacity = 0; hasStartedOnce = true; }}
                                onpause={() => { isPaused = true; }}
                                onwaiting={() => { /* buffering */ }}
                                onloadeddata={() => { /* ensure state is consistent */ }}
                            ></video>
    
                            <!-- 텍스트 오버레이 -->
                            <div 
                                class="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300"
                                style="opacity: {textOpacity}"
                            >
                                <h2 class="text-white text-4xl lg:text-5xl font-bold text-center px-4 drop-shadow-lg">
                                    {currentVideo?.displayName || ''}
                                </h2>
                            </div>
    
    
    
                            <!-- 전체화면 버튼 -->
                            {#if !isFullscreen}
                                <button
                                    onclick={toggleFullscreen}
                                    class="absolute top-4 right-4 bg-black bg-opacity-50 hover:bg-opacity-70 text-white p-2  transition-all duration-300 backdrop-blur-sm"
                                    aria-label="전체화면"
                                >
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
                                    </svg>
                                </button>
                            {/if}
    
                            <!-- 재생 상태 표시 -->
                            {#if isPaused && isPlaying}
                                <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div class="bg-black bg-opacity-50 rounded-full p-4">
                                        <svg class="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z"/>
                                        </svg>
                                    </div>
                                </div>
                            {/if}

                            <!-- 플레이 안내 문구 (처음에만 표시, autoStart가 false일 때만) -->
                            {#if !isPlaying && !hasStartedOnce && !autoStart}
                                <div 
                                    class="absolute inset-0 flex items-center justify-center cursor-pointer bg-black bg-opacity-30 hover:bg-opacity-40 transition-all duration-300"
                                    onclick={startVideoImmediately}
                                >
                                    <div class="text-center">
                                        <div class="mb-4">
                                            <svg class="w-16 h-16 text-white mx-auto opacity-80" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M8 5v14l11-7z"/>
                                            </svg>
                                        </div>
                                        <p class="text-white text-xl font-medium drop-shadow-lg">
                                            플레이하려면 화면을 클릭해주세요
                                        </p>
                                    </div>
                                </div>
                            {/if}
                        </div>
                        {#if showUI}
                            <div class="text-sm text-white flex gap-8">
                                <div class="flex items-center gap-2">
                                    <kbd class="px-2 py-1 bg-gray-800 border border-white rounded text-xs w-15 text-center flex-shrink-0">Space</kbd>
                                    <span class="flex-1">재생/일시정지</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <kbd class="px-2 py-1 bg-gray-800 border border-white rounded text-xs w-15 text-center flex-shrink-0">Cmd+E</kbd>
                                    <span class="flex-1">다음 비디오로 건너뛰기</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <kbd class="px-2 py-1 bg-gray-800 border border-white rounded text-xs w-15 text-center flex-shrink-0">F</kbd>
                                    <span class="flex-1">전체화면</span>
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>

                {#if showUI}
                    <!-- 비디오 목록 -->
                    <div class="w-full lg:w-80 xl:w-96 space-y-4 flex-shrink-0">
                        <!-- 현재 재생 중인 비디오 정보 -->
                        <div class="bg-black border border-white shadow-lg p-6">
                            <div class="mb-4">
                                <h3 class="text-xl font-bold text-white mb-2">현재 재생 중</h3>
                                <p class="text-white">{currentVideo?.displayName || '비디오 없음'}</p>
                                <p class="text-sm text-gray-300">{currentVideoIndex + 1} / {videos.length}</p>
                            </div>
                            
                            <div class="flex items-center space-x-2 text-sm">
                                <div class="flex items-center space-x-1">
                                    <div class="w-2 h-2 rounded-full {isPlaying ? 'bg-green-500' : 'bg-gray-400'}"></div>
                                    <span class="text-white">
                                        {isPlaying ? (isPaused ? '일시정지' : '재생 중') : '대기 중'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- 재생 목록 -->
                        <div class="bg-black border border-white shadow-lg p-6">
                            <h3 class="text-lg font-bold text-white mb-4">재생 목록</h3>
                            <div class="space-y-2 max-h-96 overflow-y-auto">
                                {#each videos as video, index}
                                    <div 
                                        class="p-3 transition-colors duration-200 cursor-pointer {
                                            index === currentVideoIndex 
                                                ? 'bg-gray-800 border-l-4 border-white' 
                                                : 'bg-gray-900 hover:bg-gray-800 hover:shadow-white/20'
                                        }"
                                        onclick={() => selectVideo(index)}
                                        role="button"
                                        tabindex="0"
                                        onkeydown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                selectVideo(index);
                                            }
                                        }}
                                    >
                                        <div class="flex items-center justify-between">
                                            <div class="flex-1 min-w-0">
                                                <p class="text-sm font-medium text-white truncate">
                                                    {video.displayName}
                                                </p>
                                            </div>
                                            <div class="flex-shrink-0 w-4 flex items-center justify-center">
                                            {#if index === currentVideoIndex}
                                                <div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                                            {:else}
                                                <svg class="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M8 5v14l11-7z"/>
                                                </svg>
                                            {/if}
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    /* 전체화면 스타일 */
    .video-container:fullscreen {
        width: 100vw !important;
        height: 100vh !important;
        border-radius: 0 !important;
    }

    .video-container:fullscreen video {
        width: 100% !important;
        height: 100% !important;
        object-fit: contain !important;
    }
</style> 
