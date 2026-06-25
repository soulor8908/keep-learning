// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_VUE = path.resolve(__dirname, 'fixtures/sample-component.vue');

// cli.js 为 CommonJS（require fs/path），vitest 通过 CJS interop 桥接；
// require.main === module 守卫确保 import 时不自动执行 main()。
const cli = await import('../cli.js');
const { WIDGET_NAME_RE, callAI, buildPrompt, main } = cli;

describe('wc/ai-assistant/cli', () => {
  let originalFetch;
  let originalArgv;
  let originalEnv;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalArgv = process.argv;
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.argv = originalArgv;
    // 恢复 env
    for (const k of ['AI_API_KEY', 'AI_API_URL', 'AI_MODEL']) {
      if (k in originalEnv) process.env[k] = originalEnv[k];
      else delete process.env[k];
    }
    vi.restoreAllMocks();
  });

  describe('WIDGET_NAME_RE 路径穿越拒收', () => {
    it('拒收 ../ 路径穿越', () => {
      expect(WIDGET_NAME_RE.test('../evil')).toBe(false);
    });

    it('拒收绝对路径 /abs/path', () => {
      expect(WIDGET_NAME_RE.test('/abs/path')).toBe(false);
      expect(WIDGET_NAME_RE.test('/etc/passwd')).toBe(false);
    });

    it('拒收空字符串', () => {
      expect(WIDGET_NAME_RE.test('')).toBe(false);
    });

    it('拒收含特殊字符的名（如 bi-../evil）', () => {
      expect(WIDGET_NAME_RE.test('bi-../evil')).toBe(false);
      expect(WIDGET_NAME_RE.test('bi..evil')).toBe(false);
      expect(WIDGET_NAME_RE.test('bi evil')).toBe(false); // 空格
      expect(WIDGET_NAME_RE.test('bi/evil')).toBe(false); // 斜杠
      expect(WIDGET_NAME_RE.test('bi\\evil')).toBe(false); // 反斜杠
      expect(WIDGET_NAME_RE.test('Bi-Evil')).toBe(false); // 大写
      expect(WIDGET_NAME_RE.test('bi.evil')).toBe(false); // 点
      expect(WIDGET_NAME_RE.test('bi;evil')).toBe(false); // 分号
    });

    it('拒收 Windows 绝对路径', () => {
      expect(WIDGET_NAME_RE.test('C:/evil')).toBe(false);
      expect(WIDGET_NAME_RE.test('C:\\evil')).toBe(false);
    });
  });

  describe('WIDGET_NAME_RE 合法名接收', () => {
    it('接收 bi-sales-panel', () => {
      expect(WIDGET_NAME_RE.test('bi-sales-panel')).toBe(true);
    });

    it('接收 bi-orders-panel', () => {
      expect(WIDGET_NAME_RE.test('bi-orders-panel')).toBe(true);
    });

    it('接收纯小写字母', () => {
      expect(WIDGET_NAME_RE.test('widget')).toBe(true);
    });

    it('接收含数字', () => {
      expect(WIDGET_NAME_RE.test('bi-123')).toBe(true);
      expect(WIDGET_NAME_RE.test('widget2')).toBe(true);
    });
  });

  describe('callAI 未配置 AI_API_KEY', () => {
    it('仅打印 Prompt 不发请求（fetch 未被调用）', async () => {
      delete process.env.AI_API_KEY;
      globalThis.fetch = vi.fn();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await callAI('PROMPT_CONTENT');

      expect(result).toBe('');
      expect(globalThis.fetch).not.toHaveBeenCalled();
      // 打印了 prompt
      const logged = logSpy.mock.calls.map(c => c[0]).join('\n');
      expect(logged).toContain('PROMPT_CONTENT');
      expect(logged).toContain('AI_API_KEY');
    });
  });

  describe('callAI 配置 AI_API_KEY', () => {
    it('以正确 URL/headers/body 调用 fetch 并返回 content', async () => {
      process.env.AI_API_KEY = 'sk-test-key';
      process.env.AI_API_URL = 'https://api.example.com/v1/chat';
      process.env.AI_MODEL = 'gpt-test';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'AI_RESULT' } }] })
      });

      const result = await callAI('the prompt');

      expect(result).toBe('AI_RESULT');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = globalThis.fetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/v1/chat');
      expect(opts.method).toBe('POST');
      expect(opts.headers.Authorization).toBe('Bearer sk-test-key');
      expect(opts.headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(opts.body);
      expect(body.model).toBe('gpt-test');
      expect(body.messages[1].content).toBe('the prompt');
    });

    it('非 2xx 响应抛错', async () => {
      process.env.AI_API_KEY = 'sk-test-key';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'rate limited'
      });
      await expect(callAI('p')).rejects.toThrow(/AI 接口请求失败.*429/);
    });

    it('返回空 content 抛错', async () => {
      process.env.AI_API_KEY = 'sk-test-key';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '' } }] })
      });
      await expect(callAI('p')).rejects.toThrow(/AI 接口返回为空/);
    });
  });

  describe('buildPrompt', () => {
    it('组合系统提示词 + 组件名 + 组件代码', () => {
      // 使用真实 prompts（migrate-component.txt）+ fixture 组件
      const prompt = buildPrompt('migrate', 'bi-test-widget', FIXTURE_VUE);
      expect(prompt).toContain('bi-test-widget');
      expect(prompt).toContain('SampleComponent'); // fixture 内容
      expect(prompt).toContain('```vue');
    });

    it('migrate 提示词包含 config 与 props 双模兼容说明', () => {
      const prompt = buildPrompt('migrate', 'bi-test-widget', FIXTURE_VUE);
      // 验证新提示词涵盖 props 模式与 config 模式
      expect(prompt).toContain('props 模式');
      expect(prompt).toContain('config 模式');
      expect(prompt).toContain('不要为已有独立 props 的组件强行新增 config prop');
    });

    it('schema 任务加载 generate-schema 提示词', () => {
      const prompt = buildPrompt('schema', 'bi-test', FIXTURE_VUE);
      expect(prompt).toContain('bi-test');
      expect(prompt).toContain('```vue');
    });
  });

  describe('main 文件写回路径校验', () => {
    it('非法 widget 名触发 exit 且不写文件（路径穿越被正则拦下）', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      globalThis.fetch = vi.fn();
      process.argv = ['node', 'cli.js', 'migrate', '../evil', FIXTURE_VUE];

      await expect(main()).rejects.toThrow('process.exit(1)');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(writeSpy).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('未配置 AI_API_KEY 时合法任务不写文件（占位模式）', async () => {
      delete process.env.AI_API_KEY;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      globalThis.fetch = vi.fn();
      process.argv = ['node', 'cli.js', 'migrate', 'bi-safe-widget', FIXTURE_VUE];

      await main();

      expect(exitSpy).not.toHaveBeenCalled();
      expect(writeSpy).not.toHaveBeenCalled(); // 占位模式 result='' 不写
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('配置 AI_API_KEY 时写回 `${widgetName}.vue`，路径不越界', async () => {
      process.env.AI_API_KEY = 'sk-test';
      process.env.AI_API_URL = 'https://api.example.com/v1/chat';
      process.env.AI_MODEL = 'gpt-test';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'MIGRATED_CODE' } }] })
      });
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      process.argv = ['node', 'cli.js', 'migrate', 'bi-safe-widget', FIXTURE_VUE];

      await main();

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const [outPath, content] = writeSpy.mock.calls[0];
      // 输出路径仅为 `bi-safe-widget.vue`（无目录分隔符、无 ..）
      expect(outPath).toBe('bi-safe-widget.vue');
      expect(content).toBe('MIGRATED_CODE');
      expect(outPath).not.toMatch(/[/\\]|\.\./);
    });

    it('schema 任务写回 `${widgetName}.schema.json`', async () => {
      process.env.AI_API_KEY = 'sk-test';
      process.env.AI_API_URL = 'https://api.example.com/v1/chat';
      process.env.AI_MODEL = 'gpt-test';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"x":1}' } }] })
      });
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      process.argv = ['node', 'cli.js', 'schema', 'bi-safe', FIXTURE_VUE];

      await main();

      expect(writeSpy.mock.calls[0][0]).toBe('bi-safe.schema.json');
    });

    it('缺参数时打印 Usage 并 exit(1)', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      process.argv = ['node', 'cli.js'];

      await expect(main()).rejects.toThrow('process.exit(1)');
      const logged = logSpy.mock.calls.map(c => c[0]).join('\n');
      expect(logged).toContain('Usage');
    });
  });
});
