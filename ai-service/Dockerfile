FROM python:3.11-slim

WORKDIR /app

# 安装 uv (最快的 Python 包管理器)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# 复制依赖文件
COPY pyproject.toml ./

# 安装依赖(使用 uv,比 pip 快 10-100x)
RUN uv pip install --system --no-cache -r pyproject.toml

# 复制应用代码
COPY app ./app

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/healthz')" || exit 1

# 启动服务
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
