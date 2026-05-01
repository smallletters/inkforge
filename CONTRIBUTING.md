# 贡献指南

欢迎贡献代码！请仔细阅读以下指南，确保你的贡献符合项目规范。

## 📋 贡献流程

### 1. Fork 仓库

点击 GitHub 页面右上角的 "Fork" 按钮，将仓库克隆到你的账户。

### 2. 克隆仓库

```bash
git clone https://github.com/yourusername/inkforge.git
cd inkforge
```

### 3. 创建分支

```bash
# 创建特性分支
git checkout -b feature/your-feature-name

# 或者修复分支
git checkout -b fix/issue-number
```

### 4. 安装依赖

```bash
# 前端
cd packages/frontend
pnpm install

# 后端
cd packages/backend
pip install -r requirements.txt
```

### 5. 开发和测试

```bash
# 前端开发
pnpm dev

# 前端测试
pnpm test

# 后端开发
uvicorn main:app --reload

# 后端测试
pytest
```

### 6. 提交代码

```bash
# 查看更改
git status

# 添加文件
git add .

# 提交更改（使用规范的 commit 信息）
git commit -m "feat: 添加新功能描述"
```

### 7. 推送分支

```bash
git push origin feature/your-feature-name
```

### 8. 创建 Pull Request

在 GitHub 上打开你的分支页面，点击 "Compare & pull request"。

## ✅ 代码规范

### 前端规范

- 使用 TypeScript
- 使用 ESLint 进行代码检查
- 使用 Prettier 进行代码格式化
- 组件命名使用 PascalCase
- 文件命名使用 kebab-case

### 后端规范

- 使用 Python 3.12+
- 使用 Black 进行代码格式化
- 使用 isort 进行导入排序
- 函数命名使用 snake_case
- 类命名使用 PascalCase

### Commit 信息规范

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Type 类型：**
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构（既不新增功能也不修复 bug）
- `test`: 测试相关
- `chore`: 构建/工具相关

**示例：**
```
feat(auth): 添加用户注册功能

- 实现邮箱注册接口
- 添加密码加密逻辑
- 更新用户模型
```

## 🔧 开发环境

### 环境变量

复制 `.env.example` 并修改配置：

```bash
cp .env.example .env
```

### Docker 开发

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 📝 编写测试

### 前端测试

```bash
cd packages/frontend
pnpm test
```

### 后端测试

```bash
cd packages/backend
pytest tests/
```

## 📌 Issue 规范

### Bug 报告

```markdown
**问题描述**
清晰描述问题现象

**复现步骤**
1. 步骤一
2. 步骤二
3. 步骤三

**预期行为**
描述期望的结果

**实际行为**
描述实际发生的情况

**截图/日志**
如有需要，提供截图或错误日志
```

### 功能请求

```markdown
**功能描述**
清晰描述需要的功能

**使用场景**
描述该功能的使用场景

**参考资料**
如有相关参考链接或设计稿，请提供
```

## 📞 联系方式

如有问题或建议，欢迎通过以下方式联系：

- 提交 Issue
- 发送邮件：<smallletters@sina.com>

感谢你的贡献！🎉