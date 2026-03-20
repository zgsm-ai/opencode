/**
 * TreeSitter服务 - Bun适配版本
 * 提供统一的TreeSitter解析器接口，支持多种编程语言的AST解析
 * 使用lazy加载避免构建时解析WASM路径
 */

import { Parser, Language, Tree } from 'web-tree-sitter';
import { fileURLToPath } from 'url';
import { lazy } from '@/util/lazy';
import { Log } from '@/util/log';

const log = Log.create({ service: 'tree-sitter' });

// 导出类型定义
export type { Language, Tree, Parser } from 'web-tree-sitter';

/**
 * 解析WASM资源路径（复用项目现有机制）
 */
const resolveWasm = (asset: string) => {
  if (asset.startsWith('file://')) return fileURLToPath(asset);
  if (asset.startsWith('/') || /^[a-z]:/i.test(asset)) return asset;
  const url = new URL(asset, import.meta.url);
  return fileURLToPath(url);
};

/**
 * 语言到文件扩展名的映射
 */
export const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  python: ['.py', '.pyw'],
  java: ['.java'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  typescript: ['.ts', '.tsx'],
  go: ['.go'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.h', '.hh', '.hxx'],
  c: ['.c', '.h'],
  rust: ['.rs'],
  ruby: ['.rb', '.rake', '.gemspec'],
  php: ['.php', '.phtml', '.php5', '.php7', '.phps'],
  perl: ['.pl', '.pm', '.perl', '.t'],
};

/**
 * 扩展名到语言的反向映射
 */
export const EXTENSION_TO_LANGUAGE: Record<string, string> = {};
for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
  for (const ext of exts) {
    EXTENSION_TO_LANGUAGE[ext] = lang;
  }
}

/**
 * 延迟加载Python语言
 */
const loadPython = lazy(async () => {
  const { default: pythonWasm } = await import('tree-sitter-python/tree-sitter-python.wasm' as string, {
    with: { type: 'wasm' },
  });
  return await Language.load(resolveWasm(pythonWasm));
});

/**
 * 延迟加载Java语言
 */
const loadJava = lazy(async () => {
  const { default: javaWasm } = await import('tree-sitter-java/tree-sitter-java.wasm' as string, {
    with: { type: 'wasm' },
  });
  return await Language.load(resolveWasm(javaWasm));
});

/**
 * 延迟加载JavaScript语言
 */
const loadJavaScript = lazy(async () => {
  const { default: jsWasm } = await import('tree-sitter-javascript/tree-sitter-javascript.wasm' as string, {
    with: { type: 'wasm' },
  });
  return await Language.load(resolveWasm(jsWasm));
});

/**
 * 延迟加载TypeScript语言
 */
const loadTypeScript = lazy(async () => {
  const { default: tsWasm } = await import('tree-sitter-typescript/tree-sitter-typescript.wasm' as string, {
    with: { type: 'wasm' },
  });
  return await Language.load(resolveWasm(tsWasm));
});

/**
 * 延迟加载Go语言
 */
const loadGo = lazy(async () => {
  const { default: goWasm } = await import('tree-sitter-go/tree-sitter-go.wasm' as string, {
    with: { type: 'wasm' },
  });
  return await Language.load(resolveWasm(goWasm));
});

/**
 * 延迟加载C语言
 */
const loadC = lazy(async () => {
  const { default: cWasm } = await import('tree-sitter-c/tree-sitter-c.wasm' as string, {
    with: { type: 'wasm' },
  });
  return await Language.load(resolveWasm(cWasm));
});

/**
 * 延迟加载C++语言
 */
const loadCpp = lazy(async () => {
  const { default: cppWasm } = await import('tree-sitter-cpp/tree-sitter-cpp.wasm' as string, {
    with: { type: 'wasm' },
  });
  return await Language.load(resolveWasm(cppWasm));
});

/**
 * 延迟加载Rust语言
 */
