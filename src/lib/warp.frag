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
                p.y -= .5;
                
                // 카메라 렌즈 왜곡 효과 (Barrel/Pincushion Distortion)
                vec2 center = vec2(0.0, 0.0);
                vec2 offset = p - center;
                float dist = length(offset);
                float distortionStrength = 0.15; // 왜곡 강도
                
                // 핀쿠션 디스토션 (가장자리가 중앙으로 당겨짐)
                float distorted = dist * (1.0 + distortionStrength * dist * dist);
                vec2 direction = normalize(offset);
                p = center + direction * distorted;
                
                // 원근 투영 효과
                vec3 q = vec3(p, 1.0);
                q = erot(q, vec3(1.0, 1.0, 1.0), -3.14159265359 * 1.5);
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
                // color.rgb = mix(pow(color.rgb, vec3(1.)), color.rgb, fogFactor);
                color.rgb *= smoothstep(0.0, 1.0, pow(distance,2.));
                
                gl_FragColor = color;