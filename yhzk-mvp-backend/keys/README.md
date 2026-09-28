# keys/

JWT RS256 密钥对不纳入 Git（已在 .gitignore 排除 *.pem）。

生成方式：
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

私钥只放服务器 `.env` 指向的路径，严禁提交仓库或写入文档。
