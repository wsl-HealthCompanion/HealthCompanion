"""
检查配置和 API Key
"""
from app.config import settings, AGENT_REGISTRY

print("=== 配置检查 ===")
print(f"DeepSeek API Key: {settings.deepseek_api_key[:10]}... (长度: {len(settings.deepseek_api_key)})")
print(f"DeepSeek Base URL: {settings.deepseek_base_url}")
print(f"DashScope API Key: {settings.dashscope_api_key[:10]}... (长度: {len(settings.dashscope_api_key)})")
print(f"Milvus Address: {settings.milvus_address}")

print("\n=== Agent Registry ===")
for name, cfg in AGENT_REGISTRY.items():
    status = "启用" if cfg.enabled else "禁用"
    print(f"{name}: {status} | {cfg.provider} | {cfg.model}")

print("\n=== 检查结果 ===")
if settings.deepseek_api_key == "placeholder":
    print("警告: DEEPSEEK_API_KEY 还是 placeholder")
    print("\n请在 .env 文件中填入真实的 DeepSeek API Key:")
    print("  1. 访问 https://platform.deepseek.com")
    print("  2. 创建 API Key")
    print("  3. 编辑 ai-service/.env,替换 DEEPSEEK_API_KEY=placeholder")
    print("  4. 重新运行测试")
else:
    print("✓ DeepSeek API Key 已配置")

if settings.dashscope_api_key == "placeholder":
    print("警告: DASHSCOPE_API_KEY 还是 placeholder (RAG embedding需要)")
else:
    print("✓ DashScope API Key 已配置")
