import { readdir, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const GALLERY_DIR = join(process.cwd(), 'static', 'gallery_thumbs');
const OUTPUT_DIR = join(process.cwd(), 'build', 'api');
const OUTPUT_FILE = join(OUTPUT_DIR, 'gallery_thumbs');

async function generateGalleryManifest() {
    try {
        // 출력 디렉토리 생성
        if (!existsSync(OUTPUT_DIR)) {
            await mkdir(OUTPUT_DIR, { recursive: true });
        }

        if (!existsSync(GALLERY_DIR)) {
            const manifest = { items: [], map: {} };
            await writeFile(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
            console.log('갤러리 디렉토리가 없어 빈 매니페스트 생성');
            return;
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

        const manifest = { items, map };
        await writeFile(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
        
        console.log(`갤러리 매니페스트 생성 완료: ${items.length}개 파일`);
        console.log('생성된 파일:', OUTPUT_FILE);
        
    } catch (error) {
        console.error('갤러리 매니페스트 생성 실패:', error);
        process.exit(1);
    }
}

generateGalleryManifest();
