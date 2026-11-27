"""Hardened image upload validation (magic bytes, size limit, EXIF strip, WebP output)."""

from __future__ import annotations

import io
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MiB
_CHUNK_SIZE = 64 * 1024


@dataclass(frozen=True)
class StoredImageResult:
    """Sanitized image output metadata."""

    filename: str
    url: str
    mime_type: str
    size_bytes: int


def detect_image_mime(data: bytes) -> str | None:
    """Detect supported raster image MIME types strictly from binary magic bytes."""
    if len(data) < 12:
        return None
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp" and data[8:12] in (b"avif", b"avis"):
        return "image/avif"
    return None


async def read_bounded_upload(file: UploadFile, max_bytes: int) -> bytes:
    """Read an UploadFile up to max_bytes, raising HTTP 413 if exceeded."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"La imagen supera el tamaño máximo permitido ({max_bytes // (1024 * 1024)} MB).",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def sanitize_and_convert_to_webp(raw_bytes: bytes) -> bytes:
    """Validate image structure, strip all EXIF/XMP metadata, and encode as WebP."""
    try:
        with Image.open(io.BytesIO(raw_bytes)) as opened:
            opened.load()
            transposed = ImageOps.exif_transpose(opened)
            mode = "RGBA" if transposed.mode in ("RGBA", "LA", "P") else "RGB"
            converted = transposed.convert(mode)
            clean_image = Image.new(mode, converted.size)
            clean_image.paste(converted)
            out_buf = io.BytesIO()
            clean_image.save(out_buf, format="WEBP", quality=85, method=4)
            return out_buf.getvalue()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=415,
            detail="El archivo no contiene una imagen válida o está corrupto.",
        ) from exc


async def process_image_upload(
    file: UploadFile,
    media_dir: Path,
    safe_stem: str,
    max_bytes: int = DEFAULT_MAX_UPLOAD_BYTES,
) -> StoredImageResult:
    """Validate magic bytes & size, strip EXIF, convert to WebP, and persist in media_dir."""
    raw_bytes = await read_bounded_upload(file, max_bytes=max_bytes)
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="El archivo subido está vacío.")

    detected_mime = detect_image_mime(raw_bytes)
    if detected_mime is None:
        raise HTTPException(
            status_code=415,
            detail="Formato de imagen no soportado (solo JPEG, PNG, WebP, GIF o AVIF).",
        )

    webp_bytes = sanitize_and_convert_to_webp(raw_bytes)
    unique_name = f"{safe_stem}-{uuid.uuid4().hex[:8]}.webp"
    dest_path = media_dir / unique_name
    dest_path.write_bytes(webp_bytes)
    return StoredImageResult(
        filename=unique_name,
        url=f"/media/{unique_name}",
        mime_type="image/webp",
        size_bytes=len(webp_bytes),
    )
