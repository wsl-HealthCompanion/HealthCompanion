"""
LLM 工厂 — 根据 agent 名称返回 LLM 实例 + 并发限流保护
"""
from langchain_openai import ChatOpenAI
from app.config import settings, AGENT_REGISTRY
import httpx
import asyncio
import os

_MAX_CONCURRENT_LLM = int(os.getenv("MAX_CONCURRENT_LLM", "10"))
_llm_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_LLM)

# 绕过代理 + 自定义DNS
_DNS = os.getenv("DNS_SERVERS", "").split(",")[0].strip() if os.getenv("DNS_SERVERS") else ""
if _DNS:
    import socket as _socket, sys
    _orig_getaddrinfo = _socket.getaddrinfo
    def _custom_addrinfo(host, port, family=0, type=0, proto=0, flags=0):
        import subprocess, re
        try:
            r = subprocess.run(["nslookup", host, _DNS], capture_output=True, text=True, timeout=4)
            ips = re.findall(r'Address:\s*(\d+\.\d+\.\d+\.\d+)', r.stdout)
            for ip in reversed(ips):
                if ip.split('.')[0] not in ('127','0'):
                    print(f"[DNS FIX] Resolved {host} → {ip}", file=sys.stderr)
                    return _orig_getaddrinfo(ip, port, family, type, proto, flags)
        except Exception as e:
            print(f"[DNS FIX] Failed to resolve {host}: {e}", file=sys.stderr)
        return _orig_getaddrinfo(host, port, family, type, proto, flags)
    _socket.getaddrinfo = _custom_addrinfo
    print("[DNS FIX] Custom DNS resolver activated", file=sys.stderr)

_HTTP_CLIENT = httpx.AsyncClient(trust_env=False)


class RateLimitedChatOpenAI(ChatOpenAI):
    """ChatOpenAI 包装器: ainvoke 自动排队,超并发上限时不报错只等待"""

    async def ainvoke(self, *args, **kwargs):
        async with _llm_semaphore:
            return await super().ainvoke(*args, **kwargs)

    async def astream(self, *args, **kwargs):
        async with _llm_semaphore:
            async for chunk in super().astream(*args, **kwargs):
                yield chunk


def get_llm(agent_name: str, streaming: bool = True) -> ChatOpenAI:
    """
    获取配置好的 LLM 实例

    Args:
        agent_name: Agent名称,如 "orchestrator", "knowledge_qa"
        streaming: 是否启用流式输出

    Returns:
        配置好的 ChatOpenAI 实例

    Raises:
        KeyError: 如果 agent_name 不在 AGENT_REGISTRY 中
    """
    if agent_name not in AGENT_REGISTRY:
        raise KeyError(f"Agent '{agent_name}' not found in registry. Available: {list(AGENT_REGISTRY.keys())}")

    cfg = AGENT_REGISTRY[agent_name]

    # 根据provider选择base_url和api_key
    if cfg.provider == "deepseek":
        base_url = settings.deepseek_base_url
        api_key = settings.deepseek_api_key
    elif cfg.provider == "qwen":
        base_url = settings.qwen_base_url
        api_key = settings.dashscope_api_key
    else:
        raise ValueError(f"Unknown provider: {cfg.provider}")

    return RateLimitedChatOpenAI(
        model=cfg.model,
        base_url=base_url,
        api_key=api_key,
        temperature=cfg.temperature,
        max_tokens=cfg.max_tokens,
        timeout=cfg.timeout,
        streaming=streaming,
        http_async_client=_HTTP_CLIENT,  # 绕过 Windows 系统代理
    )
