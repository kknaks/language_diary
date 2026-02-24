"""Circuit Breaker + Retry with exponential backoff for external API calls."""

import asyncio
import logging
import time
from enum import Enum
from typing import Callable, Optional, Tuple, Type

logger = logging.getLogger(__name__)

# Default configuration
DEFAULT_FAILURE_THRESHOLD = 5
DEFAULT_RECOVERY_TIMEOUT = 60.0  # seconds
DEFAULT_MAX_RETRIES = 3
DEFAULT_BASE_DELAY = 1.0  # seconds
DEFAULT_MAX_DELAY = 30.0  # seconds


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerError(Exception):
    """Raised when the circuit breaker is open and calls are rejected."""

    def __init__(self, name: str):
        self.name = name
        super().__init__(f"Circuit breaker '{name}' is OPEN — calls are being rejected")


class CircuitBreaker:
    """Circuit breaker pattern for external service calls.

    States:
        - CLOSED: Normal operation, requests pass through
        - OPEN: Too many failures, requests are rejected immediately
        - HALF_OPEN: After recovery timeout, allow one test request
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = DEFAULT_FAILURE_THRESHOLD,
        recovery_timeout: float = DEFAULT_RECOVERY_TIMEOUT,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time: Optional[float] = None

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            if (
                self._last_failure_time
                and time.monotonic() - self._last_failure_time >= self.recovery_timeout
            ):
                self._state = CircuitState.HALF_OPEN
        return self._state

    def record_success(self) -> None:
        self._failure_count = 0
        self._state = CircuitState.CLOSED

    def record_failure(self) -> None:
        self._failure_count += 1
        self._last_failure_time = time.monotonic()
        if self._failure_count >= self.failure_threshold:
            self._state = CircuitState.OPEN
            logger.warning(
                "Circuit breaker '%s' opened after %d failures",
                self.name,
                self._failure_count,
            )

    def allow_request(self) -> bool:
        state = self.state
        if state == CircuitState.CLOSED:
            return True
        if state == CircuitState.HALF_OPEN:
            return True
        return False

    def reset(self) -> None:
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time = None


async def retry_with_backoff(
    func: Callable,
    max_retries: int = DEFAULT_MAX_RETRIES,
    base_delay: float = DEFAULT_BASE_DELAY,
    max_delay: float = DEFAULT_MAX_DELAY,
    retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,),
    circuit_breaker: Optional[CircuitBreaker] = None,
):
    """Execute an async function with exponential backoff retry.

    Args:
        func: Async callable to execute
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay between retries (seconds)
        max_delay: Maximum delay between retries (seconds)
        retryable_exceptions: Tuple of exception types that trigger a retry
        circuit_breaker: Optional circuit breaker instance

    Returns:
        The result of the function call

    Raises:
        CircuitBreakerError: If the circuit breaker is open
        The last exception if all retries are exhausted
    """
    if circuit_breaker and not circuit_breaker.allow_request():
        raise CircuitBreakerError(circuit_breaker.name)

    last_exception = None

    for attempt in range(max_retries + 1):
        try:
            result = await func()
            if circuit_breaker:
                circuit_breaker.record_success()
            return result
        except retryable_exceptions as e:
            last_exception = e
            if circuit_breaker:
                circuit_breaker.record_failure()

            if attempt < max_retries:
                delay = min(base_delay * (2 ** attempt), max_delay)
                logger.warning(
                    "Attempt %d/%d failed: %s. Retrying in %.1fs...",
                    attempt + 1,
                    max_retries + 1,
                    str(e),
                    delay,
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    "All %d attempts failed: %s",
                    max_retries + 1,
                    str(e),
                )

    raise last_exception
