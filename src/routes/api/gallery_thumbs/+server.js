import { mkdir, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';



const GALLERY_DIR = join(process.cwd(), 'static', 'gallery_thumbs');

export async function POST({ request }) {
    try {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const { fileName, dataUrl } = await request.json();
            if (!fileName || !dataUrl) {
                return new Response(JSON.stringify({ error: 'fileName과 dataUrl이 필요합니다' }), { status: 400 });
            }
            const base64 = dataUrl.split(',')[1];
            const buffer = Buffer.from(base64, 'base64');
            if (!existsSync(GALLERY_DIR)) {
                await mkdir(GALLERY_DIR, { recursive: true });
            }
            const safeName = fileName.replace(/\.[^/.]+$/, '') + '.jpg';
            const outPath = join(GALLERY_DIR, safeName);
            await writeFile(outPath, buffer);
            return new Response(JSON.stringify({ ok: true, path: `/gallery_thumbs/${safeName}` }), { status: 200 });
        }

        // 기본: multipart/form-data 지원 (선택)
        const form = await request.formData();
        const file = form.get('file');
        const name = form.get('name');
        if (!file || !name) {
            return new Response(JSON.stringify({ error: 'file과 name이 필요합니다' }), { status: 400 });
        }
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (!existsSync(GALLERY_DIR)) {
            await mkdir(GALLERY_DIR, { recursive: true });
        }
        const safeName = String(name).replace(/\.[^/.]+$/, '') + '.jpg';
        const outPath = join(GALLERY_DIR, safeName);
        await writeFile(outPath, buffer);
        return new Response(JSON.stringify({ ok: true, path: `/gallery_thumbs/${safeName}` }), { status: 200 });
    } catch (e) {
        console.error('갤러리 썸네일 저장 실패:', e);
        return new Response(JSON.stringify({ error: '저장 실패' }), { status: 500 });
    }
}

// 갤러리 썸네일 목록 조회 (클라이언트에서 404를 줄이기 위해 매니페스트 제공)
export async function GET() {
    try {
        if (!existsSync(GALLERY_DIR)) {
            return new Response(JSON.stringify({ items: [], map: {} }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const files = await readdir(GALLERY_DIR);
        const imageFiles = files.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));

        const items = imageFiles.map((file) => {
            const base = file.replace(/\.[^/.]+$/, '');
            // URL 인코딩하여 특수문자/제어문자 문제 방지
            const url = `/build/gallery_thumbs/${encodeURIComponent(file)}`;
            return { file, base, url };
        });

        const map = {};
        for (const item of items) {
            map[item.base] = item.url;
        }

        // 빌드 시 정적 파일로 생성하기 위해 prerender 설정
        return new Response(JSON.stringify({ items, map }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        console.error('갤러리 썸네일 목록 조회 실패:', e);
        return new Response(JSON.stringify({ items, map: {} }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

