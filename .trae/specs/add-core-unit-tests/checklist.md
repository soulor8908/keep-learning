# 验收清单：核心模块单元测试

> change-id: `add-core-unit-tests`
> 实施完成后逐项打勾。任何一项未通过即不可交付。

## 基础设施

- [ ] `package.json` 含 `vitest` 与 `happy-dom` devDependencies。
- [ ] `npm test` / `npm run test:run` / `npm run test:ci` 三个脚本存在。
- [ ] `vitest.config.js` 存在且 `include` 指向 `wc/**/__tests__/*.test.js`。
- [ ] `npm run test:run` 退出码为 0。

## 测试文件存在性

- [ ] `wc/widget-bus/__tests__/bus.test.js`
- [ ] `wc/widget-scope/__tests__/scope.test.js`
- [ ] `wc/widget-scope/__tests__/nesting.integration.test.js`
- [ ] `wc/widget-loader/__tests__/semver.test.js`
- [ ] `wc/widget-loader/__tests__/checkDependencies.test.js`

## widget-bus 覆盖

- [ ] emit/on 基本收发
- [ ] 取消订阅函数生效
- [ ] once 仅一次
- [ ] handler 抛异常不阻断其他监听器 + console.error 文案
- [ ] createBus 命名空间隔离
- [ ] 默认总线事件名前缀 `bi-widget-bus:`
- [ ] bubbles/composed 选项透传

## widget-scope 基础覆盖

- [ ] name 必填校验
- [ ] meta 冻结
- [ ] isWidgetScope 判定（正/反例）
- [ ] log 前缀
- [ ] request 调用 fetch
- [ ] request 拦截器注入 headers
- [ ] 拦截器抛错不阻断
- [ ] scope 对象冻结

## widget-scope 嵌套循环检测覆盖（核心）

- [ ] 直接自引用抛错 + 链路含 `A -> A`
- [ ] A→B→A 祖先链回环抛错 + 链路含 `A -> B -> A`
- [ ] A→B→C→A 多级传播抛错 + 链路含 `A -> B -> C -> A`
- [ ] 无环嵌套不抛错
- [ ] pendingAncestors 消费后清除

## semver satisfies 覆盖

- [ ] `^2.6.0` 边界
- [ ] `^0.0.3` 0.0.x 收紧
- [ ] `^0.2.0` 0.x 收紧
- [ ] `~1.2.3`
- [ ] `>=2.6.0 <3.0.0` AND 复合
- [ ] `||` 或范围
- [ ] `*` 与空范围
- [ ] 精确版本 `=` 与无操作符
- [ ] 预发布版本比较
- [ ] `v` / `=` 前缀清洗

## checkDependencies 覆盖

- [ ] vueVersion='none' 跳过
- [ ] Vue2 缺失抛错
- [ ] Vue2 版本不兼容抛错
- [ ] Vue2 版本兼容不抛错
- [ ] Vue3 兼容不抛错
- [ ] Vue3 缺失抛错
- [ ] err.code === 'DEP_VERSION_MISMATCH'
- [ ] err.details 是数组

## 不变性约束

- [ ] `wc/` 下所有源码文件 `git diff` 为空（未改动被测代码）
- [ ] 未引入除 `vitest` / `happy-dom` 外的新依赖
- [ ] 用例总数 ≥ 40
