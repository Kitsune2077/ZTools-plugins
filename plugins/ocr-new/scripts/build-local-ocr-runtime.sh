#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
RUNTIME_ROOT="$PROJECT_DIR/public/local-ocr-runtime/$PLATFORM"
SERVER_DIR="$RUNTIME_ROOT/rapidocr-server"
BUILD_DIR="$PROJECT_DIR/.runtime-build"

echo "=== 构建 RapidOCR 运行时：$PLATFORM ==="

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

echo "[1/4] 创建 Python 虚拟环境 ..."
python3 -m venv .venv
source .venv/bin/activate

echo "[2/4] 安装依赖 ..."
pip install --upgrade pip
pip install rapidocr>=3.8.1 onnxruntime>=1.18.0 pyinstaller

echo "[3/4] PyInstaller 打包 ..."
cat > "$BUILD_DIR/server.py" << 'PYEOF'
import sys
import os
os.environ.setdefault("RAPIDOCR_HOME", os.path.dirname(__file__))
from rapidocr_onnxruntime import RapidOCR
engine = RapidOCR()
print("RapidOCR 运行时已就绪 (platform: %s)" % sys.platform)
PYEOF

pyinstaller \
  --onedir \
  --name rapidocr-server \
  --add-data "$(python -c "import rapidocr; print(rapidocr.__path__[0])")"/models:rapidocr/models \
  --hidden-import rapidocr_onnxruntime \
  --hidden-import onnxruntime \
  --hidden-import cv2 \
  --hidden-import numpy \
  --hidden-import PIL \
  --hidden-import pyclipper \
  --hidden-import shapely \
  --noconsole \
  server.py

deactivate

echo "[4/4] 复制产物到 $SERVER_DIR ..."
mkdir -p "$SERVER_DIR"
cp -r "$BUILD_DIR/dist/rapidocr-server/"* "$SERVER_DIR/"

echo ""
echo "=== 构建完成 ==="
echo "产物路径: $SERVER_DIR"
echo "平台: $PLATFORM"
