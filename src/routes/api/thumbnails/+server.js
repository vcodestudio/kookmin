import { readdir, stat, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { createCanvas, loadImage } from 'canvas';
import { building } from '$app/environment';

const VIDEOS_DIR = join(process.cwd(), 'static', 'videos');
const THUMBNAILS_DIR = join(process.cwd(), 'static', 'thumbnails');
// 빌드 시에는 결과물을 build/thumbnails 에 생성해야 최종 산출물에 포함됨
const TARGET_THUMBNAILS_DIR = building
    ? join(process.cwd(), 'build', 'thumbnails')
    : THUMBNAILS_DIR;
const ATLAS_FILE = join(TARGET_THUMBNAILS_DIR, 'atlas.jpg');

export const prerender = true;

export async function GET() {
    try {
        // 타깃 썸네일 디렉토리가 없으면 생성
        if (!existsSync(TARGET_THUMBNAILS_DIR)) {
            await mkdir(TARGET_THUMBNAILS_DIR, { recursive: true });
        }

        // 비디오 파일 목록
        const files = await readdir(VIDEOS_DIR);
        const videoFiles = files.filter(file => 
            file.toLowerCase().endsWith('.mp4') || 
            file.toLowerCase().endsWith('.webm') ||
            file.toLowerCase().endsWith('.mov') ||
            file.toLowerCase().endsWith('.avi')
        );

        // 아틀라스가 없으면 생성
        if (!existsSync(ATLAS_FILE)) {
            await generateThumbnailAtlas(videoFiles);
        }

        const thumbnailCount = videoFiles.length * 3; // 각 비디오마다 3개의 썸네일 (5초, 10초, 15초)

        return new Response(JSON.stringify({
            hasAtlas: existsSync(ATLAS_FILE),
            atlasUrl: '/build/thumbnails/atlas.jpg',
            thumbnailCount,
            tileSize: 256
        }), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('썸네일 정보 로드 실패:', error);
        return new Response(JSON.stringify({ error: '썸네일 정보를 불러올 수 없습니다' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}

async function generateThumbnailAtlas(videoFiles) {
    const tileSize = 256;
    const timePoints = [5, 10, 15];
    const totalThumbnails = videoFiles.length * timePoints.length;
    const atlasWidth = tileSize * totalThumbnails;
    const atlasHeight = tileSize;
    
    console.log(`아틀라스 생성 시작: ${atlasWidth}x${atlasHeight}, 썸네일 개수: ${totalThumbnails}`);
    
    const canvas = createCanvas(atlasWidth, atlasHeight);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, atlasWidth, atlasHeight);
    
    let currentIndex = 0;
    
    for (let videoIndex = 0; videoIndex < videoFiles.length; videoIndex++) {
        const videoFile = videoFiles[videoIndex];
        const videoPath = join(VIDEOS_DIR, videoFile);
        
        for (const timePoint of timePoints) {
            try {
                const thumbnailBuffer = await generateSingleThumbnail(videoPath, timePoint, tileSize);
                
                if (thumbnailBuffer) {
                    const img = await loadImage(thumbnailBuffer);
                    const x = currentIndex * tileSize;
                    const y = 0;
                    
                    ctx.drawImage(img, x, y, tileSize, tileSize);
                    console.log(`썸네일 배치 완료: ${videoFile} - ${timePoint}초 (${currentIndex + 1}/${totalThumbnails})`);
                } else {
                    const x = currentIndex * tileSize;
                    const y = 0;
                    ctx.fillStyle = '#374151';
                    ctx.fillRect(x, y, tileSize, tileSize);
                    ctx.fillStyle = '#9ca3af';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('ERROR', x + tileSize/2, y + tileSize/2);
                    console.warn(`썸네일 생성 실패: ${videoFile} - ${timePoint}초`);
                }
                
                currentIndex++;
            } catch (error) {
                console.error(`썸네일 생성 오류: ${videoFile} - ${timePoint}초:`, error);
                const x = currentIndex * tileSize;
                const y = 0;
                ctx.fillStyle = '#374151';
                ctx.fillRect(x, y, tileSize, tileSize);
                ctx.fillStyle = '#9ca3af';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('ERROR', x + tileSize/2, y + tileSize/2);
                currentIndex++;
            }
        }
    }
    
    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.8 });
    await writeFile(ATLAS_FILE, buffer);
    console.log(`아틀라스 생성 완료: ${ATLAS_FILE}`);
}

async function generateSingleThumbnail(videoPath, timePoint, size) {
    return new Promise((resolve) => {
        const tempPath = join(THUMBNAILS_DIR, `temp_${Date.now()}_${Math.random()}.jpg`);
        
        ffmpeg(videoPath)
            .seekInput(timePoint)
            .frames(1)
            .videoFilter([
                `crop=ih:ih:(iw-ih)/2:0`,
                `scale=${size}:${size}`
            ])
            .output(tempPath)
            .on('end', async () => {
                try {
                    const fs = await import('fs');
                    const buffer = fs.readFileSync(tempPath);
                    fs.unlinkSync(tempPath);
                    resolve(buffer);
                } catch (error) {
                    console.error('임시 파일 처리 오류:', error);
                    resolve(null);
                }
            })
            .on('error', (err) => {
                console.error('FFmpeg 오류:', err);
                resolve(null);
            })
            .run();
    });
}