"""Structured JSON logging with per-request correlation IDs for Mise en Place MD."""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from datetime import UTC, datetime

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


def get_request_id() -> str:
    """Return the active request correlation identifier."""
    return request_id_var.get()


class JsonLogFormatter(logging.Formatter):
    """Format application log records as single-line structured JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", get_request_id()),
            "message": record.getMessage(),
        }
        for attr in ("method", "path", "status_code", "duration_ms", "event"):
            val = getattr(record, attr, None)
            if val is not None:
                payload[attr] = val
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_json_logging(level: int = logging.INFO) -> logging.Logger:
    """Configure the dedicated application JSON logger idempotently."""
    logger = logging.getLogger("mise_en_place")
    logger.setLevel(level)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonLogFormatter())
        logger.addHandler(handler)
    logger.propagate = False
    return logger


app_logger = configure_json_logging()


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach a unique request_id to every request and emit structured JSON access logs."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        incoming_id = (request.headers.get("X-Request-ID") or "").strip()
        req_id = incoming_id[:64] if incoming_id else uuid.uuid4().hex[:16]
        token = request_id_var.set(req_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - started) * 1000.0, 2)
            app_logger.exception(
                "Unhandled request error",
                extra={
                    "request_id": req_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": 500,
                    "duration_ms": duration_ms,
                    "event": "http_request_error",
                },
            )
            request_id_var.reset(token)
            raise

        duration_ms = round((time.perf_counter() - started) * 1000.0, 2)
        response.headers["X-Request-ID"] = req_id
        app_logger.info(
            "HTTP request completed",
            extra={
                "request_id": req_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "event": "http_request",
            },
        )
        request_id_var.reset(token)
        return response
