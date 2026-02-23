from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base application error with structured response per PRD 10.3."""

    def __init__(self, code: str, message: str, detail: str = "", status_code: int = 400):
        self.code = code
        self.message = message
        self.detail = detail
        self.status_code = status_code


class NotFoundError(AppError):
    def __init__(self, code: str = "DIARY_NOT_FOUND", message: str = "리소스를 찾을 수 없습니다.", detail: str = ""):
        super().__init__(code=code, message=message, detail=detail, status_code=status.HTTP_404_NOT_FOUND)


class BadRequestError(AppError):
    def __init__(self, code: str = "VALIDATION_ERROR", message: str = "요청 데이터가 올바르지 않습니다.", detail: str = ""):
        super().__init__(code=code, message=message, detail=detail, status_code=status.HTTP_400_BAD_REQUEST)


class ConflictError(AppError):
    def __init__(self, code: str = "CONFLICT", message: str = "충돌이 발생했습니다.", detail: str = ""):
        super().__init__(code=code, message=message, detail=detail, status_code=status.HTTP_409_CONFLICT)


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "detail": exc.detail,
            }
        },
    )


async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "요청 데이터 검증 실패",
                "detail": str(exc.errors()),
            }
        },
    )
