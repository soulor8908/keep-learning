// XSS 场景 fixture：mount 抛出含 HTML 的错误消息，错误降级必须以纯文本渲染
export default {
  mount() {
    throw new Error('<img src=x onerror=globalThis.__xss=1>');
  }
};
