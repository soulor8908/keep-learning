/* Verify internal links & anchors in markdown docs using markdown-it + github-slugger. */
const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');
const GithubSlugger = require('github-slugger').default;

const DOCS_DIR = '/workspace/docs';
const files = [
  path.join(DOCS_DIR, 'elementui-on-demand-loading.md'),
  path.join(DOCS_DIR, 'elementui-migration-strategy.md'),
];

// Collect headings (slugger reset per file to mimic GitHub behavior)
function collectHeadings(md, src) {
  const slugger = new GithubSlugger();
  const headings = new Set();
  const tokens = md.parse(src, {});
  const walk = (toks) => {
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type === 'heading_open') {
        const inline = toks[i + 1];
        let text = '';
        if (inline && inline.type === 'inline' && inline.children) {
          text = inline.children.map(c => c.content || '').join('');
        }
        headings.add(slugger.slug(text));
      }
      if (t.children) walk(t.children);
    }
  };
  walk(tokens);
  return headings;
}

let totalIssues = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf-8');
  const md = new MarkdownIt({ html: true });
  const headings = collectHeadings(md, src);

  const issues = [];
  const tokens = md.parse(src, {});
  const links = [];
  const walk = (toks) => {
    for (const t of toks) {
      if (t.type === 'inline' && t.children) {
        for (const c of t.children) {
          if (c.type === 'link_open') {
            const href = c.attrs.find(a => a[0] === 'href');
            if (href) links.push(href[1]);
          }
        }
      }
      if (t.children) walk(t.children);
    }
  };
  walk(tokens);

  for (const href of links) {
    if (!href) continue;
    if (/^(https?:|mailto:|ftp:|\/\/)/i.test(href)) continue;

    let targetFile = file;
    let anchor = null;

    if (href.startsWith('#')) {
      anchor = href.slice(1);
    } else {
      const hashIdx = href.indexOf('#');
      let relPath = href;
      if (hashIdx >= 0) {
        relPath = href.slice(0, hashIdx);
        anchor = href.slice(hashIdx + 1);
      }
      if (relPath) {
        const resolved = path.resolve(path.dirname(file), relPath);
        targetFile = resolved;
        if (!fs.existsSync(resolved)) {
          issues.push(`BROKEN FILE LINK: [${href}] -> ${resolved} (file not found)`);
          continue;
        }
      }
    }

    if (anchor) {
      // markdown-it percent-encodes non-ASCII in href; github-slugger keeps raw CJK.
      // Decode so we compare apples to apples (mirrors browser fragment matching).
      let decoded = anchor;
      try { decoded = decodeURIComponent(anchor); } catch (_) { /* keep raw */ }
      const candidates = [anchor, decoded];
      if (!candidates.some(c => headings.has(c))) {
        const closest = [...headings].filter(h => h.includes(decoded) || decoded.includes(h));
        issues.push(`BROKEN ANCHOR: [${href}] -> #${anchor} (not in headings${closest.length ? '; closest: ' + closest.join(', ') : ''})`);
      }
    }
  }

  console.log(`\n=== ${path.basename(file)} ===`);
  console.log(`headings (${headings.size}): ${[...headings].slice(0, 60).join(' | ')}`);
  console.log(`links checked: ${links.length}`);
  if (issues.length === 0) {
    console.log('OK: no broken internal links or anchors');
  } else {
    totalIssues += issues.length;
    issues.forEach(i => console.log('  - ' + i));
  }
}

console.log(`\nTOTAL INTERNAL-LINK ISSUES: ${totalIssues}`);
process.exit(totalIssues > 0 ? 1 : 0);
