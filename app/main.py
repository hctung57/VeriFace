"""Ứng dụng FastAPI cho nhận diện khuôn mặt từ webcam trình duyệt."""

from __future__ import annotations

import base64
from pathlib import Path

import cv2
import face_recognition
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request

from app.face_registry import FaceRegistry
from app.models import (
    ApiMessage,
    BrowserDetectRequest,
    BrowserDetectResponse,
    BrowserRecognitionRequest,
    BrowserRecognitionResponse,
    FaceDetectionResult,
    FaceMatchResult,
    ReferenceInfo,
)


BASE_DIR: Path = Path(__file__).resolve().parent.parent
REFERENCE_DIR: Path = BASE_DIR / "data" / "references"

face_registry = FaceRegistry(storage_dir=REFERENCE_DIR)
app = FastAPI(title="OdinEye", version="2.0.0")

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.get("/", response_class=HTMLResponse)
async def home(request: Request) -> HTMLResponse:
    """Render trang giao diện chính; ví dụ: GET /."""

    return templates.TemplateResponse("index.html", {"request": request})


@app.on_event("startup")
async def on_startup() -> None:
    """Khởi tạo dữ liệu trước khi nhận request; ví dụ: on_startup()."""

    face_registry.load_existing_references()


@app.post("/api/references", response_model=ReferenceInfo)
async def upload_reference(
    label: str = Form(""),
    image: UploadFile = File(...),
) -> ReferenceInfo:
    """Upload một ảnh khuôn mặt tham chiếu; ví dụ: POST /api/references."""

    return await face_registry.add_reference(label=label, upload_file=image)


@app.get("/api/references", response_model=list[ReferenceInfo])
async def list_references() -> list[ReferenceInfo]:
    """Lấy danh sách khuôn mặt đã upload; ví dụ: GET /api/references."""

    return face_registry.list_references()


@app.delete("/api/references/{reference_id}", response_model=ApiMessage)
async def delete_reference(reference_id: str) -> ApiMessage:
    """Xóa một khuôn mặt tham chiếu; ví dụ: DELETE /api/references/{reference_id}."""

    face_registry.delete_reference(reference_id)
    return ApiMessage(message="Reference face deleted")


@app.get("/api/references/{reference_id}/image")
async def get_reference_image(reference_id: str) -> FileResponse:
    """Trả file ảnh tham chiếu theo ID; ví dụ: GET /api/references/{reference_id}/image."""

    image_path: Path = face_registry.get_reference_image_path(reference_id)
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Reference image file not found")
    return FileResponse(path=str(image_path))


@app.post("/api/browser-recognition", response_model=BrowserRecognitionResponse)
async def browser_recognition(payload: BrowserRecognitionRequest) -> BrowserRecognitionResponse:
    """Nhận diện từ webcam client gửi lên; ví dụ: POST /api/browser-recognition."""

    try:
        frame_rgb: np.ndarray = _decode_browser_image(payload.image_base64)
    except ValueError as decode_error:
        raise HTTPException(status_code=400, detail=str(decode_error)) from decode_error
    references = face_registry.get_faces(payload.reference_ids)

    detections: list[FaceDetectionResult] = []
    face_locations: list[tuple[int, int, int, int]] = face_recognition.face_locations(frame_rgb, model="hog")
    face_encodings: list[np.ndarray] = face_recognition.face_encodings(frame_rgb, face_locations)

    known_encodings: list[np.ndarray] = [face.encoding for face in references]
    known_labels: list[str] = [face.label for face in references]

    for (top, right, bottom, left), unknown_encoding in zip(face_locations, face_encodings):
        label: str = "Unknown"
        distance: float = 1.0
        is_match: bool = False

        if known_encodings:
            distances: np.ndarray = face_recognition.face_distance(known_encodings, unknown_encoding)
            best_index: int = int(np.argmin(distances))
            distance = float(distances[best_index])

            # Ngưỡng 0.48 giúp giảm false positive so với mức mặc định 0.6.
            if distance <= 0.48:
                label = known_labels[best_index]
                is_match = True

        detections.append(
            FaceDetectionResult(
                label=label,
                top=top,
                right=right,
                bottom=bottom,
                left=left,
                distance=distance,
                is_match=is_match,
            )
        )

    filtered_detections: list[FaceDetectionResult] = _filter_recognition_detections(
        detections=detections,
        result_mode=payload.result_mode,
    )
    return BrowserRecognitionResponse(detections=filtered_detections)


def _filter_recognition_detections(
    detections: list[FaceDetectionResult],
    result_mode: str,
) -> list[FaceDetectionResult]:
    """Lọc danh sách detection theo chế độ hiển thị; ví dụ: _filter_recognition_detections(detections, 'matched-only')."""

    if result_mode == "matched-only":
        return [detection for detection in detections if detection.is_match]
    return detections


@app.post("/api/browser-detect", response_model=BrowserDetectResponse)
async def browser_detect(payload: BrowserDetectRequest) -> BrowserDetectResponse:
    """Nhận diện từ face crops được detect ở browser; ví dụ: POST /api/browser-detect."""

    if len(payload.face_crops) != len(payload.face_locations):
        raise HTTPException(
            status_code=400,
            detail="Number of face_crops and face_locations must match",
        )

    references = face_registry.get_faces(payload.reference_ids)
    known_encodings: list[np.ndarray] = [face.encoding for face in references]
    known_labels: list[str] = [face.label for face in references]

    matches: list[FaceMatchResult] = []

    for crop_base64, location in zip(payload.face_crops, payload.face_locations):
        try:
            crop_rgb: np.ndarray = _decode_browser_image(crop_base64)
        except ValueError:
            continue

        # Extract face encoding từ crop
        face_locations_in_crop: list[tuple[int, int, int, int]] = face_recognition.face_locations(crop_rgb, model="hog")
        if not face_locations_in_crop:
            continue

        face_encodings: list[np.ndarray] = face_recognition.face_encodings(crop_rgb, face_locations_in_crop)
        if not face_encodings:
            continue

        unknown_encoding: np.ndarray = face_encodings[0]
        identity: str = "Unknown"
        distance: float = 1.0
        is_match: bool = False

        if known_encodings:
            distances: np.ndarray = face_recognition.face_distance(known_encodings, unknown_encoding)
            best_index: int = int(np.argmin(distances))
            distance = float(distances[best_index])

            if distance <= 0.48:
                identity = known_labels[best_index]
                is_match = True

        matches.append(
            FaceMatchResult(
                identity=identity,
                distance=distance,
                is_match=is_match,
                location=location,
            )
        )

    return BrowserDetectResponse(matches=matches)


def _decode_browser_image(image_base64: str) -> np.ndarray:
    """Giải mã data URL base64 thành ảnh RGB; ví dụ: _decode_browser_image('data:image/jpeg;base64,...')."""

    if "," not in image_base64:
        raise ValueError("image_base64 is not a valid data URL")

    _, encoded_payload = image_base64.split(",", maxsplit=1)
    jpeg_bytes: bytes = base64.b64decode(encoded_payload)
    image_array: np.ndarray = np.frombuffer(jpeg_bytes, dtype=np.uint8)
    frame_bgr: np.ndarray | None = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    if frame_bgr is None:
        raise ValueError("Unable to decode image from image_base64")
    return cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Dọn tài nguyên khi ứng dụng dừng; ví dụ: on_shutdown()."""

    # Khong co tai nguyen stream server can giai phong trong che do webcam browser-only.
    return
