# VeriFace

<p align="center">
  <img src="docs/assets/veriface-logo.svg" alt="VeriFace logo" width="520" />
</p>

## Overview
VeriFace is a browser-first face recognition application for lightweight deployment scenarios. It matters because it keeps webcam capture on the client side while performing recognition on the server, reducing device-specific camera handling on backend hosts.

>VeriFace là một phần mềm nhận diện khuôn mặt theo định hướng browser-first, được thiết kế cho các kịch bản triển khai nhẹ. Điều này quan trọng vì hệ thống giữ việc truy cập và xử lý webcam ở phía client, trong khi quá trình nhận diện được thực hiện trên server, từ đó giảm sự phụ thuộc vào việc xử lý camera theo từng loại thiết bị ở phía backend.

Demo:

<p align="center">
  <img src="docs/assets/demo.png" alt="VeriFace demo" width="980" />
</p>

## Getting Started
Installation steps:

1. Ensure Docker Engine and Docker Compose are installed.
2. Ensure TLS certificates exist:
3. `certs/cert.pem`
4. `certs/key.pem`
5. Start services:

```bash
docker compose up --build
```

Configuration:

- HTTPS port: `8443` (mapped to app port `8000` inside container)
- Data persistence: `./data:/app/data`
- TLS cert mount: `./certs:/app/certs:ro`

Example usage:

1. Open `https://<host-or-ip>:8443`.
2. Upload reference images in `Reference Gallery`.
3. Start webcam and choose sampling interval (100ms to 5s).
4. Monitor results in `Detection History`.

## Deployment
Architecture + setup:

- Frontend: Browser captures webcam frames and sends base64 images.
- Backend: FastAPI receives frames, detects/matches faces via `face_recognition`.
- Storage: references are persisted in `data/references`.
- Runtime: single HTTPS service via `docker-compose.yml`.

Deployment command:

```bash
docker compose up -d --build
```

Stop command:

```bash
docker compose down
```

## Features
- Browser-only webcam capture with periodic recognition
- Reference enrollment with duplicate-face protection
- Live sampling interval control (100ms to 5s)
- Detection history with compact cards and result filtering
- HTTPS-first Docker Compose deployment

## Advanced Configuration
### HTTPS and Runtime Tuning
Details:

- `HOST`, `PORT`, `WORKERS` can be tuned via compose environment.
- SSL paths are configured by `SSL_CERT_FILE` and `SSL_KEY_FILE`.
- Recognition cadence can be tuned from the UI sampling slider.

## Configuration Options
`HOST`: Bind address for uvicorn (default `0.0.0.0`)

`PORT`: Internal uvicorn port (default `8000`)

`WORKERS`: Number of uvicorn workers (default `1`)

`SSL_CERT_FILE`: Path to TLS certificate in container (`/app/certs/cert.pem`)

`SSL_KEY_FILE`: Path to TLS private key in container (`/app/certs/key.pem`)

`result_mode`: Recognition response filter mode (`all` or `matched-only`)

`sampling interval`: Frontend recognition polling interval (100ms to 5000ms)

## Tips
- Use clear, front-facing images with exactly one face per reference.
- If recognition feels slow, increase sampling interval before scaling compute.
- For LAN access, trust/install your cert on client devices to avoid browser camera restrictions.
- Keep `./data` mounted to preserve references across container restarts.
