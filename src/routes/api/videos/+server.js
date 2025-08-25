import { readdir, stat, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
export const prerender = true;

const STATIC_VIDEOS_DIR = join(process.cwd(), 'static', 'videos');
const BUILD_VIDEOS_DIR = join(process.cwd(), 'build', 'videos');
const THUMBNAILS_DIR = join(process.cwd(), 'static', 'thumbnails');

export async function GET() {
    try {
        // 썸네일 디렉토리가 없으면 생성
        if (!existsSync(THUMBNAILS_DIR)) {
            await mkdir(THUMBNAILS_DIR, { recursive: true });
        }

        // 비디오 디렉토리 선택 (static 우선, 없으면 build 폴더 검사)
        const candidateDirs = [STATIC_VIDEOS_DIR, BUILD_VIDEOS_DIR].filter((p) => existsSync(p));
        const videosDir = candidateDirs[0];

        if (!videosDir) {
            console.error('[api/videos] 비디오 디렉토리를 찾을 수 없습니다:', {
                cwd: process.cwd(),
                tried: [STATIC_VIDEOS_DIR, BUILD_VIDEOS_DIR]
            });
            return new Response(JSON.stringify([]), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const files = await readdir(videosDir);
        const videoFiles = files.filter(file => 
            file.toLowerCase().endsWith('.mp4') || 
            file.toLowerCase().endsWith('.webm') ||
            file.toLowerCase().endsWith('.mov') ||
            file.toLowerCase().endsWith('.avi')
        );

        const videos = [];
        
        for (const file of videoFiles) {
            const filePath = join(videosDir, file);
            const stats = await stat(filePath);
            
            // 파일명에서 displayName 생성
            const baseName = file.replace(/\.[^/.]+$/, ''); // 확장자 제거
            const parts = baseName.split('_');
            const displayName = parts.length > 1 ? parts.slice(1).join(' | ') : baseName;
            
            videos.push({
                name: file,
                displayName: displayName,
                size: stats.size,
                lastModified: stats.mtime.toISOString()
            });
        }

        // 아틀라스 생성은 /api/thumbnails 에서 처리함

        return new Response(JSON.stringify(videos), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('비디오 목록 로드 실패:', error);
        return new Response(JSON.stringify({ error: '비디오 목록을 불러올 수 없습니다' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}