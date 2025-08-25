<script>
    import { onMount, onDestroy } from 'svelte';
    import * as THREE from 'three';
    
    let videos = $state([]);
    let thumbnailInfo = $state(null);
    let isLoading = $state(true);
    let error = $state(null);
    let loadingProgress = $state(0);

    let { onVideoSelect = null, isVideoPlaying = false } = $props(); // 비디오 선택 콜백

    // Three.js 관련 변수들
    let canvas = $state();
    let container = $state();
    let scene, camera, renderer, material, geometry, mesh;
    let atlasTexture = null;
    let animationId;

    let resizeObserver = null;

    onMount(async () => {
        await loadVideos();
        await loadThumbnailInfo();
        if (thumbnailInfo && thumbnailInfo.hasAtlas) {
            await createAtlasTexture();
            await initThreeJS();
            animate();
        } else {
            isLoading = false;
            error = '아틀라스 이미지가 생성되지 않았습니다.';
        }

        // 윈도우 리사이즈 시 캔버스/렌더러 갱신
        const onResize = () => {
            if (!canvas) return;
            handleResize();
        };
        window.addEventListener('resize', onResize);

        // 컨테이너/캔버스 크기 변화를 관찰하여 즉시 반영
        if (typeof ResizeObserver !== 'undefined') {
            const target = container || (canvas && canvas.parentElement) || canvas;
            if (target) {
                resizeObserver = new ResizeObserver(() => {
                    handleResize();
                });
                resizeObserver.observe(target);
            }
        }
        
        return () => {
            window.removeEventListener('resize', onResize);
            if (resizeObserver) {
                try { resizeObserver.disconnect(); } catch {}
                resizeObserver = null;
            }
        };
    });

    // 비디오 재생 상태 변경 감지
    $effect(() => {
        console.log('VideoThumbnails - isVideoPlaying:', isVideoPlaying, 'animationId:', animationId, 'renderer:', !!renderer);
        if (!isVideoPlaying && !animationId && renderer) {
            console.log('VideoThumbnails - 애니메이션 재시작');
            // 비디오가 멈추면 애니메이션 재시작
            animate();
        }
    });

    onDestroy(() => {
        if (animationId) cancelAnimationFrame(animationId);
        if (renderer) renderer.dispose();
        if (atlasTexture) atlasTexture.dispose();
    });

    // API 기본 경로 설정 (빌드 시 /build 추가)
    const API_BASE = import.meta.env.DEV ? '' : '/build';
    
    async function loadVideos() {
        try {
            const response = await fetch(`${API_BASE}/api/videos`);
            if (!response.ok) throw new Error('비디오 목록을 불러올 수 없습니다.');
            const data = await response.json();
            videos = Array.isArray(data) ? data : [];
        } catch (err) {
            console.error('비디오 로드 실패:', err);
            videos = [];
        }
    }

    async function loadThumbnailInfo() {
        try {
            const response = await fetch(`${API_BASE}/api/thumbnails`);
            if (!response.ok) throw new Error('썸네일 정보를 불러올 수 없습니다.');
            const data = await response.json();
            // 서버에서 받은 썸네일 정보를 상태에 저장
            thumbnailInfo = {
                hasAtlas: !!data.hasAtlas,
                atlasUrl: data.atlasUrl || '',
                thumbnailCount: data.thumbnailCount || 0,
                tileSize: data.tileSize || 256
            };
        } catch (err) {
            console.error('썸네일 정보 로드 실패:', err);
            thumbnailInfo = null;
            error = '썸네일 정보를 불러올 수 없습니다.';
            isLoading = false;
        }
    }

    async function createAtlasTexture() {
        if (!thumbnailInfo || !thumbnailInfo.hasAtlas) return;
        
        try {
            console.log('아틀라스 이미지 로딩 시작...');
            loadingProgress = 50;
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            await new Promise((resolve, reject) => {
                img.onload = () => {
                    loadingProgress = 100;
                    
                    // Three.js 텍스처 생성
                    atlasTexture = new THREE.Texture(img);
                    atlasTexture.needsUpdate = true;
                    atlasTexture.minFilter = THREE.LinearFilter;
                    atlasTexture.magFilter = THREE.LinearFilter;
                    atlasTexture.wrapS = THREE.ClampToEdgeWrapping;
                    atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
                    
                    console.log('아틀라스 텍스처 생성 완료');
                    resolve();
                };
                img.onerror = () => {
                    reject(new Error('아틀라스 이미지 로드 실패'));
                };
                img.src = thumbnailInfo.atlasUrl;
            });
            
        } catch (err) {
            console.error('아틀라스 텍스처 생성 오류:', err);
            error = '아틀라스 이미지를 로드할 수 없습니다: ' + err.message;
        } finally {
            isLoading = false;
        }
    }

    async function initThreeJS() {
        if (!canvas || !atlasTexture) return;

        // Scene 설정
        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // Renderer 설정
        renderer = new THREE.WebGLRenderer({ 
            canvas, 
            antialias: true,
            alpha: true 
        });
        const width = Math.max(1, Math.floor(window.innerWidth));
        const height = Math.max(1, Math.floor(window.innerHeight - 100));
        renderer.setSize(width, height, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Fragment Shader - 매트릭스 스타일 썸네일 비
        const fragmentShader = `
            precision highp float;
            
            uniform sampler2D u_atlas;
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform int u_imageCount;
            varying vec2 vUv;
            
            // Blackle Mori의 회전 함수
            vec3 erot(vec3 p, vec3 A, float a) {
                return mix(dot(A, p) * A, p, cos(a)) + cross(A, p) * sin(a);
            }
            
            // Dave Hoskins의 해시 함수들
            float hash11(float p) {
                p = fract(p * 0.1031);
                p *= p + 33.33;
                p *= p + p;
                return fract(p);
            }
            
            vec2 hash22(vec2 p) {
                vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.xx + p3.yz) * p3.zy);
            }
            
            void main() {
                vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
                
                // 좌표계 설정 (시작점을 왼쪽으로 이동)
                vec2 p = (gl_FragCoord.xy - u_resolution.xy / 1.0) / u_resolution.y;
                p.x -= .5; // 왼쪽으로 이동
                
                // 원근 투영 효과
                vec3 q = vec3(p, 1.0);
                q = erot(q, vec3(1.0, 1.0, 1.0), -0.5);
                p = q.xy / q.z;
                
                // 그리드 설정
                float grid = 8.0;
                
                // 각 줄마다 고정된 랜덤 속도 (천천히)
                float columnIndex = floor(p.x * grid);
                float speed = 0.02 + hash11(columnIndex) * 0.06; // 0.02~0.08 범위의 고정 속도
                
                // 부드러운 스크롤
                p.y += u_time * speed;
                
                vec2 cell = floor(p * grid);
                
                // 셀별 랜덤값
                vec2 rng = hash22(cell);
                
                // 썸네일 선택 (수평 아틀라스용) - 고정
                int thumbnailIndex = int(rng.x * float(u_imageCount));
                thumbnailIndex = thumbnailIndex % u_imageCount;
                
                // 셀 내부의 UV (0~1)
                vec2 cellUV = fract(p * grid);
                
                // 수평 아틀라스 내 해당 썸네일의 UV 계산
                float thumbnailWidth = 1.0 / float(u_imageCount); // 각 썸네일의 너비
                float startX = float(thumbnailIndex) * thumbnailWidth; // 썸네일 시작 X 위치
                vec2 atlasUV = vec2(startX + cellUV.x * thumbnailWidth, cellUV.y);
                
                // 텍스처 샘플링
                vec4 texColor = texture2D(u_atlas, atlasUV);
                
                // 거리 기반 fog
                float distance = q.z;
                float fogFactor = smoothstep(0.0, 1.0, distance);
                                
                // 컬러풀 효과 - 고정
                bool colorful = rng.y > 0.5;
                if (colorful) {
                    color.rgb = vec3(length(0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + floor(cell.y * 0.1))));
                    color.rgb *= (dot(texColor.rgb, vec3(0.299, 0.587, 0.114)));
                    color.rgb = pow(color.rgb, vec3(2.2));
                } else {
                    color.rgb = texColor.rgb;
                }
                
                // fog 적용 (밝기 감소)
                color.rgb = mix(pow(color.rgb, vec3(3.)), color.rgb, fogFactor);
                color.rgb *= pow(fogFactor,2.);
                gl_FragColor = color;
            }
        `;

        const vertexShader = `
            varying vec2 vUv;
            
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        // Material 생성 - 아틀라스 텍스처
        const uniforms = {
            u_atlas: { value: atlasTexture },
            u_time: { value: 0.0 },
            u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight - 100) },
            u_imageCount: { value: thumbnailInfo.thumbnailCount }
        };

        material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader,
            fragmentShader
        });

        // Geometry와 Mesh
        geometry = new THREE.PlaneGeometry(2, 2);
        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
    }

    function animate() {
        // 비디오가 재생 중이면 애니메이션 중단
        if (isVideoPlaying) {
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            return;
        }
        
        animationId = requestAnimationFrame(animate);
        
        if (material && material.uniforms.u_time) {
            material.uniforms.u_time.value += 0.016; // 60fps 기준
        }
        
        if (renderer) {
            renderer.render(scene, camera);
        }
    }

    function handleClick(event) {
        if (!canvas || !onVideoSelect || !thumbnailInfo) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        
        // 8x8 그리드 기준으로 클릭된 셀 계산
        const grid = 8;
        const col = Math.floor(x * grid);
        const row = Math.floor(y * grid);
        const cellIndex = row * grid + col;
        
        // 매트릭스 효과에서 해당 셀의 썸네일 인덱스를 계산
        const thumbnailIndex = cellIndex % thumbnailInfo.thumbnailCount;
        
        if (thumbnailIndex < thumbnailInfo.thumbnailCount) {
            // 썸네일 인덱스에서 원본 비디오 인덱스 계산 (3개씩 그룹)
            const originalVideoIndex = Math.floor(thumbnailIndex / 3);
            onVideoSelect(originalVideoIndex);
        }
    }

    function handleResize() {
        if (!renderer) return;

        const width = Math.max(1, Math.floor(window.innerWidth));
        const height = Math.max(1, Math.floor(window.innerHeight - 100));
        renderer.setSize(width, height, false);

        if (material && material.uniforms.u_resolution) {
            material.uniforms.u_resolution.value.set(width, height);
        }
    }

    function getStudentCredits() {
        if (!videos || videos.length === 0) return [];
        
        const credits = [];
        
        videos.forEach(video => {
            const filename = video.name;
            let name = '';
            
            // 파일명에서 이름만 추출
            if (filename.includes('_')) {
                const parts = filename.replace('.mp4', '').split('_');
                
                if (parts.length >= 2) {
                    // 첫 번째 부분이 숫자로 시작하면 두 번째가 이름
                    if (parts[0].match(/^\d/)) {
                        name = parts[1];
                    } else {
                        name = parts[0];
                    }
                }
            } else {
                // 언더스코어가 없는 경우
                name = filename.replace('.mp4', '');
            }
            
            if (name) {
                credits.push({ name });
            }
        });
        
        // 이름 순으로 정렬하고 중복 제거
        const uniqueCredits = credits.filter((credit, index, self) => 
            index === self.findIndex(c => c.name === credit.name)
        );
        
        return uniqueCredits.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    }
</script>

<div class="w-screen h-[calc(100vh-100px)] relative" bind:this={container}>    
    {#if isLoading}
        <div class="text-center py-8">
            <div class="text-gray-600 mb-2">썸네일 로딩 중...</div>
            <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div 
                    class="bg-gray-500 h-2 rounded-full transition-all duration-300" 
                    style="width: {loadingProgress}%"
                ></div>
            </div>
            <div class="text-sm text-gray-500">{loadingProgress}%</div>
        </div>
    {:else if error}
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-center">
            <p class="text-sm">{error}</p>
        </div>
    {:else if !thumbnailInfo || !thumbnailInfo.hasAtlas}
        <div class="text-center py-8 text-gray-500">
            아틀라스 이미지가 생성되지 않았습니다.
        </div>
    {:else}
        <canvas 
            bind:this={canvas}
            class="w-full h-full"
            onclick={handleClick}
            onresize={handleResize}
        ></canvas>
    {/if}

         <div class="absolute top-0 left-0 w-full h-full flex py-24 px-24">
         <div class="flex flex-col gap-12">
             <div class="text-white font-bold flex flex-col gap-2">
                 <p class="text-4xl">Motion Graphic ll</p>
                 <p class="font-light">Final Presentation</p>
             </div>
             <div class="grid grid-cols-2 gap-x-4 gap-y-2 w-[200px] text-sm">
                 {#each getStudentCredits() as credit}
                     <span class="font-light text-white">{credit.name}</span>
                 {/each}
             </div>
         </div>
         
     </div>
</div>

<style>
    canvas {
        display: block;
        width: 100vw;
        height: calc(100vh - 100px);
        max-width: 100vw;
        cursor: pointer;
        margin: 0;
        padding: 0;
        border: none;
        outline: none;
    }
</style> 