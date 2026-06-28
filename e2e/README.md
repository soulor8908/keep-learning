# E2E 测试

覆盖新的 `demo/host` 基座，验证 Vue2 / Vue3 / H5 物料在同一页面共存。

## 运行

```bash
pnpm e2e
```

测试会自动构建物料并启动 host dev server（端口 5000）。

## 测试用例

- `host.spec.js`：验证三种技术栈物料都能渲染，且页面无未捕获异常。
