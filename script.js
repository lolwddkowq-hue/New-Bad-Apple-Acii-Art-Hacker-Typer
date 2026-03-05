const video = document.getElementById('srcVideo');
const canvas = document.getElementById('buffer');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const asciiEl = document.getElementById('ascii');
const hint = document.getElementById('hint');
const topbar = document.getElementById('topbar');
const chars = ' .:-=+*#%@';
const textColor = '#00ff66';
asciiEl.style.color = textColor;
hint.style.color = textColor;
if (topbar) {
	topbar.style.color = textColor;
}
const state = {
	playing: true,
	typeBoost: 0,
	lastTypeAt: 0,
	cols: 160,
	rows: 90,
	lastFrameTs: performance.now(),
	lastRenderTs: 0,
	quality: 0.45,
	bootTs: performance.now()
};
video.loop = true;
const soundtrack = new Audio('videoplayback.mp3');
soundtrack.loop = true;
soundtrack.preload = 'auto';
soundtrack.volume = 0.6;
let audioCtx;
let mediaAudioUnlocked = false;
function ensureAudioContext() {
	const AudioCtx = window.AudioContext || window['webkitAudioContext'];
	if (!AudioCtx) {
		return null;
	}
	if (!audioCtx) {
		audioCtx = new AudioCtx();
	}
	return audioCtx;
}
function tryUnlockAudio(keepPlaying = false) {
	const ctx = ensureAudioContext();
	if (ctx && ctx.state !== 'running') {
		ctx.resume().catch(() => {});
	}
	const finishUnlock = () => {
		mediaAudioUnlocked = true;
		if (keepPlaying && state.playing && Number.isFinite(video.currentTime) && Number.isFinite(soundtrack.duration) && soundtrack.duration > 0) {
			const target = video.currentTime % soundtrack.duration;
			if (Math.abs(soundtrack.currentTime - target) > 0.35) {
				soundtrack.currentTime = target;
			}
		}
		if (!keepPlaying || !state.playing) {
			soundtrack.pause();
		}
	};
	const playPromise = soundtrack.play();
	if (playPromise && typeof playPromise.then === 'function') {
		playPromise.then(finishUnlock).catch(() => {});
	} else {
		finishUnlock();
	}
}
function ensureInteractionAudio(keepPlaying = true) {
	if (!mediaAudioUnlocked) {
		tryUnlockAudio(keepPlaying);
		return;
	}
	const ctx = ensureAudioContext();
	if (ctx && ctx.state === 'suspended') {
		ctx.resume().catch(() => {});
	}
}
function beep() {
	const ctx = ensureAudioContext();
	if (!ctx) {
		return;
	}
	const startTone = () => {
		const toneStart = ctx.currentTime + 0.001;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'square';
		osc.frequency.setValueAtTime(900, toneStart);
		gain.gain.setValueAtTime(0.0001, toneStart);
		gain.gain.exponentialRampToValueAtTime(0.07, toneStart + 0.005);
		gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.08);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(toneStart);
		osc.stop(toneStart + 0.08);
	};
	if (ctx.state === 'running') {
		startTone();
		return;
	}
	ctx.resume().then(() => {
		startTone();
	}).catch(() => {});
}
function syncSoundtrack(forceAlign = false) {
	if (forceAlign && Number.isFinite(video.currentTime) && Number.isFinite(soundtrack.duration) && soundtrack.duration > 0) {
		const target = video.currentTime % soundtrack.duration;
		if (Math.abs(soundtrack.currentTime - target) > 0.35) {
			soundtrack.currentTime = target;
		}
	}
	if (state.playing) {
		if (!mediaAudioUnlocked) {
			return;
		}
		soundtrack.play().catch(() => {});
	} else {
		soundtrack.pause();
	}
}
function fitAscii() {
	const w = window.innerWidth - 20;
	const h = window.innerHeight - 70;
	const cellW = 6;
	const cellH = 8;
	state.cols = Math.max(56, Math.floor((w / cellW) * state.quality));
	state.rows = Math.max(32, Math.floor((h / cellH) * state.quality));
	if (canvas.width !== state.cols) {
		canvas.width = state.cols;
	}
	if (canvas.height !== state.rows) {
		canvas.height = state.rows;
	}
}
function frameToAscii() {
	ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
	const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
	let out = '';
	for (let y = 0; y < canvas.height; y++) {
		let row = '';
		for (let x = 0; x < canvas.width; x++) {
			const i = (y * canvas.width + x) * 4;
			const r = frame[i];
			const g = frame[i + 1];
			const b = frame[i + 2];
			const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			const idx = Math.min(chars.length - 1, Math.floor((lum / 255) * chars.length));
			row += chars[idx];
		}
		out += row + '\n';
	}
	asciiEl.textContent = out;
}
function tick(ts) {
	const dt = Math.min(0.05, (ts - state.lastFrameTs) / 1000);
	state.lastFrameTs = ts;
	const nextQuality = Math.min(1, 0.45 + (ts - state.bootTs) / 7000);
	if (Math.abs(nextQuality - state.quality) >= 0.08) {
		state.quality = nextQuality;
		fitAscii();
	}
	if (state.playing && video.readyState >= 2) {
		const autoSpeed = 1.1;
		video.playbackRate = Math.min(4, autoSpeed + state.typeBoost * 0.4);
		const renderInterval = state.quality < 0.65 ? 70 : state.quality < 0.9 ? 45 : 30;
		if (ts - state.lastRenderTs >= renderInterval) {
			frameToAscii();
			state.lastRenderTs = ts;
		}
	}
	state.typeBoost = Math.max(0, state.typeBoost - dt * 1.6);
	requestAnimationFrame(tick);
}
function onType() {
	ensureInteractionAudio(true);
	const now = performance.now();
	const rapid = now - state.lastTypeAt < 120;
	state.lastTypeAt = now;
	state.typeBoost = Math.min(6, state.typeBoost + (rapid ? 0.5 : 0.3));
	hint.style.opacity = '0.25';
	setTimeout(() => {
		hint.style.opacity = '0.75';
	}, 100);
	beep();
	syncSoundtrack(true);
}
window.addEventListener('keydown', (e) => {
	ensureInteractionAudio(true);
	if (e.code === 'Space') {
		e.preventDefault();
		state.playing = !state.playing;
		if (state.playing) {
			video.play().catch(() => {});
		} else {
			video.pause();
		}
		syncSoundtrack(true);
		return;
	}
	onType();
});
window.addEventListener('pointerdown', () => {
	ensureInteractionAudio(state.playing);
	syncSoundtrack(true);
}, { passive: true });
window.addEventListener('resize', fitAscii);
video.addEventListener('loadeddata', () => {
	fitAscii();
	if (state.playing) {
		video.play().catch(() => {});
	}
	syncSoundtrack(true);
});
video.addEventListener('canplay', () => {
	if (state.playing && video.paused) {
		video.play().catch(() => {});
	}
	syncSoundtrack(true);
});
video.addEventListener('error', () => {
	asciiEl.textContent = 'Video load failed. Make sure videoplayback.mp4 is in the same folder as index.html and open via http://localhost:8000';
});
soundtrack.addEventListener('error', () => {
	hint.textContent = 'Audio load failed: videoplayback.mp3';
});
fitAscii();
requestAnimationFrame(tick);
video.load();
soundtrack.load();
