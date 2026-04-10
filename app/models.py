"""Khai báo model dữ liệu cho API."""

from typing import Literal

from pydantic import BaseModel, Field


class ReferenceInfo(BaseModel):
    """Thông tin khuôn mặt tham chiếu; ví dụ: ReferenceInfo(reference_id='abc', label='An')."""

    reference_id: str = Field(..., description="ID duy nhất của khuôn mặt")
    label: str = Field(..., description="Tên hiển thị của khuôn mặt")
    image_path: str = Field(..., description="Đường dẫn ảnh tham chiếu")


class ApiMessage(BaseModel):
    """Thông báo API tổng quát; ví dụ: ApiMessage(message='ok')."""

    message: str


class BrowserRecognitionRequest(BaseModel):
    """Payload nhận diện từ webcam browser; ví dụ: BrowserRecognitionRequest(image_base64='data:image/jpeg;base64,...')."""

    image_base64: str = Field(..., min_length=32, description="Ảnh JPEG dạng data URL base64")
    reference_ids: list[str] = Field(default_factory=list, description="Danh sách ID khuôn mặt cần đối chiếu")
    result_mode: Literal["all", "matched-only"] = Field(
        default="all",
        description="Chế độ trả kết quả: all hoặc matched-only",
    )


class FaceDetectionResult(BaseModel):
    """Kết quả nhận diện từng khuôn mặt; ví dụ: FaceDetectionResult(label='An', top=10, right=20, bottom=30, left=40, distance=0.33, is_match=True)."""

    label: str
    top: int
    right: int
    bottom: int
    left: int
    distance: float
    is_match: bool


class BrowserRecognitionResponse(BaseModel):
    """Kết quả nhận diện cho một frame webcam browser; ví dụ: BrowserRecognitionResponse(detections=[])."""

    detections: list[FaceDetectionResult]


class BrowserFaceLocation(BaseModel):
    """Vị trí khuôn mặt trong frame; ví dụ: BrowserFaceLocation(top=10, right=20, bottom=30, left=5)."""

    top: int
    right: int
    bottom: int
    left: int


class BrowserDetectRequest(BaseModel):
    """Payload gửi face crops để nhận diện; ví dụ: BrowserDetectRequest(face_crops=['data:image/jpeg;base64,...])."""

    face_crops: list[str] = Field(..., min_items=1, description="Danh sách ảnh crops dạng base64")
    face_locations: list[BrowserFaceLocation] = Field(..., description="Vị trí các khuôn mặt tương ứng")
    reference_ids: list[str] = Field(default_factory=list, description="Danh sách ID khuôn mặt cần đối chiếu")


class FaceMatchResult(BaseModel):
    """Kết quả matching một khuôn mặt; ví dụ: FaceMatchResult(identity='Alex', distance=0.35, is_match=True)."""

    identity: str
    distance: float
    is_match: bool
    location: BrowserFaceLocation


class BrowserDetectResponse(BaseModel):
    """Kết quả nhận diện từ browser detect; ví dụ: BrowserDetectResponse(matches=[])."""

    matches: list[FaceMatchResult]
