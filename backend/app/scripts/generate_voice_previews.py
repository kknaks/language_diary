"""Generate consistent voice preview audio files via ElevenLabs TTS API.

1. ElevenLabs TTS로 원본 생성
2. ffmpeg로 RMS 측정 → target RMS까지 gain 계산
3. gain 적용해서 정규화된 MP3 저장
4. DB에 sample_url + volume_gain_db 저장 (대화 TTS에서도 동일 gain 적용용)

Usage:
    cd backend
    python -m app.scripts.generate_voice_previews
"""

import logging
import re
import subprocess
import tempfile
from pathlib import Path

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.seed import Voice

logger = logging.getLogger(__name__)

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"
OUTPUT_DIR = STATIC_DIR / "voice_previews"

# 목표 RMS (dB). 모바일에서 충분히 들리는 수준.
TARGET_RMS_DB = -14.0

# 언어별 미리듣기 텍스트
PREVIEW_TEXTS = {
    1: "안녕하세요, 만나서 반가워요.",
    2: "Hello, nice to meet you.",
    3: "こんにちは、はじめまして。",
    4: "你好，很高兴认识你。",
    5: "Hola, mucho gusto en conocerte.",
}


def _call_elevenlabs(voice_id: str, text: str) -> bytes:
    """ElevenLabs TTS API 호출, raw MP3 bytes 반환."""
    url = f"{ELEVENLABS_TTS_URL}/{voice_id}"
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }
    with httpx.Client(timeout=30) as client:
        resp = client.post(url, headers=headers, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(f"ElevenLabs TTS failed ({resp.status_code}): {resp.text[:200]}")
        return resp.content


def _measure_rms(audio_path: str) -> float:
    """ffmpeg volumedetect로 mean_volume(RMS dB) 측정."""
    result = subprocess.run(
        ["ffmpeg", "-i", audio_path, "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    match = re.search(r"mean_volume:\s*([-\d.]+)\s*dB", result.stderr)
    if not match:
        raise RuntimeError(f"Could not measure RMS: {result.stderr[-300:]}")
    return float(match.group(1))


def _apply_gain(input_path: str, output_path: str, gain_db: float) -> None:
    """ffmpeg volume 필터로 gain 적용."""
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-i", input_path,
            "-af", f"volume={gain_db}dB",
            str(output_path),
        ],
        capture_output=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg gain failed: {result.stderr[-300:]}")


def generate_and_normalize(voice_id: str, text: str, output_path: Path) -> float:
    """TTS 생성 → RMS 측정 → gain 적용 → 저장. gain_db 값 반환."""
    raw_bytes = _call_elevenlabs(voice_id, text)

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name

    try:
        current_rms = _measure_rms(tmp_path)
        gain_db = TARGET_RMS_DB - current_rms

        logger.info(
            "Voice %s: current RMS=%.1f dB, gain=%.1f dB → target=%.1f dB",
            voice_id, current_rms, gain_db, TARGET_RMS_DB,
        )

        _apply_gain(tmp_path, str(output_path), gain_db)
        return gain_db
    finally:
        Path(tmp_path).unlink(missing_ok=True)


async def generate_voice_previews(session: AsyncSession) -> None:
    """DB의 모든 voice에 대해 preview MP3가 없으면 생성하고 sample_url/volume_gain_db 업데이트."""
    if not settings.ELEVENLABS_API_KEY:
        logger.warning("ELEVENLABS_API_KEY not set — skipping voice preview generation.")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    result = await session.execute(select(Voice))
    voices = result.scalars().all()

    generated = 0
    for voice in voices:
        output_file = OUTPUT_DIR / f"{voice.elevenlabs_voice_id}.mp3"
        expected_url = f"/static/voice_previews/{voice.elevenlabs_voice_id}.mp3"

        if output_file.exists():
            if voice.sample_url != expected_url:
                voice.sample_url = expected_url
            # 파일은 있지만 volume_gain_db가 미계산(0)이면 RMS 측정해서 업데이트
            if voice.volume_gain_db == 0:
                try:
                    current_rms = _measure_rms(str(output_file))
                    gain_db = TARGET_RMS_DB - current_rms
                    voice.volume_gain_db = gain_db
                    logger.info(
                        "Voice %s: measured existing file RMS=%.1f dB → gain=%.1f dB",
                        voice.name, current_rms, gain_db,
                    )
                except Exception as e:
                    logger.error("Failed to measure RMS for %s: %s", voice.name, e)
            continue

        text = PREVIEW_TEXTS.get(voice.language_id, PREVIEW_TEXTS[2])
        logger.info("Generating voice preview: %s (%s)", voice.name, voice.elevenlabs_voice_id)

        try:
            gain_db = generate_and_normalize(voice.elevenlabs_voice_id, text, output_file)
            voice.sample_url = expected_url
            voice.volume_gain_db = gain_db
            generated += 1
        except Exception as e:
            logger.error("Failed to generate preview for %s: %s", voice.name, e)

    await session.flush()
    logger.info("Voice previews done — %d new, %d total.", generated, len(voices))


if __name__ == "__main__":
    import asyncio
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    async def _main():
        engine = create_async_engine(settings.DATABASE_URL)
        async_sess = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with async_sess() as session:
            await generate_voice_previews(session)
            await session.commit()
        await engine.dispose()

    asyncio.run(_main())
