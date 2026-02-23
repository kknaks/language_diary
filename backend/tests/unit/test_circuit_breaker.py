"""Tests for Circuit Breaker + Retry utility."""

import asyncio
import pytest
from unittest.mock import AsyncMock

from app.utils.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerError,
    CircuitState,
    retry_with_backoff,
)


class TestCircuitBreaker:
    def test_initial_state_closed(self):
        cb = CircuitBreaker(name="test")
        assert cb.state == CircuitState.CLOSED

    def test_allows_requests_when_closed(self):
        cb = CircuitBreaker(name="test")
        assert cb.allow_request() is True

    def test_stays_closed_below_threshold(self):
        cb = CircuitBreaker(name="test", failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED
        assert cb.allow_request() is True

    def test_opens_at_threshold(self):
        cb = CircuitBreaker(name="test", failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        assert cb.allow_request() is False

    def test_success_resets_failure_count(self):
        cb = CircuitBreaker(name="test", failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        assert cb.state == CircuitState.CLOSED
        assert cb._failure_count == 0

    def test_transitions_to_half_open_after_timeout(self):
        cb = CircuitBreaker(name="test", failure_threshold=1, recovery_timeout=0.0)
        cb.record_failure()
        assert cb.state == CircuitState.HALF_OPEN
        assert cb.allow_request() is True

    def test_reset(self):
        cb = CircuitBreaker(name="test", failure_threshold=1)
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        cb.reset()
        assert cb.state == CircuitState.CLOSED
        assert cb.allow_request() is True


class TestRetryWithBackoff:
    @pytest.mark.asyncio
    async def test_succeeds_on_first_try(self):
        mock_fn = AsyncMock(return_value="ok")
        result = await retry_with_backoff(mock_fn, max_retries=3, base_delay=0.01)
        assert result == "ok"
        assert mock_fn.call_count == 1

    @pytest.mark.asyncio
    async def test_retries_on_failure(self):
        mock_fn = AsyncMock(side_effect=[ValueError("fail"), "ok"])
        result = await retry_with_backoff(
            mock_fn, max_retries=1, base_delay=0.01, retryable_exceptions=(ValueError,)
        )
        assert result == "ok"
        assert mock_fn.call_count == 2

    @pytest.mark.asyncio
    async def test_raises_after_max_retries(self):
        mock_fn = AsyncMock(side_effect=ValueError("always fail"))
        with pytest.raises(ValueError, match="always fail"):
            await retry_with_backoff(
                mock_fn, max_retries=2, base_delay=0.01, retryable_exceptions=(ValueError,)
            )
        assert mock_fn.call_count == 3  # initial + 2 retries

    @pytest.mark.asyncio
    async def test_non_retryable_exception_raises_immediately(self):
        mock_fn = AsyncMock(side_effect=TypeError("not retryable"))
        with pytest.raises(TypeError):
            await retry_with_backoff(
                mock_fn, max_retries=3, base_delay=0.01, retryable_exceptions=(ValueError,)
            )
        assert mock_fn.call_count == 1

    @pytest.mark.asyncio
    async def test_circuit_breaker_open_rejects(self):
        cb = CircuitBreaker(name="test", failure_threshold=1)
        cb.record_failure()  # opens the circuit
        mock_fn = AsyncMock(return_value="ok")

        with pytest.raises(CircuitBreakerError):
            await retry_with_backoff(mock_fn, circuit_breaker=cb)

        assert mock_fn.call_count == 0

    @pytest.mark.asyncio
    async def test_circuit_breaker_records_success(self):
        cb = CircuitBreaker(name="test", failure_threshold=5)
        cb.record_failure()
        cb.record_failure()

        mock_fn = AsyncMock(return_value="ok")
        await retry_with_backoff(mock_fn, circuit_breaker=cb, base_delay=0.01)

        assert cb._failure_count == 0
        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_circuit_breaker_records_failures(self):
        cb = CircuitBreaker(name="test", failure_threshold=5)
        mock_fn = AsyncMock(side_effect=ValueError("fail"))

        with pytest.raises(ValueError):
            await retry_with_backoff(
                mock_fn,
                max_retries=2,
                base_delay=0.01,
                retryable_exceptions=(ValueError,),
                circuit_breaker=cb,
            )

        assert cb._failure_count == 3  # initial + 2 retries
