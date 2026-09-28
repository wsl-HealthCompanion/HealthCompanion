"""
Gunicorn 配置文件 — 生产模式多 worker
用法: gunicorn -k uvicorn.workers.UvicornWorker -c gunicorn_conf.py app.main:app

开发模式: python -c "from app.main import app; import uvicorn; uvicorn.run(app, port=8000)"
生产模式: gunicorn -c gunicorn_conf.py app.main:app
"""
import multiprocessing
import os

# Worker 配置
workers = int(os.getenv("GUNICORN_WORKERS", min(4, multiprocessing.cpu_count() * 2 + 1)))
worker_class = "uvicorn.workers.UvicornWorker"

# 绑定地址
bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"

# 超时 (LLM 调用可能较慢)
timeout = int(os.getenv("GUNICORN_TIMEOUT", "60"))
keepalive = 5

# 日志
accesslog = "-"  # stdout
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")

# 优雅重启
max_requests = 1000
max_requests_jitter = 100
graceful_timeout = 30