const loadRust = lazy(async () => {
  const { default: rustWasm } = await import('tree-sitter-rust/tree-sitter-rust.wasm' as string, {
    with: { type: 'wasm' },
  });
  return await Language.load(resolveWasm(rustWasm));
});

/**
 * 延迟加载Ruby语言
 */
const loadRuby = lazy(async () => {
  const { default: rubyWasm } = await import('tree-sitter-ruby/tree-sitter-ruby.wasm' as string, {
    with: { type: 'wasm' },
  });
  return await Language.load(resolveWasm(rubyWasm));
});

/**
 * 延迟加载PHP语言
 */
const loadPhp = lazy(async () => {
  const { default: phpWasm } = await import('tree-sitter-php/tree-sitter-php.wasm' as string, {
    with: { type: 'wasm' },
  });
  return await Language.load(resolveWasm(phpWasm));
});

/**
 * 延迟加载Perl语言
 * 固定使用仓库内置 wasm，保证离线可用
 */
const loadPerl = lazy(async () => {
  const { default: perlWasm } = await import('../wasm/tree-sitter-perl.wasm' as string, {
    with: { type: 'wasm' },
  });
  return await Language.load(resolveWasm(perlWasm));
});



/**
 * 延迟初始化Parser
 */
const initParser = lazy(async () => {
  const { default: treeWasm } = await import('web-tree-sitter/tree-sitter.wasm' as string, {
    with: { type: 'wasm' },
  });
  const treePath = resolveWasm(treeWasm);

  await Parser.init({
    locateFile() {
      return treePath;
    },
  });
});

/**
 * TreeSitter服务类
 * 提供解析器初始化、语言加载和代码解析功能
 */
export class TreeSitterService {
  /**
   * 加载指定语言的WASM文件
   * @param language - 语言标识符（如 'python', 'javascript'）
   * @returns 语言对象
   */
  async loadLanguage(language: string): Promise<Language> {
    log.debug('Loading language', { language });

    // 确保Parser已初始化
    await initParser();

    // 根据语言类型加载对应的WASM
    // lazy() 返回的函数调用后返回 Promise，必须 await
    switch (language) {
      case 'python':
        return await loadPython();
      case 'java':
        return await loadJava();
      case 'javascript':
        return await loadJavaScript();
      case 'typescript':
        return await loadTypeScript();
      case 'go':
        return await loadGo();
      case 'c':
        return await loadC();
      case 'cpp':
        return await loadCpp();
      case 'rust':
        return await loadRust();
      case 'ruby':
        return await loadRuby();
      case 'php':
        return await loadPhp();
      case 'perl':
        return await loadPerl();
      default:
        log.error('Unsupported language', { language });
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  /**
   * 从文件路径获取语言标识符
   * @param filePath - 文件路径
   * @returns 语言标识符，如果不支持则返回 undefined
   */
  getLanguageFromPath(filePath: string): string | undefined {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    return EXTENSION_TO_LANGUAGE[ext];
  }

  /**
   * 创建配置好的解析器
   * @param language - 语言标识符
   * @returns 配置好的Parser实例
   */
  async createParser(language: string): Promise<Parser> {
    const lang = await this.loadLanguage(language);
    const parser = new Parser();
    parser.setLanguage(lang);
    return parser;
  }

  /**
   * 解析源代码并返回AST
   * @param sourceCode - 源代码
   * @param filePath - 文件路径（用于确定语言）
   * @returns Tree对象，如果解析失败或语言不支持则返回 null
   */
  async parseSourceCode(sourceCode: string, filePath: string): Promise<Tree | null> {
    const language = this.getLanguageFromPath(filePath);
    if (!language) {
      return null;
    }

    try {
      const parser = await this.createParser(language);
      const tree = parser.parse(sourceCode);
      log.debug('Source code parsed successfully', { filePath, language });
      return tree;
    } catch (error) {
      log.error('Failed to parse source code', {
        filePath,
        language,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
}

/**
 * 全局单例实例
 */
export const treeSitterService = new TreeSitterService();
