# CourseLens

上传 PDF 课件，逐页 AI 解读 + 追问。

## 功能

- Qwen3.6 极致视觉推理能力
- 轻量、气泡极简、MacOS 暗色
- 选中文字直接追问
- 邻页解读 + Qwen低token消耗，极高性价比
- 自学与伴学的助手

## 技术栈

- 前端：Vite + React + TypeScript + Tailwind CSS
- 后端：FastAPI + PyMuPDF + DashScope

## （方式一）
## Docker 启动（recommend）

**1. 安装 Docker Desktop ，启动Docker Desktop**  

**2. 启动前后端**

```bash
docker compose up --build
```

**3. 打开浏览器**

```text
http://localhost:3000
```

**4. 停止服务**

```bash
docker compose down
```

说明：
- 前端：`http://localhost:3000`
- 后端：`http://localhost:8000`

## （方式二）
## 环境要求

- Node.js 18+
- Python 3.11+

## 1. 安装环境
  ```winget install OpenJS.NodeJS ```
  ``` winget install Python.Python.3.11```

**2. 启动后端**

```
双击 start_backend.bat
```

**3. 启动前端**

```
双击 start_frontend.bat
```

**4. 等待前后端环境安装**

**5. 打开浏览器**

```
http://localhost:3000
```


## demo

<img width="2559" height="1401" alt="image" src="https://github.com/user-attachments/assets/8d75cba6-eed8-4935-bcda-0dfcd45bfe08" />
<img width="2559" height="1405" alt="image" src="https://github.com/user-attachments/assets/2bcf0172-b014-4bf2-8f2e-c7d325e447e1" />
<img width="2559" height="1405" alt="image" src="https://github.com/user-attachments/assets/bed979ac-169b-4b4f-9c3a-2fd0e2fee349" />
<img width="2559" height="1400" alt="image" src="https://github.com/user-attachments/assets/f1d31d5a-1cd1-472b-b3a8-af859f8b6d1d" />

<img width="2559" height="1402" alt="image" src="https://github.com/user-attachments/assets/1e16873c-241c-4b33-8e07-781fadea6435" />
