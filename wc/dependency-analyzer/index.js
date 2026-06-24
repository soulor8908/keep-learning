#!/usr/bin/env node
/**
 * 依赖冲突分析器
 *
 * 分析多个物料项目的依赖，检测版本冲突，并推荐哪些依赖适合由基座统一提供（external）。
 *
 * 用法：
 *   node wc/dependency-analyzer/index.js <project-dir-1> [project-dir-2] ...
 *
 * 示例：
 *   node wc/dependency-analyzer/index.js demo/vue2-widget-lib demo/vue3-widget-lib
 */

const fs = require('fs');
const path = require('path');

function readPackageJson(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
}

/**
 * 解析声明的依赖版本，处理特殊协议：
 * - workspace:* / workspace:^ / workspace:~ -> 标记为 workspace 协议，实际版本读 node_modules
 * - npm:vue3@3.4.21 (npm alias) -> 提取实际包名与版本
 * - link:./path / file:./path -> 标记为本地链接，实际版本读 node_modules
 * @param {string} declared 原始声明的版本字符串
 * @returns {{raw: string, protocol?: string, aliasName?: string, aliasVersion?: string}}
 */
function resolveDeclaredVersion(declared) {
  const raw = String(declared || '');
  // workspace 协议（pnpm/yarn monorepo）
  if (raw.startsWith('workspace:')) {
    return { raw, protocol: 'workspace' };
  }
  // link:/file: 本地链接
  if (raw.startsWith('link:') || raw.startsWith('file:')) {
    return { raw, protocol: 'link' };
  }
  // npm alias：npm:<real-pkg>@<version>
  const aliasMatch = raw.match(/^npm:([^@]+)@(.+)$/);
  if (aliasMatch) {
    return {
      raw,
      protocol: 'alias',
      aliasName: aliasMatch[1],
      aliasVersion: aliasMatch[2]
    };
  }
  return { raw };
}

function getInstalledVersion(projectDir, depName) {
  // 优先读取项目自身 node_modules
  const projectModulePkg = path.join(projectDir, 'node_modules', depName, 'package.json');
  if (fs.existsSync(projectModulePkg)) {
    return JSON.parse(fs.readFileSync(projectModulePkg, 'utf-8')).version;
  }

  // 回退到 monorepo 根目录 node_modules
  const rootModulePkg = path.join(process.cwd(), 'node_modules', depName, 'package.json');
  if (fs.existsSync(rootModulePkg)) {
    return JSON.parse(fs.readFileSync(rootModulePkg, 'utf-8')).version;
  }

  return null;
}

function collectDeps(projectDir) {
  const pkg = readPackageJson(projectDir);
  if (!pkg) {
    throw new Error(`未找到 ${path.join(projectDir, 'package.json')}`);
  }

  // 只收集运行时依赖；devDependencies（构建工具等）不应 external
  const allDeps = { ...pkg.dependencies };

  const result = {
    name: pkg.name,
    dir: projectDir,
    version: pkg.version,
    dependencies: {}
  };

  Object.keys(allDeps).forEach(depName => {
    const resolved = resolveDeclaredVersion(allDeps[depName]);
    // npm alias 场景：声明的 depName 是别名，实际包名是 resolved.aliasName
    // 读取已安装版本时需用实际包名查找 node_modules
    const lookupName = resolved.aliasName || depName;
    result.dependencies[depName] = {
      declared: resolved.raw,
      // alias 协议下，声明的版本即 aliasVersion（更准确）；其余读 node_modules
      installed: resolved.aliasVersion || getInstalledVersion(projectDir, lookupName),
      protocol: resolved.protocol || null,
      aliasName: resolved.aliasName || null
    };
  });

  return result;
}

function analyze(projects) {
  const projectDeps = projects.map(collectDeps);

  // 按依赖名聚合
  const depMap = {};
  projectDeps.forEach(project => {
    Object.entries(project.dependencies).forEach(([depName, info]) => {
      if (!depMap[depName]) {
        depMap[depName] = [];
      }
      depMap[depName].push({
        project: project.name,
        dir: project.dir,
        declared: info.declared,
        installed: info.installed,
        protocol: info.protocol,
        aliasName: info.aliasName
      });
    });
  });

  // 检测冲突
  const conflicts = [];
  const commonDeps = [];

  Object.entries(depMap).forEach(([depName, usages]) => {
    if (usages.length > 1) {
      const installedVersions = [...new Set(usages.map(u => u.installed).filter(Boolean))];
      commonDeps.push({ depName, usages, installedVersions });

      if (installedVersions.length > 1) {
        conflicts.push({ depName, usages, installedVersions });
      }
    }
  });

  return { projectDeps, depMap, conflicts, commonDeps };
}

