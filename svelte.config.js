import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-static을 사용하여 스태틱 사이트로 빌드
		adapter: adapter({
			// 기본 출력 디렉토리
			pages: 'build',
			assets: 'build',
			// 디렉토리 기반 라우팅 사용 (player.html → player/index.html)
			fallback: 'index.html',
			// 빌드 전에 디렉토리 정리
			precompress: false,
			strict: false,
			// 디렉토리 기반 라우팅 활성화
			cleanup: true
		})
	}
};

export default config;
