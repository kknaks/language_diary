"""Audio validation utilities for pronunciation evaluation."""

import struct
from typing import Tuple

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB

# WAV header constants
WAV_HEADER_SIZE = 44
EXPECTED_SAMPLE_RATE = 16000
EXPECTED_BITS_PER_SAMPLE = 16
EXPECTED_NUM_CHANNELS = 1  # mono


class AudioValidationError(Exception):
    """Raised when audio validation fails."""
    pass


def validate_wav_upload(data: bytes) -> Tuple[int, int, int]:
    """Validate that uploaded audio is WAV 16kHz 16-bit mono.

    Args:
        data: Raw bytes of the uploaded file

    Returns:
        Tuple of (sample_rate, bits_per_sample, num_channels)

    Raises:
        AudioValidationError: If validation fails
    """
    if len(data) > MAX_UPLOAD_SIZE:
        raise AudioValidationError(
            f"파일 크기가 10MB를 초과합니다. ({len(data) / (1024 * 1024):.1f}MB)"
        )

    if len(data) < WAV_HEADER_SIZE:
        raise AudioValidationError("유효하지 않은 WAV 파일입니다. (헤더 부족)")

    # Check RIFF header
    if data[:4] != b"RIFF":
        raise AudioValidationError("유효하지 않은 WAV 파일입니다. (RIFF 헤더 없음)")

    if data[8:12] != b"WAVE":
        raise AudioValidationError("유효하지 않은 WAV 파일입니다. (WAVE 형식 아님)")

    # Parse fmt chunk
    if data[12:16] != b"fmt ":
        raise AudioValidationError("유효하지 않은 WAV 파일입니다. (fmt 청크 없음)")

    # Audio format (1 = PCM)
    audio_format = struct.unpack_from("<H", data, 20)[0]
    if audio_format != 1:
        raise AudioValidationError(
            f"PCM 포맷만 지원합니다. (현재: {audio_format})"
        )

    num_channels = struct.unpack_from("<H", data, 22)[0]
    sample_rate = struct.unpack_from("<I", data, 24)[0]
    bits_per_sample = struct.unpack_from("<H", data, 34)[0]

    if num_channels != EXPECTED_NUM_CHANNELS:
        raise AudioValidationError(
            f"모노 오디오만 지원합니다. (현재 채널: {num_channels})"
        )

    if sample_rate != EXPECTED_SAMPLE_RATE:
        raise AudioValidationError(
            f"16kHz 샘플레이트만 지원합니다. (현재: {sample_rate}Hz)"
        )

    if bits_per_sample != EXPECTED_BITS_PER_SAMPLE:
        raise AudioValidationError(
            f"16-bit 오디오만 지원합니다. (현재: {bits_per_sample}-bit)"
        )

    return sample_rate, bits_per_sample, num_channels