function generateVueManifest(projectDeps) {
  const manifest = {};
  projectDeps.forEach(project => {
    const vueInfo = project.dependencies.vue;
    if (vueInfo && vueInfo.installed) {
      const major = vueInfo.installed.split('.')[0];
      manifest[project.name] = {
        vueVersion: vueInfo.installed,
        vueGlobal: `Vue${major}`
      };
    }
  });
  return manifest;
}

function printReport(analysis) {
  const { projectDeps, conflicts, commonDeps } = analysis;

  console.log('\n========== 项目依赖概览 ==========');
  projectDeps.forEach(project => {
    console.log(`\n📦 ${project.name} (${project.dir})`);
    console.log(`   总依赖数: ${Object.keys(project.dependencies).length}`);
    const vueInfo = project.dependencies.vue;
    if (vueInfo) {
      console.log(`   Vue 版本: declared=${vueInfo.declared}, installed=${vueInfo.installed}`);
    }
  });

  console.log('\n========== 公共依赖（出现在多个项目） ==========');
  if (commonDeps.length === 0) {
    console.log('无');
  } else {
    commonDeps.forEach(({ depName, usages, installedVersions }) => {
      const hasConflict = installedVersions.length > 1;
      const icon = hasConflict ? '🔴' : '🟢';
      console.log(`\n${icon} ${depName}`);
      usages.forEach(u => {
        const protoTag = u.protocol ? ` [${u.protocol}]` : '';
        console.log(`   ${u.project}: declared=${u.declared}${protoTag}, installed=${u.installed || '未安装'}`);
      });
      if (hasConflict) {
        console.log(`   ⚠️  版本冲突: ${installedVersions.join(' vs ')}`);
      }
    });
  }

  console.log('\n========== 冲突依赖汇总 ==========');
  if (conflicts.length === 0) {
    console.log('✅ 未发现版本冲突');
  } else {
    conflicts.forEach(({ depName, installedVersions }) => {
      console.log(`🔴 ${depName}: ${installedVersions.join(' vs ')}`);
    });
  }

  console.log('\n========== 推荐 external 依赖 ==========');
  // 排除项目自身的包名（dependencies 里不会出现自身，但防御性处理）
  const projectNames = new Set(projectDeps.map(p => p.name).filter(Boolean));
  // 只推荐 dependencies（运行时依赖），devDependencies 如构建工具不应 external
  const runtimeCommonDeps = commonDeps.filter(({ depName }) => !projectNames.has(depName));
  const recommendedExternals = runtimeCommonDeps.map(({ depName }) => depName);

  if (recommendedExternals.length === 0) {
    console.log('无');
  } else {
    recommendedExternals.forEach(dep => {
      console.log(`   - ${dep}`);
    });
    console.log('\n建议：把以上运行时依赖声明为 external，由基座统一提供，避免重复打包和版本冲突。');
  }

  console.log('\n========== Vue 运行时 manifest（供基座自动注入） ==========');
  const vueManifest = generateVueManifest(projectDeps);
  console.log(JSON.stringify(vueManifest, null, 2));

  return { conflicts, recommendedExternals };
}

function main() {
  const projectDirs = process.argv.slice(2);
  if (projectDirs.length === 0) {
    console.log('用法：node wc/dependency-analyzer/index.js <project-dir-1> [project-dir-2] ...');
    process.exit(1);
  }

  const missing = projectDirs.filter(dir => !fs.existsSync(path.resolve(dir)));
  if (missing.length > 0) {
    console.error(`路径不存在: ${missing.join(', ')}`);
    process.exit(1);
  }

  const resolvedDirs = projectDirs.map(dir => path.resolve(dir));
  const analysis = analyze(resolvedDirs);
  const report = printReport(analysis);

  process.exit(report.conflicts.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { analyze, collectDeps, generateVueManifest };
