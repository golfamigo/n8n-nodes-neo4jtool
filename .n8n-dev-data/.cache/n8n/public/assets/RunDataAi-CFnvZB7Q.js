import { cl as getDefaultExportFromCjs, d as defineComponent, ba as useClipboard, a as useToast, dG as useAIAssistantHelpers, bw as useNodeTypesStore, au as useNDVStore, a1 as useRootStore, dr as useAssistantStore, L as useUIStore, q as computed, dH as MAX_DISPLAY_DATA_SIZE, dI as isCommunityPackageName, c as useI18n, h as resolveComponent, cc as resolveDirective, i as createElementBlock, g as openBlock, k as createBaseVNode, f as createCommentVNode, aC as withDirectives, t as toDisplayString, j as createVNode, m as unref, dJ as InlineAskAssistantButton, w as withCtx, l as createTextVNode, F as Fragment, D as renderList, dK as NEW_ASSISTANT_SESSION_MODAL, ci as sanitizeHtml, bu as NodeConnectionTypes, dL as isObjectEmpty, r as ref, o as onMounted, n as normalizeClass, e as createBlock, b4 as VueMarkdown, _ as _export_sfc, b9 as N8nText, J as withModifiers, U as useWorkflowsStore, bC as _sfc_main$6, I as watch, bF as ElTree, B as normalizeStyle } from "./index-BolKFsR6.js";
import { d as capitalize } from "./useCanvasOperations-CZQ6BvKq.js";
import { u as useExecutionHelpers } from "./useExecutionHelpers-C7k4a6Dr.js";
var core;
var hasRequiredCore;
function requireCore() {
  if (hasRequiredCore) return core;
  hasRequiredCore = 1;
  function deepFreeze(obj) {
    if (obj instanceof Map) {
      obj.clear = obj.delete = obj.set = function() {
        throw new Error("map is read-only");
      };
    } else if (obj instanceof Set) {
      obj.add = obj.clear = obj.delete = function() {
        throw new Error("set is read-only");
      };
    }
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((name) => {
      const prop = obj[name];
      const type = typeof prop;
      if ((type === "object" || type === "function") && !Object.isFrozen(prop)) {
        deepFreeze(prop);
      }
    });
    return obj;
  }
  class Response {
    /**
     * @param {CompiledMode} mode
     */
    constructor(mode) {
      if (mode.data === void 0) mode.data = {};
      this.data = mode.data;
      this.isMatchIgnored = false;
    }
    ignoreMatch() {
      this.isMatchIgnored = true;
    }
  }
  function escapeHTML(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  }
  function inherit$1(original, ...objects) {
    const result = /* @__PURE__ */ Object.create(null);
    for (const key in original) {
      result[key] = original[key];
    }
    objects.forEach(function(obj) {
      for (const key in obj) {
        result[key] = obj[key];
      }
    });
    return (
      /** @type {T} */
      result
    );
  }
  const SPAN_CLOSE = "</span>";
  const emitsWrappingTags = (node) => {
    return !!node.scope;
  };
  const scopeToCSSClass = (name, { prefix }) => {
    if (name.startsWith("language:")) {
      return name.replace("language:", "language-");
    }
    if (name.includes(".")) {
      const pieces = name.split(".");
      return [
        `${prefix}${pieces.shift()}`,
        ...pieces.map((x, i) => `${x}${"_".repeat(i + 1)}`)
      ].join(" ");
    }
    return `${prefix}${name}`;
  };
  class HTMLRenderer {
    /**
     * Creates a new HTMLRenderer
     *
     * @param {Tree} parseTree - the parse tree (must support `walk` API)
     * @param {{classPrefix: string}} options
     */
    constructor(parseTree, options) {
      this.buffer = "";
      this.classPrefix = options.classPrefix;
      parseTree.walk(this);
    }
    /**
     * Adds texts to the output stream
     *
     * @param {string} text */
    addText(text) {
      this.buffer += escapeHTML(text);
    }
    /**
     * Adds a node open to the output stream (if needed)
     *
     * @param {Node} node */
    openNode(node) {
      if (!emitsWrappingTags(node)) return;
      const className = scopeToCSSClass(
        node.scope,
        { prefix: this.classPrefix }
      );
      this.span(className);
    }
    /**
     * Adds a node close to the output stream (if needed)
     *
     * @param {Node} node */
    closeNode(node) {
      if (!emitsWrappingTags(node)) return;
      this.buffer += SPAN_CLOSE;
    }
    /**
     * returns the accumulated buffer
    */
    value() {
      return this.buffer;
    }
    // helpers
    /**
     * Builds a span element
     *
     * @param {string} className */
    span(className) {
      this.buffer += `<span class="${className}">`;
    }
  }
  const newNode = (opts = {}) => {
    const result = { children: [] };
    Object.assign(result, opts);
    return result;
  };
  class TokenTree {
    constructor() {
      this.rootNode = newNode();
      this.stack = [this.rootNode];
    }
    get top() {
      return this.stack[this.stack.length - 1];
    }
    get root() {
      return this.rootNode;
    }
    /** @param {Node} node */
    add(node) {
      this.top.children.push(node);
    }
    /** @param {string} scope */
    openNode(scope) {
      const node = newNode({ scope });
      this.add(node);
      this.stack.push(node);
    }
    closeNode() {
      if (this.stack.length > 1) {
        return this.stack.pop();
      }
      return void 0;
    }
    closeAllNodes() {
      while (this.closeNode()) ;
    }
    toJSON() {
      return JSON.stringify(this.rootNode, null, 4);
    }
    /**
     * @typedef { import("./html_renderer").Renderer } Renderer
     * @param {Renderer} builder
     */
    walk(builder) {
      return this.constructor._walk(builder, this.rootNode);
    }
    /**
     * @param {Renderer} builder
     * @param {Node} node
     */
    static _walk(builder, node) {
      if (typeof node === "string") {
        builder.addText(node);
      } else if (node.children) {
        builder.openNode(node);
        node.children.forEach((child) => this._walk(builder, child));
        builder.closeNode(node);
      }
      return builder;
    }
    /**
     * @param {Node} node
     */
    static _collapse(node) {
      if (typeof node === "string") return;
      if (!node.children) return;
      if (node.children.every((el) => typeof el === "string")) {
        node.children = [node.children.join("")];
      } else {
        node.children.forEach((child) => {
          TokenTree._collapse(child);
        });
      }
    }
  }
  class TokenTreeEmitter extends TokenTree {
    /**
     * @param {*} options
     */
    constructor(options) {
      super();
      this.options = options;
    }
    /**
     * @param {string} text
     */
    addText(text) {
      if (text === "") {
        return;
      }
      this.add(text);
    }
    /** @param {string} scope */
    startScope(scope) {
      this.openNode(scope);
    }
    endScope() {
      this.closeNode();
    }
    /**
     * @param {Emitter & {root: DataNode}} emitter
     * @param {string} name
     */
    __addSublanguage(emitter, name) {
      const node = emitter.root;
      if (name) node.scope = `language:${name}`;
      this.add(node);
    }
    toHTML() {
      const renderer = new HTMLRenderer(this, this.options);
      return renderer.value();
    }
    finalize() {
      this.closeAllNodes();
      return true;
    }
  }
  function source(re) {
    if (!re) return null;
    if (typeof re === "string") return re;
    return re.source;
  }
  function lookahead(re) {
    return concat("(?=", re, ")");
  }
  function anyNumberOfTimes(re) {
    return concat("(?:", re, ")*");
  }
  function optional(re) {
    return concat("(?:", re, ")?");
  }
  function concat(...args) {
    const joined = args.map((x) => source(x)).join("");
    return joined;
  }
  function stripOptionsFromArgs(args) {
    const opts = args[args.length - 1];
    if (typeof opts === "object" && opts.constructor === Object) {
      args.splice(args.length - 1, 1);
      return opts;
    } else {
      return {};
    }
  }
  function either(...args) {
    const opts = stripOptionsFromArgs(args);
    const joined = "(" + (opts.capture ? "" : "?:") + args.map((x) => source(x)).join("|") + ")";
    return joined;
  }
  function countMatchGroups(re) {
    return new RegExp(re.toString() + "|").exec("").length - 1;
  }
  function startsWith(re, lexeme) {
    const match = re && re.exec(lexeme);
    return match && match.index === 0;
  }
  const BACKREF_RE = /\[(?:[^\\\]]|\\.)*\]|\(\??|\\([1-9][0-9]*)|\\./;
  function _rewriteBackreferences(regexps, { joinWith }) {
    let numCaptures = 0;
    return regexps.map((regex) => {
      numCaptures += 1;
      const offset = numCaptures;
      let re = source(regex);
      let out = "";
      while (re.length > 0) {
        const match = BACKREF_RE.exec(re);
        if (!match) {
          out += re;
          break;
        }
        out += re.substring(0, match.index);
        re = re.substring(match.index + match[0].length);
        if (match[0][0] === "\\" && match[1]) {
          out += "\\" + String(Number(match[1]) + offset);
        } else {
          out += match[0];
          if (match[0] === "(") {
            numCaptures++;
          }
        }
      }
      return out;
    }).map((re) => `(${re})`).join(joinWith);
  }
  const MATCH_NOTHING_RE = /\b\B/;
  const IDENT_RE = "[a-zA-Z]\\w*";
  const UNDERSCORE_IDENT_RE = "[a-zA-Z_]\\w*";
  const NUMBER_RE = "\\b\\d+(\\.\\d+)?";
  const C_NUMBER_RE = "(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)";
  const BINARY_NUMBER_RE = "\\b(0b[01]+)";
  const RE_STARTERS_RE = "!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~";
  const SHEBANG = (opts = {}) => {
    const beginShebang = /^#![ ]*\//;
    if (opts.binary) {
      opts.begin = concat(
        beginShebang,
        /.*\b/,
        opts.binary,
        /\b.*/
      );
    }
    return inherit$1({
      scope: "meta",
      begin: beginShebang,
      end: /$/,
      relevance: 0,
      /** @type {ModeCallback} */
      "on:begin": (m, resp) => {
        if (m.index !== 0) resp.ignoreMatch();
      }
    }, opts);
  };
  const BACKSLASH_ESCAPE = {
    begin: "\\\\[\\s\\S]",
    relevance: 0
  };
  const APOS_STRING_MODE = {
    scope: "string",
    begin: "'",
    end: "'",
    illegal: "\\n",
    contains: [BACKSLASH_ESCAPE]
  };
  const QUOTE_STRING_MODE = {
    scope: "string",
    begin: '"',
    end: '"',
    illegal: "\\n",
    contains: [BACKSLASH_ESCAPE]
  };
  const PHRASAL_WORDS_MODE = {
    begin: /\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/
  };
  const COMMENT = function(begin, end, modeOptions = {}) {
    const mode = inherit$1(
      {
        scope: "comment",
        begin,
        end,
        contains: []
      },
      modeOptions
    );
    mode.contains.push({
      scope: "doctag",
      // hack to avoid the space from being included. the space is necessary to
      // match here to prevent the plain text rule below from gobbling up doctags
      begin: "[ ]*(?=(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):)",
      end: /(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):/,
      excludeBegin: true,
      relevance: 0
    });
    const ENGLISH_WORD = either(
      // list of common 1 and 2 letter words in English
      "I",
      "a",
      "is",
      "so",
      "us",
      "to",
      "at",
      "if",
      "in",
      "it",
      "on",
      // note: this is not an exhaustive list of contractions, just popular ones
      /[A-Za-z]+['](d|ve|re|ll|t|s|n)/,
      // contractions - can't we'd they're let's, etc
      /[A-Za-z]+[-][a-z]+/,
      // `no-way`, etc.
      /[A-Za-z][a-z]{2,}/
      // allow capitalized words at beginning of sentences
    );
    mode.contains.push(
      {
        // TODO: how to include ", (, ) without breaking grammars that use these for
        // comment delimiters?
        // begin: /[ ]+([()"]?([A-Za-z'-]{3,}|is|a|I|so|us|[tT][oO]|at|if|in|it|on)[.]?[()":]?([.][ ]|[ ]|\))){3}/
        // ---
        // this tries to find sequences of 3 english words in a row (without any
        // "programming" type syntax) this gives us a strong signal that we've
        // TRULY found a comment - vs perhaps scanning with the wrong language.
        // It's possible to find something that LOOKS like the start of the
        // comment - but then if there is no readable text - good chance it is a
        // false match and not a comment.
        //
        // for a visual example please see:
        // https://github.com/highlightjs/highlight.js/issues/2827
        begin: concat(
          /[ ]+/,
          // necessary to prevent us gobbling up doctags like /* @author Bob Mcgill */
          "(",
          ENGLISH_WORD,
          /[.]?[:]?([.][ ]|[ ])/,
          "){3}"
        )
        // look for 3 words in a row
      }
    );
    return mode;
  };
  const C_LINE_COMMENT_MODE = COMMENT("//", "$");
  const C_BLOCK_COMMENT_MODE = COMMENT("/\\*", "\\*/");
  const HASH_COMMENT_MODE = COMMENT("#", "$");
  const NUMBER_MODE = {
    scope: "number",
    begin: NUMBER_RE,
    relevance: 0
  };
  const C_NUMBER_MODE = {
    scope: "number",
    begin: C_NUMBER_RE,
    relevance: 0
  };
  const BINARY_NUMBER_MODE = {
    scope: "number",
    begin: BINARY_NUMBER_RE,
    relevance: 0
  };
  const REGEXP_MODE = {
    scope: "regexp",
    begin: /\/(?=[^/\n]*\/)/,
    end: /\/[gimuy]*/,
    contains: [
      BACKSLASH_ESCAPE,
      {
        begin: /\[/,
        end: /\]/,
        relevance: 0,
        contains: [BACKSLASH_ESCAPE]
      }
    ]
  };
  const TITLE_MODE = {
    scope: "title",
    begin: IDENT_RE,
    relevance: 0
  };
  const UNDERSCORE_TITLE_MODE = {
    scope: "title",
    begin: UNDERSCORE_IDENT_RE,
    relevance: 0
  };
  const METHOD_GUARD = {
    // excludes method names from keyword processing
    begin: "\\.\\s*" + UNDERSCORE_IDENT_RE,
    relevance: 0
  };
  const END_SAME_AS_BEGIN = function(mode) {
    return Object.assign(
      mode,
      {
        /** @type {ModeCallback} */
        "on:begin": (m, resp) => {
          resp.data._beginMatch = m[1];
        },
        /** @type {ModeCallback} */
        "on:end": (m, resp) => {
          if (resp.data._beginMatch !== m[1]) resp.ignoreMatch();
        }
      }
    );
  };
  var MODES = /* @__PURE__ */ Object.freeze({
    __proto__: null,
    APOS_STRING_MODE,
    BACKSLASH_ESCAPE,
    BINARY_NUMBER_MODE,
    BINARY_NUMBER_RE,
    COMMENT,
    C_BLOCK_COMMENT_MODE,
    C_LINE_COMMENT_MODE,
    C_NUMBER_MODE,
    C_NUMBER_RE,
    END_SAME_AS_BEGIN,
    HASH_COMMENT_MODE,
    IDENT_RE,
    MATCH_NOTHING_RE,
    METHOD_GUARD,
    NUMBER_MODE,
    NUMBER_RE,
    PHRASAL_WORDS_MODE,
    QUOTE_STRING_MODE,
    REGEXP_MODE,
    RE_STARTERS_RE,
    SHEBANG,
    TITLE_MODE,
    UNDERSCORE_IDENT_RE,
    UNDERSCORE_TITLE_MODE
  });
  function skipIfHasPrecedingDot(match, response) {
    const before = match.input[match.index - 1];
    if (before === ".") {
      response.ignoreMatch();
    }
  }
  function scopeClassName(mode, _parent) {
    if (mode.className !== void 0) {
      mode.scope = mode.className;
      delete mode.className;
    }
  }
  function beginKeywords(mode, parent) {
    if (!parent) return;
    if (!mode.beginKeywords) return;
    mode.begin = "\\b(" + mode.beginKeywords.split(" ").join("|") + ")(?!\\.)(?=\\b|\\s)";
    mode.__beforeBegin = skipIfHasPrecedingDot;
    mode.keywords = mode.keywords || mode.beginKeywords;
    delete mode.beginKeywords;
    if (mode.relevance === void 0) mode.relevance = 0;
  }
  function compileIllegal(mode, _parent) {
    if (!Array.isArray(mode.illegal)) return;
    mode.illegal = either(...mode.illegal);
  }
  function compileMatch(mode, _parent) {
    if (!mode.match) return;
    if (mode.begin || mode.end) throw new Error("begin & end are not supported with match");
    mode.begin = mode.match;
    delete mode.match;
  }
  function compileRelevance(mode, _parent) {
    if (mode.relevance === void 0) mode.relevance = 1;
  }
  const beforeMatchExt = (mode, parent) => {
    if (!mode.beforeMatch) return;
    if (mode.starts) throw new Error("beforeMatch cannot be used with starts");
    const originalMode = Object.assign({}, mode);
    Object.keys(mode).forEach((key) => {
      delete mode[key];
    });
    mode.keywords = originalMode.keywords;
    mode.begin = concat(originalMode.beforeMatch, lookahead(originalMode.begin));
    mode.starts = {
      relevance: 0,
      contains: [
        Object.assign(originalMode, { endsParent: true })
      ]
    };
    mode.relevance = 0;
    delete originalMode.beforeMatch;
  };
  const COMMON_KEYWORDS = [
    "of",
    "and",
    "for",
    "in",
    "not",
    "or",
    "if",
    "then",
    "parent",
    // common variable name
    "list",
    // common variable name
    "value"
    // common variable name
  ];
  const DEFAULT_KEYWORD_SCOPE = "keyword";
  function compileKeywords(rawKeywords, caseInsensitive, scopeName = DEFAULT_KEYWORD_SCOPE) {
    const compiledKeywords = /* @__PURE__ */ Object.create(null);
    if (typeof rawKeywords === "string") {
      compileList(scopeName, rawKeywords.split(" "));
    } else if (Array.isArray(rawKeywords)) {
      compileList(scopeName, rawKeywords);
    } else {
      Object.keys(rawKeywords).forEach(function(scopeName2) {
        Object.assign(
          compiledKeywords,
          compileKeywords(rawKeywords[scopeName2], caseInsensitive, scopeName2)
        );
      });
    }
    return compiledKeywords;
    function compileList(scopeName2, keywordList) {
      if (caseInsensitive) {
        keywordList = keywordList.map((x) => x.toLowerCase());
      }
      keywordList.forEach(function(keyword) {
        const pair = keyword.split("|");
        compiledKeywords[pair[0]] = [scopeName2, scoreForKeyword(pair[0], pair[1])];
      });
    }
  }
  function scoreForKeyword(keyword, providedScore) {
    if (providedScore) {
      return Number(providedScore);
    }
    return commonKeyword(keyword) ? 0 : 1;
  }
  function commonKeyword(keyword) {
    return COMMON_KEYWORDS.includes(keyword.toLowerCase());
  }
  const seenDeprecations = {};
  const error2 = (message) => {
    console.error(message);
  };
  const warn = (message, ...args) => {
    console.log(`WARN: ${message}`, ...args);
  };
  const deprecated = (version2, message) => {
    if (seenDeprecations[`${version2}/${message}`]) return;
    console.log(`Deprecated as of ${version2}. ${message}`);
    seenDeprecations[`${version2}/${message}`] = true;
  };
  const MultiClassError = new Error();
  function remapScopeNames(mode, regexes, { key }) {
    let offset = 0;
    const scopeNames = mode[key];
    const emit = {};
    const positions = {};
    for (let i = 1; i <= regexes.length; i++) {
      positions[i + offset] = scopeNames[i];
      emit[i + offset] = true;
      offset += countMatchGroups(regexes[i - 1]);
    }
    mode[key] = positions;
    mode[key]._emit = emit;
    mode[key]._multi = true;
  }
  function beginMultiClass(mode) {
    if (!Array.isArray(mode.begin)) return;
    if (mode.skip || mode.excludeBegin || mode.returnBegin) {
      error2("skip, excludeBegin, returnBegin not compatible with beginScope: {}");
      throw MultiClassError;
    }
    if (typeof mode.beginScope !== "object" || mode.beginScope === null) {
      error2("beginScope must be object");
      throw MultiClassError;
    }
    remapScopeNames(mode, mode.begin, { key: "beginScope" });
    mode.begin = _rewriteBackreferences(mode.begin, { joinWith: "" });
  }
  function endMultiClass(mode) {
    if (!Array.isArray(mode.end)) return;
    if (mode.skip || mode.excludeEnd || mode.returnEnd) {
      error2("skip, excludeEnd, returnEnd not compatible with endScope: {}");
      throw MultiClassError;
    }
    if (typeof mode.endScope !== "object" || mode.endScope === null) {
      error2("endScope must be object");
      throw MultiClassError;
    }
    remapScopeNames(mode, mode.end, { key: "endScope" });
    mode.end = _rewriteBackreferences(mode.end, { joinWith: "" });
  }
  function scopeSugar(mode) {
    if (mode.scope && typeof mode.scope === "object" && mode.scope !== null) {
      mode.beginScope = mode.scope;
      delete mode.scope;
    }
  }
  function MultiClass(mode) {
    scopeSugar(mode);
    if (typeof mode.beginScope === "string") {
      mode.beginScope = { _wrap: mode.beginScope };
    }
    if (typeof mode.endScope === "string") {
      mode.endScope = { _wrap: mode.endScope };
    }
    beginMultiClass(mode);
    endMultiClass(mode);
  }
  function compileLanguage(language) {
    function langRe(value, global) {
      return new RegExp(
        source(value),
        "m" + (language.case_insensitive ? "i" : "") + (language.unicodeRegex ? "u" : "") + (global ? "g" : "")
      );
    }
    class MultiRegex {
      constructor() {
        this.matchIndexes = {};
        this.regexes = [];
        this.matchAt = 1;
        this.position = 0;
      }
      // @ts-ignore
      addRule(re, opts) {
        opts.position = this.position++;
        this.matchIndexes[this.matchAt] = opts;
        this.regexes.push([opts, re]);
        this.matchAt += countMatchGroups(re) + 1;
      }
      compile() {
        if (this.regexes.length === 0) {
          this.exec = () => null;
        }
        const terminators = this.regexes.map((el) => el[1]);
        this.matcherRe = langRe(_rewriteBackreferences(terminators, { joinWith: "|" }), true);
        this.lastIndex = 0;
      }
      /** @param {string} s */
      exec(s) {
        this.matcherRe.lastIndex = this.lastIndex;
        const match = this.matcherRe.exec(s);
        if (!match) {
          return null;
        }
        const i = match.findIndex((el, i2) => i2 > 0 && el !== void 0);
        const matchData = this.matchIndexes[i];
        match.splice(0, i);
        return Object.assign(match, matchData);
      }
    }
    class ResumableMultiRegex {
      constructor() {
        this.rules = [];
        this.multiRegexes = [];
        this.count = 0;
        this.lastIndex = 0;
        this.regexIndex = 0;
      }
      // @ts-ignore
      getMatcher(index) {
        if (this.multiRegexes[index]) return this.multiRegexes[index];
        const matcher = new MultiRegex();
        this.rules.slice(index).forEach(([re, opts]) => matcher.addRule(re, opts));
        matcher.compile();
        this.multiRegexes[index] = matcher;
        return matcher;
      }
      resumingScanAtSamePosition() {
        return this.regexIndex !== 0;
      }
      considerAll() {
        this.regexIndex = 0;
      }
      // @ts-ignore
      addRule(re, opts) {
        this.rules.push([re, opts]);
        if (opts.type === "begin") this.count++;
      }
      /** @param {string} s */
      exec(s) {
        const m = this.getMatcher(this.regexIndex);
        m.lastIndex = this.lastIndex;
        let result = m.exec(s);
        if (this.resumingScanAtSamePosition()) {
          if (result && result.index === this.lastIndex) ;
          else {
            const m2 = this.getMatcher(0);
            m2.lastIndex = this.lastIndex + 1;
            result = m2.exec(s);
          }
        }
        if (result) {
          this.regexIndex += result.position + 1;
          if (this.regexIndex === this.count) {
            this.considerAll();
          }
        }
        return result;
      }
    }
    function buildModeRegex(mode) {
      const mm = new ResumableMultiRegex();
      mode.contains.forEach((term) => mm.addRule(term.begin, { rule: term, type: "begin" }));
      if (mode.terminatorEnd) {
        mm.addRule(mode.terminatorEnd, { type: "end" });
      }
      if (mode.illegal) {
        mm.addRule(mode.illegal, { type: "illegal" });
      }
      return mm;
    }
    function compileMode(mode, parent) {
      const cmode = (
        /** @type CompiledMode */
        mode
      );
      if (mode.isCompiled) return cmode;
      [
        scopeClassName,
        // do this early so compiler extensions generally don't have to worry about
        // the distinction between match/begin
        compileMatch,
        MultiClass,
        beforeMatchExt
      ].forEach((ext) => ext(mode, parent));
      language.compilerExtensions.forEach((ext) => ext(mode, parent));
      mode.__beforeBegin = null;
      [
        beginKeywords,
        // do this later so compiler extensions that come earlier have access to the
        // raw array if they wanted to perhaps manipulate it, etc.
        compileIllegal,
        // default to 1 relevance if not specified
        compileRelevance
      ].forEach((ext) => ext(mode, parent));
      mode.isCompiled = true;
      let keywordPattern = null;
      if (typeof mode.keywords === "object" && mode.keywords.$pattern) {
        mode.keywords = Object.assign({}, mode.keywords);
        keywordPattern = mode.keywords.$pattern;
        delete mode.keywords.$pattern;
      }
      keywordPattern = keywordPattern || /\w+/;
      if (mode.keywords) {
        mode.keywords = compileKeywords(mode.keywords, language.case_insensitive);
      }
      cmode.keywordPatternRe = langRe(keywordPattern, true);
      if (parent) {
        if (!mode.begin) mode.begin = /\B|\b/;
        cmode.beginRe = langRe(cmode.begin);
        if (!mode.end && !mode.endsWithParent) mode.end = /\B|\b/;
        if (mode.end) cmode.endRe = langRe(cmode.end);
        cmode.terminatorEnd = source(cmode.end) || "";
        if (mode.endsWithParent && parent.terminatorEnd) {
          cmode.terminatorEnd += (mode.end ? "|" : "") + parent.terminatorEnd;
        }
      }
      if (mode.illegal) cmode.illegalRe = langRe(
        /** @type {RegExp | string} */
        mode.illegal
      );
      if (!mode.contains) mode.contains = [];
      mode.contains = [].concat(...mode.contains.map(function(c) {
        return expandOrCloneMode(c === "self" ? mode : c);
      }));
      mode.contains.forEach(function(c) {
        compileMode(
          /** @type Mode */
          c,
          cmode
        );
      });
      if (mode.starts) {
        compileMode(mode.starts, parent);
      }
      cmode.matcher = buildModeRegex(cmode);
      return cmode;
    }
    if (!language.compilerExtensions) language.compilerExtensions = [];
    if (language.contains && language.contains.includes("self")) {
      throw new Error("ERR: contains `self` is not supported at the top-level of a language.  See documentation.");
    }
    language.classNameAliases = inherit$1(language.classNameAliases || {});
    return compileMode(
      /** @type Mode */
      language
    );
  }
  function dependencyOnParent(mode) {
    if (!mode) return false;
    return mode.endsWithParent || dependencyOnParent(mode.starts);
  }
  function expandOrCloneMode(mode) {
    if (mode.variants && !mode.cachedVariants) {
      mode.cachedVariants = mode.variants.map(function(variant) {
        return inherit$1(mode, { variants: null }, variant);
      });
    }
    if (mode.cachedVariants) {
      return mode.cachedVariants;
    }
    if (dependencyOnParent(mode)) {
      return inherit$1(mode, { starts: mode.starts ? inherit$1(mode.starts) : null });
    }
    if (Object.isFrozen(mode)) {
      return inherit$1(mode);
    }
    return mode;
  }
  var version = "11.9.0";
  class HTMLInjectionError extends Error {
    constructor(reason, html) {
      super(reason);
      this.name = "HTMLInjectionError";
      this.html = html;
    }
  }
  const escape = escapeHTML;
  const inherit = inherit$1;
  const NO_MATCH = Symbol("nomatch");
  const MAX_KEYWORD_HITS = 7;
  const HLJS = function(hljs) {
    const languages = /* @__PURE__ */ Object.create(null);
    const aliases = /* @__PURE__ */ Object.create(null);
    const plugins = [];
    let SAFE_MODE = true;
    const LANGUAGE_NOT_FOUND = "Could not find the language '{}', did you forget to load/include a language module?";
    const PLAINTEXT_LANGUAGE = { disableAutodetect: true, name: "Plain text", contains: [] };
    let options = {
      ignoreUnescapedHTML: false,
      throwUnescapedHTML: false,
      noHighlightRe: /^(no-?highlight)$/i,
      languageDetectRe: /\blang(?:uage)?-([\w-]+)\b/i,
      classPrefix: "hljs-",
      cssSelector: "pre code",
      languages: null,
      // beta configuration options, subject to change, welcome to discuss
      // https://github.com/highlightjs/highlight.js/issues/1086
      __emitter: TokenTreeEmitter
    };
    function shouldNotHighlight(languageName) {
      return options.noHighlightRe.test(languageName);
    }
    function blockLanguage(block2) {
      let classes = block2.className + " ";
      classes += block2.parentNode ? block2.parentNode.className : "";
      const match = options.languageDetectRe.exec(classes);
      if (match) {
        const language = getLanguage(match[1]);
        if (!language) {
          warn(LANGUAGE_NOT_FOUND.replace("{}", match[1]));
          warn("Falling back to no-highlight mode for this block.", block2);
        }
        return language ? match[1] : "no-highlight";
      }
      return classes.split(/\s+/).find((_class) => shouldNotHighlight(_class) || getLanguage(_class));
    }
    function highlight2(codeOrLanguageName, optionsOrCode, ignoreIllegals) {
      let code = "";
      let languageName = "";
      if (typeof optionsOrCode === "object") {
        code = codeOrLanguageName;
        ignoreIllegals = optionsOrCode.ignoreIllegals;
        languageName = optionsOrCode.language;
      } else {
        deprecated("10.7.0", "highlight(lang, code, ...args) has been deprecated.");
        deprecated("10.7.0", "Please use highlight(code, options) instead.\nhttps://github.com/highlightjs/highlight.js/issues/2277");
        languageName = codeOrLanguageName;
        code = optionsOrCode;
      }
      if (ignoreIllegals === void 0) {
        ignoreIllegals = true;
      }
      const context = {
        code,
        language: languageName
      };
      fire("before:highlight", context);
      const result = context.result ? context.result : _highlight(context.language, context.code, ignoreIllegals);
      result.code = context.code;
      fire("after:highlight", result);
      return result;
    }
    function _highlight(languageName, codeToHighlight, ignoreIllegals, continuation) {
      const keywordHits = /* @__PURE__ */ Object.create(null);
      function keywordData(mode, matchText) {
        return mode.keywords[matchText];
      }
      function processKeywords() {
        if (!top.keywords) {
          emitter.addText(modeBuffer);
          return;
        }
        let lastIndex = 0;
        top.keywordPatternRe.lastIndex = 0;
        let match = top.keywordPatternRe.exec(modeBuffer);
        let buf = "";
        while (match) {
          buf += modeBuffer.substring(lastIndex, match.index);
          const word = language.case_insensitive ? match[0].toLowerCase() : match[0];
          const data = keywordData(top, word);
          if (data) {
            const [kind, keywordRelevance] = data;
            emitter.addText(buf);
            buf = "";
            keywordHits[word] = (keywordHits[word] || 0) + 1;
            if (keywordHits[word] <= MAX_KEYWORD_HITS) relevance += keywordRelevance;
            if (kind.startsWith("_")) {
              buf += match[0];
            } else {
              const cssClass = language.classNameAliases[kind] || kind;
              emitKeyword(match[0], cssClass);
            }
          } else {
            buf += match[0];
          }
          lastIndex = top.keywordPatternRe.lastIndex;
          match = top.keywordPatternRe.exec(modeBuffer);
        }
        buf += modeBuffer.substring(lastIndex);
        emitter.addText(buf);
      }
      function processSubLanguage() {
        if (modeBuffer === "") return;
        let result2 = null;
        if (typeof top.subLanguage === "string") {
          if (!languages[top.subLanguage]) {
            emitter.addText(modeBuffer);
            return;
          }
          result2 = _highlight(top.subLanguage, modeBuffer, true, continuations[top.subLanguage]);
          continuations[top.subLanguage] = /** @type {CompiledMode} */
          result2._top;
        } else {
          result2 = highlightAuto(modeBuffer, top.subLanguage.length ? top.subLanguage : null);
        }
        if (top.relevance > 0) {
          relevance += result2.relevance;
        }
        emitter.__addSublanguage(result2._emitter, result2.language);
      }
      function processBuffer() {
        if (top.subLanguage != null) {
          processSubLanguage();
        } else {
          processKeywords();
        }
        modeBuffer = "";
      }
      function emitKeyword(keyword, scope) {
        if (keyword === "") return;
        emitter.startScope(scope);
        emitter.addText(keyword);
        emitter.endScope();
      }
      function emitMultiClass(scope, match) {
        let i = 1;
        const max = match.length - 1;
        while (i <= max) {
          if (!scope._emit[i]) {
            i++;
            continue;
          }
          const klass = language.classNameAliases[scope[i]] || scope[i];
          const text = match[i];
          if (klass) {
            emitKeyword(text, klass);
          } else {
            modeBuffer = text;
            processKeywords();
            modeBuffer = "";
          }
          i++;
        }
      }
      function startNewMode(mode, match) {
        if (mode.scope && typeof mode.scope === "string") {
          emitter.openNode(language.classNameAliases[mode.scope] || mode.scope);
        }
        if (mode.beginScope) {
          if (mode.beginScope._wrap) {
            emitKeyword(modeBuffer, language.classNameAliases[mode.beginScope._wrap] || mode.beginScope._wrap);
            modeBuffer = "";
          } else if (mode.beginScope._multi) {
            emitMultiClass(mode.beginScope, match);
            modeBuffer = "";
          }
        }
        top = Object.create(mode, { parent: { value: top } });
        return top;
      }
      function endOfMode(mode, match, matchPlusRemainder) {
        let matched = startsWith(mode.endRe, matchPlusRemainder);
        if (matched) {
          if (mode["on:end"]) {
            const resp = new Response(mode);
            mode["on:end"](match, resp);
            if (resp.isMatchIgnored) matched = false;
          }
          if (matched) {
            while (mode.endsParent && mode.parent) {
              mode = mode.parent;
            }
            return mode;
          }
        }
        if (mode.endsWithParent) {
          return endOfMode(mode.parent, match, matchPlusRemainder);
        }
      }
      function doIgnore(lexeme) {
        if (top.matcher.regexIndex === 0) {
          modeBuffer += lexeme[0];
          return 1;
        } else {
          resumeScanAtSamePosition = true;
          return 0;
        }
      }
      function doBeginMatch(match) {
        const lexeme = match[0];
        const newMode = match.rule;
        const resp = new Response(newMode);
        const beforeCallbacks = [newMode.__beforeBegin, newMode["on:begin"]];
        for (const cb of beforeCallbacks) {
          if (!cb) continue;
          cb(match, resp);
          if (resp.isMatchIgnored) return doIgnore(lexeme);
        }
        if (newMode.skip) {
          modeBuffer += lexeme;
        } else {
          if (newMode.excludeBegin) {
            modeBuffer += lexeme;
          }
          processBuffer();
          if (!newMode.returnBegin && !newMode.excludeBegin) {
            modeBuffer = lexeme;
          }
        }
        startNewMode(newMode, match);
        return newMode.returnBegin ? 0 : lexeme.length;
      }
      function doEndMatch(match) {
        const lexeme = match[0];
        const matchPlusRemainder = codeToHighlight.substring(match.index);
        const endMode = endOfMode(top, match, matchPlusRemainder);
        if (!endMode) {
          return NO_MATCH;
        }
        const origin = top;
        if (top.endScope && top.endScope._wrap) {
          processBuffer();
          emitKeyword(lexeme, top.endScope._wrap);
        } else if (top.endScope && top.endScope._multi) {
          processBuffer();
          emitMultiClass(top.endScope, match);
        } else if (origin.skip) {
          modeBuffer += lexeme;
        } else {
          if (!(origin.returnEnd || origin.excludeEnd)) {
            modeBuffer += lexeme;
          }
          processBuffer();
          if (origin.excludeEnd) {
            modeBuffer = lexeme;
          }
        }
        do {
          if (top.scope) {
            emitter.closeNode();
          }
          if (!top.skip && !top.subLanguage) {
            relevance += top.relevance;
          }
          top = top.parent;
        } while (top !== endMode.parent);
        if (endMode.starts) {
          startNewMode(endMode.starts, match);
        }
        return origin.returnEnd ? 0 : lexeme.length;
      }
      function processContinuations() {
        const list = [];
        for (let current = top; current !== language; current = current.parent) {
          if (current.scope) {
            list.unshift(current.scope);
          }
        }
        list.forEach((item) => emitter.openNode(item));
      }
      let lastMatch = {};
      function processLexeme(textBeforeMatch, match) {
        const lexeme = match && match[0];
        modeBuffer += textBeforeMatch;
        if (lexeme == null) {
          processBuffer();
          return 0;
        }
        if (lastMatch.type === "begin" && match.type === "end" && lastMatch.index === match.index && lexeme === "") {
          modeBuffer += codeToHighlight.slice(match.index, match.index + 1);
          if (!SAFE_MODE) {
            const err = new Error(`0 width match regex (${languageName})`);
            err.languageName = languageName;
            err.badRule = lastMatch.rule;
            throw err;
          }
          return 1;
        }
        lastMatch = match;
        if (match.type === "begin") {
          return doBeginMatch(match);
        } else if (match.type === "illegal" && !ignoreIllegals) {
          const err = new Error('Illegal lexeme "' + lexeme + '" for mode "' + (top.scope || "<unnamed>") + '"');
          err.mode = top;
          throw err;
        } else if (match.type === "end") {
          const processed = doEndMatch(match);
          if (processed !== NO_MATCH) {
            return processed;
          }
        }
        if (match.type === "illegal" && lexeme === "") {
          return 1;
        }
        if (iterations > 1e5 && iterations > match.index * 3) {
          const err = new Error("potential infinite loop, way more iterations than matches");
          throw err;
        }
        modeBuffer += lexeme;
        return lexeme.length;
      }
      const language = getLanguage(languageName);
      if (!language) {
        error2(LANGUAGE_NOT_FOUND.replace("{}", languageName));
        throw new Error('Unknown language: "' + languageName + '"');
      }
      const md = compileLanguage(language);
      let result = "";
      let top = continuation || md;
      const continuations = {};
      const emitter = new options.__emitter(options);
      processContinuations();
      let modeBuffer = "";
      let relevance = 0;
      let index = 0;
      let iterations = 0;
      let resumeScanAtSamePosition = false;
      try {
        if (!language.__emitTokens) {
          top.matcher.considerAll();
          for (; ; ) {
            iterations++;
            if (resumeScanAtSamePosition) {
              resumeScanAtSamePosition = false;
            } else {
              top.matcher.considerAll();
            }
            top.matcher.lastIndex = index;
            const match = top.matcher.exec(codeToHighlight);
            if (!match) break;
            const beforeMatch = codeToHighlight.substring(index, match.index);
            const processedCount = processLexeme(beforeMatch, match);
            index = match.index + processedCount;
          }
          processLexeme(codeToHighlight.substring(index));
        } else {
          language.__emitTokens(codeToHighlight, emitter);
        }
        emitter.finalize();
        result = emitter.toHTML();
        return {
          language: languageName,
          value: result,
          relevance,
          illegal: false,
          _emitter: emitter,
          _top: top
        };
      } catch (err) {
        if (err.message && err.message.includes("Illegal")) {
          return {
            language: languageName,
            value: escape(codeToHighlight),
            illegal: true,
            relevance: 0,
            _illegalBy: {
              message: err.message,
              index,
              context: codeToHighlight.slice(index - 100, index + 100),
              mode: err.mode,
              resultSoFar: result
            },
            _emitter: emitter
          };
        } else if (SAFE_MODE) {
          return {
            language: languageName,
            value: escape(codeToHighlight),
            illegal: false,
            relevance: 0,
            errorRaised: err,
            _emitter: emitter,
            _top: top
          };
        } else {
          throw err;
        }
      }
    }
    function justTextHighlightResult(code) {
      const result = {
        value: escape(code),
        illegal: false,
        relevance: 0,
        _top: PLAINTEXT_LANGUAGE,
        _emitter: new options.__emitter(options)
      };
      result._emitter.addText(code);
      return result;
    }
    function highlightAuto(code, languageSubset) {
      languageSubset = languageSubset || options.languages || Object.keys(languages);
      const plaintext = justTextHighlightResult(code);
      const results = languageSubset.filter(getLanguage).filter(autoDetection).map(
        (name) => _highlight(name, code, false)
      );
      results.unshift(plaintext);
      const sorted = results.sort((a, b) => {
        if (a.relevance !== b.relevance) return b.relevance - a.relevance;
        if (a.language && b.language) {
          if (getLanguage(a.language).supersetOf === b.language) {
            return 1;
          } else if (getLanguage(b.language).supersetOf === a.language) {
            return -1;
          }
        }
        return 0;
      });
      const [best, secondBest] = sorted;
      const result = best;
      result.secondBest = secondBest;
      return result;
    }
    function updateClassName(element, currentLang, resultLang) {
      const language = currentLang && aliases[currentLang] || resultLang;
      element.classList.add("hljs");
      element.classList.add(`language-${language}`);
    }
    function highlightElement(element) {
      let node = null;
      const language = blockLanguage(element);
      if (shouldNotHighlight(language)) return;
      fire(
        "before:highlightElement",
        { el: element, language }
      );
      if (element.dataset.highlighted) {
        console.log("Element previously highlighted. To highlight again, first unset `dataset.highlighted`.", element);
        return;
      }
      if (element.children.length > 0) {
        if (!options.ignoreUnescapedHTML) {
          console.warn("One of your code blocks includes unescaped HTML. This is a potentially serious security risk.");
          console.warn("https://github.com/highlightjs/highlight.js/wiki/security");
          console.warn("The element with unescaped HTML:");
          console.warn(element);
        }
        if (options.throwUnescapedHTML) {
          const err = new HTMLInjectionError(
            "One of your code blocks includes unescaped HTML.",
            element.innerHTML
          );
          throw err;
        }
      }
      node = element;
      const text = node.textContent;
      const result = language ? highlight2(text, { language, ignoreIllegals: true }) : highlightAuto(text);
      element.innerHTML = result.value;
      element.dataset.highlighted = "yes";
      updateClassName(element, language, result.language);
      element.result = {
        language: result.language,
        // TODO: remove with version 11.0
        re: result.relevance,
        relevance: result.relevance
      };
      if (result.secondBest) {
        element.secondBest = {
          language: result.secondBest.language,
          relevance: result.secondBest.relevance
        };
      }
      fire("after:highlightElement", { el: element, result, text });
    }
    function configure(userOptions) {
      options = inherit(options, userOptions);
    }
    const initHighlighting = () => {
      highlightAll();
      deprecated("10.6.0", "initHighlighting() deprecated.  Use highlightAll() now.");
    };
    function initHighlightingOnLoad() {
      highlightAll();
      deprecated("10.6.0", "initHighlightingOnLoad() deprecated.  Use highlightAll() now.");
    }
    let wantsHighlight = false;
    function highlightAll() {
      if (document.readyState === "loading") {
        wantsHighlight = true;
        return;
      }
      const blocks = document.querySelectorAll(options.cssSelector);
      blocks.forEach(highlightElement);
    }
    function boot() {
      if (wantsHighlight) highlightAll();
    }
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("DOMContentLoaded", boot, false);
    }
    function registerLanguage(languageName, languageDefinition) {
      let lang = null;
      try {
        lang = languageDefinition(hljs);
      } catch (error$1) {
        error2("Language definition for '{}' could not be registered.".replace("{}", languageName));
        if (!SAFE_MODE) {
          throw error$1;
        } else {
          error2(error$1);
        }
        lang = PLAINTEXT_LANGUAGE;
      }
      if (!lang.name) lang.name = languageName;
      languages[languageName] = lang;
      lang.rawDefinition = languageDefinition.bind(null, hljs);
      if (lang.aliases) {
        registerAliases(lang.aliases, { languageName });
      }
    }
    function unregisterLanguage(languageName) {
      delete languages[languageName];
      for (const alias of Object.keys(aliases)) {
        if (aliases[alias] === languageName) {
          delete aliases[alias];
        }
      }
    }
    function listLanguages() {
      return Object.keys(languages);
    }
    function getLanguage(name) {
      name = (name || "").toLowerCase();
      return languages[name] || languages[aliases[name]];
    }
    function registerAliases(aliasList, { languageName }) {
      if (typeof aliasList === "string") {
        aliasList = [aliasList];
      }
      aliasList.forEach((alias) => {
        aliases[alias.toLowerCase()] = languageName;
      });
    }
    function autoDetection(name) {
      const lang = getLanguage(name);
      return lang && !lang.disableAutodetect;
    }
    function upgradePluginAPI(plugin) {
      if (plugin["before:highlightBlock"] && !plugin["before:highlightElement"]) {
        plugin["before:highlightElement"] = (data) => {
          plugin["before:highlightBlock"](
            Object.assign({ block: data.el }, data)
          );
        };
      }
      if (plugin["after:highlightBlock"] && !plugin["after:highlightElement"]) {
        plugin["after:highlightElement"] = (data) => {
          plugin["after:highlightBlock"](
            Object.assign({ block: data.el }, data)
          );
        };
      }
    }
    function addPlugin(plugin) {
      upgradePluginAPI(plugin);
      plugins.push(plugin);
    }
    function removePlugin(plugin) {
      const index = plugins.indexOf(plugin);
      if (index !== -1) {
        plugins.splice(index, 1);
      }
    }
    function fire(event, args) {
      const cb = event;
      plugins.forEach(function(plugin) {
        if (plugin[cb]) {
          plugin[cb](args);
        }
      });
    }
    function deprecateHighlightBlock(el) {
      deprecated("10.7.0", "highlightBlock will be removed entirely in v12.0");
      deprecated("10.7.0", "Please use highlightElement now.");
      return highlightElement(el);
    }
    Object.assign(hljs, {
      highlight: highlight2,
      highlightAuto,
      highlightAll,
      highlightElement,
      // TODO: Remove with v12 API
      highlightBlock: deprecateHighlightBlock,
      configure,
      initHighlighting,
      initHighlightingOnLoad,
      registerLanguage,
      unregisterLanguage,
      listLanguages,
      getLanguage,
      registerAliases,
      autoDetection,
      inherit,
      addPlugin,
      removePlugin
    });
    hljs.debugMode = function() {
      SAFE_MODE = false;
    };
    hljs.safeMode = function() {
      SAFE_MODE = true;
    };
    hljs.versionString = version;
    hljs.regex = {
      concat,
      lookahead,
      either,
      optional,
      anyNumberOfTimes
    };
    for (const key in MODES) {
      if (typeof MODES[key] === "object") {
        deepFreeze(MODES[key]);
      }
    }
    Object.assign(hljs, MODES);
    return hljs;
  };
  const highlight = HLJS({});
  highlight.newInstance = () => HLJS({});
  core = highlight;
  highlight.HighlightJS = highlight;
  highlight.default = highlight;
  return core;
}
var coreExports = /* @__PURE__ */ requireCore();
const HighlightJS = /* @__PURE__ */ getDefaultExportFromCjs(coreExports);
function createNode(parent, nodeName, currentDepth, r, children = []) {
  return {
    parent,
    node: nodeName,
    id: nodeName,
    depth: currentDepth,
    startTime: r?.data?.metadata?.startTime ?? 0,
    runIndex: r?.runIndex ?? 0,
    children,
    consumedTokens: getConsumedTokens(r?.data)
  };
}
function getTreeNodeData(nodeName, workflow, aiData) {
  return getTreeNodeDataRec(void 0, nodeName, 0, workflow, aiData, void 0);
}
function getTreeNodeDataRec(parent, nodeName, currentDepth, workflow, aiData, runIndex) {
  const connections = workflow.connectionsByDestinationNode[nodeName];
  const resultData = aiData?.filter(
    (data) => data.node === nodeName && (runIndex === void 0 || runIndex === data.runIndex)
  ) ?? [];
  if (!connections) {
    return resultData.map((d) => createNode(parent, nodeName, currentDepth, d));
  }
  const connectedSubNodes = workflow.getParentNodes(nodeName, "ALL_NON_MAIN", 1);
  const treeNode2 = createNode(parent, nodeName, currentDepth);
  const children = connectedSubNodes.flatMap((name) => {
    return aiData?.filter(
      (data) => data.node === name && (runIndex === void 0 || data.runIndex === runIndex)
    ).flatMap(
      (data) => getTreeNodeDataRec(treeNode2, name, currentDepth + 1, workflow, aiData, data.runIndex)
    ) ?? [];
  });
  children.sort((a, b) => a.startTime - b.startTime);
  treeNode2.children = children;
  if (resultData.length) {
    return resultData.map((r) => createNode(parent, nodeName, currentDepth, r, children));
  }
  return [treeNode2];
}
function createAiData(nodeName, workflow, getWorkflowResultDataByNodeName) {
  const result = [];
  const connectedSubNodes = workflow.getParentNodes(nodeName, "ALL_NON_MAIN");
  connectedSubNodes.forEach((node) => {
    const nodeRunData = getWorkflowResultDataByNodeName(node) ?? [];
    nodeRunData.forEach((run, runIndex) => {
      const referenceData = {
        data: getReferencedData(run, false)[0],
        node,
        runIndex
      };
      result.push(referenceData);
    });
  });
  result.sort((a, b) => {
    const aTime = a.data?.metadata?.startTime ?? 0;
    const bTime = b.data?.metadata?.startTime ?? 0;
    return aTime - bTime;
  });
  return result;
}
function getReferencedData(taskData, withInput, withOutput) {
  if (!taskData) {
    return [];
  }
  const returnData = [];
  function addFunction(data, inOut) {
    if (!data) {
      return;
    }
    Object.keys(data).map((type) => {
      returnData.push({
        data: data[type][0],
        inOut,
        type,
        metadata: {
          executionTime: taskData.executionTime,
          startTime: taskData.startTime,
          subExecution: taskData.metadata?.subExecution
        }
      });
    });
  }
  if (withInput) {
    addFunction(taskData.inputOverride, "input");
  }
  {
    addFunction(taskData.data, "output");
  }
  return returnData;
}
const emptyTokenUsageData = {
  completionTokens: 0,
  promptTokens: 0,
  totalTokens: 0,
  isEstimate: false
};
function addTokenUsageData(one, another) {
  return {
    completionTokens: one.completionTokens + another.completionTokens,
    promptTokens: one.promptTokens + another.promptTokens,
    totalTokens: one.totalTokens + another.totalTokens,
    isEstimate: one.isEstimate || another.isEstimate
  };
}
function getConsumedTokens(outputRun) {
  if (!outputRun?.data) {
    return emptyTokenUsageData;
  }
  const tokenUsage = outputRun.data.reduce(
    (acc, curr) => {
      const tokenUsageData = curr.json?.tokenUsage ?? curr.json?.tokenUsageEstimate;
      if (!tokenUsageData) return acc;
      return addTokenUsageData(acc, {
        ...tokenUsageData,
        isEstimate: !!curr.json.tokenUsageEstimate
      });
    },
    emptyTokenUsageData
  );
  return tokenUsage;
}
function getTotalConsumedTokens(...usage) {
  return usage.reduce(addTokenUsageData, emptyTokenUsageData);
}
function getSubtreeTotalConsumedTokens(treeNode2) {
  return getTotalConsumedTokens(
    treeNode2.consumedTokens,
    ...treeNode2.children.map(getSubtreeTotalConsumedTokens)
  );
}
function formatTokenUsageCount(usage, field) {
  const count = field === "total" ? usage.totalTokens : field === "completion" ? usage.completionTokens : usage.promptTokens;
  return usage.isEstimate ? `~${count}` : count.toLocaleString();
}
const _hoisted_1$4 = { class: "node-error-view" };
const _hoisted_2$3 = { class: "node-error-view__header" };
const _hoisted_3$2 = {
  class: "node-error-view__header-message",
  "data-test-id": "node-error-message"
};
const _hoisted_4 = {
  key: 0,
  "data-test-id": "node-error-description",
  class: "node-error-view__header-description"
};
const _hoisted_5 = { key: 1 };
const _hoisted_6 = {
  key: 2,
  class: "node-error-view__button",
  "data-test-id": "node-error-view-ask-assistant-button"
};
const _hoisted_7 = {
  key: 0,
  class: "node-error-view__info"
};
const _hoisted_8 = { class: "node-error-view__info-header" };
const _hoisted_9 = { class: "node-error-view__info-title" };
const _hoisted_10 = { class: "copy-button" };
const _hoisted_11 = { class: "node-error-view__info-content" };
const _hoisted_12 = {
  key: 0,
  class: "node-error-view__details"
};
const _hoisted_13 = { class: "node-error-view__details-summary" };
const _hoisted_14 = { class: "node-error-view__details-content" };
const _hoisted_15 = {
  key: 0,
  class: "node-error-view__details-row"
};
const _hoisted_16 = { class: "node-error-view__details-label" };
const _hoisted_17 = { class: "node-error-view__details-value" };
const _hoisted_18 = {
  key: 1,
  class: "node-error-view__details-row"
};
const _hoisted_19 = { class: "node-error-view__details-label" };
const _hoisted_20 = { class: "node-error-view__details-value" };
const _hoisted_21 = {
  key: 2,
  class: "node-error-view__details-row"
};
const _hoisted_22 = { class: "node-error-view__details-label" };
const _hoisted_23 = { class: "node-error-view__details-value" };
const _hoisted_24 = {
  key: 3,
  class: "node-error-view__details-row"
};
const _hoisted_25 = { class: "node-error-view__details-label" };
const _hoisted_26 = { class: "node-error-view__details-value" };
const _hoisted_27 = {
  key: 4,
  class: "node-error-view__details-row"
};
const _hoisted_28 = { class: "node-error-view__details-label" };
const _hoisted_29 = { class: "node-error-view__details-value" };
const _hoisted_30 = { class: "node-error-view__details" };
const _hoisted_31 = { class: "node-error-view__details-summary" };
const _hoisted_32 = { class: "node-error-view__details-content" };
const _hoisted_33 = {
  key: 0,
  class: "node-error-view__details-row"
};
const _hoisted_34 = { class: "node-error-view__details-label" };
const _hoisted_35 = { class: "node-error-view__details-value" };
const _hoisted_36 = {
  key: 1,
  class: "node-error-view__details-row"
};
const _hoisted_37 = { class: "node-error-view__details-label" };
const _hoisted_38 = { class: "node-error-view__details-value" };
const _hoisted_39 = {
  key: 2,
  class: "node-error-view__details-row"
};
const _hoisted_40 = { class: "node-error-view__details-label" };
const _hoisted_41 = { class: "node-error-view__details-value" };
const _hoisted_42 = {
  key: 3,
  class: "node-error-view__details-row"
};
const _hoisted_43 = { class: "node-error-view__details-label" };
const _hoisted_44 = { class: "node-error-view__details-value" };
const _hoisted_45 = {
  key: 4,
  class: "node-error-view__details-row"
};
const _hoisted_46 = { class: "node-error-view__details-label" };
const _hoisted_47 = { class: "node-error-view__details-value" };
const _hoisted_48 = { class: "node-error-view__details-row" };
const _hoisted_49 = { class: "node-error-view__details-label" };
const _hoisted_50 = { class: "node-error-view__details-value" };
const _hoisted_51 = {
  key: 5,
  class: "node-error-view__details-row"
};
const _hoisted_52 = { class: "node-error-view__details-label" };
const _hoisted_53 = { class: "node-error-view__details-value" };
const _hoisted_54 = {
  key: 6,
  class: "node-error-view__details-row"
};
const _hoisted_55 = { class: "node-error-view__details-label" };
const _hoisted_56 = { class: "node-error-view__details-value" };
const _hoisted_57 = {
  key: 7,
  class: "node-error-view__details-row"
};
const _hoisted_58 = { class: "node-error-view__details-label" };
const _hoisted_59 = { class: "node-error-view__details-value" };
const _hoisted_60 = {
  key: 8,
  class: "node-error-view__details-row"
};
const _hoisted_61 = { class: "node-error-view__details-label" };
const _hoisted_62 = { class: "node-error-view__details-value" };
const _sfc_main$5 = /* @__PURE__ */ defineComponent({
  __name: "NodeErrorView",
  props: {
    error: {},
    compact: { type: Boolean }
  },
  setup(__props) {
    const props = __props;
    const clipboard = useClipboard();
    const toast = useToast();
    const i18n = useI18n();
    const assistantHelpers = useAIAssistantHelpers();
    const nodeTypesStore = useNodeTypesStore();
    const ndvStore = useNDVStore();
    const rootStore = useRootStore();
    const assistantStore = useAssistantStore();
    const uiStore = useUIStore();
    const displayCause = computed(() => {
      return JSON.stringify(props.error.cause ?? "").length < MAX_DISPLAY_DATA_SIZE;
    });
    const node = computed(() => {
      return props.error.node || ndvStore.activeNode;
    });
    const parameters = computed(() => {
      if (!node.value) {
        return [];
      }
      const nodeType = nodeTypesStore.getNodeType(node.value.type, node.value.typeVersion);
      if (nodeType === null) {
        return [];
      }
      return nodeType.properties;
    });
    const n8nVersion = computed(() => {
      const baseUrl = rootStore.urlBaseEditor;
      let instanceType = "Self Hosted";
      if (baseUrl.includes("n8n.cloud")) {
        instanceType = "Cloud";
      }
      return rootStore.versionCli + ` (${instanceType})`;
    });
    const hasManyInputItems = computed(() => {
      return ndvStore.ndvInputData.length > 1;
    });
    const nodeDefaultName = computed(() => {
      if (!node.value) {
        return "Node";
      }
      const nodeType = nodeTypesStore.getNodeType(node.value.type, node.value.typeVersion);
      return nodeType?.defaults?.name || node.value.name;
    });
    const prepareRawMessages = computed(() => {
      const returnData = [];
      if (!props.error.messages?.length) {
        return [];
      }
      const errorMessage = getErrorMessage();
      Array.from(new Set(props.error.messages)).forEach((message) => {
        const isParsable = /^\d{3} - \{/.test(message);
        const parts = isParsable ? message.split(" - ").map((part) => part.trim()) : [];
        for (const part of parts) {
          try {
            const parsed = JSON.parse(part);
            if (typeof parsed === "object") {
              returnData.push(parsed);
              return;
            }
          } catch (error2) {
          }
        }
        if (message === errorMessage) return;
        returnData.push(message);
      });
      return returnData;
    });
    const isAskAssistantAvailable = computed(() => {
      if (!node.value || isSubNodeError.value) {
        return false;
      }
      const isCustomNode = node.value.type === void 0 || isCommunityPackageName(node.value.type);
      return assistantStore.canShowAssistantButtonsOnCanvas && !isCustomNode && !nodeIsHidden();
    });
    const assistantAlreadyAsked = computed(() => {
      return assistantStore.isNodeErrorActive({
        error: assistantHelpers.simplifyErrorForAssistant(props.error),
        node: props.error.node || ndvStore.activeNode
      });
    });
    const isSubNodeError = computed(() => {
      return props.error.name === "NodeOperationError" && props.error.functionality === "configuration-node";
    });
    function nodeVersionTag(nodeType) {
      if (!nodeType || "hidden" in nodeType && nodeType.hidden) {
        return i18n.baseText("nodeSettings.deprecated");
      }
      const latestNodeVersion = Math.max(...nodeTypesStore.getNodeVersions(nodeType.type));
      if (latestNodeVersion === nodeType.typeVersion) {
        return i18n.baseText("nodeSettings.latest");
      }
      return i18n.baseText("nodeSettings.latestVersion", {
        interpolate: { version: latestNodeVersion.toString() }
      });
    }
    function prepareDescription(description) {
      return sanitizeHtml(description.replace(/`(.*?)`/g, "<code>$1</code>"));
    }
    function getErrorDescription() {
      if (props.error.context?.descriptionKey) {
        const interpolate = {
          nodeCause: props.error.context.nodeCause,
          runIndex: props.error.context.runIndex ?? "0",
          itemIndex: props.error.context.itemIndex ?? "0"
        };
        return prepareDescription(
          i18n.baseText(
            `nodeErrorView.description.${props.error.context.descriptionKey}`,
            { interpolate }
          )
        );
      }
      if (!props.error.context?.descriptionTemplate) {
        return prepareDescription(props.error.description ?? "");
      }
      const parameterName = parameterDisplayName(props.error.context.parameter);
      return prepareDescription(
        props.error.context.descriptionTemplate.replace(/%%PARAMETER%%/g, parameterName)
      );
    }
    function addItemIndexSuffix(message) {
      let itemIndexSuffix = "";
      if (hasManyInputItems.value && props.error?.context?.itemIndex !== void 0) {
        itemIndexSuffix = `item ${props.error.context.itemIndex}`;
      }
      if (message.includes(itemIndexSuffix)) return message;
      return `${message} [${itemIndexSuffix}]`;
    }
    function getErrorMessage() {
      let message = "";
      const isNonEmptyString = (value) => !!value && typeof value === "string";
      if (isSubNodeError.value) {
        message = i18n.baseText("nodeErrorView.errorSubNode", {
          interpolate: { node: props.error.node.name }
        });
      } else if (isNonEmptyString(props.error.message) && (props.error.message === props.error.description || !props.error.context?.messageTemplate)) {
        message = props.error.message;
      } else if (isNonEmptyString(props.error.context?.messageTemplate) && isNonEmptyString(props.error.context?.parameter)) {
        const parameterName = parameterDisplayName(props.error.context.parameter);
        message = props.error.context.messageTemplate.replace(/%%PARAMETER%%/g, parameterName);
      } else if (Array.isArray(props.error.messages) && props.error.messages.length > 0) {
        message = props.error.messages[0];
      }
      return addItemIndexSuffix(message);
    }
    function parameterDisplayName(path, fullPath = true) {
      try {
        const params = getParameterName(parameters.value, path.split("."));
        if (!params.length) {
          throw new Error();
        }
        if (!fullPath) {
          return params.pop().displayName;
        }
        return params.map((parameter) => parameter.displayName).join(" > ");
      } catch (error2) {
        return `Could not find parameter "${path}"`;
      }
    }
    function getParameterName(params, pathParts) {
      let currentParameterName = pathParts.shift();
      if (currentParameterName === void 0) {
        return [];
      }
      const arrayMatch = currentParameterName.match(/(.*)\[([\d])\]$/);
      if (arrayMatch !== null && arrayMatch.length > 0) {
        currentParameterName = arrayMatch[1];
      }
      const currentParameter = params.find(
        (parameter) => parameter.name === currentParameterName
      );
      if (currentParameter === void 0) {
        throw new Error(`Could not find parameter "${currentParameterName}"`);
      }
      if (pathParts.length === 0) {
        return [currentParameter];
      }
      if (currentParameter.hasOwnProperty("options")) {
        return [
          currentParameter,
          ...getParameterName(currentParameter.options, pathParts)
        ];
      }
      if (currentParameter.hasOwnProperty("values")) {
        return [
          currentParameter,
          ...getParameterName(currentParameter.values, pathParts)
        ];
      }
      return [currentParameter];
    }
    function copyErrorDetails() {
      const error2 = props.error;
      const errorInfo = {
        errorMessage: getErrorMessage()
      };
      if (error2.description) {
        errorInfo.errorDescription = error2.description;
      }
      const errorDetails = {};
      if (error2?.messages?.length) {
        errorDetails.rawErrorMessage = error2.messages;
      }
      if ("httpCode" in error2 && error2.httpCode) {
        errorDetails.httpCode = error2.httpCode;
      }
      if (error2.context && error2.context.data) {
        errorDetails.errorData = error2.context.data;
      }
      if (error2.extra) {
        errorDetails.errorExtra = error2.extra;
      }
      errorInfo.errorDetails = errorDetails;
      const n8nDetails = {};
      if (error2.node) {
        n8nDetails.nodeName = error2.node.name;
        n8nDetails.nodeType = error2.node.type;
        n8nDetails.nodeVersion = error2.node.typeVersion;
        if (error2.node?.parameters?.resource) {
          n8nDetails.resource = error2.node.parameters.resource;
        }
        if (error2?.node?.parameters?.operation) {
          n8nDetails.operation = error2.node.parameters.operation;
        }
      }
      if (error2.context) {
        if (error2.context.itemIndex !== void 0) {
          n8nDetails.itemIndex = error2.context.itemIndex;
        }
        if (error2.context.runIndex !== void 0) {
          n8nDetails.runIndex = error2.context.runIndex;
        }
        if (error2.context.parameter !== void 0) {
          n8nDetails.parameter = error2.context.parameter;
        }
        if (error2.context.causeDetailed) {
          n8nDetails.causeDetailed = error2.context.causeDetailed;
        }
      }
      if (error2.timestamp) {
        n8nDetails.time = new Date(error2.timestamp).toLocaleString();
      }
      n8nDetails.n8nVersion = n8nVersion.value;
      n8nDetails.binaryDataMode = rootStore.binaryDataMode;
      if (error2.cause) {
        n8nDetails.cause = error2.cause;
      }
      n8nDetails.stackTrace = error2.stack?.split("\n");
      errorInfo.n8nDetails = n8nDetails;
      void clipboard.copy(JSON.stringify(errorInfo, null, 2));
      copySuccess();
    }
    function copySuccess() {
      toast.showMessage({
        title: i18n.baseText("nodeErrorView.showMessage.title"),
        type: "info"
      });
    }
    function nodeIsHidden() {
      const nodeType = nodeTypesStore.getNodeType(node?.value.type);
      return nodeType?.hidden ?? false;
    }
    const onOpenErrorNodeDetailClick = () => {
      ndvStore.activeNodeName = props.error.node.name;
    };
    async function onAskAssistantClick() {
      const { message, lineNumber, description } = props.error;
      const sessionInProgress = !assistantStore.isSessionEnded;
      const errorHelp = {
        error: {
          name: props.error.name,
          message,
          lineNumber,
          description: description ?? getErrorDescription(),
          type: "type" in props.error ? props.error.type : void 0
        },
        node: node.value
      };
      if (sessionInProgress) {
        uiStore.openModalWithData({
          name: NEW_ASSISTANT_SESSION_MODAL,
          data: { context: { errorHelp } }
        });
        return;
      }
      await assistantStore.initErrorHelper(errorHelp);
      assistantStore.trackUserOpenedAssistant({
        source: "error",
        task: "error",
        has_existing_session: false
      });
    }
    return (_ctx, _cache) => {
      const _component_n8n_button = resolveComponent("n8n-button");
      const _component_n8n_icon_button = resolveComponent("n8n-icon-button");
      const _component_n8n_tooltip = resolveComponent("n8n-tooltip");
      const _component_font_awesome_icon = resolveComponent("font-awesome-icon");
      const _directive_n8n_html = resolveDirective("n8n-html");
      return openBlock(), createElementBlock("div", _hoisted_1$4, [
        createBaseVNode("div", _hoisted_2$3, [
          createBaseVNode("div", _hoisted_3$2, [
            createBaseVNode("div", null, toDisplayString(getErrorMessage()), 1)
          ]),
          (_ctx.error.description || _ctx.error.context?.descriptionKey) && !isSubNodeError.value ? withDirectives((openBlock(), createElementBlock("div", _hoisted_4, null, 512)), [
            [_directive_n8n_html, getErrorDescription()]
          ]) : createCommentVNode("", true),
          isSubNodeError.value ? (openBlock(), createElementBlock("div", _hoisted_5, [
            createVNode(_component_n8n_button, {
              icon: "arrow-right",
              type: "secondary",
              label: unref(i18n).baseText("pushConnection.executionError.openNode"),
              class: "node-error-view__button",
              "data-test-id": "node-error-view-open-node-button",
              onClick: onOpenErrorNodeDetailClick
            }, null, 8, ["label"])
          ])) : createCommentVNode("", true),
          isAskAssistantAvailable.value ? (openBlock(), createElementBlock("div", _hoisted_6, [
            createVNode(InlineAskAssistantButton, {
              asked: assistantAlreadyAsked.value,
              onClick: onAskAssistantClick
            }, null, 8, ["asked"])
          ])) : createCommentVNode("", true)
        ]),
        !_ctx.compact ? (openBlock(), createElementBlock("div", _hoisted_7, [
          createBaseVNode("div", _hoisted_8, [
            createBaseVNode("p", _hoisted_9, toDisplayString(unref(i18n).baseText("nodeErrorView.details.title")), 1),
            createVNode(_component_n8n_tooltip, {
              class: "item",
              content: unref(i18n).baseText("nodeErrorView.copyToClipboard.tooltip"),
              placement: "left"
            }, {
              default: withCtx(() => [
                createBaseVNode("div", _hoisted_10, [
                  createVNode(_component_n8n_icon_button, {
                    icon: "copy",
                    type: "secondary",
                    size: "mini",
                    text: "true",
                    "transparent-background": "transparent",
                    onClick: copyErrorDetails
                  })
                ])
              ]),
              _: 1
            }, 8, ["content"])
          ]),
          createBaseVNode("div", _hoisted_11, [
            "httpCode" in _ctx.error && _ctx.error.httpCode || prepareRawMessages.value.length || _ctx.error?.context?.data || _ctx.error.extra ? (openBlock(), createElementBlock("details", _hoisted_12, [
              createBaseVNode("summary", _hoisted_13, [
                createVNode(_component_font_awesome_icon, {
                  class: "node-error-view__details-icon",
                  icon: "angle-right"
                }),
                createTextVNode(" " + toDisplayString(unref(i18n).baseText("nodeErrorView.details.from", {
                  interpolate: { node: `${nodeDefaultName.value}` }
                })), 1)
              ]),
              createBaseVNode("div", _hoisted_14, [
                "httpCode" in _ctx.error && _ctx.error.httpCode ? (openBlock(), createElementBlock("div", _hoisted_15, [
                  createBaseVNode("p", _hoisted_16, toDisplayString(unref(i18n).baseText("nodeErrorView.errorCode")), 1),
                  createBaseVNode("p", _hoisted_17, [
                    createBaseVNode("code", null, toDisplayString(_ctx.error.httpCode), 1)
                  ])
                ])) : createCommentVNode("", true),
                prepareRawMessages.value.length ? (openBlock(), createElementBlock("div", _hoisted_18, [
                  createBaseVNode("p", _hoisted_19, toDisplayString(unref(i18n).baseText("nodeErrorView.details.rawMessages")), 1),
                  createBaseVNode("div", _hoisted_20, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(prepareRawMessages.value, (msg, index) => {
                      return openBlock(), createElementBlock("div", { key: index }, [
                        createBaseVNode("pre", null, [
                          createBaseVNode("code", null, toDisplayString(msg), 1)
                        ])
                      ]);
                    }), 128))
                  ])
                ])) : createCommentVNode("", true),
                _ctx.error?.context?.data ? (openBlock(), createElementBlock("div", _hoisted_21, [
                  createBaseVNode("p", _hoisted_22, toDisplayString(unref(i18n).baseText("nodeErrorView.details.errorData")), 1),
                  createBaseVNode("div", _hoisted_23, [
                    createBaseVNode("pre", null, [
                      createBaseVNode("code", null, toDisplayString(_ctx.error.context.data), 1)
                    ])
                  ])
                ])) : createCommentVNode("", true),
                _ctx.error.extra ? (openBlock(), createElementBlock("div", _hoisted_24, [
                  createBaseVNode("p", _hoisted_25, toDisplayString(unref(i18n).baseText("nodeErrorView.details.errorExtra")), 1),
                  createBaseVNode("div", _hoisted_26, [
                    createBaseVNode("pre", null, [
                      createBaseVNode("code", null, toDisplayString(_ctx.error.extra), 1)
                    ])
                  ])
                ])) : createCommentVNode("", true),
                _ctx.error.context && _ctx.error.context.request ? (openBlock(), createElementBlock("div", _hoisted_27, [
                  createBaseVNode("p", _hoisted_28, toDisplayString(unref(i18n).baseText("nodeErrorView.details.request")), 1),
                  createBaseVNode("div", _hoisted_29, [
                    createBaseVNode("pre", null, [
                      createBaseVNode("code", null, toDisplayString(_ctx.error.context.request), 1)
                    ])
                  ])
                ])) : createCommentVNode("", true)
              ])
            ])) : createCommentVNode("", true),
            createBaseVNode("details", _hoisted_30, [
              createBaseVNode("summary", _hoisted_31, [
                createVNode(_component_font_awesome_icon, {
                  class: "node-error-view__details-icon",
                  icon: "angle-right"
                }),
                createTextVNode(" " + toDisplayString(unref(i18n).baseText("nodeErrorView.details.info")), 1)
              ]),
              createBaseVNode("div", _hoisted_32, [
                _ctx.error.context && _ctx.error.context.itemIndex !== void 0 ? (openBlock(), createElementBlock("div", _hoisted_33, [
                  createBaseVNode("p", _hoisted_34, toDisplayString(unref(i18n).baseText("nodeErrorView.itemIndex")), 1),
                  createBaseVNode("p", _hoisted_35, [
                    createBaseVNode("code", null, toDisplayString(_ctx.error.context.itemIndex), 1)
                  ])
                ])) : createCommentVNode("", true),
                _ctx.error.context && _ctx.error.context.runIndex !== void 0 ? (openBlock(), createElementBlock("div", _hoisted_36, [
                  createBaseVNode("p", _hoisted_37, toDisplayString(unref(i18n).baseText("nodeErrorView.runIndex")), 1),
                  createBaseVNode("p", _hoisted_38, [
                    createBaseVNode("code", null, toDisplayString(_ctx.error.context.runIndex), 1)
                  ])
                ])) : createCommentVNode("", true),
                _ctx.error.context && _ctx.error.context.parameter !== void 0 ? (openBlock(), createElementBlock("div", _hoisted_39, [
                  createBaseVNode("p", _hoisted_40, toDisplayString(unref(i18n).baseText("nodeErrorView.inParameter")), 1),
                  createBaseVNode("p", _hoisted_41, [
                    createBaseVNode("code", null, toDisplayString(parameterDisplayName(`${_ctx.error.context.parameter}`)), 1)
                  ])
                ])) : createCommentVNode("", true),
                _ctx.error.node && _ctx.error.node.type ? (openBlock(), createElementBlock("div", _hoisted_42, [
                  createBaseVNode("p", _hoisted_43, toDisplayString(unref(i18n).baseText("nodeErrorView.details.nodeType")), 1),
                  createBaseVNode("p", _hoisted_44, [
                    createBaseVNode("code", null, toDisplayString(_ctx.error.node.type), 1)
                  ])
                ])) : createCommentVNode("", true),
                _ctx.error.node && _ctx.error.node.typeVersion ? (openBlock(), createElementBlock("div", _hoisted_45, [
                  createBaseVNode("p", _hoisted_46, toDisplayString(unref(i18n).baseText("nodeErrorView.details.nodeVersion")), 1),
                  createBaseVNode("p", _hoisted_47, [
                    createBaseVNode("code", null, [
                      createBaseVNode("span", null, toDisplayString(_ctx.error.node.typeVersion + " "), 1),
                      createBaseVNode("span", null, "(" + toDisplayString(nodeVersionTag(_ctx.error.node)) + ")", 1)
                    ])
                  ])
                ])) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_48, [
                  createBaseVNode("p", _hoisted_49, toDisplayString(unref(i18n).baseText("nodeErrorView.details.n8nVersion")), 1),
                  createBaseVNode("p", _hoisted_50, [
                    createBaseVNode("code", null, toDisplayString(n8nVersion.value), 1)
                  ])
                ]),
                _ctx.error.timestamp ? (openBlock(), createElementBlock("div", _hoisted_51, [
                  createBaseVNode("p", _hoisted_52, toDisplayString(unref(i18n).baseText("nodeErrorView.time")), 1),
                  createBaseVNode("p", _hoisted_53, [
                    createBaseVNode("code", null, toDisplayString(new Date(_ctx.error.timestamp).toLocaleString()), 1)
                  ])
                ])) : createCommentVNode("", true),
                _ctx.error.cause && displayCause.value ? (openBlock(), createElementBlock("div", _hoisted_54, [
                  createBaseVNode("p", _hoisted_55, toDisplayString(unref(i18n).baseText("nodeErrorView.details.errorCause")), 1),
                  createBaseVNode("pre", _hoisted_56, [
                    createBaseVNode("code", null, toDisplayString(_ctx.error.cause), 1)
                  ])
                ])) : createCommentVNode("", true),
                _ctx.error.context && _ctx.error.context.causeDetailed ? (openBlock(), createElementBlock("div", _hoisted_57, [
                  createBaseVNode("p", _hoisted_58, toDisplayString(unref(i18n).baseText("nodeErrorView.details.causeDetailed")), 1),
                  createBaseVNode("pre", _hoisted_59, [
                    createBaseVNode("code", null, toDisplayString(_ctx.error.context.causeDetailed), 1)
                  ])
                ])) : createCommentVNode("", true),
                _ctx.error.stack ? (openBlock(), createElementBlock("div", _hoisted_60, [
                  createBaseVNode("p", _hoisted_61, toDisplayString(unref(i18n).baseText("nodeErrorView.details.stackTrace")), 1),
                  createBaseVNode("pre", _hoisted_62, [
                    createBaseVNode("code", null, toDisplayString(_ctx.error.stack), 1)
                  ])
                ])) : createCommentVNode("", true)
              ])
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
});
const fallbackParser = (execData) => ({
  type: "json",
  data: execData,
  parsed: false
});
const outputTypeParsers = {
  [NodeConnectionTypes.AiLanguageModel](execData) {
    const response = execData.response ?? execData;
    if (!response) throw new Error("No response from Language Model");
    if (Array.isArray(response?.messages) && response?.messages.length === 1 && typeof response?.messages[0] === "string") {
      return {
        type: "text",
        data: response.messages[0],
        parsed: true
      };
    }
    if (response.messages && Array.isArray(response.messages)) {
      return outputTypeParsers[NodeConnectionTypes.AiMemory](execData);
    }
    if (response.generations) {
      const generations = response.generations;
      const content = generations.map((generation) => {
        if (generation?.text) return generation.text;
        if (Array.isArray(generation)) {
          return generation.map((item) => item.text ?? item).join("\n\n").trim();
        }
        return generation;
      });
      return {
        type: "json",
        data: content,
        parsed: true
      };
    }
    return {
      type: "json",
      data: response,
      parsed: true
    };
  },
  [NodeConnectionTypes.AiTool]: fallbackParser,
  [NodeConnectionTypes.AiAgent]: fallbackParser,
  [NodeConnectionTypes.AiMemory](execData) {
    const chatHistory = execData.chatHistory ?? execData.messages ?? execData?.response?.chat_history;
    if (Array.isArray(chatHistory)) {
      const responseText = chatHistory.map((content) => {
        if (content.type === "constructor" && content.id?.includes("messages") && content.kwargs) {
          let message = content.kwargs.content;
          if (Array.isArray(message)) {
            message = message.map((item) => {
              const { type, image_url } = item;
              if (type === "image_url" && typeof image_url === "object" && typeof image_url.url === "string") {
                return `![Input image](${image_url.url})`;
              } else if (typeof image_url === "string") {
                return `![Input image](${image_url})`;
              }
              return item.text;
            }).join("\n");
          }
          if (Object.keys(content.kwargs.additional_kwargs).length) {
            message += ` (${JSON.stringify(content.kwargs.additional_kwargs)})`;
          }
          if (content.id.includes("HumanMessage")) {
            message = `**Human:** ${String(message).trim()}`;
          } else if (content.id.includes("AIMessage")) {
            message = `**AI:** ${message}`;
          } else if (content.id.includes("SystemMessage")) {
            message = `**System Message:** ${message}`;
          }
          return message;
        }
        return "";
      }).join("\n\n");
      if (responseText.length === 0) {
        return fallbackParser(execData);
      }
      return {
        type: "markdown",
        data: responseText,
        parsed: true
      };
    }
    return fallbackParser(execData);
  },
  [NodeConnectionTypes.AiOutputParser]: fallbackParser,
  [NodeConnectionTypes.AiRetriever]: fallbackParser,
  [NodeConnectionTypes.AiVectorStore](execData) {
    if (execData.documents) {
      return {
        type: "json",
        data: execData.documents,
        parsed: true
      };
    }
    return fallbackParser(execData);
  },
  [NodeConnectionTypes.AiEmbedding](execData) {
    if (execData.documents) {
      return {
        type: "json",
        data: execData.documents,
        parsed: true
      };
    }
    return fallbackParser(execData);
  },
  [NodeConnectionTypes.AiDocument](execData) {
    if (execData.documents) {
      return {
        type: "json",
        data: execData.documents,
        parsed: true
      };
    }
    return fallbackParser(execData);
  },
  [NodeConnectionTypes.AiTextSplitter](execData) {
    const arrayData = Array.isArray(execData.response) ? execData.response : [execData.textSplitter];
    return {
      type: "text",
      data: arrayData.join("\n\n"),
      parsed: true
    };
  }
};
const useAiContentParsers = () => {
  const parseAiRunData = (executionData, endpointType) => {
    if ([NodeConnectionTypes.AiChain, NodeConnectionTypes.Main].includes(
      endpointType
    )) {
      return executionData.map((data) => ({ raw: data.json, parsedContent: null }));
    }
    const contentJson = executionData.map((node) => {
      const hasBinaryData = !isObjectEmpty(node.binary);
      return hasBinaryData ? node.binary : node.json;
    });
    const parser = outputTypeParsers[endpointType];
    if (!parser)
      return [
        {
          raw: contentJson.filter((item) => item !== void 0),
          parsedContent: null
        }
      ];
    const parsedOutput = contentJson.filter((c) => c !== void 0).map((c) => ({ raw: c, parsedContent: parser(c) }));
    return parsedOutput;
  };
  return {
    parseAiRunData
  };
};
const _hoisted_1$3 = ["data-content-type"];
const _hoisted_2$2 = ["textContent"];
const _sfc_main$4 = /* @__PURE__ */ defineComponent({
  __name: "AiRunContentBlock",
  props: {
    runData: {},
    error: {}
  },
  setup(__props) {
    const props = __props;
    const i18n = useI18n();
    const clipboard = useClipboard();
    const { showMessage } = useToast();
    const contentParsers = useAiContentParsers();
    const isExpanded = ref(getInitialExpandedState());
    const renderType = ref("rendered");
    const contentParsed = ref(false);
    const parsedRun = ref(void 0);
    function getInitialExpandedState() {
      const collapsedTypes = {
        input: [
          NodeConnectionTypes.AiDocument,
          NodeConnectionTypes.AiTextSplitter
        ],
        output: [
          NodeConnectionTypes.AiDocument,
          NodeConnectionTypes.AiEmbedding,
          NodeConnectionTypes.AiTextSplitter,
          NodeConnectionTypes.AiVectorStore
        ]
      };
      return !collapsedTypes[props.runData.inOut].includes(props.runData.type);
    }
    function isJsonString(text) {
      try {
        JSON.parse(text);
        return true;
      } catch (e) {
        return false;
      }
    }
    const markdownOptions = {
      highlight(str, lang) {
        if (lang && HighlightJS.getLanguage(lang)) {
          try {
            return HighlightJS.highlight(str, { language: lang }).value;
          } catch {
          }
        }
        return "";
      }
    };
    function parseAiRunData(run) {
      if (!run.data) {
        return;
      }
      const parsedData = contentParsers.parseAiRunData(run.data, run.type);
      return parsedData;
    }
    function isMarkdown(content) {
      if (typeof content !== "string") return false;
      const markdownPatterns = [
        /^# .+/gm,
        // headers
        /\*{1,2}.+\*{1,2}/g,
        // emphasis and strong
        /\[.+\]\(.+\)/g,
        // links
        /```[\s\S]+```/g
        // code blocks
      ];
      return markdownPatterns.some((pattern) => pattern.test(content));
    }
    function formatToJsonMarkdown(data) {
      return "```json\n" + data + "\n```";
    }
    function jsonToMarkdown(data) {
      if (isMarkdown(data)) return data;
      if (Array.isArray(data) && data.length && typeof data[0] !== "number") {
        const markdownArray = data.map((item) => jsonToMarkdown(item));
        return markdownArray.join("\n\n").trim();
      }
      if (typeof data === "string") {
        if (isJsonString(data)) {
          return formatToJsonMarkdown(data);
        }
        return data;
      }
      return formatToJsonMarkdown(JSON.stringify(data, null, 2));
    }
    function setContentParsed(content) {
      contentParsed.value = !!content.find((item) => {
        if (item.parsedContent?.parsed === true) {
          return true;
        }
        return false;
      });
    }
    function onBlockHeaderClick() {
      isExpanded.value = !isExpanded.value;
    }
    function onCopyToClipboard(content) {
      try {
        void clipboard.copy(JSON.stringify(content, void 0, 2));
        showMessage({
          title: i18n.baseText("generic.copiedToClipboard"),
          type: "success"
        });
      } catch (err) {
      }
    }
    function onRenderTypeChange(value) {
      renderType.value = value;
    }
    onMounted(() => {
      parsedRun.value = parseAiRunData(props.runData);
      if (parsedRun.value) {
        setContentParsed(parsedRun.value);
      }
    });
    return (_ctx, _cache) => {
      const _component_font_awesome_icon = resolveComponent("font-awesome-icon");
      const _component_n8n_radio_buttons = resolveComponent("n8n-radio-buttons");
      const _component_NodeErrorView = _sfc_main$5;
      const _component_n8n_icon_button = resolveComponent("n8n-icon-button");
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(_ctx.$style.block)
      }, [
        createBaseVNode("header", {
          class: normalizeClass(_ctx.$style.blockHeader),
          onClick: onBlockHeaderClick
        }, [
          createBaseVNode("button", {
            class: normalizeClass(_ctx.$style.blockToggle)
          }, [
            createVNode(_component_font_awesome_icon, {
              icon: isExpanded.value ? "angle-down" : "angle-right",
              size: "lg"
            }, null, 8, ["icon"])
          ], 2),
          createBaseVNode("p", {
            class: normalizeClass(_ctx.$style.blockTitle)
          }, toDisplayString(unref(capitalize)(_ctx.runData.inOut)), 3),
          contentParsed.value && !_ctx.error && isExpanded.value ? (openBlock(), createBlock(_component_n8n_radio_buttons, {
            key: 0,
            size: "small",
            "model-value": renderType.value,
            class: normalizeClass(_ctx.$style.rawSwitch),
            options: [
              { label: "Rendered", value: "rendered" },
              { label: "JSON", value: "json" }
            ],
            "onUpdate:modelValue": onRenderTypeChange
          }, null, 8, ["model-value", "class"])) : createCommentVNode("", true)
        ], 2),
        createBaseVNode("main", {
          class: normalizeClass({
            [_ctx.$style.blockContent]: true,
            [_ctx.$style.blockContentExpanded]: isExpanded.value
          })
        }, [
          _ctx.error ? (openBlock(), createBlock(_component_NodeErrorView, {
            key: 0,
            error: _ctx.error,
            class: normalizeClass(_ctx.$style.error)
          }, null, 8, ["error", "class"])) : (openBlock(true), createElementBlock(Fragment, { key: 1 }, renderList(parsedRun.value, ({ parsedContent, raw }, index) => {
            return openBlock(), createElementBlock("div", {
              key: index,
              class: normalizeClass(_ctx.$style.contentText),
              "data-content-type": parsedContent?.type
            }, [
              parsedContent && renderType.value === "rendered" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                parsedContent.type === "json" ? (openBlock(), createBlock(unref(VueMarkdown), {
                  key: 0,
                  source: jsonToMarkdown(parsedContent.data),
                  class: normalizeClass(_ctx.$style.markdown),
                  options: markdownOptions
                }, null, 8, ["source", "class"])) : createCommentVNode("", true),
                parsedContent.type === "markdown" ? (openBlock(), createBlock(unref(VueMarkdown), {
                  key: 1,
                  source: parsedContent.data,
                  class: normalizeClass(_ctx.$style.markdown),
                  options: markdownOptions
                }, null, 8, ["source", "class"])) : createCommentVNode("", true),
                parsedContent.type === "text" ? (openBlock(), createElementBlock("p", {
                  key: 2,
                  class: normalizeClass(_ctx.$style.runText),
                  textContent: toDisplayString(parsedContent.data)
                }, null, 10, _hoisted_2$2)) : createCommentVNode("", true)
              ], 64)) : (openBlock(), createElementBlock("div", {
                key: 1,
                class: normalizeClass(_ctx.$style.rawContent)
              }, [
                createVNode(_component_n8n_icon_button, {
                  size: "small",
                  class: normalizeClass(_ctx.$style.copyToClipboard),
                  type: "secondary",
                  title: unref(i18n).baseText("nodeErrorView.copyToClipboard"),
                  icon: "copy",
                  onClick: ($event) => onCopyToClipboard(raw)
                }, null, 8, ["class", "title", "onClick"]),
                createVNode(unref(VueMarkdown), {
                  source: jsonToMarkdown(raw),
                  class: normalizeClass(_ctx.$style.markdown)
                }, null, 8, ["source", "class"])
              ], 2))
            ], 10, _hoisted_1$3);
          }), 128))
        ], 2)
      ], 2);
    };
  }
});
const copyToClipboard = "_copyToClipboard_kaw5r_123";
const rawContent = "_rawContent_kaw5r_129";
const markdown = "_markdown_kaw5r_133";
const contentText = "_contentText_kaw5r_157";
const block = "_block_kaw5r_164";
const blockContent = "_blockContent_kaw5r_171";
const blockContentExpanded = "_blockContentExpanded_kaw5r_175";
const runText = "_runText_kaw5r_179";
const rawSwitch = "_rawSwitch_kaw5r_184";
const blockHeader = "_blockHeader_kaw5r_194";
const blockTitle = "_blockTitle_kaw5r_207";
const blockToggle = "_blockToggle_kaw5r_214";
const error = "_error_kaw5r_222";
const style0$3 = {
  copyToClipboard,
  rawContent,
  markdown,
  contentText,
  block,
  blockContent,
  blockContentExpanded,
  runText,
  rawSwitch,
  blockHeader,
  blockTitle,
  blockToggle,
  error
};
const cssModules$3 = {
  "$style": style0$3
};
const AiRunContentBlock = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__cssModules", cssModules$3]]);
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "ConsumedTokensDetails",
  props: {
    consumedTokens: {}
  },
  setup(__props) {
    const i18n = useI18n();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", null, [
        createVNode(unref(N8nText), {
          bold: true,
          size: "small"
        }, {
          default: withCtx(() => [
            createTextVNode(toDisplayString(unref(i18n).baseText("runData.aiContentBlock.tokens.prompt")) + " " + toDisplayString(unref(i18n).baseText("runData.aiContentBlock.tokens", {
              interpolate: {
                count: unref(formatTokenUsageCount)(_ctx.consumedTokens, "prompt")
              }
            })), 1)
          ]),
          _: 1
        }),
        _cache[0] || (_cache[0] = createBaseVNode("br", null, null, -1)),
        createVNode(unref(N8nText), {
          bold: true,
          size: "small"
        }, {
          default: withCtx(() => [
            createTextVNode(toDisplayString(unref(i18n).baseText("runData.aiContentBlock.tokens.completion")) + " " + toDisplayString(unref(i18n).baseText("runData.aiContentBlock.tokens", {
              interpolate: {
                count: unref(formatTokenUsageCount)(_ctx.consumedTokens, "completion")
              }
            })), 1)
          ]),
          _: 1
        })
      ]);
    };
  }
});
const _hoisted_1$2 = ["href"];
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "ViewSubExecution",
  props: {
    taskMetadata: {},
    displayMode: {},
    inline: { type: Boolean, default: false }
  },
  setup(__props) {
    const { trackOpeningRelatedExecution, resolveRelatedExecutionUrl } = useExecutionHelpers();
    const i18n = useI18n();
    const props = __props;
    const hasRelatedExecution = computed(() => {
      return Boolean(props.taskMetadata.subExecution ?? props.taskMetadata.parentExecution);
    });
    function getExecutionLinkLabel(task) {
      if (task.parentExecution) {
        return i18n.baseText("runData.openParentExecution", {
          interpolate: { id: task.parentExecution.executionId }
        });
      }
      if (task.subExecution) {
        if (props.taskMetadata.subExecutionsCount === 1) {
          return i18n.baseText("runData.openSubExecutionSingle");
        } else {
          return i18n.baseText("runData.openSubExecutionWithId", {
            interpolate: { id: task.subExecution.executionId }
          });
        }
      }
      return;
    }
    return (_ctx, _cache) => {
      const _component_N8nIcon = resolveComponent("N8nIcon");
      return hasRelatedExecution.value ? (openBlock(), createElementBlock("a", {
        key: 0,
        class: normalizeClass({ [_ctx.$style.relatedExecutionInfo]: !_ctx.inline }),
        "data-test-id": "related-execution-link",
        href: unref(resolveRelatedExecutionUrl)(_ctx.taskMetadata),
        target: "_blank",
        onClick: _cache[0] || (_cache[0] = withModifiers(($event) => unref(trackOpeningRelatedExecution)(_ctx.taskMetadata, _ctx.displayMode), ["stop"]))
      }, [
        createVNode(_component_N8nIcon, {
          icon: "external-link-alt",
          size: "xsmall"
        }),
        createTextVNode(" " + toDisplayString(getExecutionLinkLabel(_ctx.taskMetadata)), 1)
      ], 10, _hoisted_1$2)) : createCommentVNode("", true);
    };
  }
});
const relatedExecutionInfo = "_relatedExecutionInfo_saqms_123";
const style0$2 = {
  relatedExecutionInfo
};
const cssModules$2 = {
  "$style": style0$2
};
const ViewSubExecution = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__cssModules", cssModules$2]]);
const _hoisted_1$1 = { key: 0 };
const _hoisted_2$1 = { key: 1 };
const _hoisted_3$1 = { key: 2 };
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "RunDataAiContent",
  props: {
    inputData: {},
    contentIndex: {}
  },
  setup(__props) {
    const props = __props;
    const nodeTypesStore = useNodeTypesStore();
    const workflowsStore = useWorkflowsStore();
    const i18n = useI18n();
    const consumedTokensSum = computed(() => {
      return getConsumedTokens(outputRun.value);
    });
    function extractRunMeta(run) {
      const uiNode = workflowsStore.getNodeByName(props.inputData.node);
      const nodeType = nodeTypesStore.getNodeType(uiNode?.type ?? "");
      const runMeta2 = {
        startTimeMs: run.metadata.startTime,
        executionTimeMs: run.metadata.executionTime,
        node: nodeType,
        type: run.inOut,
        connectionType: run.type,
        subExecution: run.metadata?.subExecution
      };
      return runMeta2;
    }
    const outputRun = computed(() => {
      return props.inputData.data.find((r) => r.inOut === "output");
    });
    const runMeta = computed(() => {
      if (outputRun.value === void 0) {
        return;
      }
      return extractRunMeta(outputRun.value);
    });
    const executionRunData = computed(() => {
      return workflowsStore.getWorkflowExecution?.data?.resultData?.runData;
    });
    const outputError = computed(() => {
      return executionRunData.value?.[props.inputData.node]?.[props.inputData.runIndex]?.error;
    });
    return (_ctx, _cache) => {
      const _component_n8n_tooltip = resolveComponent("n8n-tooltip");
      const _component_n8n_info_tip = resolveComponent("n8n-info-tip");
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(_ctx.$style.container)
      }, [
        createBaseVNode("header", {
          class: normalizeClass(_ctx.$style.header)
        }, [
          runMeta.value?.node ? (openBlock(), createBlock(_sfc_main$6, {
            key: 0,
            class: normalizeClass(_ctx.$style.nodeIcon),
            "node-type": runMeta.value.node,
            size: 20
          }, null, 8, ["class", "node-type"])) : createCommentVNode("", true),
          createBaseVNode("div", {
            class: normalizeClass(_ctx.$style.headerWrap)
          }, [
            createBaseVNode("p", {
              class: normalizeClass(_ctx.$style.title)
            }, toDisplayString(_ctx.inputData.node), 3),
            createBaseVNode("ul", {
              class: normalizeClass(_ctx.$style.meta)
            }, [
              runMeta.value?.startTimeMs ? (openBlock(), createElementBlock("li", _hoisted_1$1, toDisplayString(runMeta.value?.executionTimeMs) + "ms", 1)) : createCommentVNode("", true),
              runMeta.value?.startTimeMs ? (openBlock(), createElementBlock("li", _hoisted_2$1, [
                createVNode(_component_n8n_tooltip, null, {
                  content: withCtx(() => [
                    createTextVNode(toDisplayString(new Date(runMeta.value?.startTimeMs).toLocaleString()), 1)
                  ]),
                  default: withCtx(() => [
                    createTextVNode(" " + toDisplayString(unref(i18n).baseText("runData.aiContentBlock.startedAt", {
                      interpolate: {
                        startTime: new Date(runMeta.value?.startTimeMs).toLocaleTimeString()
                      }
                    })), 1)
                  ]),
                  _: 1
                })
              ])) : createCommentVNode("", true),
              runMeta.value ? (openBlock(), createElementBlock("li", _hoisted_3$1, [
                createVNode(ViewSubExecution, {
                  "task-metadata": runMeta.value,
                  "display-mode": "ai",
                  inline: true
                }, null, 8, ["task-metadata"])
              ])) : createCommentVNode("", true),
              (consumedTokensSum.value?.totalTokens ?? 0) > 0 ? (openBlock(), createElementBlock("li", {
                key: 3,
                class: normalizeClass(_ctx.$style.tokensUsage)
              }, [
                createTextVNode(toDisplayString(unref(i18n).baseText("runData.aiContentBlock.tokens", {
                  interpolate: {
                    count: unref(formatTokenUsageCount)(consumedTokensSum.value, "total")
                  }
                })) + " ", 1),
                createVNode(_component_n8n_info_tip, {
                  type: "tooltip",
                  theme: "info-light",
                  "tooltip-placement": "right"
                }, {
                  default: withCtx(() => [
                    createVNode(_sfc_main$3, { "consumed-tokens": consumedTokensSum.value }, null, 8, ["consumed-tokens"])
                  ]),
                  _: 1
                })
              ], 2)) : createCommentVNode("", true)
            ], 2)
          ], 2)
        ], 2),
        (openBlock(true), createElementBlock(Fragment, null, renderList(props.inputData.data, (run, index) => {
          return openBlock(), createElementBlock("main", {
            key: index,
            class: normalizeClass(_ctx.$style.content)
          }, [
            createVNode(AiRunContentBlock, {
              "run-data": run,
              error: run.inOut === "output" ? outputError.value : void 0
            }, null, 8, ["run-data", "error"])
          ], 2);
        }), 128))
      ], 2);
    };
  }
});
const container$1 = "_container_dypaw_2";
const nodeIcon$1 = "_nodeIcon_dypaw_5";
const header = "_header_dypaw_8";
const headerWrap = "_headerWrap_dypaw_14";
const title$1 = "_title_dypaw_18";
const meta = "_meta_dypaw_25";
const tokensUsage = "_tokensUsage_dypaw_41";
const style0$1 = {
  container: container$1,
  nodeIcon: nodeIcon$1,
  header,
  headerWrap,
  title: title$1,
  meta,
  tokensUsage
};
const cssModules$1 = {
  "$style": style0$1
};
const RunDataAiContent = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__cssModules", cssModules$1]]);
const _hoisted_1 = ["data-tree-depth"];
const _hoisted_2 = ["onClick"];
const _hoisted_3 = ["textContent"];
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "RunDataAi",
  props: {
    node: {},
    runIndex: { default: 0 },
    slim: { type: Boolean },
    workflow: {}
  },
  setup(__props) {
    const props = __props;
    const workflowsStore = useWorkflowsStore();
    const nodeTypesStore = useNodeTypesStore();
    const selectedRun = ref([]);
    const i18n = useI18n();
    function isTreeNodeSelected(node) {
      return selectedRun.value.some((run) => run.node === node.node && run.runIndex === node.runIndex);
    }
    function toggleTreeItem(node) {
      node.expanded = !node.expanded;
    }
    function onItemClick(data) {
      const matchingRun = aiData.value?.find(
        (run) => run.node === data.node && run.runIndex === data.runIndex
      );
      if (!matchingRun) {
        selectedRun.value = [];
        return;
      }
      const selectedNodeRun = workflowsStore.getWorkflowResultDataByNodeName(data.node)?.[data.runIndex];
      if (!selectedNodeRun) {
        return;
      }
      selectedRun.value = [
        {
          node: data.node,
          runIndex: data.runIndex,
          data: getReferencedData(selectedNodeRun, true)
        }
      ];
    }
    function getNodeType(nodeName) {
      const node = workflowsStore.getNodeByName(nodeName);
      if (!node) {
        return null;
      }
      const nodeType = nodeTypesStore.getNodeType(node?.type);
      return nodeType;
    }
    function selectFirst() {
      if (executionTree.value.length && executionTree.value[0].children.length) {
        onItemClick(executionTree.value[0].children[0]);
      }
    }
    const aiData = computed(
      () => createAiData(props.node.name, props.workflow, workflowsStore.getWorkflowResultDataByNodeName)
    );
    const executionTree = computed(
      () => getTreeNodeData(props.node.name, props.workflow, aiData.value)
    );
    watch(() => props.runIndex, selectFirst, { immediate: true });
    return (_ctx, _cache) => {
      const _component_font_awesome_icon = resolveComponent("font-awesome-icon");
      const _component_n8n_tooltip = resolveComponent("n8n-tooltip");
      const _component_n8n_text = resolveComponent("n8n-text");
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(_ctx.$style.container)
      }, [
        aiData.value.length > 0 ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
          createBaseVNode("div", {
            class: normalizeClass({ [_ctx.$style.tree]: true, [_ctx.$style.slim]: _ctx.slim })
          }, [
            createVNode(unref(ElTree), {
              data: executionTree.value,
              props: { label: "node" },
              "default-expand-all": "",
              indent: 12,
              "expand-on-click-node": false,
              "data-test-id": "lm-chat-logs-tree",
              onNodeClick: onItemClick
            }, {
              default: withCtx(({ node, data }) => [
                createBaseVNode("div", {
                  class: normalizeClass({
                    [_ctx.$style.treeNode]: true,
                    [_ctx.$style.isSelected]: isTreeNodeSelected(data)
                  }),
                  "data-tree-depth": data.depth,
                  style: normalizeStyle({ "--item-depth": data.depth })
                }, [
                  data.children.length ? (openBlock(), createElementBlock("button", {
                    key: 0,
                    class: normalizeClass(_ctx.$style.treeToggle),
                    onClick: ($event) => toggleTreeItem(node)
                  }, [
                    createVNode(_component_font_awesome_icon, {
                      icon: node.expanded ? "angle-down" : "angle-right"
                    }, null, 8, ["icon"])
                  ], 10, _hoisted_2)) : createCommentVNode("", true),
                  createVNode(_component_n8n_tooltip, {
                    disabled: !_ctx.slim,
                    placement: "right"
                  }, {
                    content: withCtx(() => [
                      createTextVNode(toDisplayString(node.label), 1)
                    ]),
                    default: withCtx(() => [
                      createBaseVNode("span", {
                        class: normalizeClass(_ctx.$style.leafLabel)
                      }, [
                        createVNode(_sfc_main$6, {
                          "node-type": getNodeType(data.node),
                          size: 17,
                          class: normalizeClass(_ctx.$style.nodeIcon)
                        }, null, 8, ["node-type", "class"]),
                        !_ctx.slim ? (openBlock(), createElementBlock("span", {
                          key: 0,
                          textContent: toDisplayString(node.label)
                        }, null, 8, _hoisted_3)) : createCommentVNode("", true)
                      ], 2)
                    ]),
                    _: 2
                  }, 1032, ["disabled"])
                ], 14, _hoisted_1)
              ]),
              _: 1
            }, 8, ["data"])
          ], 2),
          createBaseVNode("div", {
            class: normalizeClass(_ctx.$style.runData)
          }, [
            selectedRun.value.length === 0 ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: normalizeClass(_ctx.$style.empty)
            }, [
              createVNode(_component_n8n_text, { size: "large" }, {
                default: withCtx(() => [
                  createTextVNode(toDisplayString(unref(i18n).baseText("ndv.output.ai.empty", {
                    interpolate: {
                      node: props.node.name
                    }
                  })), 1)
                ]),
                _: 1
              })
            ], 2)) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(selectedRun.value, (data, index) => {
              return openBlock(), createElementBlock("div", {
                key: `${data.node}__${data.runIndex}__index`,
                "data-test-id": "lm-chat-logs-entry"
              }, [
                createVNode(RunDataAiContent, {
                  "input-data": data,
                  "content-index": index
                }, null, 8, ["input-data", "content-index"])
              ]);
            }), 128))
          ], 2)
        ], 64)) : (openBlock(), createElementBlock("div", {
          key: 1,
          class: normalizeClass(_ctx.$style.noData)
        }, toDisplayString(unref(i18n).baseText("ndv.output.ai.waiting")), 3))
      ], 2);
    };
  }
});
const treeToggle = "_treeToggle_1qaq4_123";
const leafLabel = "_leafLabel_1qaq4_131";
const noData = "_noData_1qaq4_137";
const empty = "_empty_1qaq4_145";
const title = "_title_1qaq4_149";
const tree = "_tree_1qaq4_123";
const slim = "_slim_1qaq4_161";
const runData = "_runData_1qaq4_165";
const container = "_container_1qaq4_171";
const nodeIcon = "_nodeIcon_1qaq4_198";
const isSelected = "_isSelected_1qaq4_204";
const treeNode = "_treeNode_1qaq4_208";
const style0 = {
  treeToggle,
  leafLabel,
  noData,
  empty,
  title,
  tree,
  slim,
  runData,
  container,
  nodeIcon,
  isSelected,
  treeNode
};
const cssModules = {
  "$style": style0
};
const RunDataAi = /* @__PURE__ */ _export_sfc(_sfc_main, [["__cssModules", cssModules]]);
export {
  HighlightJS as H,
  RunDataAi as R,
  ViewSubExecution as V,
  _sfc_main$3 as _,
  getTreeNodeData as a,
  getTotalConsumedTokens as b,
  createAiData as c,
  _sfc_main$5 as d,
  formatTokenUsageCount as f,
  getSubtreeTotalConsumedTokens as g
};
