"""Tests for audio validation utility."""

import struct
import pytest

from app.utils.audio import AudioValidationError, validate_wav_upload


def _make_wav(sample_rate=16000, bits_per_sample=16, num_channels=1, data_size=3200, audio_format=1):
    """Build a minimal valid WAV header + fake audio data."""
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    chunk_size = 36 + data_size
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", chunk_size, b"WAVE", b"fmt ", 16,
        audio_format, num_channels, sample_rate, byte_rate, block_align, bits_per_sample,
        b"data", data_size,
    )
    return header + (b"\x00" * data_size)


class TestValidateWavUpload:
    def test_valid_wav(self):
        data = _make_wav()
        sr, bps, ch = validate_wav_upload(data)
        assert sr == 16000
        assert bps == 16
        assert ch == 1

    def test_too_large(self):
        data = _make_wav(data_size=11 * 1024 * 1024)
        with pytest.raises(AudioValidationError, match="10MB"):
            validate_wav_upload(data)

    def test_too_short(self):
        with pytest.raises(AudioValidationError, match="헤더 부족"):
            validate_wav_upload(b"short")

    def test_not_riff(self):
        data = b"NOTR" + b"\x00" * 40
        with pytest.raises(AudioValidationError, match="RIFF"):
            validate_wav_upload(data)

    def test_not_wave(self):
        data = b"RIFF" + b"\x00" * 4 + b"NOPE" + b"\x00" * 32
        with pytest.raises(AudioValidationError, match="WAVE"):
            validate_wav_upload(data)

    def test_wrong_sample_rate(self):
        data = _make_wav(sample_rate=44100)
        with pytest.raises(AudioValidationError, match="16kHz"):
            validate_wav_upload(data)

    def test_wrong_channels(self):
        data = _make_wav(num_channels=2)
        with pytest.raises(AudioValidationError, match="모노"):
            validate_wav_upload(data)

    def test_wrong_bit_depth(self):
        data = _make_wav(bits_per_sample=8)
        with pytest.raises(AudioValidationError, match="16-bit"):
            validate_wav_upload(data)

    def test_non_pcm_format(self):
        data = _make_wav(audio_format=3)  # IEEE float
        with pytest.raises(AudioValidationError, match="PCM"):
            validate_wav_upload(data)
