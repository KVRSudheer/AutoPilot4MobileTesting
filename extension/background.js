var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target2, all) => {
  for (var name in all)
    __defProp(target2, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target2) => (target2 = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target2, "default", { value: mod, enumerable: true }) : target2,
  mod
));

// ../node_modules/fast-xml-parser/src/util.js
var require_util = __commonJS({
  "../node_modules/fast-xml-parser/src/util.js"(exports) {
    "use strict";
    var nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
    var nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
    var nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
    var regexName = new RegExp("^" + nameRegexp + "$");
    var getAllMatches = function(string, regex) {
      const matches = [];
      let match = regex.exec(string);
      while (match) {
        const allmatches = [];
        allmatches.startIndex = regex.lastIndex - match[0].length;
        const len = match.length;
        for (let index = 0; index < len; index++) {
          allmatches.push(match[index]);
        }
        matches.push(allmatches);
        match = regex.exec(string);
      }
      return matches;
    };
    var isName = function(string) {
      const match = regexName.exec(string);
      return !(match === null || typeof match === "undefined");
    };
    exports.isExist = function(v) {
      return typeof v !== "undefined";
    };
    exports.isEmptyObject = function(obj) {
      return Object.keys(obj).length === 0;
    };
    exports.merge = function(target2, a, arrayMode) {
      if (a) {
        const keys = Object.keys(a);
        const len = keys.length;
        for (let i = 0; i < len; i++) {
          if (arrayMode === "strict") {
            target2[keys[i]] = [a[keys[i]]];
          } else {
            target2[keys[i]] = a[keys[i]];
          }
        }
      }
    };
    exports.getValue = function(v) {
      if (exports.isExist(v)) {
        return v;
      } else {
        return "";
      }
    };
    var DANGEROUS_PROPERTY_NAMES = [
      // '__proto__',
      // 'constructor',
      // 'prototype',
      "hasOwnProperty",
      "toString",
      "valueOf",
      "__defineGetter__",
      "__defineSetter__",
      "__lookupGetter__",
      "__lookupSetter__"
    ];
    var criticalProperties = ["__proto__", "constructor", "prototype"];
    exports.isName = isName;
    exports.getAllMatches = getAllMatches;
    exports.nameRegexp = nameRegexp;
    exports.DANGEROUS_PROPERTY_NAMES = DANGEROUS_PROPERTY_NAMES;
    exports.criticalProperties = criticalProperties;
  }
});

// ../node_modules/fast-xml-parser/src/validator.js
var require_validator = __commonJS({
  "../node_modules/fast-xml-parser/src/validator.js"(exports) {
    "use strict";
    var util = require_util();
    var defaultOptions = {
      allowBooleanAttributes: false,
      //A tag can have attributes without any value
      unpairedTags: []
    };
    exports.validate = function(xmlData, options) {
      options = Object.assign({}, defaultOptions, options);
      const tags = [];
      let tagFound = false;
      let reachedRoot = false;
      if (xmlData[0] === "\uFEFF") {
        xmlData = xmlData.substr(1);
      }
      for (let i = 0; i < xmlData.length; i++) {
        if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
          i += 2;
          i = readPI(xmlData, i);
          if (i.err) return i;
        } else if (xmlData[i] === "<") {
          let tagStartPos = i;
          i++;
          if (xmlData[i] === "!") {
            i = readCommentAndCDATA(xmlData, i);
            continue;
          } else {
            let closingTag = false;
            if (xmlData[i] === "/") {
              closingTag = true;
              i++;
            }
            let tagName = "";
            for (; i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "	" && xmlData[i] !== "\n" && xmlData[i] !== "\r"; i++) {
              tagName += xmlData[i];
            }
            tagName = tagName.trim();
            if (tagName[tagName.length - 1] === "/") {
              tagName = tagName.substring(0, tagName.length - 1);
              i--;
            }
            if (!validateTagName(tagName)) {
              let msg;
              if (tagName.trim().length === 0) {
                msg = "Invalid space after '<'.";
              } else {
                msg = "Tag '" + tagName + "' is an invalid name.";
              }
              return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
            }
            const result = readAttributeStr(xmlData, i);
            if (result === false) {
              return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
            }
            let attrStr = result.value;
            i = result.index;
            if (attrStr[attrStr.length - 1] === "/") {
              const attrStrStart = i - attrStr.length;
              attrStr = attrStr.substring(0, attrStr.length - 1);
              const isValid = validateAttributeString(attrStr, options);
              if (isValid === true) {
                tagFound = true;
              } else {
                return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
              }
            } else if (closingTag) {
              if (!result.tagClosed) {
                return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
              } else if (attrStr.trim().length > 0) {
                return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
              } else if (tags.length === 0) {
                return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
              } else {
                const otg = tags.pop();
                if (tagName !== otg.tagName) {
                  let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
                  return getErrorObject(
                    "InvalidTag",
                    "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                    getLineNumberForPosition(xmlData, tagStartPos)
                  );
                }
                if (tags.length == 0) {
                  reachedRoot = true;
                }
              }
            } else {
              const isValid = validateAttributeString(attrStr, options);
              if (isValid !== true) {
                return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
              }
              if (reachedRoot === true) {
                return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
              } else if (options.unpairedTags.indexOf(tagName) !== -1) {
              } else {
                tags.push({ tagName, tagStartPos });
              }
              tagFound = true;
            }
            for (i++; i < xmlData.length; i++) {
              if (xmlData[i] === "<") {
                if (xmlData[i + 1] === "!") {
                  i++;
                  i = readCommentAndCDATA(xmlData, i);
                  continue;
                } else if (xmlData[i + 1] === "?") {
                  i = readPI(xmlData, ++i);
                  if (i.err) return i;
                } else {
                  break;
                }
              } else if (xmlData[i] === "&") {
                const afterAmp = validateAmpersand(xmlData, i);
                if (afterAmp == -1)
                  return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
                i = afterAmp;
              } else {
                if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
                  return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
                }
              }
            }
            if (xmlData[i] === "<") {
              i--;
            }
          }
        } else {
          if (isWhiteSpace(xmlData[i])) {
            continue;
          }
          return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
        }
      }
      if (!tagFound) {
        return getErrorObject("InvalidXml", "Start tag expected.", 1);
      } else if (tags.length == 1) {
        return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
      } else if (tags.length > 0) {
        return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
      }
      return true;
    };
    function isWhiteSpace(char) {
      return char === " " || char === "	" || char === "\n" || char === "\r";
    }
    function readPI(xmlData, i) {
      const start = i;
      for (; i < xmlData.length; i++) {
        if (xmlData[i] == "?" || xmlData[i] == " ") {
          const tagname = xmlData.substr(start, i - start);
          if (i > 5 && tagname === "xml") {
            return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
          } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
            i++;
            break;
          } else {
            continue;
          }
        }
      }
      return i;
    }
    function readCommentAndCDATA(xmlData, i) {
      if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
        for (i += 3; i < xmlData.length; i++) {
          if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
            i += 2;
            break;
          }
        }
      } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
        let angleBracketsCount = 1;
        for (i += 8; i < xmlData.length; i++) {
          if (xmlData[i] === "<") {
            angleBracketsCount++;
          } else if (xmlData[i] === ">") {
            angleBracketsCount--;
            if (angleBracketsCount === 0) {
              break;
            }
          }
        }
      } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
        for (i += 8; i < xmlData.length; i++) {
          if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
            i += 2;
            break;
          }
        }
      }
      return i;
    }
    var doubleQuote = '"';
    var singleQuote2 = "'";
    function readAttributeStr(xmlData, i) {
      let attrStr = "";
      let startChar = "";
      let tagClosed = false;
      for (; i < xmlData.length; i++) {
        if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote2) {
          if (startChar === "") {
            startChar = xmlData[i];
          } else if (startChar !== xmlData[i]) {
          } else {
            startChar = "";
          }
        } else if (xmlData[i] === ">") {
          if (startChar === "") {
            tagClosed = true;
            break;
          }
        }
        attrStr += xmlData[i];
      }
      if (startChar !== "") {
        return false;
      }
      return {
        value: attrStr,
        index: i,
        tagClosed
      };
    }
    var validAttrStrRegxp = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
    function validateAttributeString(attrStr, options) {
      const matches = util.getAllMatches(attrStr, validAttrStrRegxp);
      const attrNames = {};
      for (let i = 0; i < matches.length; i++) {
        if (matches[i][1].length === 0) {
          return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
        } else if (matches[i][3] !== void 0 && matches[i][4] === void 0) {
          return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
        } else if (matches[i][3] === void 0 && !options.allowBooleanAttributes) {
          return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
        }
        const attrName = matches[i][2];
        if (!validateAttrName(attrName)) {
          return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
        }
        if (!attrNames.hasOwnProperty(attrName)) {
          attrNames[attrName] = 1;
        } else {
          return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
        }
      }
      return true;
    }
    function validateNumberAmpersand(xmlData, i) {
      let re = /\d/;
      if (xmlData[i] === "x") {
        i++;
        re = /[\da-fA-F]/;
      }
      for (; i < xmlData.length; i++) {
        if (xmlData[i] === ";")
          return i;
        if (!xmlData[i].match(re))
          break;
      }
      return -1;
    }
    function validateAmpersand(xmlData, i) {
      i++;
      if (xmlData[i] === ";")
        return -1;
      if (xmlData[i] === "#") {
        i++;
        return validateNumberAmpersand(xmlData, i);
      }
      let count = 0;
      for (; i < xmlData.length; i++, count++) {
        if (xmlData[i].match(/\w/) && count < 20)
          continue;
        if (xmlData[i] === ";")
          break;
        return -1;
      }
      return i;
    }
    function getErrorObject(code, message, lineNumber) {
      return {
        err: {
          code,
          msg: message,
          line: lineNumber.line || lineNumber,
          col: lineNumber.col
        }
      };
    }
    function validateAttrName(attrName) {
      return util.isName(attrName);
    }
    function validateTagName(tagname) {
      return util.isName(tagname);
    }
    function getLineNumberForPosition(xmlData, index) {
      const lines = xmlData.substring(0, index).split(/\r?\n/);
      return {
        line: lines.length,
        // column number is last line's length + 1, because column numbering starts at 1:
        col: lines[lines.length - 1].length + 1
      };
    }
    function getPositionFromMatch(match) {
      return match.startIndex + match[1].length;
    }
  }
});

// ../node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
var require_OptionsBuilder = __commonJS({
  "../node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js"(exports) {
    var { DANGEROUS_PROPERTY_NAMES, criticalProperties } = require_util();
    var defaultOnDangerousProperty = (name) => {
      if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
        return "__" + name;
      }
      return name;
    };
    var defaultOptions = {
      preserveOrder: false,
      attributeNamePrefix: "@_",
      attributesGroupName: false,
      textNodeName: "#text",
      ignoreAttributes: true,
      removeNSPrefix: false,
      // remove NS from tag name or attribute name if true
      allowBooleanAttributes: false,
      //a tag can have attributes without any value
      //ignoreRootElement : false,
      parseTagValue: true,
      parseAttributeValue: false,
      trimValues: true,
      //Trim string values of tag and attributes
      cdataPropName: false,
      numberParseOptions: {
        hex: true,
        leadingZeros: true,
        eNotation: true
      },
      tagValueProcessor: function(tagName, val) {
        return val;
      },
      attributeValueProcessor: function(attrName, val) {
        return val;
      },
      stopNodes: [],
      //nested tags will not be parsed even for errors
      alwaysCreateTextNode: false,
      isArray: () => false,
      commentPropName: false,
      unpairedTags: [],
      processEntities: true,
      htmlEntities: false,
      ignoreDeclaration: false,
      ignorePiTags: false,
      transformTagName: false,
      transformAttributeName: false,
      updateTag: function(tagName, jPath, attrs) {
        return tagName;
      },
      // skipEmptyListItem: false
      captureMetaData: false,
      maxNestedTags: 100,
      strictReservedNames: true,
      onDangerousProperty: defaultOnDangerousProperty
    };
    function validatePropertyName(propertyName, optionName) {
      if (typeof propertyName !== "string") {
        return;
      }
      const normalized = propertyName.toLowerCase();
      if (DANGEROUS_PROPERTY_NAMES.some((dangerous) => normalized === dangerous.toLowerCase())) {
        throw new Error(
          `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
        );
      }
      if (criticalProperties.some((dangerous) => normalized === dangerous.toLowerCase())) {
        throw new Error(
          `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
        );
      }
    }
    function normalizeProcessEntities(value) {
      if (typeof value === "boolean") {
        return {
          enabled: value,
          // true or false
          maxEntitySize: 1e4,
          maxExpansionDepth: 10,
          maxTotalExpansions: 1e3,
          maxExpandedLength: 1e5,
          allowedTags: null,
          tagFilter: null
        };
      }
      if (typeof value === "object" && value !== null) {
        return {
          enabled: value.enabled !== false,
          maxEntitySize: Math.max(1, value.maxEntitySize ?? 1e4),
          maxExpansionDepth: Math.max(1, value.maxExpansionDepth ?? 1e4),
          maxTotalExpansions: Math.max(1, value.maxTotalExpansions ?? Infinity),
          maxExpandedLength: Math.max(1, value.maxExpandedLength ?? 1e5),
          maxEntityCount: Math.max(1, value.maxEntityCount ?? 1e3),
          allowedTags: value.allowedTags ?? null,
          tagFilter: value.tagFilter ?? null
        };
      }
      return normalizeProcessEntities(true);
    }
    var buildOptions = function(options) {
      const built = Object.assign({}, defaultOptions, options);
      const propertyNameOptions = [
        { value: built.attributeNamePrefix, name: "attributeNamePrefix" },
        { value: built.attributesGroupName, name: "attributesGroupName" },
        { value: built.textNodeName, name: "textNodeName" },
        { value: built.cdataPropName, name: "cdataPropName" },
        { value: built.commentPropName, name: "commentPropName" }
      ];
      for (const { value, name } of propertyNameOptions) {
        if (value) {
          validatePropertyName(value, name);
        }
      }
      if (built.onDangerousProperty === null) {
        built.onDangerousProperty = defaultOnDangerousProperty;
      }
      built.processEntities = normalizeProcessEntities(built.processEntities);
      return built;
    };
    exports.buildOptions = buildOptions;
    exports.defaultOptions = defaultOptions;
  }
});

// ../node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
var require_xmlNode = __commonJS({
  "../node_modules/fast-xml-parser/src/xmlparser/xmlNode.js"(exports, module) {
    "use strict";
    var XmlNode = class {
      constructor(tagname) {
        this.tagname = tagname;
        this.child = [];
        this[":@"] = {};
      }
      add(key, val) {
        if (key === "__proto__") key = "#__proto__";
        this.child.push({ [key]: val });
      }
      addChild(node) {
        if (node.tagname === "__proto__") node.tagname = "#__proto__";
        if (node[":@"] && Object.keys(node[":@"]).length > 0) {
          this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
        } else {
          this.child.push({ [node.tagname]: node.child });
        }
      }
    };
    module.exports = XmlNode;
  }
});

// ../node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
var require_DocTypeReader = __commonJS({
  "../node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js"(exports, module) {
    var util = require_util();
    var DocTypeReader = class {
      constructor(options) {
        this.suppressValidationErr = !options;
        this.options = options || {};
      }
      readDocType(xmlData, i) {
        const entities = /* @__PURE__ */ Object.create(null);
        let entityCount = 0;
        if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
          i = i + 9;
          let angleBracketsCount = 1;
          let hasBody = false, comment = false;
          let exp = "";
          for (; i < xmlData.length; i++) {
            if (xmlData[i] === "<" && !comment) {
              if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
                i += 7;
                let entityName, val;
                [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
                if (val.indexOf("&") === -1) {
                  if (this.options.enabled !== false && this.options.maxEntityCount != null && entityCount >= this.options.maxEntityCount) {
                    throw new Error(
                      `Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`
                    );
                  }
                  const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                  entities[entityName] = {
                    regx: RegExp(`&${escaped};`, "g"),
                    val
                  };
                  entityCount++;
                }
              } else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
                i += 8;
                const { index } = this.readElementExp(xmlData, i + 1);
                i = index;
              } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
                i += 8;
              } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
                i += 9;
                const { index } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
                i = index;
              } else if (hasSeq(xmlData, "!--", i)) {
                comment = true;
              } else {
                throw new Error(`Invalid DOCTYPE`);
              }
              angleBracketsCount++;
              exp = "";
            } else if (xmlData[i] === ">") {
              if (comment) {
                if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
                  comment = false;
                  angleBracketsCount--;
                }
              } else {
                angleBracketsCount--;
              }
              if (angleBracketsCount === 0) {
                break;
              }
            } else if (xmlData[i] === "[") {
              hasBody = true;
            } else {
              exp += xmlData[i];
            }
          }
          if (angleBracketsCount !== 0) {
            throw new Error(`Unclosed DOCTYPE`);
          }
        } else {
          throw new Error(`Invalid Tag instead of DOCTYPE`);
        }
        return { entities, i };
      }
      readEntityExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        let entityName = "";
        while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
          entityName += xmlData[i];
          i++;
        }
        validateEntityName(entityName);
        i = skipWhitespace(xmlData, i);
        if (!this.suppressValidationErr) {
          if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
            throw new Error("External entities are not supported");
          } else if (xmlData[i] === "%") {
            throw new Error("Parameter entities are not supported");
          }
        }
        let entityValue = "";
        [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");
        if (this.options.enabled !== false && this.options.maxEntitySize != null && entityValue.length > this.options.maxEntitySize) {
          throw new Error(
            `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`
          );
        }
        i--;
        return [entityName, entityValue, i];
      }
      readNotationExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        let notationName = "";
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          notationName += xmlData[i];
          i++;
        }
        !this.suppressValidationErr && validateEntityName(notationName);
        i = skipWhitespace(xmlData, i);
        const identifierType = xmlData.substring(i, i + 6).toUpperCase();
        if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
          throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
        }
        i += identifierType.length;
        i = skipWhitespace(xmlData, i);
        let publicIdentifier = null;
        let systemIdentifier = null;
        if (identifierType === "PUBLIC") {
          [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");
          i = skipWhitespace(xmlData, i);
          if (xmlData[i] === '"' || xmlData[i] === "'") {
            [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
          }
        } else if (identifierType === "SYSTEM") {
          [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
          if (!this.suppressValidationErr && !systemIdentifier) {
            throw new Error("Missing mandatory system identifier for SYSTEM notation");
          }
        }
        return { notationName, publicIdentifier, systemIdentifier, index: --i };
      }
      readIdentifierVal(xmlData, i, type) {
        let identifierVal = "";
        const startChar = xmlData[i];
        if (startChar !== '"' && startChar !== "'") {
          throw new Error(`Expected quoted string, found "${startChar}"`);
        }
        i++;
        while (i < xmlData.length && xmlData[i] !== startChar) {
          identifierVal += xmlData[i];
          i++;
        }
        if (xmlData[i] !== startChar) {
          throw new Error(`Unterminated ${type} value`);
        }
        i++;
        return [i, identifierVal];
      }
      readElementExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        let elementName = "";
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          elementName += xmlData[i];
          i++;
        }
        if (!this.suppressValidationErr && !util.isName(elementName)) {
          throw new Error(`Invalid element name: "${elementName}"`);
        }
        i = skipWhitespace(xmlData, i);
        let contentModel = "";
        if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) {
          i += 4;
        } else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) {
          i += 2;
        } else if (xmlData[i] === "(") {
          i++;
          while (i < xmlData.length && xmlData[i] !== ")") {
            contentModel += xmlData[i];
            i++;
          }
          if (xmlData[i] !== ")") {
            throw new Error("Unterminated content model");
          }
        } else if (!this.suppressValidationErr) {
          throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
        }
        return {
          elementName,
          contentModel: contentModel.trim(),
          index: i
        };
      }
      readAttlistExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        let elementName = "";
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          elementName += xmlData[i];
          i++;
        }
        validateEntityName(elementName);
        i = skipWhitespace(xmlData, i);
        let attributeName = "";
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          attributeName += xmlData[i];
          i++;
        }
        if (!validateEntityName(attributeName)) {
          throw new Error(`Invalid attribute name: "${attributeName}"`);
        }
        i = skipWhitespace(xmlData, i);
        let attributeType = "";
        if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
          attributeType = "NOTATION";
          i += 8;
          i = skipWhitespace(xmlData, i);
          if (xmlData[i] !== "(") {
            throw new Error(`Expected '(', found "${xmlData[i]}"`);
          }
          i++;
          let allowedNotations = [];
          while (i < xmlData.length && xmlData[i] !== ")") {
            let notation = "";
            while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
              notation += xmlData[i];
              i++;
            }
            notation = notation.trim();
            if (!validateEntityName(notation)) {
              throw new Error(`Invalid notation name: "${notation}"`);
            }
            allowedNotations.push(notation);
            if (xmlData[i] === "|") {
              i++;
              i = skipWhitespace(xmlData, i);
            }
          }
          if (xmlData[i] !== ")") {
            throw new Error("Unterminated list of notations");
          }
          i++;
          attributeType += " (" + allowedNotations.join("|") + ")";
        } else {
          while (i < xmlData.length && !/\s/.test(xmlData[i])) {
            attributeType += xmlData[i];
            i++;
          }
          const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
          if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
            throw new Error(`Invalid attribute type: "${attributeType}"`);
          }
        }
        i = skipWhitespace(xmlData, i);
        let defaultValue = "";
        if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
          defaultValue = "#REQUIRED";
          i += 8;
        } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
          defaultValue = "#IMPLIED";
          i += 7;
        } else {
          [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
        }
        return {
          elementName,
          attributeName,
          attributeType,
          defaultValue,
          index: i
        };
      }
    };
    var skipWhitespace = (data, index) => {
      while (index < data.length && /\s/.test(data[index])) {
        index++;
      }
      return index;
    };
    function hasSeq(data, seq, i) {
      for (let j = 0; j < seq.length; j++) {
        if (seq[j] !== data[i + j + 1]) return false;
      }
      return true;
    }
    function validateEntityName(name) {
      if (util.isName(name))
        return name;
      else
        throw new Error(`Invalid entity name ${name}`);
    }
    module.exports = DocTypeReader;
  }
});

// ../node_modules/strnum/strnum.js
var require_strnum = __commonJS({
  "../node_modules/strnum/strnum.js"(exports, module) {
    var hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
    var numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
    var consider = {
      hex: true,
      // oct: false,
      leadingZeros: true,
      decimalPoint: ".",
      eNotation: true
      //skipLike: /regex/
    };
    function toNumber(str, options = {}) {
      options = Object.assign({}, consider, options);
      if (!str || typeof str !== "string") return str;
      let trimmedStr = str.trim();
      if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
      else if (str === "0") return 0;
      else if (options.hex && hexRegex.test(trimmedStr)) {
        return parse_int(trimmedStr, 16);
      } else if (trimmedStr.search(/[eE]/) !== -1) {
        const notation = trimmedStr.match(/^([-\+])?(0*)([0-9]*(\.[0-9]*)?[eE][-\+]?[0-9]+)$/);
        if (notation) {
          if (options.leadingZeros) {
            trimmedStr = (notation[1] || "") + notation[3];
          } else {
            if (notation[2] === "0" && notation[3][0] === ".") {
            } else {
              return str;
            }
          }
          return options.eNotation ? Number(trimmedStr) : str;
        } else {
          return str;
        }
      } else {
        const match = numRegex.exec(trimmedStr);
        if (match) {
          const sign = match[1];
          const leadingZeros = match[2];
          let numTrimmedByZeros = trimZeros(match[3]);
          if (!options.leadingZeros && leadingZeros.length > 0 && sign && trimmedStr[2] !== ".") return str;
          else if (!options.leadingZeros && leadingZeros.length > 0 && !sign && trimmedStr[1] !== ".") return str;
          else if (options.leadingZeros && leadingZeros === str) return 0;
          else {
            const num = Number(trimmedStr);
            const numStr = "" + num;
            if (numStr.search(/[eE]/) !== -1) {
              if (options.eNotation) return num;
              else return str;
            } else if (trimmedStr.indexOf(".") !== -1) {
              if (numStr === "0" && numTrimmedByZeros === "") return num;
              else if (numStr === numTrimmedByZeros) return num;
              else if (sign && numStr === "-" + numTrimmedByZeros) return num;
              else return str;
            }
            if (leadingZeros) {
              return numTrimmedByZeros === numStr || sign + numTrimmedByZeros === numStr ? num : str;
            } else {
              return trimmedStr === numStr || trimmedStr === sign + numStr ? num : str;
            }
          }
        } else {
          return str;
        }
      }
    }
    function trimZeros(numStr) {
      if (numStr && numStr.indexOf(".") !== -1) {
        numStr = numStr.replace(/0+$/, "");
        if (numStr === ".") numStr = "0";
        else if (numStr[0] === ".") numStr = "0" + numStr;
        else if (numStr[numStr.length - 1] === ".") numStr = numStr.substr(0, numStr.length - 1);
        return numStr;
      }
      return numStr;
    }
    function parse_int(numStr, base) {
      if (parseInt) return parseInt(numStr, base);
      else if (Number.parseInt) return Number.parseInt(numStr, base);
      else if (window && window.parseInt) return window.parseInt(numStr, base);
      else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
    }
    module.exports = toNumber;
  }
});

// ../node_modules/fast-xml-parser/src/ignoreAttributes.js
var require_ignoreAttributes = __commonJS({
  "../node_modules/fast-xml-parser/src/ignoreAttributes.js"(exports, module) {
    function getIgnoreAttributesFn(ignoreAttributes) {
      if (typeof ignoreAttributes === "function") {
        return ignoreAttributes;
      }
      if (Array.isArray(ignoreAttributes)) {
        return (attrName) => {
          for (const pattern of ignoreAttributes) {
            if (typeof pattern === "string" && attrName === pattern) {
              return true;
            }
            if (pattern instanceof RegExp && pattern.test(attrName)) {
              return true;
            }
          }
        };
      }
      return () => false;
    }
    module.exports = getIgnoreAttributesFn;
  }
});

// ../node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
var require_OrderedObjParser = __commonJS({
  "../node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js"(exports, module) {
    "use strict";
    var util = require_util();
    var xmlNode = require_xmlNode();
    var DocTypeReader = require_DocTypeReader();
    var toNumber = require_strnum();
    var getIgnoreAttributesFn = require_ignoreAttributes();
    var OrderedObjParser = class {
      constructor(options) {
        this.options = options;
        this.currentNode = null;
        this.tagsNodeStack = [];
        this.docTypeEntities = {};
        this.lastEntities = {
          "apos": { regex: /&(apos|#39|#x27);/g, val: "'" },
          "gt": { regex: /&(gt|#62|#x3E);/g, val: ">" },
          "lt": { regex: /&(lt|#60|#x3C);/g, val: "<" },
          "quot": { regex: /&(quot|#34|#x22);/g, val: '"' }
        };
        this.ampEntity = { regex: /&(amp|#38|#x26);/g, val: "&" };
        this.htmlEntities = {
          "space": { regex: /&(nbsp|#160);/g, val: " " },
          // "lt" : { regex: /&(lt|#60);/g, val: "<" },
          // "gt" : { regex: /&(gt|#62);/g, val: ">" },
          // "amp" : { regex: /&(amp|#38);/g, val: "&" },
          // "quot" : { regex: /&(quot|#34);/g, val: "\"" },
          // "apos" : { regex: /&(apos|#39);/g, val: "'" },
          "cent": { regex: /&(cent|#162);/g, val: "\xA2" },
          "pound": { regex: /&(pound|#163);/g, val: "\xA3" },
          "yen": { regex: /&(yen|#165);/g, val: "\xA5" },
          "euro": { regex: /&(euro|#8364);/g, val: "\u20AC" },
          "copyright": { regex: /&(copy|#169);/g, val: "\xA9" },
          "reg": { regex: /&(reg|#174);/g, val: "\xAE" },
          "inr": { regex: /&(inr|#8377);/g, val: "\u20B9" },
          "num_dec": { regex: /&#([0-9]{1,7});/g, val: (_, str) => fromCodePoint(str, 10, "&#") },
          "num_hex": { regex: /&#x([0-9a-fA-F]{1,6});/g, val: (_, str) => fromCodePoint(str, 16, "&#x") }
        };
        this.addExternalEntities = addExternalEntities;
        this.parseXml = parseXml;
        this.parseTextData = parseTextData;
        this.resolveNameSpace = resolveNameSpace;
        this.buildAttributesMap = buildAttributesMap;
        this.isItStopNode = isItStopNode;
        this.replaceEntitiesValue = replaceEntitiesValue;
        this.readStopNodeData = readStopNodeData;
        this.saveTextToParentTag = saveTextToParentTag;
        this.addChild = addChild;
        this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
        this.entityExpansionCount = 0;
        this.currentExpandedLength = 0;
        if (this.options.stopNodes && this.options.stopNodes.length > 0) {
          this.stopNodesExact = /* @__PURE__ */ new Set();
          this.stopNodesWildcard = /* @__PURE__ */ new Set();
          for (let i = 0; i < this.options.stopNodes.length; i++) {
            const stopNodeExp = this.options.stopNodes[i];
            if (typeof stopNodeExp !== "string") continue;
            if (stopNodeExp.startsWith("*.")) {
              this.stopNodesWildcard.add(stopNodeExp.substring(2));
            } else {
              this.stopNodesExact.add(stopNodeExp);
            }
          }
        }
      }
    };
    function addExternalEntities(externalEntities) {
      const entKeys = Object.keys(externalEntities);
      for (let i = 0; i < entKeys.length; i++) {
        const ent = entKeys[i];
        const escaped = ent.replace(/[.\-+*:]/g, "\\.");
        this.lastEntities[ent] = {
          regex: new RegExp("&" + escaped + ";", "g"),
          val: externalEntities[ent]
        };
      }
    }
    function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
      if (val !== void 0) {
        if (this.options.trimValues && !dontTrim) {
          val = val.trim();
        }
        if (val.length > 0) {
          if (!escapeEntities) val = this.replaceEntitiesValue(val, tagName, jPath);
          const newval = this.options.tagValueProcessor(tagName, val, jPath, hasAttributes, isLeafNode);
          if (newval === null || newval === void 0) {
            return val;
          } else if (typeof newval !== typeof val || newval !== val) {
            return newval;
          } else if (this.options.trimValues) {
            return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
          } else {
            const trimmedVal = val.trim();
            if (trimmedVal === val) {
              return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
            } else {
              return val;
            }
          }
        }
      }
    }
    function resolveNameSpace(tagname) {
      if (this.options.removeNSPrefix) {
        const tags = tagname.split(":");
        const prefix = tagname.charAt(0) === "/" ? "/" : "";
        if (tags[0] === "xmlns") {
          return "";
        }
        if (tags.length === 2) {
          tagname = prefix + tags[1];
        }
      }
      return tagname;
    }
    var attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
    function buildAttributesMap(attrStr, jPath, tagName) {
      if (this.options.ignoreAttributes !== true && typeof attrStr === "string") {
        const matches = util.getAllMatches(attrStr, attrsRegx);
        const len = matches.length;
        const attrs = {};
        for (let i = 0; i < len; i++) {
          const attrName = this.resolveNameSpace(matches[i][1]);
          if (this.ignoreAttributesFn(attrName, jPath)) {
            continue;
          }
          let oldVal = matches[i][4];
          let aName = this.options.attributeNamePrefix + attrName;
          if (attrName.length) {
            if (this.options.transformAttributeName) {
              aName = this.options.transformAttributeName(aName);
            }
            aName = sanitizeName(aName, this.options);
            if (oldVal !== void 0) {
              if (this.options.trimValues) {
                oldVal = oldVal.trim();
              }
              oldVal = this.replaceEntitiesValue(oldVal, tagName, jPath);
              const newVal = this.options.attributeValueProcessor(attrName, oldVal, jPath);
              if (newVal === null || newVal === void 0) {
                attrs[aName] = oldVal;
              } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
                attrs[aName] = newVal;
              } else {
                attrs[aName] = parseValue(
                  oldVal,
                  this.options.parseAttributeValue,
                  this.options.numberParseOptions
                );
              }
            } else if (this.options.allowBooleanAttributes) {
              attrs[aName] = true;
            }
          }
        }
        if (!Object.keys(attrs).length) {
          return;
        }
        if (this.options.attributesGroupName) {
          const attrCollection = {};
          attrCollection[this.options.attributesGroupName] = attrs;
          return attrCollection;
        }
        return attrs;
      }
    }
    var parseXml = function(xmlData) {
      xmlData = xmlData.replace(/\r\n?/g, "\n");
      const xmlObj = new xmlNode("!xml");
      let currentNode = xmlObj;
      let textData = "";
      let jPath = "";
      this.entityExpansionCount = 0;
      this.currentExpandedLength = 0;
      const docTypeReader = new DocTypeReader(this.options.processEntities);
      for (let i = 0; i < xmlData.length; i++) {
        const ch = xmlData[i];
        if (ch === "<") {
          if (xmlData[i + 1] === "/") {
            const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
            let tagName = xmlData.substring(i + 2, closeIndex).trim();
            if (this.options.removeNSPrefix) {
              const colonIndex = tagName.indexOf(":");
              if (colonIndex !== -1) {
                tagName = tagName.substr(colonIndex + 1);
              }
            }
            if (this.options.transformTagName) {
              tagName = this.options.transformTagName(tagName);
            }
            if (currentNode) {
              textData = this.saveTextToParentTag(textData, currentNode, jPath);
            }
            const lastTagName = jPath.substring(jPath.lastIndexOf(".") + 1);
            if (tagName && this.options.unpairedTags.indexOf(tagName) !== -1) {
              throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
            }
            let propIndex = 0;
            if (lastTagName && this.options.unpairedTags.indexOf(lastTagName) !== -1) {
              propIndex = jPath.lastIndexOf(".", jPath.lastIndexOf(".") - 1);
              this.tagsNodeStack.pop();
            } else {
              propIndex = jPath.lastIndexOf(".");
            }
            jPath = jPath.substring(0, propIndex);
            currentNode = this.tagsNodeStack.pop();
            textData = "";
            i = closeIndex;
          } else if (xmlData[i + 1] === "?") {
            let tagData = readTagExp(xmlData, i, false, "?>");
            if (!tagData) throw new Error("Pi Tag is not closed.");
            textData = this.saveTextToParentTag(textData, currentNode, jPath);
            if (this.options.ignoreDeclaration && tagData.tagName === "?xml" || this.options.ignorePiTags) {
            } else {
              const childNode = new xmlNode(tagData.tagName);
              childNode.add(this.options.textNodeName, "");
              if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent) {
                childNode[":@"] = this.buildAttributesMap(tagData.tagExp, jPath, tagData.tagName);
              }
              this.addChild(currentNode, childNode, jPath, i);
            }
            i = tagData.closeIndex + 1;
          } else if (xmlData.substr(i + 1, 3) === "!--") {
            const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
            if (this.options.commentPropName) {
              const comment = xmlData.substring(i + 4, endIndex - 2);
              textData = this.saveTextToParentTag(textData, currentNode, jPath);
              currentNode.add(this.options.commentPropName, [{ [this.options.textNodeName]: comment }]);
            }
            i = endIndex;
          } else if (xmlData.substr(i + 1, 2) === "!D") {
            const result = docTypeReader.readDocType(xmlData, i);
            this.docTypeEntities = result.entities;
            i = result.i;
          } else if (xmlData.substr(i + 1, 2) === "![") {
            const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
            const tagExp = xmlData.substring(i + 9, closeIndex);
            textData = this.saveTextToParentTag(textData, currentNode, jPath);
            let val = this.parseTextData(tagExp, currentNode.tagname, jPath, true, false, true, true);
            if (val == void 0) val = "";
            if (this.options.cdataPropName) {
              currentNode.add(this.options.cdataPropName, [{ [this.options.textNodeName]: tagExp }]);
            } else {
              currentNode.add(this.options.textNodeName, val);
            }
            i = closeIndex + 2;
          } else {
            let result = readTagExp(xmlData, i, this.options.removeNSPrefix);
            let tagName = result.tagName;
            const rawTagName = result.rawTagName;
            let tagExp = result.tagExp;
            let attrExpPresent = result.attrExpPresent;
            let closeIndex = result.closeIndex;
            if (this.options.transformTagName) {
              const newTagName = this.options.transformTagName(tagName);
              if (tagExp === tagName) {
                tagExp = newTagName;
              }
              tagName = newTagName;
            }
            if (this.options.strictReservedNames && (tagName === this.options.commentPropName || tagName === this.options.cdataPropName || tagName === this.options.textNodeName || tagName === this.options.attributesGroupName)) {
              throw new Error(`Invalid tag name: ${tagName}`);
            }
            if (currentNode && textData) {
              if (currentNode.tagname !== "!xml") {
                textData = this.saveTextToParentTag(textData, currentNode, jPath, false);
              }
            }
            const lastTag = currentNode;
            if (lastTag && this.options.unpairedTags.indexOf(lastTag.tagname) !== -1) {
              currentNode = this.tagsNodeStack.pop();
              jPath = jPath.substring(0, jPath.lastIndexOf("."));
            }
            if (tagName !== xmlObj.tagname) {
              jPath += jPath ? "." + tagName : tagName;
            }
            const startIndex = i;
            if (this.isItStopNode(this.stopNodesExact, this.stopNodesWildcard, jPath, tagName)) {
              let tagContent = "";
              if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
                if (tagName[tagName.length - 1] === "/") {
                  tagName = tagName.substr(0, tagName.length - 1);
                  jPath = jPath.substr(0, jPath.length - 1);
                  tagExp = tagName;
                } else {
                  tagExp = tagExp.substr(0, tagExp.length - 1);
                }
                i = result.closeIndex;
              } else if (this.options.unpairedTags.indexOf(tagName) !== -1) {
                i = result.closeIndex;
              } else {
                const result2 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
                if (!result2) throw new Error(`Unexpected end of ${rawTagName}`);
                i = result2.i;
                tagContent = result2.tagContent;
              }
              const childNode = new xmlNode(tagName);
              if (tagName !== tagExp && attrExpPresent) {
                childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
              }
              if (tagContent) {
                tagContent = this.parseTextData(tagContent, tagName, jPath, true, attrExpPresent, true, true);
              }
              jPath = jPath.substr(0, jPath.lastIndexOf("."));
              childNode.add(this.options.textNodeName, tagContent);
              this.addChild(currentNode, childNode, jPath, startIndex);
            } else {
              if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
                if (tagName[tagName.length - 1] === "/") {
                  tagName = tagName.substr(0, tagName.length - 1);
                  jPath = jPath.substr(0, jPath.length - 1);
                  tagExp = tagName;
                } else {
                  tagExp = tagExp.substr(0, tagExp.length - 1);
                }
                if (this.options.transformTagName) {
                  const newTagName = this.options.transformTagName(tagName);
                  if (tagExp === tagName) {
                    tagExp = newTagName;
                  }
                  tagName = newTagName;
                }
                const childNode = new xmlNode(tagName);
                if (tagName !== tagExp && attrExpPresent) {
                  childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
                }
                this.addChild(currentNode, childNode, jPath, startIndex);
                jPath = jPath.substr(0, jPath.lastIndexOf("."));
              } else if (this.options.unpairedTags.indexOf(tagName) !== -1) {
                const childNode = new xmlNode(tagName);
                if (tagName !== tagExp && attrExpPresent) {
                  childNode[":@"] = this.buildAttributesMap(tagExp, jPath);
                }
                this.addChild(currentNode, childNode, jPath, startIndex);
                jPath = jPath.substr(0, jPath.lastIndexOf("."));
                i = result.closeIndex;
                continue;
              } else {
                const childNode = new xmlNode(tagName);
                if (this.tagsNodeStack.length > this.options.maxNestedTags) {
                  throw new Error("Maximum nested tags exceeded");
                }
                this.tagsNodeStack.push(currentNode);
                if (tagName !== tagExp && attrExpPresent) {
                  childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
                }
                this.addChild(currentNode, childNode, jPath);
                currentNode = childNode;
              }
              textData = "";
              i = closeIndex;
            }
          }
        } else {
          textData += xmlData[i];
        }
      }
      return xmlObj.child;
    };
    function addChild(currentNode, childNode, jPath, startIndex) {
      if (!this.options.captureMetaData) startIndex = void 0;
      const result = this.options.updateTag(childNode.tagname, jPath, childNode[":@"]);
      if (result === false) {
      } else if (typeof result === "string") {
        childNode.tagname = result;
        currentNode.addChild(childNode, startIndex);
      } else {
        currentNode.addChild(childNode, startIndex);
      }
    }
    var replaceEntitiesValue = function(val, tagName, jPath) {
      if (val.indexOf("&") === -1) {
        return val;
      }
      const entityConfig = this.options.processEntities;
      if (!entityConfig.enabled) {
        return val;
      }
      if (entityConfig.allowedTags) {
        if (!entityConfig.allowedTags.includes(tagName)) {
          return val;
        }
      }
      if (entityConfig.tagFilter) {
        if (!entityConfig.tagFilter(tagName, jPath)) {
          return val;
        }
      }
      for (let entityName in this.docTypeEntities) {
        const entity = this.docTypeEntities[entityName];
        const matches = val.match(entity.regx);
        if (matches) {
          this.entityExpansionCount += matches.length;
          if (entityConfig.maxTotalExpansions && this.entityExpansionCount > entityConfig.maxTotalExpansions) {
            throw new Error(
              `Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`
            );
          }
          const lengthBefore = val.length;
          val = val.replace(entity.regx, entity.val);
          if (entityConfig.maxExpandedLength) {
            this.currentExpandedLength += val.length - lengthBefore;
            if (this.currentExpandedLength > entityConfig.maxExpandedLength) {
              throw new Error(
                `Total expanded content size exceeded: ${this.currentExpandedLength} > ${entityConfig.maxExpandedLength}`
              );
            }
          }
        }
      }
      if (val.indexOf("&") === -1) return val;
      for (const entityName of Object.keys(this.lastEntities)) {
        const entity = this.lastEntities[entityName];
        const matches = val.match(entity.regex);
        if (matches) {
          this.entityExpansionCount += matches.length;
          if (entityConfig.maxTotalExpansions && this.entityExpansionCount > entityConfig.maxTotalExpansions) {
            throw new Error(
              `Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`
            );
          }
        }
        val = val.replace(entity.regex, entity.val);
      }
      if (val.indexOf("&") === -1) return val;
      if (this.options.htmlEntities) {
        for (const entityName of Object.keys(this.htmlEntities)) {
          const entity = this.htmlEntities[entityName];
          const matches = val.match(entity.regex);
          if (matches) {
            this.entityExpansionCount += matches.length;
            if (entityConfig.maxTotalExpansions && this.entityExpansionCount > entityConfig.maxTotalExpansions) {
              throw new Error(
                `Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`
              );
            }
          }
          val = val.replace(entity.regex, entity.val);
        }
      }
      val = val.replace(this.ampEntity.regex, this.ampEntity.val);
      return val;
    };
    function saveTextToParentTag(textData, parentNode, jPath, isLeafNode) {
      if (textData) {
        if (isLeafNode === void 0) isLeafNode = parentNode.child.length === 0;
        textData = this.parseTextData(
          textData,
          parentNode.tagname,
          jPath,
          false,
          parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false,
          isLeafNode
        );
        if (textData !== void 0 && textData !== "")
          parentNode.add(this.options.textNodeName, textData);
        textData = "";
      }
      return textData;
    }
    function isItStopNode(stopNodesExact, stopNodesWildcard, jPath, currentTagName) {
      if (stopNodesWildcard && stopNodesWildcard.has(currentTagName)) return true;
      if (stopNodesExact && stopNodesExact.has(jPath)) return true;
      return false;
    }
    function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
      let attrBoundary;
      let tagExp = "";
      for (let index = i; index < xmlData.length; index++) {
        let ch = xmlData[index];
        if (attrBoundary) {
          if (ch === attrBoundary) attrBoundary = "";
        } else if (ch === '"' || ch === "'") {
          attrBoundary = ch;
        } else if (ch === closingChar[0]) {
          if (closingChar[1]) {
            if (xmlData[index + 1] === closingChar[1]) {
              return {
                data: tagExp,
                index
              };
            }
          } else {
            return {
              data: tagExp,
              index
            };
          }
        } else if (ch === "	") {
          ch = " ";
        }
        tagExp += ch;
      }
    }
    function findClosingIndex(xmlData, str, i, errMsg) {
      const closingIndex = xmlData.indexOf(str, i);
      if (closingIndex === -1) {
        throw new Error(errMsg);
      } else {
        return closingIndex + str.length - 1;
      }
    }
    function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
      const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
      if (!result) return;
      let tagExp = result.data;
      const closeIndex = result.index;
      const separatorIndex = tagExp.search(/\s/);
      let tagName = tagExp;
      let attrExpPresent = true;
      if (separatorIndex !== -1) {
        tagName = tagExp.substring(0, separatorIndex);
        tagExp = tagExp.substring(separatorIndex + 1).trimStart();
      }
      const rawTagName = tagName;
      if (removeNSPrefix) {
        const colonIndex = tagName.indexOf(":");
        if (colonIndex !== -1) {
          tagName = tagName.substr(colonIndex + 1);
          attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
        }
      }
      return {
        tagName,
        tagExp,
        closeIndex,
        attrExpPresent,
        rawTagName
      };
    }
    function readStopNodeData(xmlData, tagName, i) {
      const startIndex = i;
      let openTagCount = 1;
      for (; i < xmlData.length; i++) {
        if (xmlData[i] === "<") {
          if (xmlData[i + 1] === "/") {
            const closeIndex = findClosingIndex(xmlData, ">", i, `${tagName} is not closed`);
            let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
            if (closeTagName === tagName) {
              openTagCount--;
              if (openTagCount === 0) {
                return {
                  tagContent: xmlData.substring(startIndex, i),
                  i: closeIndex
                };
              }
            }
            i = closeIndex;
          } else if (xmlData[i + 1] === "?") {
            const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
            i = closeIndex;
          } else if (xmlData.substr(i + 1, 3) === "!--") {
            const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
            i = closeIndex;
          } else if (xmlData.substr(i + 1, 2) === "![") {
            const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
            i = closeIndex;
          } else {
            const tagData = readTagExp(xmlData, i, ">");
            if (tagData) {
              const openTagName = tagData && tagData.tagName;
              if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
                openTagCount++;
              }
              i = tagData.closeIndex;
            }
          }
        }
      }
    }
    function parseValue(val, shouldParse, options) {
      if (shouldParse && typeof val === "string") {
        const newval = val.trim();
        if (newval === "true") return true;
        else if (newval === "false") return false;
        else return toNumber(val, options);
      } else {
        if (util.isExist(val)) {
          return val;
        } else {
          return "";
        }
      }
    }
    function fromCodePoint(str, base, prefix) {
      const codePoint = Number.parseInt(str, base);
      if (codePoint >= 0 && codePoint <= 1114111) {
        return String.fromCodePoint(codePoint);
      } else {
        return prefix + str + ";";
      }
    }
    function sanitizeName(name, options) {
      if (util.criticalProperties.includes(name)) {
        throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
      } else if (util.DANGEROUS_PROPERTY_NAMES.includes(name)) {
        return options.onDangerousProperty(name);
      }
      return name;
    }
    module.exports = OrderedObjParser;
  }
});

// ../node_modules/fast-xml-parser/src/xmlparser/node2json.js
var require_node2json = __commonJS({
  "../node_modules/fast-xml-parser/src/xmlparser/node2json.js"(exports) {
    "use strict";
    function prettify(node, options) {
      return compress(node, options);
    }
    function compress(arr, options, jPath) {
      let text;
      const compressedObj = {};
      for (let i = 0; i < arr.length; i++) {
        const tagObj = arr[i];
        const property = propName(tagObj);
        let newJpath = "";
        if (jPath === void 0) newJpath = property;
        else newJpath = jPath + "." + property;
        if (property === options.textNodeName) {
          if (text === void 0) text = tagObj[property];
          else text += "" + tagObj[property];
        } else if (property === void 0) {
          continue;
        } else if (tagObj[property]) {
          let val = compress(tagObj[property], options, newJpath);
          const isLeaf = isLeafTag(val, options);
          if (tagObj[":@"]) {
            assignAttributes(val, tagObj[":@"], newJpath, options);
          } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
            val = val[options.textNodeName];
          } else if (Object.keys(val).length === 0) {
            if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
            else val = "";
          }
          if (compressedObj[property] !== void 0 && compressedObj.hasOwnProperty(property)) {
            if (!Array.isArray(compressedObj[property])) {
              compressedObj[property] = [compressedObj[property]];
            }
            compressedObj[property].push(val);
          } else {
            if (options.isArray(property, newJpath, isLeaf)) {
              compressedObj[property] = [val];
            } else {
              compressedObj[property] = val;
            }
          }
        }
      }
      if (typeof text === "string") {
        if (text.length > 0) compressedObj[options.textNodeName] = text;
      } else if (text !== void 0) compressedObj[options.textNodeName] = text;
      return compressedObj;
    }
    function propName(obj) {
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key !== ":@") return key;
      }
    }
    function assignAttributes(obj, attrMap, jpath, options) {
      if (attrMap) {
        const keys = Object.keys(attrMap);
        const len = keys.length;
        for (let i = 0; i < len; i++) {
          const atrrName = keys[i];
          if (options.isArray(atrrName, jpath + "." + atrrName, true, true)) {
            obj[atrrName] = [attrMap[atrrName]];
          } else {
            obj[atrrName] = attrMap[atrrName];
          }
        }
      }
    }
    function isLeafTag(obj, options) {
      const { textNodeName } = options;
      const propCount = Object.keys(obj).length;
      if (propCount === 0) {
        return true;
      }
      if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
        return true;
      }
      return false;
    }
    exports.prettify = prettify;
  }
});

// ../node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
var require_XMLParser = __commonJS({
  "../node_modules/fast-xml-parser/src/xmlparser/XMLParser.js"(exports, module) {
    var { buildOptions } = require_OptionsBuilder();
    var OrderedObjParser = require_OrderedObjParser();
    var { prettify } = require_node2json();
    var validator = require_validator();
    var XMLParser2 = class {
      constructor(options) {
        this.externalEntities = {};
        this.options = buildOptions(options);
      }
      /**
       * Parse XML dats to JS object 
       * @param {string|Buffer} xmlData 
       * @param {boolean|Object} validationOption 
       */
      parse(xmlData, validationOption) {
        if (typeof xmlData === "string") {
        } else if (xmlData.toString) {
          xmlData = xmlData.toString();
        } else {
          throw new Error("XML data is accepted in String or Bytes[] form.");
        }
        if (validationOption) {
          if (validationOption === true) validationOption = {};
          const result = validator.validate(xmlData, validationOption);
          if (result !== true) {
            throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
          }
        }
        const orderedObjParser = new OrderedObjParser(this.options);
        orderedObjParser.addExternalEntities(this.externalEntities);
        const orderedResult = orderedObjParser.parseXml(xmlData);
        if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
        else return prettify(orderedResult, this.options);
      }
      /**
       * Add Entity which is not by default supported by this library
       * @param {string} key 
       * @param {string} value 
       */
      addEntity(key, value) {
        if (value.indexOf("&") !== -1) {
          throw new Error("Entity value can't have '&'");
        } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
          throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
        } else if (value === "&") {
          throw new Error("An entity with value '&' is not permitted");
        } else {
          this.externalEntities[key] = value;
        }
      }
    };
    module.exports = XMLParser2;
  }
});

// ../node_modules/fast-xml-parser/src/xmlbuilder/orderedJs2Xml.js
var require_orderedJs2Xml = __commonJS({
  "../node_modules/fast-xml-parser/src/xmlbuilder/orderedJs2Xml.js"(exports, module) {
    var EOL = "\n";
    function toXml(jArray, options) {
      let indentation = "";
      if (options.format && options.indentBy.length > 0) {
        indentation = EOL;
      }
      return arrToStr(jArray, options, "", indentation);
    }
    function arrToStr(arr, options, jPath, indentation) {
      let xmlStr = "";
      let isPreviousElementTag = false;
      if (!Array.isArray(arr)) {
        if (arr !== void 0 && arr !== null) {
          let text = arr.toString();
          text = replaceEntitiesValue(text, options);
          return text;
        }
        return "";
      }
      for (let i = 0; i < arr.length; i++) {
        const tagObj = arr[i];
        const tagName = propName(tagObj);
        if (tagName === void 0) continue;
        let newJPath = "";
        if (jPath.length === 0) newJPath = tagName;
        else newJPath = `${jPath}.${tagName}`;
        if (tagName === options.textNodeName) {
          let tagText = tagObj[tagName];
          if (!isStopNode(newJPath, options)) {
            tagText = options.tagValueProcessor(tagName, tagText);
            tagText = replaceEntitiesValue(tagText, options);
          }
          if (isPreviousElementTag) {
            xmlStr += indentation;
          }
          xmlStr += tagText;
          isPreviousElementTag = false;
          continue;
        } else if (tagName === options.cdataPropName) {
          if (isPreviousElementTag) {
            xmlStr += indentation;
          }
          xmlStr += `<![CDATA[${tagObj[tagName][0][options.textNodeName]}]]>`;
          isPreviousElementTag = false;
          continue;
        } else if (tagName === options.commentPropName) {
          xmlStr += indentation + `<!--${tagObj[tagName][0][options.textNodeName]}-->`;
          isPreviousElementTag = true;
          continue;
        } else if (tagName[0] === "?") {
          const attStr2 = attr_to_str(tagObj[":@"], options);
          const tempInd = tagName === "?xml" ? "" : indentation;
          let piTextNodeName = tagObj[tagName][0][options.textNodeName];
          piTextNodeName = piTextNodeName.length !== 0 ? " " + piTextNodeName : "";
          xmlStr += tempInd + `<${tagName}${piTextNodeName}${attStr2}?>`;
          isPreviousElementTag = true;
          continue;
        }
        let newIdentation = indentation;
        if (newIdentation !== "") {
          newIdentation += options.indentBy;
        }
        const attStr = attr_to_str(tagObj[":@"], options);
        const tagStart = indentation + `<${tagName}${attStr}`;
        const tagValue = arrToStr(tagObj[tagName], options, newJPath, newIdentation);
        if (options.unpairedTags.indexOf(tagName) !== -1) {
          if (options.suppressUnpairedNode) xmlStr += tagStart + ">";
          else xmlStr += tagStart + "/>";
        } else if ((!tagValue || tagValue.length === 0) && options.suppressEmptyNode) {
          xmlStr += tagStart + "/>";
        } else if (tagValue && tagValue.endsWith(">")) {
          xmlStr += tagStart + `>${tagValue}${indentation}</${tagName}>`;
        } else {
          xmlStr += tagStart + ">";
          if (tagValue && indentation !== "" && (tagValue.includes("/>") || tagValue.includes("</"))) {
            xmlStr += indentation + options.indentBy + tagValue + indentation;
          } else {
            xmlStr += tagValue;
          }
          xmlStr += `</${tagName}>`;
        }
        isPreviousElementTag = true;
      }
      return xmlStr;
    }
    function propName(obj) {
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        if (key !== ":@") return key;
      }
    }
    function attr_to_str(attrMap, options) {
      let attrStr = "";
      if (attrMap && !options.ignoreAttributes) {
        for (let attr2 in attrMap) {
          if (!Object.prototype.hasOwnProperty.call(attrMap, attr2)) continue;
          let attrVal = options.attributeValueProcessor(attr2, attrMap[attr2]);
          attrVal = replaceEntitiesValue(attrVal, options);
          if (attrVal === true && options.suppressBooleanAttributes) {
            attrStr += ` ${attr2.substr(options.attributeNamePrefix.length)}`;
          } else {
            attrStr += ` ${attr2.substr(options.attributeNamePrefix.length)}="${attrVal}"`;
          }
        }
      }
      return attrStr;
    }
    function isStopNode(jPath, options) {
      jPath = jPath.substr(0, jPath.length - options.textNodeName.length - 1);
      let tagName = jPath.substr(jPath.lastIndexOf(".") + 1);
      for (let index in options.stopNodes) {
        if (options.stopNodes[index] === jPath || options.stopNodes[index] === "*." + tagName) return true;
      }
      return false;
    }
    function replaceEntitiesValue(textValue, options) {
      if (textValue && textValue.length > 0 && options.processEntities) {
        for (let i = 0; i < options.entities.length; i++) {
          const entity = options.entities[i];
          textValue = textValue.replace(entity.regex, entity.val);
        }
      }
      return textValue;
    }
    module.exports = toXml;
  }
});

// ../node_modules/fast-xml-parser/src/xmlbuilder/json2xml.js
var require_json2xml = __commonJS({
  "../node_modules/fast-xml-parser/src/xmlbuilder/json2xml.js"(exports, module) {
    "use strict";
    var buildFromOrderedJs = require_orderedJs2Xml();
    var getIgnoreAttributesFn = require_ignoreAttributes();
    var defaultOptions = {
      attributeNamePrefix: "@_",
      attributesGroupName: false,
      textNodeName: "#text",
      ignoreAttributes: true,
      cdataPropName: false,
      format: false,
      indentBy: "  ",
      suppressEmptyNode: false,
      suppressUnpairedNode: true,
      suppressBooleanAttributes: true,
      tagValueProcessor: function(key, a) {
        return a;
      },
      attributeValueProcessor: function(attrName, a) {
        return a;
      },
      preserveOrder: false,
      commentPropName: false,
      unpairedTags: [],
      entities: [
        { regex: new RegExp("&", "g"), val: "&amp;" },
        //it must be on top
        { regex: new RegExp(">", "g"), val: "&gt;" },
        { regex: new RegExp("<", "g"), val: "&lt;" },
        { regex: new RegExp("'", "g"), val: "&apos;" },
        { regex: new RegExp('"', "g"), val: "&quot;" }
      ],
      processEntities: true,
      stopNodes: [],
      // transformTagName: false,
      // transformAttributeName: false,
      oneListGroup: false
    };
    function Builder(options) {
      this.options = Object.assign({}, defaultOptions, options);
      if (this.options.ignoreAttributes === true || this.options.attributesGroupName) {
        this.isAttribute = function() {
          return false;
        };
      } else {
        this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
        this.attrPrefixLen = this.options.attributeNamePrefix.length;
        this.isAttribute = isAttribute;
      }
      this.processTextOrObjNode = processTextOrObjNode;
      if (this.options.format) {
        this.indentate = indentate;
        this.tagEndChar = ">\n";
        this.newLine = "\n";
      } else {
        this.indentate = function() {
          return "";
        };
        this.tagEndChar = ">";
        this.newLine = "";
      }
    }
    Builder.prototype.build = function(jObj) {
      if (this.options.preserveOrder) {
        return buildFromOrderedJs(jObj, this.options);
      } else {
        if (Array.isArray(jObj) && this.options.arrayNodeName && this.options.arrayNodeName.length > 1) {
          jObj = {
            [this.options.arrayNodeName]: jObj
          };
        }
        return this.j2x(jObj, 0, []).val;
      }
    };
    Builder.prototype.j2x = function(jObj, level, ajPath) {
      let attrStr = "";
      let val = "";
      const jPath = ajPath.join(".");
      for (let key in jObj) {
        if (!Object.prototype.hasOwnProperty.call(jObj, key)) continue;
        if (typeof jObj[key] === "undefined") {
          if (this.isAttribute(key)) {
            val += "";
          }
        } else if (jObj[key] === null) {
          if (this.isAttribute(key)) {
            val += "";
          } else if (key === this.options.cdataPropName) {
            val += "";
          } else if (key[0] === "?") {
            val += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
          } else {
            val += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
          }
        } else if (jObj[key] instanceof Date) {
          val += this.buildTextValNode(jObj[key], key, "", level);
        } else if (typeof jObj[key] !== "object") {
          const attr2 = this.isAttribute(key);
          if (attr2 && !this.ignoreAttributesFn(attr2, jPath)) {
            attrStr += this.buildAttrPairStr(attr2, "" + jObj[key]);
          } else if (!attr2) {
            if (key === this.options.textNodeName) {
              let newval = this.options.tagValueProcessor(key, "" + jObj[key]);
              val += this.replaceEntitiesValue(newval);
            } else {
              val += this.buildTextValNode(jObj[key], key, "", level);
            }
          }
        } else if (Array.isArray(jObj[key])) {
          const arrLen = jObj[key].length;
          let listTagVal = "";
          let listTagAttr = "";
          for (let j = 0; j < arrLen; j++) {
            const item = jObj[key][j];
            if (typeof item === "undefined") {
            } else if (item === null) {
              if (key[0] === "?") val += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
              else val += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
            } else if (typeof item === "object") {
              if (this.options.oneListGroup) {
                const result = this.j2x(item, level + 1, ajPath.concat(key));
                listTagVal += result.val;
                if (this.options.attributesGroupName && item.hasOwnProperty(this.options.attributesGroupName)) {
                  listTagAttr += result.attrStr;
                }
              } else {
                listTagVal += this.processTextOrObjNode(item, key, level, ajPath);
              }
            } else {
              if (this.options.oneListGroup) {
                let textValue = this.options.tagValueProcessor(key, item);
                textValue = this.replaceEntitiesValue(textValue);
                listTagVal += textValue;
              } else {
                listTagVal += this.buildTextValNode(item, key, "", level);
              }
            }
          }
          if (this.options.oneListGroup) {
            listTagVal = this.buildObjectNode(listTagVal, key, listTagAttr, level);
          }
          val += listTagVal;
        } else {
          if (this.options.attributesGroupName && key === this.options.attributesGroupName) {
            const Ks = Object.keys(jObj[key]);
            const L = Ks.length;
            for (let j = 0; j < L; j++) {
              attrStr += this.buildAttrPairStr(Ks[j], "" + jObj[key][Ks[j]]);
            }
          } else {
            val += this.processTextOrObjNode(jObj[key], key, level, ajPath);
          }
        }
      }
      return { attrStr, val };
    };
    Builder.prototype.buildAttrPairStr = function(attrName, val) {
      val = this.options.attributeValueProcessor(attrName, "" + val);
      val = this.replaceEntitiesValue(val);
      if (this.options.suppressBooleanAttributes && val === "true") {
        return " " + attrName;
      } else return " " + attrName + '="' + val + '"';
    };
    function processTextOrObjNode(object, key, level, ajPath) {
      const result = this.j2x(object, level + 1, ajPath.concat(key));
      if (object[this.options.textNodeName] !== void 0 && Object.keys(object).length === 1) {
        return this.buildTextValNode(object[this.options.textNodeName], key, result.attrStr, level);
      } else {
        return this.buildObjectNode(result.val, key, result.attrStr, level);
      }
    }
    Builder.prototype.buildObjectNode = function(val, key, attrStr, level) {
      if (val === "") {
        if (key[0] === "?") return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
        else {
          return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
        }
      } else {
        let tagEndExp = "</" + key + this.tagEndChar;
        let piClosingChar = "";
        if (key[0] === "?") {
          piClosingChar = "?";
          tagEndExp = "";
        }
        if ((attrStr || attrStr === "") && val.indexOf("<") === -1) {
          return this.indentate(level) + "<" + key + attrStr + piClosingChar + ">" + val + tagEndExp;
        } else if (this.options.commentPropName !== false && key === this.options.commentPropName && piClosingChar.length === 0) {
          return this.indentate(level) + `<!--${val}-->` + this.newLine;
        } else {
          return this.indentate(level) + "<" + key + attrStr + piClosingChar + this.tagEndChar + val + this.indentate(level) + tagEndExp;
        }
      }
    };
    Builder.prototype.closeTag = function(key) {
      let closeTag = "";
      if (this.options.unpairedTags.indexOf(key) !== -1) {
        if (!this.options.suppressUnpairedNode) closeTag = "/";
      } else if (this.options.suppressEmptyNode) {
        closeTag = "/";
      } else {
        closeTag = `></${key}`;
      }
      return closeTag;
    };
    Builder.prototype.buildTextValNode = function(val, key, attrStr, level) {
      if (this.options.cdataPropName !== false && key === this.options.cdataPropName) {
        return this.indentate(level) + `<![CDATA[${val}]]>` + this.newLine;
      } else if (this.options.commentPropName !== false && key === this.options.commentPropName) {
        return this.indentate(level) + `<!--${val}-->` + this.newLine;
      } else if (key[0] === "?") {
        return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
      } else {
        let textValue = this.options.tagValueProcessor(key, val);
        textValue = this.replaceEntitiesValue(textValue);
        if (textValue === "") {
          return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
        } else {
          return this.indentate(level) + "<" + key + attrStr + ">" + textValue + "</" + key + this.tagEndChar;
        }
      }
    };
    Builder.prototype.replaceEntitiesValue = function(textValue) {
      if (textValue && textValue.length > 0 && this.options.processEntities) {
        for (let i = 0; i < this.options.entities.length; i++) {
          const entity = this.options.entities[i];
          textValue = textValue.replace(entity.regex, entity.val);
        }
      }
      return textValue;
    };
    function indentate(level) {
      return this.options.indentBy.repeat(level);
    }
    function isAttribute(name) {
      if (name.startsWith(this.options.attributeNamePrefix) && name !== this.options.textNodeName) {
        return name.substr(this.attrPrefixLen);
      } else {
        return false;
      }
    }
    module.exports = Builder;
  }
});

// ../node_modules/fast-xml-parser/src/fxp.js
var require_fxp = __commonJS({
  "../node_modules/fast-xml-parser/src/fxp.js"(exports, module) {
    "use strict";
    var validator = require_validator();
    var XMLParser2 = require_XMLParser();
    var XMLBuilder = require_json2xml();
    module.exports = {
      XMLParser: XMLParser2,
      XMLValidator: validator,
      XMLBuilder
    };
  }
});

// src/engine/automation/webdriver.ts
var webdriver_exports = {};
__export(webdriver_exports, {
  RemoteElement: () => RemoteElement,
  RemoteSession: () => RemoteSession
});
function isNoSuchElement(err) {
  return err instanceof WebDriverError && (err.wdError === "no such element" || err.status === 404);
}
async function wdFetch(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 12e4);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json2 = {};
    try {
      json2 = JSON.parse(text);
    } catch {
    }
    if (!res.ok) {
      const v = json2.value;
      throw new WebDriverError(
        v?.message || `WebDriver call failed (${res.status}): ${text.slice(0, 300)}`,
        res.status,
        v?.error
      );
    }
    return { value: json2.value };
  } finally {
    clearTimeout(timer);
  }
}
function toStrategy(selector) {
  if (selector.startsWith("~")) return { using: "accessibility id", value: selector.slice(1) };
  if (selector.startsWith("id=")) return { using: "id", value: selector.slice(3) };
  if (selector.startsWith("android="))
    return { using: "-android uiautomator", value: selector.slice(8) };
  if (selector.startsWith("//") || selector.startsWith("(")) {
    return { using: "xpath", value: selector };
  }
  return { using: "css selector", value: selector };
}
var ELEMENT_KEY, WebDriverError, ActionChain, RemoteElement, RemoteSession;
var init_webdriver = __esm({
  "src/engine/automation/webdriver.ts"() {
    "use strict";
    ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";
    WebDriverError = class extends Error {
      constructor(message, status, wdError) {
        super(message);
        this.status = status;
        this.wdError = wdError;
      }
    };
    ActionChain = class {
      constructor(session, pointerType) {
        this.session = session;
        this.pointerType = pointerType;
      }
      actions = [];
      move(opts) {
        this.actions.push({
          type: "pointerMove",
          duration: opts.duration ?? 0,
          x: opts.x,
          y: opts.y,
          origin: "viewport"
        });
        return this;
      }
      down() {
        this.actions.push({ type: "pointerDown", button: 0 });
        return this;
      }
      up() {
        this.actions.push({ type: "pointerUp", button: 0 });
        return this;
      }
      pause(ms) {
        this.actions.push({ type: "pause", duration: ms });
        return this;
      }
      async perform() {
        await this.session.cmd("POST", "/actions", {
          actions: [
            {
              type: "pointer",
              id: "finger1",
              parameters: { pointerType: this.pointerType },
              actions: this.actions
            }
          ]
        });
      }
    };
    RemoteElement = class {
      constructor(session, selector) {
        this.session = session;
        this.selector = selector;
      }
      id = null;
      get elementId() {
        return this.id ?? void 0;
      }
      // WebDriver arg serialization for execute(): {element-6066…: id}.
      toJSON() {
        return this.id ? { [ELEMENT_KEY]: this.id } : {};
      }
      async find() {
        const { using, value } = toStrategy(this.selector);
        const res = await this.session.cmd("POST", "/element", { using, value });
        const el = res.value;
        this.id = el[ELEMENT_KEY] ?? Object.values(el)[0];
        if (!this.id) throw new Error(`Element not found: ${this.selector}`);
        return this.id;
      }
      async ensure() {
        return this.id ?? await this.find();
      }
      async waitForExist(opts) {
        const deadline = Date.now() + (opts?.timeout ?? 1e4);
        for (; ; ) {
          try {
            await this.find();
            return;
          } catch (err) {
            if (!isNoSuchElement(err) || Date.now() > deadline) throw err;
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }
      async isExisting() {
        try {
          await this.find();
          return true;
        } catch (err) {
          if (isNoSuchElement(err)) return false;
          throw err;
        }
      }
      async click() {
        const id = await this.ensure();
        await this.session.cmd("POST", `/element/${id}/click`, {});
      }
      // webdriverio's setValue = clear + type; mirror that.
      async setValue(value) {
        const id = await this.ensure();
        try {
          await this.session.cmd("POST", `/element/${id}/clear`, {});
        } catch {
        }
        await this.session.cmd("POST", `/element/${id}/value`, { text: value });
      }
      async getText() {
        const id = await this.ensure();
        const res = await this.session.cmd("GET", `/element/${id}/text`);
        return String(res.value ?? "");
      }
      async getValue() {
        const id = await this.ensure();
        try {
          const res = await this.session.cmd("GET", `/element/${id}/property/value`);
          return String(res.value ?? "");
        } catch {
          return "";
        }
      }
      async getAttribute(name) {
        const id = await this.ensure();
        const res = await this.session.cmd("GET", `/element/${id}/attribute/${encodeURIComponent(name)}`);
        return res.value == null ? null : String(res.value);
      }
    };
    RemoteSession = class _RemoteSession {
      constructor(baseUrl, headers, sessionId) {
        this.baseUrl = baseUrl;
        this.headers = headers;
        this.sessionId = sessionId;
      }
      static async create(options) {
        const base = `${options.protocol}://${options.hostname}:${options.port}${options.path.replace(/\/+$/, "")}`;
        const headers = { "Content-Type": "application/json" };
        if (options.user && options.key) {
          headers.Authorization = "Basic " + btoa(`${options.user}:${options.key}`);
        }
        const res = await wdFetch(`${base}/session`, {
          method: "POST",
          headers,
          timeoutMs: options.connectTimeoutMs ?? 3e5,
          body: JSON.stringify({
            capabilities: { alwaysMatch: options.capabilities, firstMatch: [{}] }
          })
        });
        const value = res.value;
        const sessionId = value.sessionId ?? res.sessionId;
        if (!sessionId) throw new Error("Device session did not return a sessionId.");
        return new _RemoteSession(base, headers, sessionId);
      }
      async cmd(method, path, body) {
        return wdFetch(`${this.baseUrl}/session/${this.sessionId}${path}`, {
          method,
          headers: this.headers,
          body: body === void 0 ? void 0 : JSON.stringify(body)
        });
      }
      // --- WdBrowser structural surface (what driver.ts consumes) ---------------
      $(selector) {
        return new RemoteElement(this, selector);
      }
      async url(u) {
        await this.cmd("POST", "/url", { url: u });
      }
      async getPageSource() {
        const res = await this.cmd("GET", "/source");
        return String(res.value ?? "");
      }
      async takeScreenshot() {
        const res = await this.cmd("GET", "/screenshot");
        return String(res.value ?? "");
      }
      async getWindowSize() {
        const res = await this.cmd("GET", "/window/rect");
        const rect = res.value;
        return { width: rect.width ?? 390, height: rect.height ?? 844 };
      }
      action(_type, opts) {
        return new ActionChain(this, opts?.parameters?.pointerType ?? "touch");
      }
      async pressKeyCode(code) {
        await this.cmd("POST", "/appium/device/press_keycode", { keycode: code });
      }
      /**
       * Send keystrokes to the focused element (webdriverio's `browser.keys`
       * equivalent) as a W3C key input source. Real key events, so UIs that move
       * focus per character - OTP/PIN boxes - behave as they do for a user.
       */
      async keys(text) {
        const actions = [];
        for (const ch of text) {
          actions.push({ type: "keyDown", value: ch });
          actions.push({ type: "keyUp", value: ch });
        }
        await this.cmd("POST", "/actions", {
          actions: [{ type: "key", id: "keyboard", actions }]
        });
      }
      async execute(script, ...args) {
        const serialized = args.map((a) => a instanceof RemoteElement ? a.toJSON() : a);
        const res = await this.cmd("POST", "/execute/sync", { script, args: serialized });
        return res.value;
      }
      async takeElementScreenshot(elementId) {
        const res = await this.cmd("GET", `/element/${elementId}/screenshot`);
        return String(res.value ?? "");
      }
      async setGeoLocation(loc) {
        await this.cmd("POST", "/location", {
          location: { latitude: loc.latitude, longitude: loc.longitude, altitude: loc.altitude ?? 0 }
        });
      }
      async getGeoLocation() {
        const res = await this.cmd("GET", "/location");
        const v = res.value;
        return v && typeof v.latitude === "number" && typeof v.longitude === "number" ? { latitude: v.latitude, longitude: v.longitude } : null;
      }
      async hideKeyboard() {
        await this.cmd("POST", "/appium/device/hide_keyboard", {});
      }
      async deleteSession() {
        await this.cmd("DELETE", "");
      }
    };
  }
});

// src/engine/config/env.ts
var env = {
  port: 0,
  uipath: {
    baseUrl: "https://cloud.uipath.com",
    orgName: "",
    tenantName: "",
    clientId: "",
    clientSecret: "",
    scope: "OR.Execution ConversationalAgents",
    bearerToken: "",
    llmModel: "gpt-4o-mini-2024-07-18",
    llmBasePath: "",
    llmApiVersion: "2024-10-21"
  },
  farm: {
    provider: "browserstack",
    browserstackUser: "",
    browserstackKey: "",
    sauceUser: "",
    sauceKey: "",
    sauceRegion: "us-west-1",
    connectTimeoutMs: 3e5,
    maxParallel: 0,
    // Live device-screen streaming cadence during a run (ms). 0 = off.
    // Floor between live frames; each is scheduled from how long the previous
    // one took, so a fast device streams smoothly and a slow one backs off
    // rather than queueing behind the step commands.
    liveFrameMs: 700
  }
};

// src/engine/store.ts
var sessions = /* @__PURE__ */ new Map();
var counter = 0;
function newSessionId() {
  counter += 1;
  const stamp = Date.now().toString(36);
  return `s_${stamp}_${counter.toString(36)}`;
}
function saveSession(state, driver) {
  const existing = sessions.get(state.id);
  sessions.set(state.id, { state, driver: driver ?? existing?.driver });
}
function getSession(id) {
  return sessions.get(id)?.state;
}
var batches = /* @__PURE__ */ new Map();
var batchCounter = 0;
function newBatchId() {
  batchCounter += 1;
  return `b_${Date.now().toString(36)}_${batchCounter.toString(36)}`;
}
function saveBatch(batch) {
  batches.set(batch.id, batch);
}
function getBatch(id) {
  return batches.get(id);
}

// src/engine/uipath/auth.ts
function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "") || "https://cloud.uipath.com";
}
var tokenCache = /* @__PURE__ */ new Map();
function cacheKey(config) {
  return [
    config.mode,
    config.baseUrl,
    config.orgName,
    config.tenantName,
    config.clientId ?? "",
    config.bearerToken ? "bearer" : ""
  ].join("|");
}
async function exchangeClientCredentials(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const tokenUrl = `${baseUrl}/identity_/connect/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId ?? "",
    client_secret: config.clientSecret ?? "",
    scope: config.scope?.trim() || "OR.Execution"
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `UiPath token exchange failed (${response.status}): ${detail.slice(0, 400)}`
    );
  }
  const json2 = await response.json();
  if (!json2.access_token) {
    throw new Error("UiPath token endpoint returned no access_token.");
  }
  return { token: json2.access_token, expiresIn: json2.expires_in ?? 3600 };
}
async function resolveUiPathToken(config) {
  const key = cacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 6e4) {
    return cached;
  }
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  let token;
  let expiresAt;
  if (config.mode === "bearer") {
    if (!config.bearerToken) {
      throw new Error("Bearer auth selected but no token was provided.");
    }
    token = config.bearerToken.trim();
    expiresAt = Date.now() + 30 * 6e4;
  } else {
    if (!config.clientId || !config.clientSecret) {
      throw new Error(
        "Client-credentials auth selected but clientId/clientSecret are missing."
      );
    }
    const result = await exchangeClientCredentials(config);
    token = result.token;
    expiresAt = Date.now() + result.expiresIn * 1e3;
  }
  const resolved = {
    token,
    baseUrl,
    orgName: config.orgName,
    tenantName: config.tenantName,
    expiresAt
  };
  tokenCache.set(key, resolved);
  return resolved;
}
function isUiPathConfigured(config) {
  if (!config) return false;
  if (!config.orgName || !config.tenantName) return false;
  if (config.mode === "bearer") return Boolean(config.bearerToken);
  return Boolean(config.clientId && config.clientSecret);
}

// src/engine/uipath/llmGateway.ts
var DEFAULT_BASE_PATHS = [
  "llmgateway_/api/chat/completions",
  "orchestrator_/llm/api/chat/completions",
  "agenthub_/llm/api/chat/completions"
];
function basePaths() {
  if (env.uipath.llmBasePath) {
    const custom = env.uipath.llmBasePath.replace(/^\/+|\/+$/g, "");
    const withSuffix = custom.endsWith("chat/completions") ? custom : `${custom}/api/chat/completions`;
    return [withSuffix, ...DEFAULT_BASE_PATHS];
  }
  return DEFAULT_BASE_PATHS;
}
function buildUrl(auth, basePath) {
  const apiVersion = encodeURIComponent(env.uipath.llmApiVersion);
  return `${auth.baseUrl}/${auth.orgName}/${auth.tenantName}/${basePath}?api-version=${apiVersion}`;
}
function buildHeaders(token, model) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-UIPATH-STREAMING-ENABLED": "false",
    "X-UiPath-LlmGateway-RequestingProduct": "mobile-test-autopilot",
    "X-UiPath-LlmGateway-RequestingFeature": "action-planner",
    // Required by the normalized LLM Gateway API (agenthub_/orchestrator_ /llm).
    "X-UiPath-LlmGateway-NormalizedApi-ModelName": model,
    "X-UiPath-LLMGateway-AllowFull4xxResponse": "true"
  };
}
var stickyBasePath = null;
async function chatComplete(auth, messages, options = {}) {
  const model = options.model || env.uipath.llmModel;
  const payload = {
    model,
    messages,
    temperature: options.temperature ?? 0,
    max_tokens: 800
  };
  if (options.jsonMode) {
    payload.response_format = { type: "json_object" };
  }
  const ordered = stickyBasePath ? [stickyBasePath, ...basePaths().filter((p) => p !== stickyBasePath)] : basePaths();
  const errors = [];
  for (const basePath of ordered) {
    const url = buildUrl(auth, basePath);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(auth.token, model),
        body: JSON.stringify(payload)
      });
      if (response.status === 404 || response.status === 405) {
        errors.push(`${basePath} -> ${response.status}`);
        continue;
      }
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        errors.push(`${basePath} -> ${response.status} ${text.slice(0, 200)}`);
        continue;
      }
      const json2 = await response.json();
      const content = json2.choices?.[0]?.message?.content ?? "";
      if (!content) {
        errors.push(`${basePath} -> empty completion`);
        continue;
      }
      stickyBasePath = basePath;
      return { content, model, basePathUsed: basePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${basePath} -> ${message}`);
    }
  }
  throw new Error(
    `UiPath LLM Gateway call failed across all base paths. Tried: ${errors.join(" | ")}`
  );
}
async function listModels(auth) {
  const ordered = stickyBasePath ? [stickyBasePath, ...basePaths().filter((p) => p !== stickyBasePath)] : basePaths();
  for (const basePath of ordered) {
    const url = buildUrl(auth, basePath);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(auth.token, "__list_models__"),
        body: JSON.stringify({
          model: "__list_models__",
          messages: [{ role: "user", content: "x" }],
          max_tokens: 5
        })
      });
      if (response.status === 404 || response.status === 405) continue;
      const text = await response.text();
      const match = text.match(/Supported models are:\s*([^"}]+)/i);
      if (match) {
        stickyBasePath = basePath;
        return match[1].replace(/\.\s*$/, "").split(",").map((s) => s.trim()).filter(Boolean).sort();
      }
    } catch {
    }
  }
  return [];
}
var NON_CHAT = /(image|embed|whisper|tts|audio|moderation|computer-use|bison|vision)/i;
async function probeModel(auth, model, basePath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12e3);
  try {
    const response = await fetch(buildUrl(auth, basePath), {
      method: "POST",
      headers: buildHeaders(auth.token, model),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0
      }),
      signal: controller.signal
    });
    return response.ok || response.status === 429;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
async function listWorkingModels(auth) {
  const catalog = await listModels(auth);
  if (catalog.length === 0) return [];
  const basePath = stickyBasePath ?? basePaths()[0];
  const candidates = catalog.filter((m) => !NON_CHAT.test(m));
  const working = [];
  let next = 0;
  const CONCURRENCY = 8;
  const worker = async () => {
    while (next < candidates.length) {
      const model = candidates[next++];
      if (await probeModel(auth, model, basePath)) working.push(model);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker())
  );
  return working.sort();
}

// src/engine/farms/provider.ts
function resolveNativeBuild(device, app) {
  if (device.platform === "Android") {
    return {
      buildId: app.android?.buildId,
      appPackage: app.android?.appPackage,
      appActivity: app.android?.appActivity
    };
  }
  return { buildId: app.ios?.buildId, bundleId: app.ios?.bundleId };
}
function appSessionName(device, app) {
  return app.appName || resolveNativeBuild(device, app).buildId || "app";
}
function baseCapabilities(device, app) {
  const automationName = device.platform === "Android" ? "UiAutomator2" : "XCUITest";
  const build = resolveNativeBuild(device, app);
  const caps = {
    platformName: device.platform,
    "appium:automationName": automationName,
    "appium:deviceName": device.deviceName,
    "appium:platformVersion": device.osVersion,
    "appium:app": build.buildId,
    "appium:autoGrantPermissions": device.platform === "Android" ? true : void 0,
    "appium:newCommandTimeout": 1800
  };
  if (device.platform === "Android" && build.appPackage) {
    caps["appium:appPackage"] = build.appPackage;
    if (build.appActivity) caps["appium:appActivity"] = build.appActivity;
  }
  if (device.platform === "iOS" && build.bundleId) {
    caps["appium:bundleId"] = build.bundleId;
  }
  for (const k of Object.keys(caps)) if (caps[k] === void 0) delete caps[k];
  return caps;
}
function browserNameFor(device) {
  if (device.platform === "iOS") return "safari";
  return device.browser?.trim() || "chrome";
}
function browserCapabilities(device) {
  const automationName = device.platform === "Android" ? "UiAutomator2" : "XCUITest";
  return {
    browserName: browserNameFor(device),
    platformName: device.platform,
    "appium:automationName": automationName,
    "appium:deviceName": device.deviceName,
    "appium:platformVersion": device.osVersion,
    "appium:newCommandTimeout": 1800
  };
}

// src/engine/farms/browserstack.ts
var browserStack = {
  id: "browserstack",
  label: "BrowserStack App Automate",
  hasCredentials(creds) {
    return Boolean(creds.username && creds.accessKey);
  },
  buildConnection({ creds, device, app }) {
    const target2 = device.connectionTarget ?? "app";
    let caps;
    if (target2 === "browser") {
      caps = {
        browserName: browserNameFor(device),
        "bstack:options": {
          userName: creds.username,
          accessKey: creds.accessKey,
          deviceName: device.deviceName,
          osVersion: device.osVersion,
          realMobile: "true",
          projectName: "UiPath Mobile Test Autopilot",
          buildName: "autopilot-build",
          sessionName: app.startUrl || "mobile-web",
          appiumVersion: "2.0.0"
        }
      };
    } else {
      caps = baseCapabilities(device, app);
      caps["bstack:options"] = {
        userName: creds.username,
        accessKey: creds.accessKey,
        deviceName: device.deviceName,
        osVersion: device.osVersion,
        projectName: "UiPath Mobile Test Autopilot",
        buildName: "autopilot-build",
        sessionName: appSessionName(device, app),
        appiumVersion: "2.0.0"
      };
    }
    const geo = device.geoLocation?.trim().toUpperCase();
    if (geo) {
      caps["bstack:options"].geoLocation = geo;
    }
    return {
      protocol: "https",
      hostname: "hub-cloud.browserstack.com",
      port: 443,
      path: "/wd/hub",
      user: creds.username ?? "",
      key: creds.accessKey ?? "",
      capabilities: caps
    };
  }
};

// src/engine/farms/saucelabs.ts
function hostForRegion(region) {
  const r = (region || "us-west-1").trim();
  if (r.startsWith("eu")) return "ondemand.eu-central-1.saucelabs.com";
  if (r.startsWith("us-east")) return "ondemand.us-east-4.saucelabs.com";
  return "ondemand.us-west-1.saucelabs.com";
}
function sauceDeviceName(name) {
  return `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
var sauceLabs = {
  id: "saucelabs",
  label: "Sauce Labs Real Device Cloud",
  hasCredentials(creds) {
    return Boolean(creds.username && creds.accessKey);
  },
  buildConnection({ creds, device, app }) {
    const target2 = device.connectionTarget ?? "app";
    const automationName = device.platform === "Android" ? "UiAutomator2" : "XCUITest";
    let caps;
    if (target2 === "browser") {
      const sauceOptions = {
        username: creds.username,
        accessKey: creds.accessKey,
        build: "UiPath Mobile Test Autopilot",
        name: app.startUrl || "mobile-web",
        deviceOrientation: "PORTRAIT"
      };
      const isVirtual = /emulator|simulator/i.test(device.deviceName);
      if (!isVirtual) sauceOptions.appiumVersion = "latest";
      caps = {
        browserName: browserNameFor(device),
        platformName: device.platform,
        "appium:automationName": automationName,
        "appium:platformVersion": device.osVersion,
        "appium:newCommandTimeout": 1800,
        "sauce:options": sauceOptions
      };
    } else {
      caps = baseCapabilities(device, app);
      caps["sauce:options"] = {
        username: creds.username,
        accessKey: creds.accessKey,
        build: "UiPath Mobile Test Autopilot",
        name: appSessionName(device, app),
        // Required for Android 14+ real devices on Sauce RDC (Appium 2 / W3C).
        appiumVersion: "latest"
      };
    }
    caps["appium:deviceName"] = sauceDeviceName(device.deviceName);
    return {
      protocol: "https",
      hostname: hostForRegion(creds.region),
      port: 443,
      path: "/wd/hub",
      user: creds.username ?? "",
      key: creds.accessKey ?? "",
      capabilities: caps
    };
  }
};

// src/engine/farms/lambdatest.ts
var LAMBDATEST_HUB = "mobile-hub.lambdatest.com";
function lambdaTestRegion(region) {
  const r = (region || "us").trim().toLowerCase();
  if (r.startsWith("eu")) return "EU";
  if (r.startsWith("ap") || r.startsWith("as")) return "AP";
  return "US";
}
var lambdaTest = {
  id: "lambdatest",
  label: "LambdaTest Real Device Cloud",
  hasCredentials(creds) {
    return Boolean(creds.username && creds.accessKey);
  },
  buildConnection({ creds, device, app }) {
    const target2 = device.connectionTarget ?? "app";
    const automationName = device.platform === "Android" ? "UiAutomator2" : "XCUITest";
    const ltOptions = {
      username: creds.username,
      accessKey: creds.accessKey,
      deviceName: device.deviceName,
      platformName: device.platform,
      platformVersion: device.osVersion,
      isRealMobile: true,
      // Must match the region the device list was fetched from - the pools
      // differ per data centre, so the device may not exist in another one.
      region: lambdaTestRegion(creds.region),
      project: "UiPath Mobile Test Autopilot",
      build: "autopilot-build",
      w3c: true,
      autoGrantPermissions: device.platform === "Android" ? true : void 0,
      // IP geolocation for the session (ISO country code, e.g. "ZA").
      geoLocation: device.geoLocation?.trim().toUpperCase() || void 0
    };
    let caps;
    if (target2 === "browser") {
      ltOptions.name = app.startUrl || "mobile-web";
      caps = {
        browserName: browserNameFor(device),
        platformName: device.platform,
        "appium:automationName": automationName,
        "appium:deviceName": device.deviceName,
        "appium:platformVersion": device.osVersion,
        "appium:newCommandTimeout": 1800
      };
    } else {
      ltOptions.name = appSessionName(device, app);
      ltOptions.app = resolveNativeBuild(device, app).buildId;
      caps = baseCapabilities(device, app);
      delete caps["appium:app"];
    }
    for (const k of Object.keys(ltOptions)) {
      if (ltOptions[k] === void 0) delete ltOptions[k];
    }
    caps["lt:options"] = ltOptions;
    return {
      protocol: "https",
      hostname: LAMBDATEST_HUB,
      port: 443,
      path: "/wd/hub",
      user: creds.username ?? "",
      key: creds.accessKey ?? "",
      capabilities: caps
    };
  }
};

// src/engine/farms/custom.ts
var customFarm = {
  id: "custom",
  label: "Custom Appium endpoint",
  hasCredentials(creds) {
    return Boolean(creds.hubUrl && creds.hubUrl.trim());
  },
  buildConnection({ creds, device, app }) {
    let url;
    try {
      url = new URL((creds.hubUrl ?? "").trim());
    } catch {
      throw new Error("Invalid Appium hub URL. Use e.g. http://host:4723/wd/hub");
    }
    const target2 = device.connectionTarget ?? "app";
    const caps = target2 === "browser" ? browserCapabilities(device) : baseCapabilities(device, app);
    const isHttps = url.protocol === "https:";
    return {
      protocol: isHttps ? "https" : "http",
      hostname: url.hostname,
      port: url.port ? Number(url.port) : isHttps ? 443 : 4723,
      path: url.pathname && url.pathname !== "/" ? url.pathname : "/wd/hub",
      user: creds.username ?? "",
      key: creds.accessKey ?? "",
      capabilities: caps
    };
  }
};

// src/engine/farms/index.ts
var FARMS = {
  browserstack: browserStack,
  saucelabs: sauceLabs,
  lambdatest: lambdaTest,
  custom: customFarm
};
function getFarm(provider) {
  const farm = FARMS[provider];
  if (!farm) throw new Error(`Unknown device farm provider: ${provider}`);
  return farm;
}

// src/engine/automation/pageModel.ts
var import_fast_xml_parser = __toESM(require_fxp(), 1);
var parser = new import_fast_xml_parser.XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  allowBooleanAttributes: true,
  trimValues: true
});
function attr(node, name) {
  const a = node[":@"];
  if (!a) return void 0;
  const v = a[`@_${name}`];
  return v === void 0 || v === "" ? void 0 : String(v);
}
function tagOf(node) {
  for (const key of Object.keys(node)) {
    if (key === ":@" || key === "#text") continue;
    return key;
  }
  return void 0;
}
function childrenOf(node, tag) {
  const value = node[tag];
  return Array.isArray(value) ? value : [];
}
function asBool(v) {
  if (v === void 0) return void 0;
  return v === "true";
}
function boundsCenter(bounds) {
  if (!bounds) return null;
  const android = bounds.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
  if (android) {
    const [, x1, y1, x2, y2] = android.map(Number);
    return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
  }
  const parts = bounds.split(",").map((p) => Number(p.trim()));
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    const [x, y, width, height] = parts;
    return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
  }
  return null;
}
function boundsBox(bounds) {
  if (!bounds) return null;
  const android = bounds.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
  if (android) {
    const [, x1, y1, x2, y2] = android.map(Number);
    return { left: x1, top: y1, right: x2, bottom: y2 };
  }
  const parts = bounds.split(",").map((p) => Number(p.trim()));
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    const [x, y, width, height] = parts;
    return { left: x, top: y, right: x + width, bottom: y + height };
  }
  return null;
}
function isInteresting(el) {
  return Boolean(
    el.text || el.contentDesc || el.resourceId || el.accessibilityId || el.name || el.clickable
  );
}
function parsePageSource(xml, platform) {
  let tree;
  try {
    tree = parser.parse(xml);
  } catch {
    return [];
  }
  const out = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      const tag = tagOf(node);
      if (!tag) continue;
      let el = null;
      if (platform === "Android") {
        el = {
          platform,
          className: attr(node, "class") || tag,
          text: attr(node, "text"),
          contentDesc: attr(node, "content-desc"),
          resourceId: attr(node, "resource-id"),
          accessibilityId: attr(node, "content-desc"),
          // a11y id == content-desc on Android
          bounds: attr(node, "bounds"),
          clickable: asBool(attr(node, "clickable")),
          enabled: asBool(attr(node, "enabled")),
          focused: asBool(attr(node, "focused"))
        };
      } else {
        const type = attr(node, "type") || tag;
        el = {
          platform,
          className: type,
          text: attr(node, "value") || attr(node, "label"),
          contentDesc: attr(node, "label"),
          name: attr(node, "name"),
          accessibilityId: attr(node, "name"),
          value: attr(node, "value"),
          bounds: attr(node, "x") !== void 0 ? `${attr(node, "x")},${attr(node, "y")},${attr(node, "width")},${attr(node, "height")}` : void 0,
          clickable: type.includes("Button") || type.includes("Cell") || type.includes("Link"),
          enabled: asBool(attr(node, "enabled"))
        };
      }
      if (el && isInteresting(el)) {
        out.push(el);
      }
      walk(childrenOf(node, tag));
    }
  };
  walk(tree);
  return out.map((el, index) => ({ ...el, index }));
}

// src/engine/automation/driver.ts
function toWdSelector(selector) {
  switch (selector.strategy) {
    case "accessibility id":
      return `~${selector.locator}`;
    case "id":
      return `id=${selector.locator}`;
    case "-android uiautomator":
      return `android=${selector.locator}`;
    case "css":
    case "xpath":
      return selector.locator;
    default:
      return selector.locator;
  }
}
var ANDROID_KEYCODES = {
  BACK: 4,
  HOME: 3,
  ENTER: 66,
  TAB: 61,
  DEL: 67,
  SEARCH: 84
};
var WEB_EXTRACT_JS = `
const out = [];
const sel = 'a,button,input,textarea,select,[role="button"],[role="link"],[onclick],[data-test],label,h1,h2,h3';
const nodes = Array.from(document.querySelectorAll(sel)).slice(0, 90);
function cssPath(el){
  if (el.id) return '#' + CSS.escape(el.id);
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && parts.length < 4){
    let part = node.tagName.toLowerCase();
    if (node.classList && node.classList.length) {
      const stable = Array.from(node.classList).filter(c=>!/^(ng-|is-|has-|mat-|cdk-)|^(active|show|open|focus|focused|hover|disabled|selected|touched|untouched|dirty|pristine|valid|invalid|loading|loaded)$/.test(c)).slice(0,2);
      if (stable.length) part += '.' + stable.map(c=>CSS.escape(c)).join('.');
    }
    const parent = node.parentNode;
    if (parent){
      const sibs = Array.from(parent.children).filter(c=>c.tagName===node.tagName);
      if (sibs.length>1) part += ':nth-of-type(' + (sibs.indexOf(node)+1) + ')';
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(' > ');
}
const txt = (e) => (e.innerText||e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,80);
nodes.forEach((el)=>{
  const r = el.getBoundingClientRect();
  if (r.width===0 || r.height===0) return;
  const tag = el.tagName.toLowerCase();
  const isField = tag==='input'||tag==='textarea'||tag==='select';
  const o = {
    tag,
    id: el.id||'',
    name: el.getAttribute('name')||'',
    type: el.getAttribute('type')||'',
    text: isField ? (el.value||'') : txt(el),
    ariaLabel: el.getAttribute('aria-label')||'',
    placeholder: el.getAttribute('placeholder')||'',
    title: el.getAttribute('title')||'',
    href: el.getAttribute('href')||'',
    role: el.getAttribute('role')||'',
    dataTest: el.getAttribute('data-test')||el.getAttribute('data-testid')||'',
    css: cssPath(el),
  };
  // Drop identifier-less noise (e.g. empty icon/nav anchors). Always keep fields.
  const signal = o.id||o.name||o.dataTest||o.text||o.ariaLabel||o.placeholder||o.title||o.href;
  if (!isField && !signal) return;
  out.push(o);
});
return out;
`;
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
var WebdriverDriver = class {
  constructor(browser, platform, target2) {
    this.browser = browser;
    this.platform = platform;
    this.target = target2;
  }
  async el(selector) {
    return await this.browser.$(toWdSelector(selector));
  }
  // Open a URL in the device browser. The W3C navigate is primary, but on some
  // iOS Safari builds (e.g. iOS 26/27) it resolves WITHOUT actually navigating
  // (stays on about:blank). So we verify we landed and, if not, force the
  // navigation via JS in the page context.
  async navigateTo(url) {
    try {
      await this.browser.url(url);
    } catch {
    }
    await this.waitForWebReady();
    if (!await this.atHost(url)) {
      try {
        await this.browser.execute(`window.location.assign(${JSON.stringify(url)})`);
      } catch {
      }
      await this.waitForWebReady();
    }
  }
  async currentUrl() {
    try {
      return await this.browser.execute("return document.location.href") || "";
    } catch {
      return "";
    }
  }
  // Did the browser actually land on the requested URL's host?
  async atHost(url) {
    const current = await this.currentUrl();
    try {
      return Boolean(current) && new URL(current).host === new URL(url).host;
    } catch {
      return false;
    }
  }
  async captureElements() {
    if (this.target === "browser") {
      await this.waitForWebReady();
      const raw = await this.browser.execute(WEB_EXTRACT_JS) ?? [];
      return raw.map((e, index) => ({
        index,
        platform: this.platform,
        kind: "web",
        className: e.tag,
        tag: e.tag,
        htmlId: e.id || void 0,
        name: e.name || void 0,
        testId: e.dataTest || void 0,
        inputType: e.type || void 0,
        text: e.text || void 0,
        ariaLabel: e.ariaLabel || e.title || e.dataTest || void 0,
        placeholder: e.placeholder || void 0,
        href: e.href || void 0,
        role: e.role || void 0,
        cssPath: e.css || void 0,
        clickable: e.tag === "a" || e.tag === "button" || e.role === "button" || e.role === "link"
      }));
    }
    const xml = await this.browser.getPageSource();
    return parsePageSource(xml, this.platform);
  }
  // Wait until the DOM is interactive/complete before reading the page, so we
  // never plan against a half-loaded screen.
  async waitForWebReady() {
    for (let i = 0; i < 20; i += 1) {
      try {
        const state = await this.browser.execute("return document.readyState");
        if (state === "complete" || state === "interactive") {
          await delay(250);
          return;
        }
      } catch {
        return;
      }
      await delay(300);
    }
  }
  async takeScreenshot() {
    const base64 = await this.browser.takeScreenshot();
    return `data:image/png;base64,${base64}`;
  }
  async tap(selector) {
    const element = await this.el(selector);
    await element.waitForExist({ timeout: 1e4 });
    await element.click();
  }
  /**
   * Type into whatever currently has focus, as real key events.
   *
   * Needed for inputs that carry no id, description or text - web-view forms
   * expose them that way - where no selector can single one out. Tapping the
   * field focuses it, then the keystrokes land wherever the caret is.
   */
  async typeIntoFocused(text, perCharDelayMs = 0) {
    if (!this.browser.keys) throw new Error("This driver cannot send raw key events.");
    if (perCharDelayMs <= 0) {
      await this.browser.keys(text);
      return;
    }
    for (const ch of text) {
      await this.browser.keys(ch);
      await new Promise((r) => setTimeout(r, perCharDelayMs));
    }
  }
  async tapAt(x, y) {
    await this.browser.action("pointer", { parameters: { pointerType: "touch" } }).move({ duration: 0, x: Math.round(x), y: Math.round(y) }).down().pause(80).up().perform();
  }
  async setText(selector, text) {
    const element = await this.el(selector);
    await element.waitForExist({ timeout: 1e4 });
    await element.setValue(text);
    if (this.target === "app" && text.length > 1) {
      await this.fixSegmentedInput(selector, text);
    }
  }
  /**
   * OTP / PIN screens split the value across one box per character. Those
   * boxes cap at maxlength=1 and move focus themselves as you type, so a
   * single setValue leaves only the first character in place.
   *
   * Detect that (the field read back shorter than what we sent) and re-enter
   * the value as individual keystrokes to the focused element, letting the
   * app's own auto-advance carry each character to the next box.
   */
  async fixSegmentedInput(selector, text) {
    if (!this.browser.keys) return;
    const landed = await this.getFieldValue(selector).catch(() => "");
    if (landed.length === 0 || landed.length >= text.length) return;
    try {
      await (await this.el(selector)).click();
      await delay(150);
      await this.browser.keys("\uE003".repeat(text.length + 2));
      await delay(150);
      for (const ch of text) {
        await this.browser.keys(ch);
        await delay(120);
      }
    } catch {
    }
  }
  async getText(selector) {
    const element = await this.el(selector);
    await element.waitForExist({ timeout: 1e4 });
    return await element.getText();
  }
  // The current value of an input - used to confirm a setText actually landed.
  async getFieldValue(selector) {
    try {
      const element = await this.el(selector);
      if (this.target === "browser") {
        let v = element.getValue ? await element.getValue() ?? "" : "";
        if (!v) {
          v = await this.browser.execute(
            "return arguments[0] && arguments[0].value || ''",
            element
          ) || "";
        }
        return v;
      }
      if (element.getAttribute) {
        const v = await element.getAttribute("value");
        if (v != null && v !== "") return v;
      }
      return await element.getText();
    } catch {
      return "";
    }
  }
  // Screenshot cropped to a single element (driver-side, so it's
  // chrome-independent). Returns "" if the driver can't do element screenshots.
  async captureElementShot(selector) {
    try {
      const element = await this.el(selector);
      await element.waitForExist({ timeout: 5e3 });
      const id = element.elementId;
      if (!id || !this.browser.takeElementScreenshot) return "";
      const b64 = await this.browser.takeElementScreenshot(id);
      return b64 ? `data:image/png;base64,${b64}` : "";
    } catch {
      return "";
    }
  }
  // A cheap fingerprint of the current screen, to detect whether an action
  // (e.g. a tap) actually changed anything.
  async screenSignature() {
    try {
      if (this.target === "browser") {
        return await this.browser.execute(
          "return location.href + '#' + document.title + '#' + document.querySelectorAll('*').length + '#' + (document.body ? document.body.innerText.length : 0)"
        );
      }
      const src = await this.browser.getPageSource();
      return `len:${src.length}`;
    } catch {
      return "";
    }
  }
  async waitForPresent(selector, timeoutMs = 15e3) {
    const deadline = Date.now() + timeoutMs;
    for (; ; ) {
      if (await this.exists(selector)) return true;
      if (Date.now() >= deadline) return false;
      await delay(500);
    }
  }
  async exists(selector) {
    try {
      const element = await this.el(selector);
      return await element.isExisting();
    } catch {
      return false;
    }
  }
  async pressKey(key) {
    const code = ANDROID_KEYCODES[key?.toUpperCase()];
    if (this.platform === "Android" && code && this.browser.pressKeyCode) {
      await this.browser.pressKeyCode(code);
      return;
    }
    if (this.platform === "iOS" && key?.toUpperCase() === "HOME") {
      await this.browser.execute("mobile: pressButton", { name: "home" });
    }
  }
  async swipe(direction) {
    if (this.target === "browser") {
      const { width: width2, height: height2 } = await this.browser.getWindowSize().catch(() => ({ width: 390, height: 844 }));
      const dy2 = Math.round(height2 * 0.6);
      const dx2 = Math.round(width2 * 0.6);
      const [bx, by] = direction === "up" ? [0, dy2] : direction === "down" ? [0, -dy2] : direction === "left" ? [dx2, 0] : [-dx2, 0];
      await this.browser.execute(`window.scrollBy(${bx}, ${by})`);
      return;
    }
    const { width, height } = await this.browser.getWindowSize();
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);
    const dx = Math.round(width * 0.3);
    const dy = Math.round(height * 0.3);
    const to = { x: cx, y: cy };
    if (direction === "up") to.y = cy - dy;
    if (direction === "down") to.y = cy + dy;
    if (direction === "left") to.x = cx - dx;
    if (direction === "right") to.x = cx + dx;
    await this.browser.action("pointer", { parameters: { pointerType: "touch" } }).move({ duration: 0, x: cx, y: cy }).down().pause(120).move({ duration: 300, x: to.x, y: to.y }).up().perform();
  }
  async setGeoLocation(latitude, longitude) {
    if (!this.browser.setGeoLocation) return null;
    await this.browser.setGeoLocation({ latitude, longitude, altitude: 0 });
    if (!this.browser.getGeoLocation) return null;
    try {
      return await this.browser.getGeoLocation();
    } catch {
      return null;
    }
  }
  /**
   * Close the soft keyboard, and verify it actually closed.
   *
   * `hideKeyboard` is unreliable on Android - over a web view it frequently
   * resolves without doing anything, and the old code swallowed that silently.
   * A keyboard left up keeps the form scrolled, so every element position read
   * afterwards is wrong: on a card form that put the card number into the name
   * field and left the submit button unreachable.
   *
   * BACK always closes an Android IME, but it navigates when no keyboard is
   * open - so it is used only after confirming one IS open.
   */
  async dismissKeyboard() {
    if (this.target !== "app") return;
    const isShown = async () => {
      if (!this.browser.isKeyboardShown) return false;
      try {
        return Boolean(await this.browser.isKeyboardShown());
      } catch {
        return false;
      }
    };
    if (!await isShown()) return;
    if (this.browser.hideKeyboard) {
      try {
        await this.browser.hideKeyboard();
      } catch {
      }
    }
    if (!await isShown()) return;
    if (this.platform === "Android") {
      await this.pressKey("BACK").catch(() => void 0);
    }
  }
  async quit() {
    try {
      await this.browser.deleteSession();
    } catch {
    }
  }
};

// src/engine/fixtures/sampleApp.ts
var pkg = "com.acme.shopping";
var SAMPLE_SCREENS = [
  {
    id: "login",
    appName: "ACME Shopping",
    title: "Sign in",
    elements: [
      { kind: "title", text: "Welcome back", accessibilityId: "welcome_title" },
      { kind: "input", text: "Email", resourceId: `${pkg}:id/email_input`, accessibilityId: "email_field" },
      { kind: "input", text: "Password", resourceId: `${pkg}:id/password_input`, accessibilityId: "password_field" },
      { kind: "button", text: "Log in", resourceId: `${pkg}:id/login_button`, accessibilityId: "login_button" },
      { kind: "label", text: "Forgot password?", accessibilityId: "forgot_password" }
    ]
  },
  {
    id: "home",
    appName: "ACME Shopping",
    title: "Home",
    elements: [
      { kind: "title", text: "Featured", accessibilityId: "home_title" },
      { kind: "input", text: "Search products", resourceId: `${pkg}:id/search_box`, accessibilityId: "search_box" },
      { kind: "item", text: "Wireless Headphones", resourceId: `${pkg}:id/product_card`, accessibilityId: "product_headphones" },
      { kind: "item", text: "Smart Watch", resourceId: `${pkg}:id/product_card`, accessibilityId: "product_watch" },
      { kind: "button", text: "Cart", resourceId: `${pkg}:id/cart_tab`, accessibilityId: "cart_tab" }
    ]
  },
  {
    id: "product",
    appName: "ACME Shopping",
    title: "Product",
    elements: [
      { kind: "title", text: "Wireless Headphones", accessibilityId: "product_name" },
      { kind: "label", text: "$129.00", resourceId: `${pkg}:id/price`, accessibilityId: "product_price" },
      { kind: "button", text: "Add to cart", resourceId: `${pkg}:id/add_to_cart`, accessibilityId: "add_to_cart" },
      { kind: "button", text: "Buy now", resourceId: `${pkg}:id/buy_now`, accessibilityId: "buy_now" }
    ]
  },
  {
    id: "cart",
    appName: "ACME Shopping",
    title: "Cart",
    elements: [
      { kind: "title", text: "Your Cart", accessibilityId: "cart_title" },
      { kind: "item", text: "Wireless Headphones - $129.00", resourceId: `${pkg}:id/cart_line`, accessibilityId: "cart_line_1" },
      { kind: "label", text: "Total: $129.00", resourceId: `${pkg}:id/cart_total`, accessibilityId: "cart_total" },
      { kind: "button", text: "Checkout", resourceId: `${pkg}:id/checkout_button`, accessibilityId: "checkout_button" }
    ]
  },
  {
    id: "confirmation",
    appName: "ACME Shopping",
    title: "Order placed",
    elements: [
      { kind: "title", text: "Thank you!", accessibilityId: "confirmation_title" },
      { kind: "label", text: "Order #ACME-10293 confirmed", resourceId: `${pkg}:id/order_id`, accessibilityId: "order_id" },
      { kind: "button", text: "Continue shopping", resourceId: `${pkg}:id/continue_button`, accessibilityId: "continue_button" }
    ]
  }
];
function esc(v) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var PHONE = { w: 360, h: 780 };
function rowY(index) {
  return 150 + index * 96;
}
function buildScreenshot(screen, platform, deviceLabel) {
  const orange = "#FA4616";
  const navy = "#182128";
  const muted = "#667880";
  const rows = screen.elements.map((el, i) => {
    const y = rowY(i);
    if (el.kind === "title") {
      return `<text x="28" y="${y + 34}" font-family="Poppins, Segoe UI, sans-serif" font-size="26" font-weight="600" fill="${navy}">${esc(el.text)}</text>`;
    }
    if (el.kind === "label") {
      return `<text x="28" y="${y + 30}" font-family="Poppins, sans-serif" font-size="16" fill="${muted}">${esc(el.text)}</text>`;
    }
    if (el.kind === "input") {
      return `<g><rect x="24" y="${y}" rx="14" width="${PHONE.w - 48}" height="56" fill="#ffffff" stroke="#d9d9d9" stroke-width="1.5"/><text x="40" y="${y + 35}" font-family="Poppins, sans-serif" font-size="15" fill="#9aa7ad">${esc(el.text)}</text></g>`;
    }
    if (el.kind === "button") {
      const primary = i === screen.elements.length - 1 || /log in|checkout|buy|add to cart|continue/i.test(el.text);
      const fill = primary ? orange : "#ffffff";
      const stroke = primary ? orange : "#d9d9d9";
      const tcolor = primary ? "#ffffff" : navy;
      return `<g><rect x="24" y="${y}" rx="16" width="${PHONE.w - 48}" height="56" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><text x="${PHONE.w / 2}" y="${y + 35}" text-anchor="middle" font-family="Poppins, sans-serif" font-size="16" font-weight="600" fill="${tcolor}">${esc(el.text)}</text></g>`;
    }
    return `<g><rect x="24" y="${y}" rx="16" width="${PHONE.w - 48}" height="72" fill="#ffffff" stroke="#eceff1" stroke-width="1.5"/><rect x="40" y="${y + 16}" rx="8" width="40" height="40" fill="#cceefe"/><text x="96" y="${y + 42}" font-family="Poppins, sans-serif" font-size="15" font-weight="500" fill="${navy}">${esc(el.text)}</text></g>`;
  }).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PHONE.w}" height="${PHONE.h}" viewBox="0 0 ${PHONE.w} ${PHONE.h}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f7fbff"/></linearGradient></defs>
  <rect width="${PHONE.w}" height="${PHONE.h}" fill="url(#bg)"/>
  <rect width="${PHONE.w}" height="40" fill="${navy}"/>
  <text x="16" y="26" font-family="Poppins, sans-serif" font-size="13" fill="#ffffff">9:41</text>
  <text x="${PHONE.w - 16}" y="26" text-anchor="end" font-family="Poppins, sans-serif" font-size="12" fill="#cfd8dc">${esc(deviceLabel)}</text>
  <rect y="40" width="${PHONE.w}" height="64" fill="#ffffff"/>
  <circle cx="34" cy="72" r="12" fill="${orange}"/>
  <text x="56" y="78" font-family="Poppins, sans-serif" font-size="18" font-weight="600" fill="${navy}">${esc(screen.appName)}</text>
  <line x1="0" y1="104" x2="${PHONE.w}" y2="104" stroke="#eceff1"/>
  ${rows}
</svg>`;
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}

// src/engine/automation/simulated.ts
function androidClass(kind) {
  switch (kind) {
    case "input":
      return "android.widget.EditText";
    case "button":
      return "android.widget.Button";
    case "item":
      return "android.view.ViewGroup";
    default:
      return "android.widget.TextView";
  }
}
function iosType(kind) {
  switch (kind) {
    case "input":
      return "XCUIElementTypeTextField";
    case "button":
      return "XCUIElementTypeButton";
    case "item":
      return "XCUIElementTypeCell";
    default:
      return "XCUIElementTypeStaticText";
  }
}
function htmlTag(kind) {
  switch (kind) {
    case "input":
      return "input";
    case "button":
      return "button";
    case "item":
      return "a";
    default:
      return "span";
  }
}
var SimulatedDriver = class {
  constructor(platform, target2, deviceLabel) {
    this.platform = platform;
    this.target = target2;
    this.deviceLabel = deviceLabel;
  }
  screenIndex = 0;
  get screen() {
    return SAMPLE_SCREENS[Math.min(this.screenIndex, SAMPLE_SCREENS.length - 1)];
  }
  advance() {
    if (this.screenIndex < SAMPLE_SCREENS.length - 1) this.screenIndex += 1;
  }
  async captureElements() {
    return this.screen.elements.map((el, index) => {
      if (this.target === "browser") {
        const id = (el.resourceId?.split("/").pop() || el.accessibilityId || "").trim();
        return {
          index,
          platform: this.platform,
          kind: "web",
          className: htmlTag(el.kind),
          tag: htmlTag(el.kind),
          htmlId: id || void 0,
          name: id || void 0,
          text: el.kind === "input" ? void 0 : el.text,
          placeholder: el.kind === "input" ? el.text : void 0,
          ariaLabel: el.accessibilityId,
          cssPath: id ? `#${id}` : void 0,
          clickable: el.kind === "button" || el.kind === "item"
        };
      }
      return {
        index,
        platform: this.platform,
        kind: "native",
        className: this.platform === "Android" ? androidClass(el.kind) : iosType(el.kind),
        text: el.kind === "input" ? void 0 : el.text,
        contentDesc: el.accessibilityId,
        resourceId: el.resourceId,
        accessibilityId: el.accessibilityId,
        name: el.accessibilityId,
        clickable: el.kind === "button" || el.kind === "item",
        enabled: true
      };
    });
  }
  async navigateTo(_url) {
  }
  async currentUrl() {
    return "";
  }
  async takeScreenshot() {
    return buildScreenshot(this.screen, this.platform, this.deviceLabel);
  }
  async tap(_selector) {
    this.advance();
  }
  async tapAt(_x, _y) {
    this.advance();
  }
  async typeIntoFocused(_text) {
  }
  async setText(_selector, _text) {
  }
  async getText(_selector) {
    const el = this.screen.elements.find((e) => e.kind === "title" || e.kind === "label");
    return el?.text ?? "";
  }
  async getFieldValue(_selector) {
    return "";
  }
  async captureElementShot(_selector) {
    return "";
  }
  async screenSignature() {
    return `screen:${this.screenIndex}`;
  }
  async waitForPresent(selector, _timeoutMs = 15e3) {
    return this.exists(selector);
  }
  async exists(selector) {
    return this.screen.elements.some(
      (e) => selector.locator.includes(e.accessibilityId ?? "\0") || e.resourceId === selector.locator || e.text === selector.locator
    );
  }
  async pressKey(_key) {
  }
  async swipe(_direction) {
  }
  async setGeoLocation() {
    return null;
  }
  async dismissKeyboard() {
  }
  async quit() {
  }
};

// src/engine/automation/session.ts
var SECRET_KEYS = /* @__PURE__ */ new Set(["username", "userName", "accessKey", "access_key", "key", "password"]);
function stripSecrets(caps) {
  const out = {};
  for (const [k, v] of Object.entries(caps)) {
    if (SECRET_KEYS.has(k)) continue;
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? stripSecrets(v) : v;
  }
  return out;
}
async function createSession(args) {
  const farm = getFarm(args.creds.provider);
  const target2 = args.device.connectionTarget ?? "app";
  const deviceLabel = `${args.device.deviceName} \xB7 ${args.device.platform} ${args.device.osVersion}`;
  if (!farm.hasCredentials(args.creds)) {
    return {
      mode: "simulated",
      driver: new SimulatedDriver(args.device.platform, target2, deviceLabel)
    };
  }
  if (target2 === "app" && !resolveNativeBuild(args.device, args.app).buildId) {
    throw new Error(
      `No ${args.device.platform} build (.${args.device.platform === "iOS" ? "ipa" : "apk/.aab"}) was provided for this native run.`
    );
  }
  const conn = farm.buildConnection(args);
  const { RemoteSession: RemoteSession2 } = await Promise.resolve().then(() => (init_webdriver(), webdriver_exports));
  const browser = await RemoteSession2.create({
    protocol: conn.protocol,
    hostname: conn.hostname,
    port: conn.port,
    path: conn.path,
    user: conn.user,
    key: conn.key,
    capabilities: conn.capabilities,
    connectTimeoutMs: env.farm.connectTimeoutMs
  });
  return {
    mode: "live",
    driver: new WebdriverDriver(browser, args.device.platform, target2),
    connection: {
      hubUrl: `${conn.protocol}://${conn.hostname}${conn.port === 443 || conn.port === 80 ? "" : `:${conn.port}`}${conn.path}`,
      capabilities: stripSecrets(conn.capabilities)
    }
  };
}

// src/engine/workflow/selectors.ts
function esc2(value) {
  return value.replace(/&/g, "&amp;").replace(/'/g, "&apos;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function buildSelector(el, all) {
  if (el.kind === "web") {
    return buildWebSelector(el);
  }
  if (el.platform === "Android") {
    return buildAndroidSelector(el, all);
  }
  return buildIosSelector(el, all);
}
function duplicatePosition(el, all, key) {
  const value = key(el);
  if (!all || !value) return { ordinal: 0, count: 1 };
  const matches = all.filter((e) => key(e) === value);
  const ordinal = Math.max(0, matches.findIndex((e) => e.index === el.index));
  return { ordinal, count: matches.length };
}
function xpathLit(value) {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return "concat('" + value.split("'").join(`',"'",'`) + "')";
}
var SAFE_CSS_ID = /^[A-Za-z][\w-]*$/;
function buildWebSelector(el) {
  const tag = el.tag || el.className || "*";
  const aaname = el.text || el.ariaLabel || el.name || "";
  const attrs = [`tag='${esc2(tag.toUpperCase())}'`];
  if (el.htmlId) attrs.push(`id='${esc2(el.htmlId)}'`);
  else if (el.name) attrs.push(`name='${esc2(el.name)}'`);
  else if (aaname) attrs.push(`aaname='${esc2(aaname)}'`);
  else if (el.placeholder) attrs.push(`placeholder='${esc2(el.placeholder)}'`);
  const mbl = `<html app='chrome' /><webctrl ${attrs.join(" ")} />`;
  const base = { platform: el.platform, kind: "web", mbl };
  if (el.htmlId && SAFE_CSS_ID.test(el.htmlId)) {
    return { ...base, strategy: "css", locator: `#${el.htmlId}` };
  }
  if (el.htmlId) {
    return { ...base, strategy: "xpath", locator: `//*[@id=${xpathLit(el.htmlId)}]` };
  }
  if (el.testId) {
    return { ...base, strategy: "xpath", locator: `//*[@data-test=${xpathLit(el.testId)} or @data-testid=${xpathLit(el.testId)}]` };
  }
  if (el.name) {
    return { ...base, strategy: "xpath", locator: `//${tag}[@name=${xpathLit(el.name)}]` };
  }
  if (aaname) {
    return {
      ...base,
      strategy: "xpath",
      locator: `//${tag}[normalize-space()=${xpathLit(aaname)} or normalize-space(.)=${xpathLit(aaname)}]`
    };
  }
  if (el.cssPath) {
    return { ...base, strategy: "css", locator: el.cssPath };
  }
  return { ...base, strategy: "css", locator: tag };
}
function stableDescription(el) {
  const desc = (el.contentDesc ?? "").trim();
  if (!desc) return void 0;
  const comma = desc.indexOf(",");
  const prefix = comma > 0 ? desc.slice(0, comma) : desc;
  return prefix.trim() || void 0;
}
function uiaLit(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function sharedWith(el, all, key) {
  const value = key(el);
  if (!all || !value) return 1;
  return all.filter((e) => key(e) === value).length;
}
function buildAndroidSelector(el, all) {
  const cls = el.className ? `android:className='${esc2(el.className)}'` : "";
  const parts = (...attrs) => `<mbl ${attrs.filter(Boolean).join(" ")} />`;
  if (el.resourceId) {
    const id = `id='${esc2(el.resourceId)}'`;
    const bare = !el.resourceId.includes(":id/");
    const group = all?.filter((e) => e.resourceId === el.resourceId) ?? [el];
    if (group.length > 1) {
      const mine = stableDescription(el);
      const unique = mine !== void 0 && group.filter((e) => stableDescription(e) === mine).length === 1;
      if (unique) {
        return {
          platform: "Android",
          kind: "mobile",
          // Wildcard: everything after the field name is its current value.
          mbl: parts(cls, id, `accessibilityId='${esc2(mine)}*'`),
          strategy: "-android uiautomator",
          locator: `new UiSelector().resourceId("${uiaLit(el.resourceId)}").descriptionStartsWith("${uiaLit(mine)}")`
        };
      }
      const { ordinal } = duplicatePosition(el, all, (e) => e.resourceId);
      return {
        platform: "Android",
        kind: "mobile",
        mbl: parts(cls, id, `idx='${ordinal + 1}'`),
        strategy: "-android uiautomator",
        locator: `new UiSelector().resourceId("${uiaLit(el.resourceId)}").instance(${ordinal})`
      };
    }
    if (bare) {
      return {
        platform: "Android",
        kind: "mobile",
        mbl: parts(cls, id),
        strategy: "-android uiautomator",
        locator: `new UiSelector().resourceId("${uiaLit(el.resourceId)}")`
      };
    }
    return {
      platform: "Android",
      kind: "mobile",
      mbl: parts(cls, id),
      strategy: "id",
      locator: el.resourceId
    };
  }
  if (el.contentDesc) {
    const stable = stableDescription(el);
    const volatile = stable !== void 0 && stable !== el.contentDesc.trim();
    if (volatile && stable) {
      return {
        platform: "Android",
        kind: "mobile",
        mbl: parts(cls, `accessibilityId='${esc2(stable)}*'`),
        strategy: "-android uiautomator",
        locator: `new UiSelector().descriptionStartsWith("${uiaLit(stable)}")`
      };
    }
    if (sharedWith(el, all, (e) => e.contentDesc) > 1 && el.className) {
      return {
        platform: "Android",
        kind: "mobile",
        mbl: parts(cls, `accessibilityId='${esc2(el.contentDesc)}'`),
        strategy: "-android uiautomator",
        locator: `new UiSelector().className("${uiaLit(el.className)}").description("${uiaLit(el.contentDesc)}")`
      };
    }
    return {
      platform: "Android",
      kind: "mobile",
      mbl: parts(cls, `accessibilityId='${esc2(el.contentDesc)}'`),
      strategy: "accessibility id",
      locator: el.contentDesc
    };
  }
  if (el.text) {
    const locator = sharedWith(el, all, (e) => e.text) > 1 && el.className ? `new UiSelector().className("${uiaLit(el.className)}").text("${uiaLit(el.text)}")` : `new UiSelector().text("${uiaLit(el.text)}")`;
    return {
      platform: "Android",
      kind: "mobile",
      mbl: parts(cls, `text='${esc2(el.text)}'`),
      strategy: "-android uiautomator",
      locator
    };
  }
  return {
    platform: "Android",
    kind: "mobile",
    mbl: parts(cls),
    strategy: "-android uiautomator",
    locator: `new UiSelector().className("${uiaLit(el.className)}")`
  };
}
function buildIosSelector(el, all) {
  const accessibility = el.accessibilityId || el.name;
  if (accessibility) {
    return {
      platform: "iOS",
      kind: "mobile",
      mbl: `<mbl accessibilityId='${esc2(accessibility)}' />`,
      strategy: "accessibility id",
      locator: accessibility
    };
  }
  return {
    platform: "iOS",
    kind: "mobile",
    mbl: `<mbl ios:className='${esc2(el.className)}' />`,
    strategy: "xpath",
    // iOS class chain not exposed here; placeholder
    locator: el.className
  };
}

// src/engine/uipath/planner.ts
var SYSTEM_PROMPT = `You are a mobile UI automation planner for a test-authoring tool.
You are given ONE natural-language test step and a JSON list of the elements currently visible on a mobile screen.
Return EXACTLY ONE mobile action that accomplishes (or progresses) the step - never more than one.

Respond with STRICT JSON only (no markdown, no prose) using this schema:
{
  "actionType": "tap" | "setText" | "swipe" | "pressKey" | "getText" | "assertExists",
  "targetIndex": <number>,   // index of the chosen element from the list, or -1 if none applies
  "text": <string>,          // required for setText (the value to type)
  "direction": "up"|"down"|"left"|"right", // required for swipe
  "key": <string>,           // for pressKey, e.g. "BACK","ENTER","HOME"
  "reason": <string>,        // one short sentence explaining the choice
  "confidence": <number 0..1>
}

Rules:
- Pick the single best element by its visible text, content-desc/label, resource-id or accessibility id.
- For typing, choose actionType "setText" and put the value in "text".
- For checking that something is present, use "assertExists". Steps phrased as
  "wait for X", "wait until X appears" or "verify X is displayed" are all
  "assertExists" against X - the runtime polls for up to 15s, so this is how a
  test waits for a screen that appears after a network call (OTP, dashboards).
- A step targets a specific element (tap/setText/getText/assertExists). If that element is NOT in the visible list, do NOT return a swipe to hunt for it. Return the step's intended action with "targetIndex": -1 - the runtime will scroll and ask you again on the new screen.
- Use actionType "swipe" ONLY when the test step ITSELF explicitly asks to scroll, swipe, drag or pull (then set "direction"). Never use a swipe to "reveal" the target of a tap/type/verify step.
- "direction" is the FINGER movement, not the page movement. "up" drags upward and
  therefore reveals content FURTHER DOWN the screen. So a step saying "scroll down"
  or "scroll to the bottom" must use "direction": "up"; "scroll up" uses "down".
- Prefer clickable/enabled elements for "tap".
- Only choose an element that CLEARLY matches the step by its identifier (text, content-desc/label, aria-label, id, name, resource-id or accessibility id). NEVER guess - if no element clearly matches (e.g. you'd be picking "the first link/button" or an element with no distinguishing identifier), return "targetIndex": -1 instead. A wrong tap silently breaks the flow, so -1 (let the runtime retry) is always better than a guess.`;
function compactElements(elements) {
  const slim = elements.slice(0, 60).map((e) => ({
    i: e.index,
    type: e.className?.split(".").pop() ?? e.className,
    text: e.text || void 0,
    desc: e.contentDesc || void 0,
    id: e.resourceId || e.htmlId || void 0,
    a11y: e.accessibilityId || e.name || void 0,
    test: e.testId || void 0,
    placeholder: e.placeholder || void 0,
    clickable: e.clickable || void 0
  }));
  return JSON.stringify(slim);
}
function extractJsonObject(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const json2 = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(json2);
}
function parseAction(raw) {
  const obj = extractJsonObject(raw);
  const actionType = obj.actionType ?? "tap";
  return {
    actionType,
    targetIndex: typeof obj.targetIndex === "number" ? obj.targetIndex : -1,
    text: obj.text,
    direction: obj.direction,
    key: obj.key,
    reason: obj.reason ?? "Planned by UiPath LLM Gateway.",
    confidence: typeof obj.confidence === "number" ? obj.confidence : void 0
  };
}
async function planActionWithLlm(auth, params) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Platform: ${params.platform}
Test step: "${params.step}"

Visible elements (JSON):
${compactElements(
        params.elements
      )}

Return the single best action as strict JSON.`
    }
  ];
  const result = await chatComplete(auth, messages, {
    model: params.model,
    temperature: 0,
    jsonMode: true
  });
  return parseAction(result.content);
}
var VERIFY_SYSTEM_PROMPT = `You verify ONE assertion about a mobile screen for a UI test.
You are given the elements currently visible on screen (JSON) and a natural-language assertion.
Decide whether the assertion is TRUE on THIS screen right now.
Be strict and literal: "satisfied" is true ONLY when an element clearly confirms exactly what the assertion states. An element that merely shares a word is NOT confirmation - e.g. a "Register For Account" link does NOT confirm "the account dashboard is displayed", and a "Login" button does NOT confirm "the user is logged in". If the screen does not clearly show what is asserted, answer false.
Respond with STRICT JSON only (no markdown, no prose):
{ "satisfied": <boolean>, "targetIndex": <index of the element that confirms it, or -1>, "reason": <one short sentence> }`;
async function verifyAssertion(auth, params) {
  const messages = [
    { role: "system", content: VERIFY_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Platform: ${params.platform}
Assertion: "${params.step}"

Visible elements (JSON):
${compactElements(
        params.elements
      )}

Return the strict JSON verdict.`
    }
  ];
  const result = await chatComplete(auth, messages, {
    model: params.model,
    temperature: 0,
    jsonMode: true
  });
  const obj = extractJsonObject(result.content);
  return {
    satisfied: obj.satisfied === true,
    targetIndex: typeof obj.targetIndex === "number" ? obj.targetIndex : -1,
    reason: typeof obj.reason === "string" ? obj.reason : ""
  };
}
var TAP_WORDS = ["tap", "click", "press", "select", "open", "choose", "go", "login", "log in", "sign in", "continue", "submit", "next", "add", "buy", "checkout"];
var TYPE_WORDS = ["type", "enter", "input", "fill", "set", "write", "search for"];
var SWIPE_WORDS = ["swipe", "scroll", "slide"];
var ASSERT_WORDS = ["verify", "assert", "see", "should", "is displayed", "is shown", "appears", "confirm", "check that", "ensure", "wait for", "wait until", "wait till", "waits for"];
function tokenScore(haystack, needles) {
  if (!haystack) return 0;
  const h = haystack.toLowerCase();
  const squished = h.replace(/[^a-z0-9]/g, "");
  return needles.reduce((acc, n) => {
    if (n.length <= 2) return acc;
    if (h.includes(n) || squished.includes(n)) return acc + n.length;
    return acc;
  }, 0);
}
function extractQuoted(step) {
  const m = step.match(/["'“”']([^"'“”']{1,80})["'“”']/);
  return m?.[1];
}
function keywords(step) {
  return step.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(
    (w) => w.length > 2 && !["the", "and", "tap", "click", "with", "into", "field", "button", "screen", "page", "enter", "type", "then", "should", "that", "verify", "shown", "show"].includes(w)
  );
}
function scoreElement(el, words) {
  return tokenScore(el.text, words) * 3 + tokenScore(el.placeholder, words) * 3 + tokenScore(el.contentDesc, words) * 3 + tokenScore(el.testId, words) * 3 + tokenScore(el.accessibilityId, words) * 2 + tokenScore(el.name, words) * 2 + tokenScore(el.ariaLabel, words) * 2 + tokenScore(el.htmlId, words) * 2 + tokenScore(el.href, words) * 1.5 + tokenScore(el.resourceId, words);
}
function screenMatches(condition, elements) {
  const quoted = extractQuoted(condition);
  if (quoted) {
    const needle = quoted.toLowerCase();
    return elements.some(
      (el) => [el.text, el.contentDesc, el.accessibilityId, el.name, el.ariaLabel, el.placeholder, el.resourceId, el.testId].some((v) => (v ?? "").toLowerCase().includes(needle))
    );
  }
  const words = keywords(condition);
  if (words.length === 0) return false;
  const haystack = elements.flatMap((el) => [el.text, el.contentDesc, el.accessibilityId, el.name, el.ariaLabel, el.placeholder, el.resourceId, el.testId]).filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => haystack.includes(w));
}
function bestElement(step, elements) {
  const words = keywords(step);
  let best;
  let bestKw = -1;
  let bestTotal = -1;
  for (const el of elements) {
    const kw = scoreElement(el, words);
    const total = kw + (el.clickable ? 0.01 : 0);
    if (total > bestTotal) {
      bestTotal = total;
      bestKw = kw;
      best = el;
    }
  }
  return best ? { el: best, score: bestKw } : null;
}
var NON_EDITABLE_INPUT = /* @__PURE__ */ new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "image",
  "file",
  "range",
  "color"
]);
function isEditable(el) {
  const tag = (el.tag || el.className || "").toLowerCase();
  if (tag.includes("textarea") || /edit|textfield|searchfield|textbox/i.test(el.className)) {
    return true;
  }
  if (tag === "input" || tag.endsWith(".edittext")) {
    return !el.inputType || !NON_EDITABLE_INPUT.has(el.inputType.toLowerCase());
  }
  return false;
}
function labelOf(el) {
  return el.text || el.placeholder || el.contentDesc || el.accessibilityId || el.testId || el.name || el.htmlId || el.resourceId || el.className || "element";
}
function planActionHeuristic(step, elements) {
  const lower = step.toLowerCase();
  const swipe = tokenScore(lower, SWIPE_WORDS);
  const type = tokenScore(lower, TYPE_WORDS);
  const assert = tokenScore(lower, ASSERT_WORDS);
  const tap = tokenScore(lower, TAP_WORDS);
  if (swipe >= Math.max(type, assert, tap) && swipe > 0) {
    const scrolling = /\bscroll\b/.test(lower);
    const direction = lower.includes("left") ? "left" : lower.includes("right") ? "right" : lower.includes("down") ? scrolling ? "up" : "down" : lower.includes("up") ? scrolling ? "down" : "up" : "up";
    return {
      actionType: "swipe",
      targetIndex: -1,
      direction,
      reason: `Step asks to scroll/swipe; performing a ${direction} swipe.`,
      confidence: 0.6
    };
  }
  if (type > 0) {
    const value = extractQuoted(step) ?? step.replace(/^.*?(?:type|enter|input|fill|set|write|search for)\s+/i, "").trim();
    const inputs = elements.filter(isEditable);
    const match2 = bestElement(step, inputs);
    const field = match2?.el ?? inputs[0];
    if (!field) {
      return {
        actionType: "assertExists",
        targetIndex: -1,
        reason: "No editable input field was found on the current screen for this step.",
        confidence: 0.2
      };
    }
    return {
      actionType: "setText",
      targetIndex: field.index,
      text: value,
      reason: `Typing "${value}" into the "${labelOf(field)}" field.`,
      confidence: match2 && match2.score > 0 ? 0.8 : 0.5
    };
  }
  const match = bestElement(step, elements);
  if (assert > tap) {
    if (match && match.score > 0) {
      return {
        actionType: "assertExists",
        targetIndex: match.el.index,
        reason: `Verifying "${labelOf(match.el)}" exists.`,
        confidence: 0.7
      };
    }
    return {
      actionType: "assertExists",
      targetIndex: -1,
      reason: "No element matching this verification was found on the current screen.",
      confidence: 0.2
    };
  }
  if (match && match.score > 0) {
    return {
      actionType: "tap",
      targetIndex: match.el.index,
      reason: `Best match for the step is "${labelOf(match.el)}"; tapping it.`,
      confidence: Math.min(0.9, 0.5 + match.score / 12)
    };
  }
  return {
    actionType: "assertExists",
    targetIndex: -1,
    reason: "No element confidently matched this step on the current screen.",
    confidence: 0.2
  };
}

// src/engine/automation/runControl.ts
var RunControl = class {
  stopRequested = false;
  pauseRequested = false;
  /** Resolves when the operator resumes a pause. */
  resumeWaiters = [];
  /**
   * A resume that arrived before the loop began waiting. The client can POST
   * resume in the window between the "paused" event being published and the
   * loop registering its waiter; without latching it here that signal is lost
   * and the run blocks forever.
   */
  pendingChoice = null;
  /** Elements from the step currently paused, so the UI can offer a choice. */
  candidates = [];
  /** Pause the run whenever a step doesn't pass. On by default: a stalled step
   * is nearly always worth inspecting, and resuming is one click. */
  pauseOnFailure = true;
  /** True while the run is actually sitting at a pause point. */
  paused = false;
  stop() {
    this.stopRequested = true;
    this.settle({ kind: "stop" });
  }
  requestPause() {
    this.pauseRequested = true;
  }
  /** Resume a pause, telling the loop what to do with the paused step. */
  resume(choice) {
    this.pauseRequested = false;
    if (this.resumeWaiters.length > 0) {
      this.settle(choice);
    } else {
      this.pendingChoice = choice;
    }
  }
  settle(choice) {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    this.paused = false;
    for (const w of waiters) w(choice);
  }
  get stopped() {
    return this.stopRequested;
  }
  get pausePending() {
    return this.pauseRequested;
  }
  /**
   * Block until the operator resumes. Returns their choice; a stop resolves
   * immediately so the loop can unwind.
   */
  waitForResume(candidates = []) {
    if (this.stopRequested) return Promise.resolve({ kind: "stop" });
    if (this.pendingChoice) {
      const choice = this.pendingChoice;
      this.pendingChoice = null;
      this.paused = false;
      return Promise.resolve(choice);
    }
    this.candidates = candidates;
    this.paused = true;
    return new Promise((resolve) => {
      this.resumeWaiters.push(resolve);
    });
  }
};
var controls = /* @__PURE__ */ new Map();
function getRunControl(sessionId) {
  let c = controls.get(sessionId);
  if (!c) {
    c = new RunControl();
    controls.set(sessionId, c);
  }
  return c;
}

// src/engine/automation/orchestrator.ts
var STEP_PAUSE_MS = 650;
var MAX_SEARCH_TRIES = 4;
var VERIFY_ATTEMPTS = 12;
var VERIFY_RETRY_MS = 5e3;
var CONDITION_WAIT_MS = 2e4;
function labelForLog(el) {
  return el.text || el.contentDesc || el.accessibilityId || el.name || el.resourceId || el.htmlId || el.placeholder || el.className || `element #${el.index}`;
}
function delay2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var PERMISSION_DIALOG_MARKERS = [
  "permissioncontroller:id/",
  "packageinstaller:id/permission"
];
var PERMISSION_ALLOW_IDS = [
  "com.android.permissioncontroller:id/permission_allow_button",
  "com.android.packageinstaller:id/permission_allow_button",
  "com.android.permissioncontroller:id/permission_allow_foreground_only_button",
  "com.android.permissioncontroller:id/permission_allow_one_time_button"
];
function isPermissionDialog(elements) {
  return elements.some(
    (e) => PERMISSION_DIALOG_MARKERS.some((m) => (e.resourceId ?? "").includes(m))
  );
}
async function clearPermissionDialogs(driver, elements, emit, maxPrompts = 4) {
  let current = elements;
  for (let i = 0; i < maxPrompts && isPermissionDialog(current); i += 1) {
    const allow = current.find((e) => PERMISSION_ALLOW_IDS.includes(e.resourceId ?? ""));
    if (!allow) {
      emit({
        type: "log",
        level: "warn",
        message: "A system permission dialog is on screen but its Allow button was not found - the app is blocked behind it.",
        at: Date.now()
      });
      return current;
    }
    const prompt = current.find((e) => (e.resourceId ?? "").endsWith("permission_message"))?.text;
    emit({
      type: "log",
      level: "info",
      message: `Android permission dialog${prompt ? ` - "${prompt}"` : ""}: tapping "${allow.text || "Allow"}" so the app is reachable.`,
      at: Date.now()
    });
    try {
      await driver.tap(buildSelector(allow, current));
    } catch (error) {
      emit({
        type: "log",
        level: "warn",
        message: `Could not dismiss the permission dialog: ${error instanceof Error ? error.message : String(error)}`,
        at: Date.now()
      });
      return current;
    }
    await delay2(1200);
    current = await driver.captureElements();
  }
  return current;
}
function startLiveFrames(driver, emit) {
  const floorMs = env.farm.liveFrameMs;
  if (!floorMs) return () => void 0;
  let stopped = false;
  let timer;
  const tick = async () => {
    if (stopped) return;
    const started = Date.now();
    try {
      const image = await driver.takeScreenshot();
      if (!stopped) emit({ type: "frame", image, at: Date.now() });
    } catch {
    }
    if (stopped) return;
    const took = Date.now() - started;
    timer = setTimeout(() => void tick(), Math.max(floorMs, took));
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
async function runAutomation(args) {
  const { session, driver, auth, llmModel, emit, replay = false } = args;
  const control = getRunControl(session.id);
  session.status = "running";
  saveSession(session);
  emit({ type: "session", session });
  const stopFrames = startLiveFrames(driver, emit);
  try {
    const groupVerdict = /* @__PURE__ */ new Map();
    for (let i = 0; i < session.steps.length; i += 1) {
      const step = session.steps[i];
      session.currentStep = i;
      if (step.condition) {
        const key = step.conditionGroup ?? -1;
        if (!groupVerdict.has(key)) {
          let met = false;
          const deadline = Date.now() + CONDITION_WAIT_MS;
          for (; ; ) {
            try {
              met = screenMatches(step.condition, await driver.captureElements());
            } catch {
              met = false;
            }
            if (met || Date.now() >= deadline) break;
            await delay2(600);
          }
          groupVerdict.set(key, met);
          emit({
            type: "log",
            level: "info",
            message: met ? `\u2713 Condition met (${step.condition}) - running the guarded steps.` : `\u2933 Condition not met (${step.condition}) - skipping the guarded steps.`,
            at: Date.now()
          });
        }
        if (!groupVerdict.get(key)) {
          step.status = "skipped";
          step.message = `Skipped: condition not met (${step.condition}).`;
          emit({ type: "step", step });
          emit({ type: "session", session });
          continue;
        }
      }
      if (control.stopped) {
        emit({ type: "log", level: "warn", message: "\u25A0 Stopped by the operator.", at: Date.now() });
        break;
      }
      if (control.pausePending) {
        const choice = await pauseHere(session, step, [], "Paused by the operator.", control, emit, driver);
        if (choice.kind === "stop") break;
      }
      step.status = "running";
      step.startedAt = Date.now();
      emit({ type: "step", step });
      emit({ type: "session", session });
      emit({ type: "log", level: "info", message: `\u25B6 Step ${i + 1}: ${step.description}`, at: Date.now() });
      let forceElement;
      let forceContext;
      for (; ; ) {
        try {
          await runStep({ step, driver, auth, llmModel, session, emit, replay, forceElement, forceContext });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          step.status = "failed";
          step.message = message;
          emit({ type: "log", level: "error", message: `Step ${i + 1} failed: ${message}`, at: Date.now() });
        }
        const outcome = step.status;
        const failed = outcome === "failed" || outcome === "needs-attention";
        if (!failed || !control.pauseOnFailure || control.stopped) break;
        const candidates = await driver.captureElements().then((els) => clearPermissionDialogs(driver, els, emit)).catch(() => []);
        const choice = await pauseHere(
          session,
          step,
          candidates,
          step.message || `Step ${i + 1} did not pass.`,
          control,
          emit,
          driver
        );
        if (choice.kind === "stop" || choice.kind === "skip") break;
        forceContext = candidates;
        forceElement = choice.targetIndex != null ? candidates[choice.targetIndex] : void 0;
        step.status = "running";
        step.message = void 0;
        emit({ type: "step", step });
        emit({
          type: "log",
          level: "info",
          message: `\u21BB Retrying step ${i + 1}${forceElement ? ` on "${labelForLog(forceElement)}"` : ""}\u2026`,
          at: Date.now()
        });
      }
      if (control.stopped) {
        emit({ type: "log", level: "warn", message: "\u25A0 Stopped by the operator.", at: Date.now() });
        break;
      }
      const settled = step.status;
      if (step.optional && (settled === "needs-attention" || settled === "failed")) {
        step.status = "skipped";
        step.message = "Skipped: optional step, target not on screen.";
        emit({
          type: "log",
          level: "info",
          message: `\u2933 Optional step skipped (not on screen): ${step.description}`,
          at: Date.now()
        });
      }
      step.finishedAt = Date.now();
      emit({ type: "step", step });
      emit({ type: "session", session });
      const detail = step.action?.actionType === "setText" ? `typed "${step.action.text ?? ""}"` : step.action?.actionType ?? "";
      const target2 = step.selector?.mbl ? ` \u2192 ${step.selector.mbl}` : "";
      const captured = step.capturedText ? ` (captured: "${step.capturedText}")` : "";
      const note = step.message ? ` - ${step.message}` : "";
      const device = step.outcome ? ` \xB7 device: ${step.outcome.dispatched ? "accepted" : "rejected"}, ${step.outcome.effect}` : "";
      const finalStatus = step.status;
      const level = finalStatus === "passed" ? "info" : finalStatus === "failed" ? "error" : "warn";
      emit({
        type: "log",
        level,
        message: `Step ${i + 1} ${step.status}: ${detail}${target2}${captured}${device}${note}`.trim(),
        at: Date.now()
      });
      await delay2(STEP_PAUSE_MS);
    }
    session.status = "completed";
    session.currentStep = session.steps.length;
    saveSession(session);
    emit({ type: "done", session });
  } finally {
    stopFrames();
  }
  try {
    await driver.quit();
  } catch {
  }
  return session;
}
var PAUSE_KEEPALIVE_MS = 6e4;
async function pauseHere(session, step, candidates, reason, control, emit, driver) {
  const previous = session.status;
  session.status = "paused";
  saveSession(session);
  emit({ type: "session", session });
  emit({ type: "paused", step, candidates, reason });
  emit({ type: "log", level: "warn", message: `\u23F8 ${reason} Waiting for the operator\u2026`, at: Date.now() });
  const keepalive = driver ? setInterval(() => {
    void driver.screenSignature().catch(() => void 0);
  }, PAUSE_KEEPALIVE_MS) : void 0;
  let choice;
  try {
    choice = await control.waitForResume(candidates);
  } finally {
    if (keepalive) clearInterval(keepalive);
  }
  session.status = previous === "paused" ? "running" : previous;
  saveSession(session);
  emit({ type: "resumed" });
  emit({ type: "session", session });
  return choice;
}
async function runStep(ctx) {
  const { step, driver, auth, llmModel, session, emit, replay, forceElement, forceContext } = ctx;
  step.beforeScreenshot = await driver.takeScreenshot();
  if (replay && step.action) {
    const started = Date.now();
    const targeted = isTargeted(step.action);
    if (targeted && !step.selector) {
      step.status = "needs-attention";
      step.message = "No selector was recorded for this step - nothing to replay.";
      return;
    }
    await executeAction(driver, step.action, step.selector, step);
    step.afterScreenshot = await driver.takeScreenshot();
    step.status = "passed";
    step.outcome = {
      dispatched: true,
      effect: "unverified",
      detail: `replayed in ${Date.now() - started}ms`,
      durationMs: Date.now() - started
    };
    emit({
      type: "log",
      level: "info",
      message: `\u21BB replayed ${step.action.actionType}${step.selector ? ` \u2192 ${step.selector.mbl}` : ""} (${Date.now() - started}ms)`,
      at: Date.now()
    });
    return;
  }
  const planOnce = async (els) => {
    if (auth) {
      try {
        const a = await planActionWithLlm(auth, {
          model: llmModel,
          step: step.description,
          elements: els,
          platform: driver.platform
        });
        session.llmLive = true;
        if (isTargeted(a) && (a.targetIndex < 0 || a.targetIndex >= els.length)) {
          const fallback = planActionHeuristic(step.description, els);
          return { ...fallback, reason: a.reason || fallback.reason };
        }
        return a;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emit({ type: "log", level: "warn", message: `LLM Gateway unavailable, using heuristic planner: ${message}`, at: Date.now() });
        return planActionHeuristic(step.description, els);
      }
    }
    return planActionHeuristic(step.description, els);
  };
  let elements = await driver.captureElements();
  elements = await clearPermissionDialogs(driver, elements, emit);
  let action = await planOnce(elements);
  if (action.actionType === "assertExists" && !isWaitStep(step.description)) {
    const intent = planActionHeuristic(step.description, elements);
    if (/^\s*(tap|click|press|touch|select|choose|tick|check|toggle)\b/i.test(step.description)) {
      intent.actionType = "tap";
      intent.text = void 0;
    }
    if (intent.actionType !== "assertExists") {
      emit({
        type: "log",
        level: "info",
        message: `The planner reported the target missing; the step asks to ${intent.actionType === "setText" ? "type" : intent.actionType}, so that is what will be attempted.`,
        at: Date.now()
      });
      action = {
        ...action,
        actionType: intent.actionType,
        text: intent.text ?? action.text,
        direction: intent.direction ?? action.direction,
        key: intent.key ?? action.key
      };
    }
  }
  if (forceElement) {
    elements = forceContext && forceContext.length ? forceContext : elements;
    const at = elements.findIndex((e) => e.index === forceElement.index);
    if (action.actionType === "assertExists") {
      const intent = planActionHeuristic(step.description, elements);
      if (intent.actionType !== "assertExists") {
        emit({
          type: "log",
          level: "info",
          message: `The planner had reported the target missing; the step asks to ${intent.actionType === "setText" ? "type" : intent.actionType}, so performing that on the chosen element.`,
          at: Date.now()
        });
        action = {
          ...action,
          actionType: intent.actionType,
          text: intent.text ?? action.text,
          direction: intent.direction ?? action.direction,
          key: intent.key ?? action.key
        };
      }
    }
    action = {
      ...action,
      targetIndex: at >= 0 ? at : forceElement.index,
      reason: `Target chosen by the operator: ${labelForLog(forceElement)}.`,
      confidence: 1
    };
    emit({ type: "log", level: "info", message: action.reason, at: Date.now() });
  }
  const scrollStep = isScrollStep(step.description);
  const resolvedTarget = () => {
    if (action.targetIndex < 0 || action.targetIndex >= elements.length) return void 0;
    const el = elements[action.targetIndex];
    if (forceElement) return el;
    return hasIdentifier(el) ? el : void 0;
  };
  const unresolved = () => {
    if (isTargeted(action)) return !resolvedTarget();
    if (action.actionType === "swipe" && !scrollStep) return true;
    return false;
  };
  let tries = forceElement ? MAX_SEARCH_TRIES : 0;
  while (unresolved() && tries < MAX_SEARCH_TRIES) {
    tries += 1;
    if (tries <= 2 && action.actionType !== "swipe") {
      emit({
        type: "log",
        level: "info",
        message: `Target not ready - waiting for the screen to settle (${tries}/${MAX_SEARCH_TRIES})\u2026`,
        at: Date.now()
      });
      await delay2(700);
    } else {
      const dir = action.actionType === "swipe" ? action.direction ?? "up" : "up";
      emit({
        type: "log",
        level: "info",
        message: `Target not on screen - scrolling to find it (${tries}/${MAX_SEARCH_TRIES})\u2026`,
        at: Date.now()
      });
      await driver.swipe(dir);
    }
    elements = await driver.captureElements();
    action = await planOnce(elements);
  }
  if (action.actionType === "assertExists" && unresolved()) {
    for (let attempt = 2; attempt <= VERIFY_ATTEMPTS && unresolved(); attempt += 1) {
      emit({
        type: "log",
        level: "info",
        message: `Not on screen yet - re-checking in ${VERIFY_RETRY_MS / 1e3}s (attempt ${attempt}/${VERIFY_ATTEMPTS})\u2026`,
        at: Date.now()
      });
      await delay2(VERIFY_RETRY_MS);
      elements = await driver.captureElements();
      action = await planOnce(elements);
    }
  }
  step.action = action;
  step.reason = action.reason;
  emit({ type: "step", step });
  if (action.actionType === "swipe" && !scrollStep) {
    step.status = "needs-attention";
    step.message = "Could not locate the element this step refers to - scrolled but it never appeared on screen.";
    step.afterScreenshot = await driver.takeScreenshot();
    return;
  }
  if (action.actionType === "assertExists" && auth) {
    try {
      const vt0 = Date.now();
      const verdict = await verifyAssertion(auth, {
        model: llmModel,
        step: step.description,
        elements,
        platform: driver.platform
      });
      step.reason = verdict.reason || step.reason;
      const confEl = verdict.targetIndex >= 0 && verdict.targetIndex < elements.length ? elements[verdict.targetIndex] : void 0;
      if (confEl) {
        step.element = confEl;
        step.selector = buildSelector(confEl, elements);
        const shot = await driver.captureElementShot(step.selector);
        if (shot) step.elementShot = shot;
      }
      if (verdict.satisfied) {
        step.status = "passed";
      } else {
        step.status = "needs-attention";
        step.message = verdict.reason || "The current screen does not confirm this verification.";
      }
      step.outcome = {
        dispatched: true,
        effect: verdict.satisfied ? "applied" : "no-change",
        detail: verdict.reason || (verdict.satisfied ? "The screen confirms the assertion." : "The screen does not confirm the assertion."),
        durationMs: Date.now() - vt0
      };
      step.afterScreenshot = await driver.takeScreenshot();
      return;
    } catch (error) {
      emit({
        type: "log",
        level: "warn",
        message: `Verification check unavailable, using element existence: ${error instanceof Error ? error.message : String(error)}`,
        at: Date.now()
      });
    }
  }
  if (isTargeted(action)) {
    let target2 = resolvedTarget();
    if (!target2 && action.actionType === "setText") {
      const name = fieldNameFromStep(step.description);
      const caption = name ? captionFor(name, elements) : void 0;
      const input = caption ? inputForLabel(caption, elements) : void 0;
      if (input) {
        emit({
          type: "log",
          level: "info",
          message: `No input here carries an identifier, so "${name}" was matched to its caption and the field beside it will be used.`,
          at: Date.now()
        });
        target2 = input;
      }
    }
    if (!target2) {
      step.status = "needs-attention";
      step.message = "Could not confidently identify the element for this step - no on-screen element with a stable identifier matched it.";
      step.afterScreenshot = await driver.takeScreenshot();
      return;
    }
    if (action.actionType === "setText" && !isEditableElement(target2)) {
      const input = inputForLabel(target2, elements);
      if (input) {
        emit({
          type: "log",
          level: "info",
          message: `"${labelForLog(target2)}" is a label, not an input - typing into the field beside it instead.`,
          at: Date.now()
        });
        target2 = input;
      }
    }
    const selector = buildSelector(target2, elements);
    step.element = target2;
    step.selector = selector;
    if (action.actionType === "setText" && isEditableElement(target2) && !hasIdentifier(target2) && driver.target === "app") {
      await driver.dismissKeyboard().catch(() => void 0);
      await delay2(600);
      const settled = await driver.captureElements().catch(() => elements);
      const here = settled.find((e) => sameElement(e, target2)) ?? target2;
      const centre = centreOf(here);
      if (centre) {
        const text = action.text ?? "";
        emit({
          type: "log",
          level: "info",
          message: `This input carries no identifier, so focusing it at (${centre.x}, ${centre.y}) and typing "${text}".`,
          at: Date.now()
        });
        const t0 = Date.now();
        await driver.tapAt(centre.x, centre.y);
        await delay2(500);
        await driver.typeIntoFocused(text);
        await driver.dismissKeyboard().catch(() => void 0);
        await delay2(400);
        let after = await driver.captureElements().catch(() => []);
        let landed = after.find((e) => sameElement(e, here))?.text ?? "";
        const meaningful = (s) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
        const digitsOnly = meaningful(text);
        if (text && !meaningful(landed).includes(digitsOnly) && digitsOnly !== text) {
          emit({
            type: "log",
            level: "info",
            message: `The field shows "${landed}" rather than "${text}" - it formats its own value, so re-entering "${digitsOnly}" one character at a time and letting it add the separators.`,
            at: Date.now()
          });
          await driver.tapAt(centre.x, centre.y);
          await delay2(300);
          for (let i = 0; i < landed.length + 4; i += 1) {
            await driver.pressKey("DEL").catch(() => void 0);
          }
          await driver.typeIntoFocused(digitsOnly, 140);
          await driver.dismissKeyboard().catch(() => void 0);
          await delay2(400);
          after = await driver.captureElements().catch(() => []);
          landed = after.find((e) => sameElement(e, here))?.text ?? "";
        }
        const ok = Boolean(text) && meaningful(landed).includes(digitsOnly);
        if (!ok && landed) {
          step.status = "needs-attention";
          step.message = `The field contains "${landed}" but the step asked for "${text}" - re-entering it did not take.`;
          step.outcome = {
            dispatched: true,
            effect: "no-change",
            detail: step.message,
            durationMs: Date.now() - t0
          };
          emit({ type: "log", level: "warn", message: step.message, at: Date.now() });
          step.afterScreenshot = await driver.takeScreenshot();
          return;
        }
        step.status = "passed";
        step.outcome = {
          dispatched: true,
          effect: ok ? "applied" : "unverified",
          detail: ok ? `Focused the field at (${centre.x}, ${centre.y}); it now contains "${landed}".` : `Focused the field at (${centre.x}, ${centre.y}) and typed "${text}" - the field could not be read back.`,
          durationMs: Date.now() - t0
        };
        step.afterScreenshot = await driver.takeScreenshot();
        return;
      }
    }
    if (action.actionType === "tap" && !hasIdentifier(target2) && driver.target === "app") {
      const centre = centreOf(target2);
      if (centre) {
        emit({
          type: "log",
          level: "info",
          message: `"${labelForLog(target2)}" carries no identifier, so tapping its position (${centre.x}, ${centre.y}).`,
          at: Date.now()
        });
        const t0 = Date.now();
        await driver.tapAt(centre.x, centre.y);
        step.status = "passed";
        step.outcome = {
          dispatched: true,
          effect: "applied",
          detail: `Tapped at (${centre.x}, ${centre.y}).`,
          durationMs: Date.now() - t0
        };
        step.afterScreenshot = await driver.takeScreenshot();
        return;
      }
    }
    if (forceElement && !await driver.exists(selector)) {
      const label = labelForLog(forceElement);
      const fresh = await driver.captureElements().catch(() => []);
      const still = fresh.find((e) => sameElement(e, forceElement));
      const centre = still ? boundsCenter(still.bounds) : null;
      if (still && centre && action.actionType === "tap" && driver.target === "app") {
        emit({
          type: "log",
          level: "warn",
          message: `"${label}" is on screen but its selector (${selector.strategy}: ${selector.locator}) did not resolve - tapping its position (${centre.x}, ${centre.y}) instead.`,
          at: Date.now()
        });
        const t0 = Date.now();
        await driver.tapAt(centre.x, centre.y);
        step.status = "passed";
        step.outcome = {
          dispatched: true,
          effect: "applied",
          detail: `Selector did not resolve; tapped at (${centre.x}, ${centre.y}).`,
          durationMs: Date.now() - t0
        };
        step.afterScreenshot = await driver.takeScreenshot();
        return;
      }
      step.status = "needs-attention";
      step.message = still ? `"${label}" is on screen but neither its selector (${selector.strategy}: ${selector.locator}) nor its position could be used.` : `"${label}" is no longer on screen - it changed while the run was paused. Pick again from the current screen.`;
      step.outcome = {
        dispatched: false,
        effect: "no-change",
        detail: step.message,
        durationMs: 0
      };
      emit({ type: "log", level: "warn", message: step.message, at: Date.now() });
      step.afterScreenshot = await driver.takeScreenshot();
      return;
    }
    const shot = action.actionType === "setText" || action.actionType === "getText" ? await driver.captureElementShot(selector).catch(() => "") : "";
    if (shot) step.elementShot = shot;
    await executeAction(driver, action, selector, step, emit);
    step.afterScreenshot = await driver.takeScreenshot();
    return;
  }
  await executeAction(driver, action, void 0, step, emit);
  step.afterScreenshot = await driver.takeScreenshot();
}
function isWaitStep(description) {
  return /\b(wait|verify|assert|confirm|check|should\s+(be|see)|is\s+displayed|appears?)\b/i.test(
    description
  );
}
function isEditableElement(el) {
  const tag = (el.tag || el.className || "").toLowerCase();
  return tag.endsWith(".edittext") || tag === "input" || tag === "textarea" || /edit|textfield|searchfield|textbox/i.test(el.className || "");
}
function centreOf(el) {
  return boundsCenter(el.bounds);
}
function fieldNameFromStep(description) {
  const quoted = description.match(/into\s+(?:a\s+|the\s+)?['"]([^'"]+)['"]/i);
  if (quoted) return quoted[1].trim();
  const plain = description.match(/into\s+(?:a\s+|the\s+)?(.+?)\s+field\b/i);
  if (plain) return plain[1].replace(/['"]/g, "").trim();
  return void 0;
}
function captionFor(name, all) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const want = norm(name);
  if (!want) return void 0;
  let loose;
  for (const el of all) {
    for (const value of [el.text, el.contentDesc, el.accessibilityId]) {
      if (!value) continue;
      const got = norm(value);
      if (got === want) return el;
      if (!loose && (got.includes(want) || want.includes(got)) && got.length > 3) loose = el;
    }
  }
  return loose;
}
function inputForLabel(label, all) {
  const cap = boundsBox(label.bounds);
  if (!cap) return void 0;
  const capY = (cap.top + cap.bottom) / 2;
  const capX = (cap.left + cap.right) / 2;
  let best;
  for (const el of all) {
    if (el.index === label.index || !isEditableElement(el)) continue;
    const box = boundsBox(el.bounds);
    if (!box) continue;
    if (capX < box.left - 40 || capX > box.right + 40) continue;
    let score;
    if (capY >= box.top && capY <= box.bottom) score = 0;
    else if (box.top > capY) score = box.top - capY;
    else continue;
    if (!best || score < best.score) best = { el, score };
  }
  return best?.el;
}
function sameElement(candidate, ref) {
  const same = (a, b) => (a ?? "") === (b ?? "");
  return same(candidate.resourceId, ref.resourceId) && same(candidate.contentDesc, ref.contentDesc) && same(candidate.text, ref.text) && same(candidate.className, ref.className);
}
function hasIdentifier(el) {
  const has = (s) => Boolean(s && s.trim());
  return has(el.text) || has(el.contentDesc) || has(el.resourceId) || has(el.accessibilityId) || has(el.name) || has(el.htmlId) || has(el.testId) || has(el.ariaLabel) || has(el.placeholder);
}
function isTargeted(action) {
  return action.actionType === "tap" || action.actionType === "setText" || action.actionType === "getText" || action.actionType === "assertExists";
}
function isScrollStep(description) {
  return /\b(scroll|swipe|slide|drag|fling|pull)\b/i.test(description);
}
async function executeAction(driver, action, selector, step, emit) {
  const needsTarget = action.actionType === "tap" || action.actionType === "setText" || action.actionType === "getText" || action.actionType === "assertExists";
  if (needsTarget && !selector) {
    step.status = "needs-attention";
    step.message = "No matching element was found on screen for this step.";
    return;
  }
  const t0 = Date.now();
  switch (action.actionType) {
    case "tap": {
      const sigBefore = await driver.screenSignature();
      await withScrollRetry(driver, selector, async () => {
        await driver.tap(selector);
      }, step);
      if (step.status === "needs-attention") {
        step.outcome = {
          dispatched: false,
          effect: "no-change",
          detail: step.message || "The device could not perform the tap.",
          durationMs: Date.now() - t0
        };
        break;
      }
      await delay2(400);
      const sigAfter = await driver.screenSignature();
      const changed = Boolean(sigBefore) && sigBefore !== sigAfter;
      step.status = "passed";
      step.outcome = {
        dispatched: true,
        effect: changed ? "applied" : "no-change",
        detail: changed ? "Device accepted the tap and the screen changed." : "Device accepted the tap, but nothing on screen changed - the control may be disabled or the tap had no effect.",
        durationMs: Date.now() - t0
      };
      break;
    }
    case "setText": {
      await driver.setText(selector, action.text ?? "");
      const want = action.text ?? "";
      const got = await driver.getFieldValue(selector);
      await driver.dismissKeyboard().catch(() => void 0);
      const applied = Boolean(want) && got.includes(want);
      step.status = "passed";
      step.outcome = {
        dispatched: true,
        effect: applied ? "applied" : got ? "no-change" : "unverified",
        detail: applied ? `Device accepted the input - the field now contains "${got}".` : got ? `Field contains "${got}" (expected "${want}").` : "Input sent, but the field could not be read back to confirm.",
        durationMs: Date.now() - t0
      };
      break;
    }
    case "swipe":
      await driver.swipe(action.direction ?? "up");
      step.status = "passed";
      step.outcome = {
        dispatched: true,
        effect: "unverified",
        detail: `Sent a ${action.direction ?? "up"} swipe.`,
        durationMs: Date.now() - t0
      };
      break;
    case "pressKey":
      await driver.pressKey(action.key ?? "BACK");
      step.status = "passed";
      step.outcome = {
        dispatched: true,
        effect: "unverified",
        detail: `Sent key "${action.key ?? "BACK"}".`,
        durationMs: Date.now() - t0
      };
      break;
    case "getText": {
      step.capturedText = await driver.getText(selector);
      step.status = "passed";
      step.outcome = {
        dispatched: true,
        effect: "applied",
        detail: `Read text: "${step.capturedText}".`,
        durationMs: Date.now() - t0
      };
      break;
    }
    case "assertExists": {
      let present = false;
      for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
        present = await driver.exists(selector);
        if (present) {
          if (attempt > 1) {
            emit?.({
              type: "log",
              level: "info",
              message: `Found on attempt ${attempt}/${VERIFY_ATTEMPTS}.`,
              at: Date.now()
            });
          }
          break;
        }
        if (attempt < VERIFY_ATTEMPTS) {
          emit?.({
            type: "log",
            level: "info",
            message: `Not present (attempt ${attempt}/${VERIFY_ATTEMPTS}) - retrying in ${VERIFY_RETRY_MS / 1e3}s\u2026`,
            at: Date.now()
          });
          await delay2(VERIFY_RETRY_MS);
        }
      }
      step.status = present ? "passed" : "needs-attention";
      if (!present) step.message = "Expected element was not present.";
      step.outcome = {
        dispatched: true,
        effect: present ? "applied" : "no-change",
        detail: present ? "Element is present on screen." : `Element did not appear after ${VERIFY_ATTEMPTS} attempts ${VERIFY_RETRY_MS / 1e3}s apart.`,
        durationMs: Date.now() - t0
      };
      break;
    }
    default:
      step.status = "needs-attention";
      step.message = `Unsupported action: ${action.actionType}`;
  }
}
async function withScrollRetry(driver, selector, run, step) {
  try {
    await run();
  } catch (error) {
    const exists = await driver.exists(selector).catch(() => false);
    if (!exists) {
      await driver.dismissKeyboard().catch(() => void 0);
      try {
        await run();
        return;
      } catch {
      }
      await driver.swipe("up").catch(() => void 0);
      try {
        await run();
        return;
      } catch {
        step.status = "needs-attention";
        step.message = error instanceof Error ? `Could not interact: ${error.message}` : "Could not interact with element.";
        return;
      }
    }
    throw error;
  }
}

// src/engine/workflow/xamlBuilder.ts
function vbGenerator(g) {
  const n = Number(g.arg) || g.value.length;
  switch (g.kind) {
    case "digits": {
      if (n < 1 || n > 9) return null;
      const lo = Math.pow(10, n - 1);
      const hi = Math.pow(10, n) - 1;
      return `New Random().Next(${lo}, ${hi}).ToString()`;
    }
    case "email":
      return `"autopilot." & Guid.NewGuid().ToString("N").Substring(0, 8) & "@example.com"`;
    case "uuid":
      return `Guid.NewGuid().ToString("N")`;
    case "timestamp":
      return `DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString()`;
    case "date":
      return `DateTime.Now.ToString("${g.arg || "dd/MM/yyyy"}")`;
    case "dob":
      return `DateTime.Today.AddYears(-70).AddDays(New Random().Next(0, (DateTime.Today.AddYears(-18).AddDays(-1) - DateTime.Today.AddYears(-70)).Days)).ToString("${g.arg || "dd/MM/yyyy"}")`;
    case "expiry":
      return `DateTime.Today.AddYears(3).ToString("${g.arg || "MM/yy"}")`;
    case "cvv": {
      const digits = Number(g.arg) || 3;
      if (digits < 1 || digits > 9) return null;
      return `New Random().Next(${Math.pow(10, digits - 1)}, ${Math.pow(10, digits) - 1}).ToString()`;
    }
    // cardnumber and nameoncard stay literal: a fixed test PAN must not be
    // randomised, and a name has no safe VB one-liner.
    default:
      return null;
  }
}
function xamlTextValue(text, generated, template) {
  const hits = generated.filter((g) => template ? template.includes(g.token) : true).filter((g) => g.value && text.includes(g.value) && vbGenerator(g)).sort((a, b) => b.value.length - a.value.length);
  if (hits.length === 0) return escAttr(text);
  const parts = [];
  let rest = text;
  for (const g of hits) {
    const at = rest.indexOf(g.value);
    if (at < 0) continue;
    if (at > 0) parts.push(`"${rest.slice(0, at).replace(/"/g, '""')}"`);
    parts.push(vbGenerator(g));
    rest = rest.slice(at + g.value.length);
  }
  if (rest) parts.push(`"${rest.replace(/"/g, '""')}"`);
  return escAttr(`[${parts.join(" & ")}]`);
}
function escAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function elementText(step) {
  return step.element?.text || step.element?.contentDesc || step.element?.accessibilityId || step.element?.name || step.element?.resourceId || step.element?.htmlId || "";
}
function friendlyName(step) {
  const a = step.action;
  const t = elementText(step);
  switch (a?.actionType) {
    case "tap":
      return `Tap ${t || "element"}`;
    case "setText":
      return `Set Text ${t || "field"}`;
    case "getText":
      return `Get Text ${t || "element"}`;
    case "assertExists":
      return `Element Exists ${t || "element"}`;
    case "swipe":
      return `Swipe ${a.direction ?? "up"}`;
    case "pressKey":
      return `Press ${a.key ?? "Back"}`;
    default:
      return step.description;
  }
}
function isPasswordField(step) {
  const e = step.element;
  if (!e) return /password|passcode|pwd/i.test(step.description);
  if ((e.inputType || "").toLowerCase() === "password") return true;
  if (/securetextfield/i.test(e.className || "")) return true;
  const hay = [e.htmlId, e.name, e.resourceId, e.contentDesc, e.accessibilityId, e.placeholder, e.text].filter(Boolean).join(" ").toLowerCase();
  return /password|passcode|pwd|secure/.test(hay) || /password/i.test(step.description);
}
var ANDROID_KEYCODES2 = {
  BACK: 4,
  HOME: 3,
  ENTER: 66,
  TAB: 61,
  DEL: 67,
  SEARCH: 84,
  MENU: 82
};
function swipeActionsJson(direction) {
  const cx = 540;
  const cy = 1200;
  const half = 350;
  let fx = cx;
  let fy = cy;
  let tx = cx;
  let ty = cy;
  if (direction === "up") {
    fy = cy + half;
    ty = cy - half;
  } else if (direction === "down") {
    fy = cy - half;
    ty = cy + half;
  } else if (direction === "left") {
    fx = cx + half;
    tx = cx - half;
  } else {
    fx = cx - half;
    tx = cx + half;
  }
  return `{"actions":[{"type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":${fx},"y":${fy}},{"type":"pointerDown","button":0},{"type":"pause","duration":100},{"type":"pointerMove","duration":350,"x":${tx},"y":${ty}},{"type":"pointerUp","button":0}]}]}`;
}
function pressKeycodeJson(key) {
  const code = ANDROID_KEYCODES2[(key || "BACK").toUpperCase()] ?? 4;
  return `{"keycode":${code}}`;
}
function singleQuote(text) {
  return text.replace(/"/g, "'");
}
function logMsg(display, message, level = "Info") {
  return `        <ui:LogMessage DisplayName="${escAttr(display)}" Level="${level}" Message="${escAttr(singleQuote(message))}" />`;
}
function verifyXml(title, expression, outputMessage) {
  const t = escAttr(singleQuote(title));
  return `        <uta:VerifyExpression AlternativeVerificationTitle="${t}" ContinueOnFailure="True" DisplayName="Verify - ${t}" Expression="${escAttr(expression)}" OutputMessageFormat="${escAttr(singleQuote(outputMessage))}" TakeScreenshotInCaseOfFailingAssertion="True" TakeScreenshotInCaseOfSucceedingAssertion="False" />`;
}
function vb(value) {
  return `"${value.replace(/"/g, '""')}"`;
}
function renderStep(step, generated = []) {
  const n = step.index + 1;
  const a = step.action;
  const comment = `        <!-- Step ${n}: ${escText(step.description)} -->`;
  const before = logMsg(`Log - Step ${n} start`, `Step ${n}: ${step.description}`);
  if (!a) {
    return { xml: `${comment}
${before}`, vars: [] };
  }
  const display = escAttr(friendlyName(step));
  const pieces = [comment, before];
  const vars = [];
  switch (a.actionType) {
    case "tap": {
      pieces.push(`        <uma:Tap DisplayName="${display}" RequiresInitialization="False" TapType="Single">
          <uma:Tap.Target>
${innerTarget(step)}          </uma:Tap.Target>
        </uma:Tap>`);
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: tapped ${friendlyName(step)}`));
      break;
    }
    case "setText": {
      const value = a.text ?? "";
      pieces.push(`        <uma:SetText ClearText="False" DisplayName="${display}" RequiresInitialization="False" SendNewLine="False" TapBefore="Long" Text="${xamlTextValue(value, generated, step.descriptionTemplate)}">
          <uma:SetText.Target>
${innerTarget(step)}          </uma:SetText.Target>
        </uma:SetText>`);
      if (value && !isPasswordField(step)) {
        const cv = `setTextCheck_${n}`;
        vars.push(`        <Variable x:TypeArguments="x:String" Name="${cv}" />`);
        pieces.push(`        <uma:GetText DisplayName="Read back ${escAttr(elementText(step) || "field")}" RequiresInitialization="False" Text="[${cv}]">
          <uma:GetText.Target>
${innerTarget(step)}          </uma:GetText.Target>
        </uma:GetText>`);
        pieces.push(
          verifyXml(
            `Step ${n} text entered`,
            `[${cv}.Contains(${vb(value)})]`,
            `Step ${n}: field should contain "${value}"`
          )
        );
      }
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: entered text into ${friendlyName(step)}`));
      break;
    }
    case "getText": {
      const v = `getText_${n}`;
      vars.push(`        <Variable x:TypeArguments="x:String" Name="${v}" />`);
      pieces.push(`        <uma:GetText DisplayName="${display}" RequiresInitialization="False" Text="[${v}]">
          <uma:GetText.Target>
${innerTarget(step)}          </uma:GetText.Target>
        </uma:GetText>`);
      const expected = step.capturedText?.trim();
      if (expected) {
        pieces.push(
          verifyXml(
            `Step ${n} captured text`,
            `[${v} = ${vb(expected)}]`,
            `Step ${n}: expected captured text "${expected}"`
          )
        );
      } else {
        pieces.push(
          verifyXml(
            `Step ${n} captured text`,
            `[Not String.IsNullOrEmpty(${v})]`,
            `Step ${n}: captured text should not be empty`
          )
        );
      }
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: captured text from ${friendlyName(step)}`));
      break;
    }
    case "assertExists": {
      const v = `exists_${n}`;
      vars.push(`        <Variable x:TypeArguments="x:Boolean" Name="${v}" />`);
      pieces.push(`        <uma:ElementExists DisplayName="${display}" Exists="[${v}]" RequiresInitialization="False">
          <uma:ElementExists.Target>
${innerTarget(step)}          </uma:ElementExists.Target>
        </uma:ElementExists>`);
      pieces.push(
        verifyXml(
          `Step ${n} - ${step.description}`,
          `[${v}]`,
          `Step ${n}: ${step.description}`
        )
      );
      break;
    }
    case "swipe":
    case "pressKey": {
      const isSwipe = a.actionType === "swipe";
      const what = isSwipe ? `swipe ${a.direction ?? "up"}` : `press ${a.key ?? "Back"}`;
      const suffix = isSwipe ? "/actions" : "/appium/device/press_keycode";
      const endpoint = `[appiumServerUrl + "/session/" + appiumSessionId + "${suffix}"]`;
      const body = isSwipe ? swipeActionsJson(a.direction ?? "up") : pressKeycodeJson(a.key ?? "BACK");
      pieces.push(logMsg(`Log - Step ${n} gesture`, `Step ${n}: ${what} via Appium HTTP call`));
      pieces.push(`        <!-- Add header Content-Type: application/json on this request before running -->
        <uw:HttpClient DisplayName="HTTP - ${escAttr(what)}" EndPoint="${escAttr(endpoint)}" Method="Post">
          <uw:HttpClient.Body>${escText(body)}</uw:HttpClient.Body>
        </uw:HttpClient>`);
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: ${what}`));
      break;
    }
  }
  return { xml: pieces.join("\n"), vars };
}
function rawBase64(dataUrl) {
  return (dataUrl ?? "").replace(/^data:image\/\w+;base64,/, "");
}
function innerTarget(step) {
  const sel = escAttr(step.selector?.mbl ?? "");
  const friendly = escAttr(friendlyName(step));
  const text = escAttr(elementText(step));
  const img = rawBase64(step.elementShot);
  const imgAttr = img ? ` ImageBase64="${img}"` : "";
  return `            <umm:Target Accuracy="0.8" FriendlyName="${friendly}" FullSelector="${sel}" FullSelectorArgument="${sel}"${imgAttr} Occurence="0" SearchSteps="Selector, FuzzySelector" Text="${text}">
              <umm:Target.TapOffset>
                <umm:TapOffset OffsetX="0" OffsetXArgument="0" OffsetY="0" OffsetYArgument="0" TapOffsetType="DeviceIndependentPixels" />
              </umm:Target.TapOffset>
            </umm:Target>
`;
}
function appiumUrlTemplate(provider) {
  switch (provider) {
    case "saucelabs":
      return "https://USERNAME:ACCESSKEY@ondemand.REGION.saucelabs.com/wd/hub";
    case "browserstack":
      return "https://USERNAME:ACCESSKEY@hub-cloud.browserstack.com/wd/hub";
    default:
      return "http://YOUR-APPIUM-HOST:4723/wd/hub";
  }
}
function connectionArguments(m) {
  const args = [
    `        <InArgument x:TypeArguments="x:String" x:Key="platformName">${escText(m.platformName)}</InArgument>`,
    `        <InArgument x:TypeArguments="x:String" x:Key="platformVersion">${escText(m.platformVersion)}</InArgument>`,
    `        <InArgument x:TypeArguments="x:String" x:Key="deviceName">${escText(m.deviceName)}</InArgument>`,
    `        <InArgument x:TypeArguments="x:String" x:Key="automationName">${escText(m.automationName)}</InArgument>`
  ];
  if (m.app) {
    args.push(`        <InArgument x:TypeArguments="x:String" x:Key="app">${escText(m.app)}</InArgument>`);
  }
  if (m.browserName) {
    args.push(`        <InArgument x:TypeArguments="x:String" x:Key="browserName">${escText(m.browserName)}</InArgument>`);
  }
  if (m.provider === "saucelabs") {
    args.push(
      `        <InArgument x:TypeArguments="x:String" x:Key="sauce:options">{ "username": "YOUR_SAUCE_USER", "accessKey": "YOUR_SAUCE_KEY", "appiumVersion": "latest" }</InArgument>`
    );
  } else if (m.provider === "browserstack") {
    args.push(
      `        <InArgument x:TypeArguments="x:String" x:Key="bstack:options">{ "userName": "YOUR_BS_USER", "accessKey": "YOUR_BS_KEY" }</InArgument>`
    );
  }
  return args.join("\n");
}
var NAMESPACES = `  <TextExpression.NamespacesForImplementation>
    <sco:Collection x:TypeArguments="x:String">
      <x:String>System.Activities</x:String>
      <x:String>System.Activities.Statements</x:String>
      <x:String>System.Activities.Expressions</x:String>
      <x:String>Microsoft.VisualBasic</x:String>
      <x:String>Microsoft.VisualBasic.Activities</x:String>
      <x:String>System</x:String>
      <x:String>System.Collections.Generic</x:String>
      <x:String>System.Collections.ObjectModel</x:String>
      <x:String>System.Linq</x:String>
      <x:String>System.Xml.Linq</x:String>
      <x:String>UiPath.Core</x:String>
      <x:String>UiPath.Core.Activities</x:String>
      <x:String>UiPath.MobileAutomation.Activities</x:String>
      <x:String>UiPath.MobileAutomation.Models</x:String>
      <x:String>UiPath.Testing.Activities</x:String>
    </sco:Collection>
  </TextExpression.NamespacesForImplementation>`;
function references(hasHttp) {
  const list = [
    "Microsoft.VisualBasic",
    "mscorlib",
    "System",
    "System.Activities",
    "System.Core",
    "System.Linq",
    "System.ObjectModel",
    "System.Private.CoreLib",
    "System.Xaml",
    "System.Xml",
    "System.Xml.Linq",
    "UiPath.System.Activities",
    "UiPath.Testing.Activities",
    "UiPath.MobileAutomation.Activities",
    "UiPath.MobileAutomation"
  ];
  if (hasHttp) list.push("UiPath.Web.Activities");
  const refs = list.map((r) => `      <AssemblyReference>${r}</AssemblyReference>`).join("\n");
  return `  <TextExpression.ReferencesForImplementation>
    <sco:Collection x:TypeArguments="AssemblyReference">
${refs}
    </sco:Collection>
  </TextExpression.ReferencesForImplementation>`;
}
function buildXaml(session) {
  const className = "MobileTest";
  const m = session.mobile ?? {
    platformName: session.platform,
    platformVersion: "",
    deviceName: session.deviceLabel.split("\xB7")[0]?.trim() || "device",
    automationName: session.platform === "Android" ? "UiAutomator2" : "XCUITest",
    provider: session.provider
  };
  const generated = session.generatedData ?? [];
  const rendered = session.steps.map((step) => renderStep(step, generated));
  const body = rendered.map((r) => r.xml).join("\n");
  const vars = rendered.flatMap((r) => r.vars);
  const hasHttp = session.steps.some(
    (s) => s.action?.actionType === "swipe" || s.action?.actionType === "pressKey"
  );
  if (hasHttp) {
    vars.unshift(
      `        <Variable x:TypeArguments="x:String" Name="appiumServerUrl" />`,
      `        <Variable x:TypeArguments="x:String" Name="appiumSessionId" />`
    );
  }
  const startPageAttr = m.startUrl ? ` StartPage="${escAttr(m.startUrl)}"` : "";
  const variablesBlock = vars.length ? `        <Sequence.Variables>
${vars.join("\n")}
        </Sequence.Variables>
` : "";
  const uwNs = hasHttp ? `
  xmlns:uw="clr-namespace:UiPath.Web.Activities;assembly=UiPath.Web.Activities"` : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by UiPath Mobile Test Autopilot - UiPath Mobile Automation test -->
<!-- Test case: ${escText(session.title)} -->
<!-- Device: ${escText(session.deviceLabel)} via ${escText(session.provider)} -->
<!-- BEFORE RUNNING: set the Appium URL + credentials on the Mobile Device      -->
<!-- Connection below (credentials are intentionally NOT embedded here).        -->
<!-- Requires packages: UiPath.MobileAutomation.Activities, UiPath.Testing.Activities${hasHttp ? ", UiPath.Web.Activities" : ""}. -->
<Activity mc:Ignorable="sap sap2010" x:Class="${className}"
  xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:sap="http://schemas.microsoft.com/netfx/2009/xaml/activities/presentation"
  xmlns:sap2010="http://schemas.microsoft.com/netfx/2010/xaml/activities/presentation"
  xmlns:sco="clr-namespace:System.Collections.ObjectModel;assembly=System.Private.CoreLib"
  xmlns:ui="clr-namespace:UiPath.Core.Activities;assembly=UiPath.System.Activities"
  xmlns:uma="clr-namespace:UiPath.MobileAutomation.Activities;assembly=UiPath.MobileAutomation.Activities"
  xmlns:umm="clr-namespace:UiPath.MobileAutomation.Models;assembly=UiPath.MobileAutomation"
  xmlns:uta="clr-namespace:UiPath.Testing.Activities;assembly=UiPath.Testing.Activities"${uwNs}
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <Sequence DisplayName="${escAttr(session.title)}">
    <uma:MobileDeviceConnection AppiumUrl="${escAttr(appiumUrlTemplate(m.provider))}" DisplayName="Mobile Device Connection - ${escAttr(m.deviceName)}"${startPageAttr} SingleInstanceForDevelopment="True" UseExistingOpenConnection="True" WaitForPageUpdateDevelopment="True">
      <uma:MobileDeviceConnection.Arguments>
${connectionArguments(m)}
      </uma:MobileDeviceConnection.Arguments>
      <uma:MobileDeviceConnection.Body>
        <ActivityAction x:TypeArguments="x:Object">
          <ActivityAction.Argument>
            <DelegateInArgument x:TypeArguments="x:Object" Name="UiPathScopeContext" />
          </ActivityAction.Argument>
          <Sequence DisplayName="Test Steps">
${variablesBlock}${body}
          </Sequence>
        </ActivityAction>
      </uma:MobileDeviceConnection.Body>
    </uma:MobileDeviceConnection>
  </Sequence>
${NAMESPACES}
${references(hasHttp)}
</Activity>`;
}

// src/engine/workflow/csharpBuilder.ts
function csTextExpression(text, generated, template) {
  const hits = generated.filter((g) => template ? template.includes(g.token) : true).filter((g) => g.value && text.includes(g.value)).sort((a, b) => b.value.length - a.value.length);
  if (hits.length === 0) return csString(text);
  const parts = [];
  let rest = text;
  for (const g of hits) {
    const at = rest.indexOf(g.value);
    if (at < 0) continue;
    if (at > 0) parts.push(csString(rest.slice(0, at)));
    parts.push(generatorCall(g));
    rest = rest.slice(at + g.value.length);
  }
  if (rest) parts.push(csString(rest));
  return parts.join(" + ");
}
function generatorCall(g) {
  const n = Number(g.arg) || g.value.length;
  switch (g.kind) {
    case "digits":
      return `RandomDigits(${n})`;
    case "letters":
      return `RandomLetters(${n})`;
    case "alnum":
      return `RandomAlnum(${n})`;
    case "email":
      return `RandomEmail()`;
    case "firstname":
      return `RandomFirstName()`;
    case "lastname":
      return `RandomLastName()`;
    case "uuid":
      return `Guid.NewGuid().ToString("N")`;
    case "timestamp":
      return `DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString()`;
    case "dob":
      return `RandomDateOfBirth(${csString(g.arg || "dd/MM/yyyy")})`;
    case "date":
      return `DateTime.Now.ToString(${csString(g.arg || "dd/MM/yyyy")})`;
    case "nameoncard":
      return `RandomFirstName() + " " + RandomLastName()`;
    case "cardnumber":
      return csString(g.arg || "4111111111111111");
    case "expiry":
      return `DateTime.Today.AddYears(3).ToString(${csString(g.arg || "MM/yy")})`;
    case "cvv":
      return `RandomDigits(${Number(g.arg) || 3})`;
    case "oneof":
    case "pick": {
      const options = g.arg.split("|").map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) return csString(g.value);
      if (options.length === 1) return csString(options[0]);
      return `PickOne(${options.map(csString).join(", ")})`;
    }
    default:
      return csString(g.value);
  }
}
var GENERATOR_SOURCE = {
  RandomDigits: [
    "private static string RandomDigits(int n) =>",
    "    string.Concat(Enumerable.Range(0, n).Select(_ => _rng.Next(0, 10).ToString()));"
  ],
  RandomLetters: [
    "private static string RandomLetters(int n) =>",
    "    string.Concat(Enumerable.Range(0, n).Select(_ => (char)('A' + _rng.Next(0, 26))));"
  ],
  RandomAlnum: [
    "private static string RandomAlnum(int n)",
    "{",
    '    const string pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";',
    "    return string.Concat(Enumerable.Range(0, n).Select(_ => pool[_rng.Next(pool.Length)]));",
    "}"
  ],
  RandomEmail: [
    "private static string RandomEmail() =>",
    '    $"autopilot.{Guid.NewGuid():N}".Substring(0, 18) + "@example.com";'
  ],
  RandomFirstName: [
    'private static readonly string[] _firstNames = { "Ayanda", "Thabo", "Lerato", "Sipho", "Nadia", "Kayla", "Riaan", "Zanele", "Devan", "Imke" };',
    "private static string RandomFirstName() => _firstNames[_rng.Next(_firstNames.Length)];"
  ],
  RandomLastName: [
    'private static readonly string[] _lastNames = { "Naidoo", "Botha", "Mkhize", "Pillay", "Venter", "Dlamini", "Fourie", "Khumalo", "Jacobs", "Nel" };',
    "private static string RandomLastName() => _lastNames[_rng.Next(_lastNames.Length)];"
  ],
  PickOne: [
    "private static string PickOne(params string[] options) =>",
    "    options[_rng.Next(options.Length)];"
  ],
  RandomDateOfBirth: [
    "// Always 18+ today: pick a day in the window ending the day before the",
    "// 18th-birthday cut-off (subtracting years alone can leave a 17-year-old).",
    "private static string RandomDateOfBirth(string format)",
    "{",
    "    var latest = DateTime.Today.AddYears(-18).AddDays(-1);",
    "    var earliest = DateTime.Today.AddYears(-70);",
    "    var span = (latest - earliest).Days;",
    "    return earliest.AddDays(_rng.Next(0, Math.Max(1, span))).ToString(format);",
    "}"
  ]
};
function csString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;
}
function pascal(value) {
  const cleaned = (value || "MobileTest").replace(/[^a-zA-Z0-9]+/g, " ").trim();
  const parts = cleaned.split(/\s+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const name = parts.join("") || "MobileTest";
  return /^[0-9]/.test(name) ? `T${name}` : name;
}
function credentialsFor(provider) {
  switch (provider) {
    case "browserstack":
      return {
        userKey: "userName",
        keyKey: "accessKey",
        userEnv: "BROWSERSTACK_USERNAME",
        keyEnv: "BROWSERSTACK_ACCESS_KEY"
      };
    case "saucelabs":
      return {
        userKey: "username",
        keyKey: "accessKey",
        userEnv: "SAUCE_USERNAME",
        keyEnv: "SAUCE_ACCESS_KEY"
      };
    case "lambdatest":
      return {
        userKey: "username",
        keyKey: "accessKey",
        userEnv: "LT_USERNAME",
        keyEnv: "LT_ACCESS_KEY"
      };
    default:
      return {
        userKey: "username",
        keyKey: "accessKey",
        userEnv: "APPIUM_USERNAME",
        keyEnv: "APPIUM_ACCESS_KEY"
      };
  }
}
function w3cStrategy(sel) {
  switch (sel.strategy) {
    case "accessibility id":
      return "accessibility id";
    case "id":
      return "id";
    case "-android uiautomator":
      return "-android uiautomator";
    case "css":
      return "css selector";
    case "xpath":
    default:
      return "xpath";
  }
}
var VERIFY_ATTEMPTS2 = 12;
var VERIFY_DELAY_S = 5;
var ANDROID_KEYCODE_NUMBERS = {
  BACK: 4,
  HOME: 3,
  ENTER: 66,
  TAB: 61,
  DEL: 67,
  SEARCH: 84
};
function stepLines(step, isAndroid, isWeb, generated) {
  const a = step.action;
  const sel = step.selector;
  const n = step.index + 1;
  const out = [];
  out.push(`// Step ${n}: ${step.description.replace(/\r?\n/g, " ")}`);
  if (step.reason) out.push(`// Planner: ${step.reason.replace(/\r?\n/g, " ")}`);
  if (!a) {
    out.push(`// (no action was planned for this step)`);
    return out;
  }
  if (sel) out.push(`// Selector (UiPath): ${sel.mbl.replace(/\r?\n/g, " ")}`);
  const find = (v) => `wd.FindElement(${csString(w3cStrategy(v))}, ${csString(v.locator)})`;
  switch (a.actionType) {
    case "tap":
      if (!sel) break;
      out.push(`wd.Click(${find(sel)});`);
      break;
    case "setText":
      if (!sel) break;
      out.push(
        `wd.SendKeys(${find(sel)}, ${csTextExpression(a.text ?? "", generated, step.descriptionTemplate)});`
      );
      break;
    case "getText": {
      if (!sel) break;
      out.push(`string text${n} = wd.GetText(${find(sel)});`);
      out.push(`Log($"Step ${n} captured: {text${n}}");`);
      if (step.capturedText) {
        out.push(`// Recorded run captured: ${step.capturedText.replace(/\r?\n/g, " ").slice(0, 120)}`);
      }
      break;
    }
    case "assertExists": {
      if (!sel) break;
      out.push(
        `if (!wd.WaitForPresent(${csString(w3cStrategy(sel))}, ${csString(sel.locator)}, attempts: ${VERIFY_ATTEMPTS2}, delaySeconds: ${VERIFY_DELAY_S}))`
      );
      out.push(
        `    throw new Exception(${csString(`Step ${n} failed: element not found - ${step.description}`)});`
      );
      break;
    }
    case "swipe":
      if (isWeb) {
        const dir = a.direction ?? "up";
        const js = dir === "up" ? "window.scrollBy(0, Math.round(window.innerHeight * 0.6))" : dir === "down" ? "window.scrollBy(0, -Math.round(window.innerHeight * 0.6))" : dir === "left" ? "window.scrollBy(Math.round(window.innerWidth * 0.6), 0)" : "window.scrollBy(-Math.round(window.innerWidth * 0.6), 0)";
        out.push(`wd.ExecuteScript(${csString(js)});`);
      } else {
        out.push(`wd.Swipe(${csString(a.direction ?? "up")});`);
      }
      break;
    case "pressKey": {
      const key = (a.key ?? "BACK").toUpperCase();
      if (isAndroid) {
        out.push(`wd.PressKeyCode(${ANDROID_KEYCODE_NUMBERS[key] ?? 4}); // ${key}`);
      } else {
        out.push(`wd.MobileCommand("mobile: pressButton", ${csString(key.toLowerCase())});`);
      }
      break;
    }
  }
  return out;
}
function capabilityLines(caps, cred) {
  const lines = ["var caps = new Dictionary<string, object>", "{"];
  const nested = [];
  for (const [key, value] of Object.entries(caps)) {
    if (value === void 0 || value === null) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      nested.push(`    [${csString(key)}] = new Dictionary<string, object>`);
      nested.push(`    {`);
      for (const [k, v] of Object.entries(value)) {
        if (v === void 0 || v === null) continue;
        nested.push(`        [${csString(k)}] = ${csLiteral(v)},`);
      }
      nested.push(`        [${csString(cred.userKey)}] = FarmUser,`);
      nested.push(`        [${csString(cred.keyKey)}] = FarmKey,`);
      nested.push(`    },`);
    } else {
      lines.push(`    [${csString(key)}] = ${csLiteral(value)},`);
    }
  }
  return [...lines, ...nested, "};"];
}
function csLiteral(v) {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return csString(String(v));
}
var WEBDRIVER_CLIENT = [
  "/// <summary>",
  "/// Minimal W3C WebDriver / Appium client over HttpClient - the same HTTP",
  "/// calls the Autopilot agent made when it recorded this test. Deliberately",
  "/// dependency-free: no Appium.WebDriver package, nothing to version-match.",
  "/// </summary>",
  "private sealed class WebDriver : IDisposable",
  "{",
  '    private const string ElementKey = "element-6066-11e4-a52e-4f735466cecf";',
  "    private readonly HttpClient _http;",
  "    private readonly string _baseUrl;",
  "    public string SessionId { get; private set; }",
  "    // False when the session belongs to a Mobile Device Manager connection:",
  "    // MDM opened it and MDM closes it, so this client must not delete it.",
  "    private bool _ownsSession = true;",
  "",
  "    private WebDriver(string hubUrl, HttpClient http)",
  "    {",
  "        _baseUrl = hubUrl.TrimEnd('/');",
  "        _http = http;",
  "    }",
  "",
  "    public static WebDriver Create(string hubUrl, Dictionary<string, object> capabilities, int connectTimeoutSeconds = 300)",
  "    {",
  "        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(connectTimeoutSeconds) };",
  "        var wd = new WebDriver(hubUrl, http);",
  "        var payload = new Dictionary<string, object>",
  "        {",
  '            ["capabilities"] = new Dictionary<string, object>',
  "            {",
  '                ["alwaysMatch"] = capabilities,',
  '                ["firstMatch"] = new object[] { new Dictionary<string, object>() },',
  "            },",
  "        };",
  '        var res = wd.Send(HttpMethod.Post, "/session", payload);',
  '        wd.SessionId = res?["value"]?["sessionId"]?.GetValue<string>()',
  '                       ?? res?["sessionId"]?.GetValue<string>();',
  "        if (string.IsNullOrEmpty(wd.SessionId))",
  '            throw new Exception("The hub did not return a sessionId.");',
  "        return wd;",
  "    }",
  "",
  "    /// <summary>",
  "    /// Attach to a session someone else already opened - here, the one the",
  "    /// UiPath Mobile Device Manager connection created. Nothing is created and",
  "    /// nothing is torn down, so the device stays visible in the MDM view while",
  "    /// these HTTP calls drive it.",
  "    /// </summary>",
  "    public static WebDriver Attach(string hubUrl, string sessionId, string user, string accessKey, int timeoutSeconds = 300)",
  "    {",
  "        if (string.IsNullOrEmpty(sessionId))",
  '            throw new Exception("No session id: the MDM connection did not report one.");',
  "        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(timeoutSeconds) };",
  "        // Session creation passes credentials inside the capabilities; requests",
  "        // against an existing session have to authenticate per call instead.",
  "        if (!string.IsNullOrEmpty(user))",
  "        {",
  '            var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{user}:{accessKey}"));',
  '            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", basic);',
  "        }",
  "        var wd = new WebDriver(hubUrl, http);",
  "        wd.SessionId = sessionId;",
  "        wd._ownsSession = false;",
  "        return wd;",
  "    }",
  "",
  "    private JsonNode Send(HttpMethod method, string path, object body)",
  "    {",
  "        var req = new HttpRequestMessage(method, _baseUrl + path);",
  "        if (body != null)",
  "        {",
  '            req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");',
  "        }",
  "        var res = _http.SendAsync(req).GetAwaiter().GetResult();",
  "        var text = res.Content.ReadAsStringAsync().GetAwaiter().GetResult();",
  "        JsonNode node = null;",
  "        if (!string.IsNullOrWhiteSpace(text))",
  "        {",
  "            try { node = JsonNode.Parse(text); } catch { /* some hubs return empty bodies */ }",
  "        }",
  "        if (!res.IsSuccessStatusCode)",
  "        {",
  '            var msg = node?["value"]?["message"]?.GetValue<string>() ?? text;',
  '            throw new Exception($"WebDriver {method} {path} failed ({(int)res.StatusCode}): {msg}");',
  "        }",
  "        return node;",
  "    }",
  "",
  '    private string Sess(string path) => $"/session/{SessionId}{path}";',
  "",
  "    /// <summary>Poll for an element and return its id.</summary>",
  "    public string FindElement(string using_, string value, int timeoutSeconds = 15)",
  "    {",
  "        var deadline = DateTime.UtcNow.AddSeconds(timeoutSeconds);",
  "        for (;;)",
  "        {",
  "            try",
  "            {",
  '                var res = Send(HttpMethod.Post, Sess("/element"), new Dictionary<string, object> { ["using"] = using_, ["value"] = value });',
  '                var v = res?["value"];',
  "                var id = v?[ElementKey]?.GetValue<string>();",
  "                if (id == null && v is JsonObject obj && obj.Count > 0)",
  "                {",
  "                    id = obj.First().Value?.GetValue<string>();",
  "                }",
  "                if (!string.IsNullOrEmpty(id)) return id;",
  "            }",
  "            catch (Exception) when (DateTime.UtcNow < deadline) { /* not there yet */ }",
  "            if (DateTime.UtcNow >= deadline)",
  '                throw new Exception($"Element not found: {using_}={value}");',
  "            Thread.Sleep(500);",
  "        }",
  "    }",
  "",
  "    /// <summary>Spaced presence check - mirrors the agent's verify policy.</summary>",
  `    public bool WaitForPresent(string using_, string value, int attempts = ${VERIFY_ATTEMPTS2}, int delaySeconds = ${VERIFY_DELAY_S})`,
  "    {",
  "        for (var attempt = 1; attempt <= attempts; attempt++)",
  "        {",
  "            try { FindElement(using_, value, 0); return true; }",
  "            catch { /* not present on this attempt */ }",
  "            if (attempt < attempts) Thread.Sleep(delaySeconds * 1000);",
  "        }",
  "        return false;",
  "    }",
  "",
  '    public void Click(string elementId) => Send(HttpMethod.Post, Sess($"/element/{elementId}/click"), new Dictionary<string, object>());',
  "",
  "    public void SendKeys(string elementId, string text)",
  "    {",
  '        try { Send(HttpMethod.Post, Sess($"/element/{elementId}/clear"), new Dictionary<string, object>()); }',
  "        catch { /* some fields refuse clear; typing still works */ }",
  '        Send(HttpMethod.Post, Sess($"/element/{elementId}/value"), new Dictionary<string, object> { ["text"] = text });',
  "    }",
  "",
  '    public string GetText(string elementId) => Send(HttpMethod.Get, Sess($"/element/{elementId}/text"), null)?["value"]?.GetValue<string>() ?? "";',
  "",
  "    public void PressKeyCode(int keycode) =>",
  '        Send(HttpMethod.Post, Sess("/appium/device/press_keycode"), new Dictionary<string, object> { ["keycode"] = keycode });',
  "",
  "    public void MobileCommand(string command, string name) =>",
  '        Send(HttpMethod.Post, Sess("/execute/sync"), new Dictionary<string, object>',
  "        {",
  '            ["script"] = command,',
  '            ["args"] = new object[] { new Dictionary<string, object> { ["name"] = name } },',
  "        });",
  "",
  "    public JsonNode ExecuteScript(string script) =>",
  '        Send(HttpMethod.Post, Sess("/execute/sync"), new Dictionary<string, object> { ["script"] = script, ["args"] = new object[0] });',
  "",
  "    /// <summary>Touch drag. `direction` is the finger movement.</summary>",
  "    public void Swipe(string direction)",
  "    {",
  '        var rect = Send(HttpMethod.Get, Sess("/window/rect"), null)?["value"];',
  '        int w = rect?["width"]?.GetValue<int>() ?? 390, h = rect?["height"]?.GetValue<int>() ?? 844;',
  "        int cx = w / 2, cy = h / 2, dx = (int)(w * 0.3), dy = (int)(h * 0.3);",
  "        int tx = cx, ty = cy;",
  '        if (direction == "up") ty = cy - dy;',
  '        else if (direction == "down") ty = cy + dy;',
  '        else if (direction == "left") tx = cx - dx;',
  "        else tx = cx + dx;",
  '        Send(HttpMethod.Post, Sess("/actions"), new Dictionary<string, object>',
  "        {",
  '            ["actions"] = new object[]',
  "            {",
  "                new Dictionary<string, object>",
  "                {",
  '                    ["type"] = "pointer",',
  '                    ["id"] = "finger1",',
  '                    ["parameters"] = new Dictionary<string, object> { ["pointerType"] = "touch" },',
  '                    ["actions"] = new object[]',
  "                    {",
  '                        new Dictionary<string, object> { ["type"] = "pointerMove", ["duration"] = 0, ["x"] = cx, ["y"] = cy, ["origin"] = "viewport" },',
  '                        new Dictionary<string, object> { ["type"] = "pointerDown", ["button"] = 0 },',
  '                        new Dictionary<string, object> { ["type"] = "pause", ["duration"] = 120 },',
  '                        new Dictionary<string, object> { ["type"] = "pointerMove", ["duration"] = 300, ["x"] = tx, ["y"] = ty, ["origin"] = "viewport" },',
  '                        new Dictionary<string, object> { ["type"] = "pointerUp", ["button"] = 0 },',
  "                    },",
  "                },",
  "            },",
  "        });",
  "    }",
  "",
  "    public void Navigate(string url) =>",
  '        Send(HttpMethod.Post, Sess("/url"), new Dictionary<string, object> { ["url"] = url });',
  "",
  '    /// <summary>GPS the app reads for "use my current location".</summary>',
  "    public void SetLocation(double latitude, double longitude) =>",
  '        Send(HttpMethod.Post, Sess("/location"), new Dictionary<string, object>',
  "        {",
  '            ["location"] = new Dictionary<string, object> { ["latitude"] = latitude, ["longitude"] = longitude, ["altitude"] = 0 },',
  "        });",
  "",
  "    public void Quit()",
  "    {",
  "        if (string.IsNullOrEmpty(SessionId)) return;",
  "        // An MDM-owned session is closed by disposing its Connection, not here.",
  "        if (!_ownsSession) { SessionId = null; return; }",
  '        try { Send(HttpMethod.Delete, Sess(""), null); } catch { /* ignore teardown errors */ }',
  "        SessionId = null;",
  "    }",
  "",
  "    public void Dispose() { Quit(); _http.Dispose(); }",
  "}"
];
function buildCodedWorkflow(state, opts = {}) {
  const attach = opts.attachToMdm === true;
  const className = pascal(state.title);
  const isAndroid = state.platform === "Android";
  const isWeb = state.target === "browser";
  const conn = state.connection;
  const hubUrl = conn?.hubUrl ?? "https://mobile-hub.lambdatest.com/wd/hub";
  const cred = credentialsFor(state.provider);
  const generated = state.generatedData ?? [];
  const mdmDeviceName = state.mobile?.deviceName || state.deviceLabel || "My Device";
  const mdmAppName = state.appLabel || "My Application";
  const caps = conn?.capabilities ? { ...conn.capabilities } : {
    platformName: state.platform,
    "appium:automationName": state.mobile?.automationName ?? (isAndroid ? "UiAutomator2" : "XCUITest"),
    "appium:deviceName": state.mobile?.deviceName ?? "",
    "appium:platformVersion": state.mobile?.platformVersion ?? "",
    ...isWeb ? { browserName: state.mobile?.browserName ?? "chrome" } : {},
    ...state.mobile?.app ? { "appium:app": state.mobile.app } : {}
  };
  const body = [];
  for (const step of state.steps) {
    if (step.status === "pending" || step.status === "skipped") continue;
    body.push(...stepLines(step, isAndroid, isWeb, generated), "");
  }
  const bodyText = body.join("\n");
  const usedGenerators = Object.keys(GENERATOR_SOURCE).filter(
    (name) => new RegExp(`\\b${name}\\(`).test(bodyText)
  );
  const generatorBlock = usedGenerators.length ? [
    "",
    "        // --- Fresh test data on every run -------------------------------",
    "        // The recorded run used one set of values; regenerating here keeps",
    "        // re-runs unique for apps that de-duplicate on these fields.",
    "        private static readonly Random _rng = new Random();",
    ...usedGenerators.flatMap((name) => ["", ...GENERATOR_SOURCE[name].map((l) => `        ${l}`)])
  ] : [];
  const header = [
    "// ---------------------------------------------------------------------------",
    `// ${state.title}`,
    "// UiPath Coded Workflow - generated by UiPath Mobile Test Autopilot.",
    "//",
    `// Device   : ${state.deviceLabel}`,
    `// Provider : ${state.provider}`,
    `// Target   : ${isWeb ? "mobile browser" : "native app"}`,
    `// App      : ${state.appLabel}`,
    `// Mode     : ${state.mode}${state.mode === "simulated" ? " (recorded against the bundled sample device)" : ""}`,
    "//",
    ...attach ? [
      "// The device is opened through a UiPath Mobile Device Manager connection,",
      "// so it appears in the MDM device view and the cloud dashboard shows one",
      "// session. Every action below is then a raw Appium/WebDriver HTTP call",
      "// routed to that same session id - the exact requests the Autopilot agent",
      "// made while recording this test.",
      "//",
      "// Requires the UiPath.MobileAutomation.Activities package (for the",
      "// connection only). The HTTP client is included below, so there is no",
      "// Appium.WebDriver dependency and no client-version mismatch.",
      "//",
      "// Setup:",
      "//   1. In Mobile Device Manager, configure the device connection and",
      "//      application, then match the two constants below to their names.",
      "//   2. Requests against an existing session authenticate per call, so the",
      "//      hub credentials are still needed here, via environment variables",
      "//      (or UiPath Assets):",
      `//        ${cred.userEnv} / ${cred.keyEnv}`
    ] : [
      "// Drives the device by calling the Appium/WebDriver HTTP API directly - the",
      "// exact same requests the Autopilot agent made while recording this test.",
      "//",
      "// NO NuGet packages required. The WebDriver client is included below, so",
      "// there is no Appium.WebDriver dependency and no client-version mismatch.",
      "//",
      "// Setup:",
      `//   Provide credentials via environment variables (or UiPath Assets):`,
      `//     ${cred.userEnv} / ${cred.keyEnv}`
    ],
    "//   Selectors below are the exact ones captured on the device.",
    "// ---------------------------------------------------------------------------",
    "",
    "using System;",
    "using System.Collections.Generic;",
    "using System.Linq;",
    "using System.Net.Http;",
    ...attach ? ["using System.Net.Http.Headers;"] : [],
    "using System.Text;",
    "using System.Text.Json;",
    "using System.Text.Json.Nodes;",
    "using System.Threading;",
    "using UiPath.CodedWorkflows;",
    ...attach ? ["using UiPath.MobileAutomation.API.Models;"] : [],
    "",
    "namespace MobileTestAutopilot",
    "{",
    `    public class ${className} : CodedWorkflow`,
    "    {",
    `        private const string HubUrl = ${csString(hubUrl)};`,
    ...attach ? [
      "",
      "        // Must match the entries configured in Mobile Device Manager.",
      `        private const string MdmDeviceName      = ${csString(mdmDeviceName)};`,
      `        private const string MdmApplicationName = ${csString(mdmAppName)};`
    ] : [],
    "",
    "        // Credentials are read at run time - never hard-coded here.",
    `        private static string FarmUser => Environment.GetEnvironmentVariable(${csString(cred.userEnv)}) ?? "";`,
    `        private static string FarmKey  => Environment.GetEnvironmentVariable(${csString(cred.keyEnv)}) ?? "";`,
    "",
    "        [Workflow]",
    "        public void Execute()",
    "        {"
  ];
  const capLines = attach ? [] : capabilityLines(caps, cred).map((l) => `            ${l}`);
  const connect = attach ? [
    "            using (Connection connection = mobile.Connect(MdmDeviceName, MdmApplicationName))",
    "            {",
    "                // The session MDM just opened - every HTTP call below targets it.",
    "                var sessionId = connection.GetSessionIdentifier();",
    `                Log($"MDM session {sessionId} on ${state.deviceLabel}");`,
    "                using var wd = WebDriver.Attach(HubUrl, sessionId, FarmUser, FarmKey);"
  ] : [
    "",
    "            using var wd = WebDriver.Create(HubUrl, caps);",
    `            Log($"Session {wd.SessionId} on ${state.deviceLabel}");`,
    "",
    "            try",
    "            {"
  ];
  const preamble = [];
  const coords = (state.gpsCoordinates ?? "").split(",").map((v) => Number(v.trim()));
  if (coords.length === 2 && coords.every((c) => Number.isFinite(c))) {
    preamble.push("");
    preamble.push(`                // GPS the app reads for "use my current location".`);
    preamble.push(`                wd.SetLocation(${coords[0]}, ${coords[1]});`);
  }
  if (isWeb && state.mobile?.startUrl) {
    preamble.push("");
    preamble.push(`                wd.Navigate(${csString(state.mobile.startUrl)});`);
  }
  preamble.push("");
  const footer = [
    ...attach ? [
      "            }",
      "            // No wd.Quit(): the MDM connection owns the session and closes it",
      "            // when the using block above exits."
    ] : [
      "            }",
      "            finally",
      "            {",
      "                wd.Quit();",
      "            }"
    ],
    "        }",
    "",
    "        private void Log(string message) => Console.WriteLine(message);",
    ...generatorBlock,
    "",
    ...WEBDRIVER_CLIENT.map((l) => `        ${l}`),
    "    }",
    "}",
    ""
  ];
  const indentedBody = body.map((l) => l ? `                ${l}` : "");
  return [...header, ...capLines, ...connect, ...preamble, ...indentedBody, ...footer].join("\n");
}

// src/engine/workflow/mdmBuilder.ts
var VERIFY_ATTEMPTS3 = 12;
var VERIFY_DELAY_S2 = 5;
var ANDROID_KEYCODE_NUMBERS2 = {
  ENTER: 66,
  TAB: 61,
  DEL: 67,
  SEARCH: 84,
  BACK: 4,
  HOME: 3
};
var HARDWARE_BUTTONS = {
  BACK: "HardwareButton.BackButton",
  HOME: "HardwareButton.HomeButton",
  RECENTS: "HardwareButton.SwitchAppButton",
  APPSWITCH: "HardwareButton.SwitchAppButton"
};
var SWIPE_DIRECTIONS = {
  up: "SwipeDirection.Up",
  down: "SwipeDirection.Down",
  left: "SwipeDirection.Left",
  right: "SwipeDirection.Right"
};
function target(sel) {
  return `Sel(${csString(sel.mbl.replace(/\r?\n/g, " "))})`;
}
function stepLines2(step, isAndroid, generated) {
  const a = step.action;
  const sel = step.selector;
  const n = step.index + 1;
  const out = [];
  out.push(`// Step ${n}: ${step.description.replace(/\r?\n/g, " ")}`);
  if (step.reason) out.push(`// Planner: ${step.reason.replace(/\r?\n/g, " ")}`);
  if (step.condition) {
    out.push(`// Conditional (group ${step.conditionGroup ?? 0}): only ran because - ${step.condition.replace(/\r?\n/g, " ")}`);
  }
  if (step.optional) out.push(`// Optional step: skipped rather than failed when absent.`);
  if (!a) {
    out.push(`// (no action was planned for this step)`);
    return out;
  }
  switch (a.actionType) {
    case "tap":
      if (!sel) break;
      out.push(`connection.Tap(${target(sel)});`);
      break;
    case "setText":
      if (!sel) break;
      out.push(
        `connection.SetText(${target(sel)}, ${csTextExpression(a.text ?? "", generated, step.descriptionTemplate)});`
      );
      break;
    case "getText": {
      if (!sel) break;
      out.push(`string text${n} = connection.GetText(${target(sel)});`);
      out.push(`Trace($"Step ${n} captured: {text${n}}");`);
      if (step.capturedText) {
        out.push(`// Recorded run captured: ${step.capturedText.replace(/\r?\n/g, " ").slice(0, 120)}`);
      }
      break;
    }
    case "assertExists": {
      if (!sel) break;
      out.push(`if (!WaitForElement(connection, ${target(sel)}, attempts: ${VERIFY_ATTEMPTS3}, delaySeconds: ${VERIFY_DELAY_S2}))`);
      out.push(
        `    throw new Exception(${csString(`Step ${n} failed: element not found - ${step.description}`)});`
      );
      break;
    }
    case "swipe": {
      const dir = a.direction ?? "up";
      out.push(`connection.DirectionalSwipe(${SWIPE_DIRECTIONS[dir] ?? "SwipeDirection.Up"}, 60);`);
      break;
    }
    case "pressKey": {
      const key = (a.key ?? "BACK").toUpperCase();
      const button = HARDWARE_BUTTONS[key];
      if (button) {
        out.push(`connection.PressHardwareButton(${button});`);
      } else if (isAndroid) {
        out.push(`// HardwareButton has no ${key}; sent as a native command on this session.`);
        out.push(
          `// If the driver rejects this name, use: connection.ExecuteCommand("mobile: pressKey", new Dictionary<string, object> { ["keycode"] = ${ANDROID_KEYCODE_NUMBERS2[key] ?? 66} });`
        );
        out.push(
          `connection.ExecuteCommand("pressKeyCode", new Dictionary<string, object> { ["keycode"] = ${ANDROID_KEYCODE_NUMBERS2[key] ?? 66} }); // ${key}`
        );
      } else {
        out.push(
          `connection.ExecuteCommand("mobile: pressButton", new Dictionary<string, object> { ["name"] = ${csString(key.toLowerCase())} });`
        );
      }
      break;
    }
  }
  return out;
}
function buildMdmCodedWorkflow(state) {
  const className = pascal(state.title);
  const isAndroid = state.platform === "Android";
  const isWeb = state.target === "browser";
  const generated = state.generatedData ?? [];
  const deviceName = state.mobile?.deviceName || state.deviceLabel || "My Device";
  const appName = state.appLabel || "My Application";
  const body = [];
  for (const step of state.steps) {
    if (step.status === "pending" || step.status === "skipped") continue;
    body.push(...stepLines2(step, isAndroid, generated), "");
  }
  const bodyText = body.join("\n");
  const usedGenerators = Object.keys(GENERATOR_SOURCE).filter(
    (name) => new RegExp(`\\b${name}\\(`).test(bodyText)
  );
  const generatorBlock = usedGenerators.length ? [
    "",
    "        // --- Fresh test data on every run -------------------------------",
    "        // The recorded run used one set of values; regenerating here keeps",
    "        // re-runs unique for apps that de-duplicate on these fields.",
    "        private static readonly Random _rng = new Random();",
    ...usedGenerators.flatMap((name) => ["", ...GENERATOR_SOURCE[name].map((l) => `        ${l}`)])
  ] : [];
  const needsWait = /\bWaitForElement\(/.test(bodyText);
  const gps = state.gpsCoordinates;
  const header = [
    "// ---------------------------------------------------------------------------",
    `// ${state.title}`,
    "// UiPath Coded Workflow - generated by UiPath Mobile Test Autopilot.",
    "//",
    `// Device   : ${state.deviceLabel}`,
    `// Provider : ${state.provider}`,
    `// Target   : ${isWeb ? "mobile browser" : "native app"}`,
    `// App      : ${state.appLabel}`,
    `// Mode     : ${state.mode}${state.mode === "simulated" ? " (recorded against the bundled sample device)" : ""}`,
    "//",
    "// Drives the device through the UiPath Mobile Automation API, so the run is",
    "// visible in Mobile Device Manager - live device view, MDM logs, screenshots",
    "// and Test Manager reporting. (The raw-Appium export opens its own session,",
    "// which MDM has no knowledge of, so nothing shows up in the device view.)",
    "//",
    "// Setup in Studio:",
    "//   1. Install the UiPath.MobileAutomation.Activities package.",
    "//   2. In Mobile Device Manager, create a device connection and an",
    "//      application entry, then make the two constants below match their",
    "//      names exactly. The hub URL and access key live in MDM, which is why",
    "//      no credentials appear in this file.",
    "// ---------------------------------------------------------------------------",
    "",
    "using System;",
    "using System.Collections.Generic;",
    "using System.Linq;",
    "using System.Threading;",
    "using UiPath.CodedWorkflows;",
    "using UiPath.MobileAutomation.API.Models;",
    "",
    "namespace MobileTestAutopilot",
    "{",
    `    public class ${className} : CodedWorkflow`,
    "    {",
    "        // Must match the entries configured in Mobile Device Manager.",
    `        private const string MdmDeviceName      = ${csString(deviceName)};`,
    `        private const string MdmApplicationName = ${csString(appName)};`,
    "",
    "        [Workflow]",
    "        public void Execute()",
    "        {",
    "            using (Connection connection = mobile.Connect(MdmDeviceName, MdmApplicationName))",
    "            {",
    `                Trace($"Connected through MDM to {MdmDeviceName} (Appium session {connection.GetSessionIdentifier()})");`
  ];
  const preamble = [];
  if (gps) {
    const [lat, lon] = gps.split(",").map((v) => Number(v.trim()));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      preamble.push("");
      preamble.push('                // GPS the app reads for "use my current location".');
      preamble.push(`                connection.SetDeviceGeoLocation(0, ${lat}, ${lon});`);
    }
  }
  if (isWeb && state.mobile?.startUrl) {
    preamble.push("");
    preamble.push(`                connection.OpenUrl(${csString(state.mobile.startUrl)});`);
  }
  preamble.push("");
  const helpers = [
    "",
    "        /// <summary>",
    "        /// A mobile target from a captured native selector. If your activity-pack",
    "        /// version exposes the static factory instead, the body becomes:",
    "        ///     SelectorTarget.FromSelector(selector);",
    "        /// </summary>",
    "        private static SelectorTarget Sel(string selector) =>",
    "            new SelectorTarget { Selector = selector };"
  ];
  if (needsWait) {
    helpers.push(
      "",
      "        /// <summary>Spaced presence check - mirrors the agent's verify policy.</summary>",
      "        private static bool WaitForElement(",
      `            Connection connection, SelectorTarget target, int attempts = ${VERIFY_ATTEMPTS3}, int delaySeconds = ${VERIFY_DELAY_S2})`,
      "        {",
      "            for (var attempt = 1; attempt <= attempts; attempt++)",
      "            {",
      "                try { if (connection.ElementExists(target)) return true; }",
      "                catch { /* not present on this attempt */ }",
      "                if (attempt < attempts) Thread.Sleep(delaySeconds * 1000);",
      "            }",
      "            return false;",
      "        }"
    );
  }
  const footer = [
    "            }",
    "        }",
    ...helpers,
    "",
    "        private static void Trace(string message) => Console.WriteLine(message);",
    ...generatorBlock,
    "    }",
    "}",
    ""
  ];
  const indentedBody = body.map((l) => l ? `                ${l}` : "");
  return [...header, ...preamble, ...indentedBody, ...footer].join("\n");
}

// src/engine/workflow/actionLog.ts
function buildActionLog(session) {
  return {
    generatedBy: "UiPath Mobile Test Autopilot",
    session: {
      id: session.id,
      title: session.title,
      mode: session.mode,
      platform: session.platform,
      provider: session.provider,
      device: session.deviceLabel,
      app: session.appLabel,
      llmModel: session.llmModel,
      llmLive: session.llmLive
    },
    steps: session.steps.map((s) => ({
      step: s.index + 1,
      description: s.description,
      status: s.status,
      action: s.action?.actionType,
      text: s.action?.text,
      direction: s.action?.direction,
      key: s.action?.key,
      reason: s.reason,
      selector: s.selector?.mbl,
      runtimeStrategy: s.selector?.strategy,
      runtimeLocator: s.selector?.locator,
      capturedText: s.capturedText,
      deviceOutcome: s.outcome,
      element: s.element ? {
        class: s.element.className,
        text: s.element.text,
        contentDesc: s.element.contentDesc,
        resourceId: s.element.resourceId,
        accessibilityId: s.element.accessibilityId
      } : void 0
    }))
  };
}
function buildSelectorCatalog(session) {
  return session.steps.map((s) => ({
    step: s.index + 1,
    description: s.description,
    action: s.action?.actionType ?? "-",
    status: s.status,
    selector: s.selector?.mbl,
    strategy: s.selector?.strategy,
    reason: s.reason,
    capturedText: s.capturedText,
    // Screenshots (fetched lazily by the UI, not inlined here).
    hasScreenshot: Boolean(s.afterScreenshot || s.beforeScreenshot),
    hasElementShot: Boolean(s.elementShot)
  }));
}

// src/engine/farms/appStorage.ts
function inferPlatform(name, kind) {
  const k = (kind ?? "").toLowerCase();
  if (k.includes("android")) return "Android";
  if (k.includes("ios")) return "iOS";
  const n = name.toLowerCase();
  if (n.endsWith(".apk") || n.endsWith(".aab")) return "Android";
  if (n.endsWith(".ipa")) return "iOS";
  return void 0;
}
function sauceStorageHost(region) {
  const r = (region || "us-west-1").trim();
  if (r.startsWith("eu")) return "api.eu-central-1.saucelabs.com";
  if (r.startsWith("us-east")) return "api.us-east-4.saucelabs.com";
  return "api.us-west-1.saucelabs.com";
}
function basicAuth(user, key) {
  return "Basic " + btoa(`${user}:${key}`);
}
async function listFarmApps(creds) {
  if (!creds.username || !creds.accessKey) {
    throw new Error("Device-farm credentials are required to list apps.");
  }
  if (creds.provider === "browserstack") {
    const res2 = await fetch("https://api-cloud.browserstack.com/app-automate/recent_apps", {
      headers: { Authorization: basicAuth(creds.username, creds.accessKey) }
    });
    if (!res2.ok) {
      throw new Error(`BrowserStack list failed (${res2.status}): ${(await res2.text()).slice(0, 200)}`);
    }
    const data2 = await res2.json();
    if (!Array.isArray(data2)) return [];
    return data2.map((a) => ({
      appId: a.app_url,
      name: a.app_name,
      customId: a.custom_id ?? void 0,
      uploadedAt: a.uploaded_at,
      platform: inferPlatform(a.app_name)
    }));
  }
  if (creds.provider === "lambdatest") {
    const auth = basicAuth(creds.username, creds.accessKey);
    const fetchType = async (type) => {
      const res2 = await fetch(`https://manual-api.lambdatest.com/app/list?type=${type}`, {
        headers: { Authorization: auth }
      });
      if (!res2.ok) {
        throw new Error(
          `LambdaTest list failed (${res2.status}): ${(await res2.text()).slice(0, 200)}`
        );
      }
      const payload = await res2.json();
      return (payload.data ?? []).map((a) => {
        const rawId = String(a.app_url ?? a.app_id ?? "");
        return {
          appId: rawId && !rawId.startsWith("lt://") ? `lt://${rawId}` : rawId,
          name: String(a.name ?? a.app_name ?? rawId),
          uploadedAt: a.created_at ? String(a.created_at) : void 0,
          // The bucket itself is the platform - more reliable than the filename.
          platform: type === "ios" ? "iOS" : "Android"
        };
      }).filter((a) => a.appId);
    };
    const [android, ios] = await Promise.all([fetchType("android"), fetchType("ios")]);
    return [...android, ...ios];
  }
  const host = sauceStorageHost(creds.region);
  const res = await fetch(`https://${host}/v1/storage/files?per_page=50`, {
    headers: { Authorization: basicAuth(creds.username, creds.accessKey) }
  });
  if (!res.ok) {
    throw new Error(`Sauce Labs list failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.items ?? []).map((f) => ({
    appId: `storage:${f.id}`,
    name: f.name,
    uploadedAt: f.upload_timestamp ? new Date(f.upload_timestamp * 1e3).toISOString() : void 0,
    platform: inferPlatform(f.name, f.kind)
  }));
}
async function uploadFarmApp(creds, payload) {
  if (!creds.username || !creds.accessKey) {
    throw new Error("Device-farm credentials are required to upload an app.");
  }
  if (!payload.file && !payload.url) {
    throw new Error("Provide either a file or a public URL to upload.");
  }
  if (creds.provider === "browserstack") {
    const form2 = new FormData();
    if (payload.file) {
      form2.append("file", new Blob([payload.file.buffer]), payload.file.filename);
    } else if (payload.url) {
      form2.append("url", payload.url);
    }
    if (payload.customId) form2.append("custom_id", payload.customId);
    const res2 = await fetch("https://api-cloud.browserstack.com/app-automate/upload", {
      method: "POST",
      headers: { Authorization: basicAuth(creds.username, creds.accessKey) },
      body: form2
    });
    if (!res2.ok) {
      throw new Error(`BrowserStack upload failed (${res2.status}): ${(await res2.text()).slice(0, 300)}`);
    }
    const data2 = await res2.json();
    if (!data2.app_url) throw new Error(data2.error || "BrowserStack upload returned no app_url.");
    return { appId: data2.app_url, name: payload.file?.filename || payload.url || data2.app_url, customId: data2.custom_id };
  }
  if (creds.provider === "lambdatest") {
    const form2 = new FormData();
    if (payload.file) {
      form2.append("appFile", new Blob([payload.file.buffer]), payload.file.filename);
    } else if (payload.url) {
      form2.append("url", payload.url);
    }
    if (payload.customId) form2.append("custom_id", payload.customId);
    form2.append("name", payload.file?.filename || payload.customId || "autopilot-app");
    const res2 = await fetch("https://manual-api.lambdatest.com/app/upload/realDevice", {
      method: "POST",
      headers: { Authorization: basicAuth(creds.username, creds.accessKey) },
      body: form2
    });
    if (!res2.ok) {
      throw new Error(`LambdaTest upload failed (${res2.status}): ${(await res2.text()).slice(0, 300)}`);
    }
    const data2 = await res2.json();
    const appId = data2.app_url || (data2.app_id ? `lt://${data2.app_id}` : "");
    if (!appId) throw new Error(data2.message || "LambdaTest upload returned no app id.");
    return { appId, name: data2.name || payload.file?.filename || appId };
  }
  const host = sauceStorageHost(creds.region);
  if (!payload.file) {
    throw new Error("Sauce Labs upload requires a file (URL upload is not supported).");
  }
  const form = new FormData();
  form.append("payload", new Blob([payload.file.buffer]), payload.file.filename);
  form.append("name", payload.file.filename);
  const res = await fetch(`https://${host}/v1/storage/upload`, {
    method: "POST",
    headers: { Authorization: basicAuth(creds.username, creds.accessKey) },
    body: form
  });
  if (!res.ok) {
    throw new Error(`Sauce Labs upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.item?.id) throw new Error("Sauce Labs upload returned no file id.");
  return { appId: `storage:${data.item.id}`, name: data.item.name };
}

// src/engine/farms/devices.ts
function basicAuth2(user, key) {
  return "Basic " + btoa(`${user}:${key}`);
}
function sauceApiHost(region) {
  const r = (region || "us-west-1").trim();
  if (r.startsWith("eu")) return "api.eu-central-1.saucelabs.com";
  if (r.startsWith("us-east")) return "api.us-east-4.saucelabs.com";
  return "api.us-west-1.saucelabs.com";
}
function addEntry(cat, os, name, version) {
  const key = os.includes("android") ? "Android" : os.includes("ios") ? "iOS" : null;
  if (!key || !name) return;
  const list = cat[key][name] ??= [];
  if (version && !list.includes(version)) list.push(version);
}
function sortCatalog(cat) {
  for (const os of ["Android", "iOS"]) {
    for (const name of Object.keys(cat[os])) {
      cat[os][name].sort((a, b) => parseFloat(b) - parseFloat(a));
    }
  }
  return cat;
}
async function sauceDevices(creds) {
  const host = sauceApiHost(creds.region);
  const auth = basicAuth2(creds.username ?? "", creds.accessKey ?? "");
  const [res, availRes] = await Promise.all([
    fetch(`https://${host}/v1/rdc/devices`, { headers: { Authorization: auth } }),
    fetch(`https://${host}/v1/rdc/devices/available`, { headers: { Authorization: auth } }).catch(
      () => null
    )
  ]);
  if (!res.ok) {
    throw new Error(`Sauce device list failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const items = Array.isArray(data) ? data : data.entities ?? [];
  let available = null;
  if (availRes && availRes.ok) {
    const av = await availRes.json();
    if (Array.isArray(av)) available = new Set(av.map((x) => String(x)));
  }
  const cat = { Android: {}, iOS: {} };
  for (const d of items) {
    const id = String(d.id ?? "");
    if (available && id && !available.has(id)) continue;
    const os = String(d.os ?? "").toLowerCase();
    const name = String(d.name ?? d.deviceName ?? "");
    const version = String(d.osVersion ?? d.os_version ?? "");
    addEntry(cat, os, name, version);
  }
  return sortCatalog(cat);
}
function browserStackDevices() {
  return sortCatalog({
    Android: {
      "Google Pixel 8 Pro": ["14.0"],
      "Google Pixel 8": ["14.0"],
      "Google Pixel 7": ["13.0"],
      "Google Pixel 6": ["12.0"],
      "Samsung Galaxy S23 Ultra": ["13.0"],
      "Samsung Galaxy S22 Ultra": ["12.0"],
      "Samsung Galaxy S21": ["12.0", "11.0"],
      "Samsung Galaxy A52": ["11.0"],
      "OnePlus 11R": ["13.0"],
      "Xiaomi Redmi Note 11": ["11.0"]
    },
    iOS: {
      "iPhone 15 Pro Max": ["17"],
      "iPhone 15": ["17"],
      "iPhone 14 Pro": ["16"],
      "iPhone 14": ["16"],
      "iPhone 13": ["15", "16"],
      "iPhone 12": ["14", "16"],
      "iPhone SE 2022": ["15"],
      "iPad Pro 12.9 2022": ["16"]
    }
  });
}
async function lambdaTestDevices(creds) {
  const region = lambdaTestRegion(creds.region).toLowerCase();
  const res = await fetch(
    `https://mobile-api.lambdatest.com/mobile-automation/api/v1/list?region=${region}`,
    { headers: { Authorization: basicAuth2(creds.username ?? "", creds.accessKey ?? "") } }
  );
  if (!res.ok) {
    throw new Error(
      `LambdaTest device list failed (${res.status}): ${(await res.text()).slice(0, 200)}`
    );
  }
  const data = await res.json();
  const cat = { Android: {}, iOS: {} };
  const ingest = (osHint, entries) => {
    if (!Array.isArray(entries)) return;
    for (const raw of entries) {
      const os = String(
        raw.platformName ?? raw.platform ?? raw.os ?? raw.osName ?? osHint
      ).toLowerCase();
      const name = String(raw.deviceName ?? raw.device_name ?? raw.name ?? "");
      const versions = raw.versions ?? raw.version ?? raw.osVersion ?? raw.platformVersion;
      if (Array.isArray(versions)) {
        for (const v of versions) {
          const version = typeof v === "object" && v ? String(v.version ?? "") : String(v);
          addEntry(cat, os, name, version);
        }
      } else if (versions != null) {
        addEntry(cat, os, name, String(versions));
      }
    }
  };
  if (Array.isArray(data)) {
    ingest("android", data);
  } else if (data && typeof data === "object") {
    const obj = data;
    ingest("android", obj.android ?? obj.Android);
    ingest("ios", obj.ios ?? obj.iOS);
    ingest("android", obj.devices);
  }
  return sortCatalog(cat);
}
async function listFarmDevices(creds) {
  if (creds.provider === "custom") {
    return { Android: {}, iOS: {} };
  }
  if (creds.provider === "saucelabs") {
    if (!creds.username || !creds.accessKey) {
      throw new Error("Sauce Labs username and access key are required to list devices.");
    }
    return sauceDevices(creds);
  }
  if (creds.provider === "lambdatest") {
    if (!creds.username || !creds.accessKey) {
      throw new Error("LambdaTest username and access key are required to list devices.");
    }
    return lambdaTestDevices(creds);
  }
  return browserStackDevices();
}

// src/engine/workflow/stepScript.ts
var FIRST_NAMES = ["Ayanda", "Thabo", "Lerato", "Sipho", "Nadia", "Kayla", "Riaan", "Zanele", "Devan", "Imke"];
var LAST_NAMES = ["Naidoo", "Botha", "Mkhize", "Pillay", "Venter", "Dlamini", "Fourie", "Khumalo", "Jacobs", "Nel"];
function randInt(max) {
  return Math.floor(Math.random() * max);
}
function pick(list) {
  return list[randInt(list.length)];
}
function formatDate(d, pattern) {
  const p2 = (n) => String(n).padStart(2, "0");
  const month = p2(d.getMonth() + 1);
  const hasTime = /HH|ss/.test(pattern || "");
  let out = (pattern || "dd/MM/yyyy").replace(/yyyy/g, String(d.getFullYear())).replace(/yy/g, p2(d.getFullYear() % 100)).replace(/MM/g, month);
  if (!hasTime) out = out.replace(/mm/g, month);
  return out.replace(/dd/g, p2(d.getDate())).replace(/HH/g, p2(d.getHours())).replace(/mm/g, p2(d.getMinutes())).replace(/ss/g, p2(d.getSeconds()));
}
function adultBirthDate() {
  const now = /* @__PURE__ */ new Date();
  const latest = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate() - 1);
  const earliest = new Date(now.getFullYear() - 70, now.getMonth(), now.getDate());
  const span = latest.getTime() - earliest.getTime();
  return new Date(earliest.getTime() + Math.floor(Math.random() * span));
}
function repeatRandom(n, alphabet) {
  let out = "";
  for (let i = 0; i < n; i += 1) out += alphabet[randInt(alphabet.length)];
  return out;
}
function regenerateRecordedText(text, template, oldGen, newGen) {
  let out = text;
  for (let i = 0; i < oldGen.length; i += 1) {
    const before = oldGen[i];
    const after = newGen[i];
    if (!after || before.token !== after.token) continue;
    if (template && !template.includes(before.token)) continue;
    if (!before.value || !out.includes(before.value)) continue;
    out = out.replace(before.value, after.value);
  }
  return out;
}
function expandTokensWithData(lines) {
  const memo = /* @__PURE__ */ new Map();
  const generate = (token, kind, arg) => {
    const cached = memo.get(token);
    if (cached !== void 0) return cached;
    const n = Number(arg) || 0;
    let value;
    switch (kind.toLowerCase()) {
      case "digits":
        value = repeatRandom(n || 6, "0123456789");
        break;
      case "letters":
        value = repeatRandom(n || 6, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        break;
      case "alnum":
        value = repeatRandom(n || 8, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
        break;
      case "email":
        value = `autopilot.${repeatRandom(8, "abcdefghijklmnopqrstuvwxyz0123456789")}@example.com`;
        break;
      case "firstname":
        value = pick(FIRST_NAMES);
        break;
      case "lastname":
        value = pick(LAST_NAMES);
        break;
      case "uuid":
        value = `${repeatRandom(8, "0123456789abcdef")}-${repeatRandom(4, "0123456789abcdef")}-${repeatRandom(12, "0123456789abcdef")}`;
        break;
      case "timestamp":
        value = String(Date.now());
        break;
      case "date":
        value = formatDate(/* @__PURE__ */ new Date(), arg || "dd/MM/yyyy");
        break;
      case "dob":
        value = formatDate(adultBirthDate(), arg || "dd/MM/yyyy");
        break;
      case "nameoncard":
        value = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
        break;
      case "cardnumber":
        value = arg || "4111111111111111";
        break;
      case "expiry": {
        const later = /* @__PURE__ */ new Date();
        later.setFullYear(later.getFullYear() + 3);
        value = formatDate(later, arg || "MM/yy");
        break;
      }
      case "cvv":
        value = repeatRandom(n || 3, "0123456789");
        break;
      case "oneof":
      case "pick": {
        const options = arg.split("|").map((o) => o.trim()).filter(Boolean);
        value = options.length ? pick(options) : token;
        break;
      }
      default:
        value = token;
    }
    memo.set(token, value);
    return value;
  };
  const generated = [];
  const out = lines.map(
    (line) => (line ?? "").replace(
      /\{\{\s*([a-zA-Z]+)\s*(?::\s*([^}#]*?)\s*)?(?:#[^}]*)?\}\}/g,
      (token, kind, arg) => {
        const value = generate(token, kind, arg ?? "");
        if (value !== token && !generated.some((g) => g.token === token)) {
          generated.push({ token, kind: kind.toLowerCase(), arg: arg ?? "", value });
        }
        return value;
      }
    )
  );
  return { lines: out, generated };
}
var IF_BLOCK = /^if\b\s*(.+?)\s*:?\s*$/i;
var IF_INLINE = /^if\b\s*(.+?)\s*(?:,|:|\bthen\b)\s*(.+?)\s*$/i;
var END_BLOCK = /^(?:end\s*if|endif|end)\s*\.?\s*$/i;
var OPTIONAL = /^(?:optional|if\s+present|if\s+shown)\s*[:\-]\s*(.+?)\s*$/i;
function tidy(text) {
  return text.replace(/\s*\.\s*$/, "").trim();
}
function parseStepScriptWithData(rawLines) {
  const { lines, generated } = expandTokensWithData(rawLines);
  const rawByExpanded = /* @__PURE__ */ new Map();
  lines.forEach((line, i) => rawByExpanded.set(i, rawLines[i] ?? line));
  const out = [];
  let openCondition = null;
  let group = 0;
  for (let li = 0; li < lines.length; li += 1) {
    const raw = lines[li];
    const template = (rawByExpanded.get(li) ?? raw ?? "").trim();
    const line = (raw ?? "").trim();
    if (!line) continue;
    if (END_BLOCK.test(line)) {
      openCondition = null;
      continue;
    }
    const optional = OPTIONAL.exec(line);
    if (optional) {
      out.push({ description: tidy(optional[1]), optional: true, template });
      continue;
    }
    const inline = IF_INLINE.exec(line);
    if (inline && inline[2]) {
      group += 1;
      out.push({
        description: tidy(inline[2]),
        condition: tidy(inline[1]),
        conditionGroup: group,
        template
      });
      continue;
    }
    const block = IF_BLOCK.exec(line);
    if (block) {
      group += 1;
      openCondition = tidy(block[1]);
      continue;
    }
    out.push(
      openCondition ? { description: tidy(line), condition: openCondition, conditionGroup: group, template } : { description: tidy(line), template }
    );
  }
  return { steps: out, generated };
}

// src/background.ts
var Emitter = class {
  listeners = /* @__PURE__ */ new Set();
  on(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  emit(v) {
    for (const cb of [...this.listeners]) cb(v);
  }
};
var SessionRunner = class {
  constructor(request) {
    this.request = request;
  }
  events = [];
  emitter = new Emitter();
  started = false;
  batchManaged = false;
  emit(event) {
    if (event.type !== "frame") this.events.push(event);
    this.emitter.emit(event);
    if (event.type === "done" || event.type === "error") {
      const state = getSession(sessionIdOf(this));
      if (state) void persistSession(state);
    }
  }
  subscribe(cb) {
    for (const e of this.events) cb(e);
    return this.emitter.on(cb);
  }
  begin(run) {
    if (this.started) return;
    this.started = true;
    run((e) => this.emit(e)).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ type: "error", message });
    });
  }
};
var runners = /* @__PURE__ */ new Map();
function sessionIdOf(runner) {
  for (const [id, r] of runners) if (r === runner) return id;
  return "";
}
var BatchRunner = class {
  constructor(runIds) {
    this.runIds = runIds;
  }
  started = false;
  settled = /* @__PURE__ */ new Set();
  emitter = new Emitter();
  done = false;
  onDone(cb) {
    if (this.done) {
      cb();
      return () => void 0;
    }
    return this.emitter.on(cb);
  }
  markSettled(runId) {
    if (this.settled.has(runId)) return;
    this.settled.add(runId);
    if (this.settled.size >= this.runIds.length && !this.done) {
      this.done = true;
      this.emitter.emit();
    }
  }
  begin(cap, run) {
    if (this.started) return;
    this.started = true;
    if (this.runIds.length === 0) {
      this.done = true;
      this.emitter.emit();
      return;
    }
    let next = 0;
    let active = 0;
    const launch = () => {
      while (active < cap && next < this.runIds.length) {
        const runId = this.runIds[next++];
        const runner = runners.get(runId);
        const state = getSession(runId);
        if (!runner || !state) {
          this.markSettled(runId);
          continue;
        }
        active += 1;
        const off = runner.subscribe((event) => {
          if (event.type === "done" || event.type === "error") {
            off();
            active -= 1;
            this.markSettled(runId);
            launch();
          }
        });
        runner.begin(async (emit) => {
          await run(state, runner.request, emit);
        });
      }
    };
    launch();
  }
};
var batchRunners = /* @__PURE__ */ new Map();
var SESSION_KEY_PREFIX = "mta_s_";
var MAX_PERSISTED_SESSIONS = 10;
function withoutScreenshots(state) {
  return {
    ...state,
    steps: state.steps.map((s) => ({
      ...s,
      beforeScreenshot: void 0,
      afterScreenshot: void 0,
      elementShot: void 0
    }))
  };
}
async function prunePersistedSessions(keepId) {
  try {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter(
      (k) => k.startsWith(SESSION_KEY_PREFIX) && k !== `${SESSION_KEY_PREFIX}${keepId}`
    );
    if (keys.length < MAX_PERSISTED_SESSIONS) return;
    const ordered = keys.sort(
      (a, b) => (all[a]?.createdAt ?? 0) - (all[b]?.createdAt ?? 0)
    );
    const drop = ordered.slice(0, ordered.length - (MAX_PERSISTED_SESSIONS - 1));
    if (drop.length) await chrome.storage.local.remove(drop);
  } catch {
  }
}
async function persistSession(state) {
  const key = `${SESSION_KEY_PREFIX}${state.id}`;
  await prunePersistedSessions(state.id);
  try {
    await chrome.storage.local.set({ [key]: state });
    return;
  } catch (error) {
    console.warn(
      "[autopilot] full session did not fit in storage, retrying without screenshots:",
      error
    );
  }
  try {
    await chrome.storage.local.set({ [key]: withoutScreenshots(state) });
    console.warn("[autopilot] session persisted without screenshots (downloads still work).");
  } catch (error) {
    console.error(
      "[autopilot] could not persist the session - its downloads will only work while this service worker stays alive:",
      error
    );
  }
}
async function loadSession(id) {
  const inMemory = getSession(id);
  if (inMemory) return inMemory;
  try {
    const data = await chrome.storage.local.get(`mta_s_${id}`);
    const state = data[`mta_s_${id}`];
    if (state) saveSession(state);
    return state;
  } catch {
    return void 0;
  }
}
function resolveUipathConfig(u = {}) {
  return {
    mode: u.mode || "clientCredentials",
    baseUrl: u.baseUrl || env.uipath.baseUrl,
    orgName: u.orgName || env.uipath.orgName,
    tenantName: u.tenantName || env.uipath.tenantName,
    clientId: u.clientId || env.uipath.clientId,
    clientSecret: u.clientSecret || env.uipath.clientSecret,
    scope: u.scope || env.uipath.scope,
    bearerToken: u.bearerToken || env.uipath.bearerToken,
    llmModel: u.llmModel || env.uipath.llmModel
  };
}
function resolveFarmCreds(input) {
  const provider = input?.provider || env.farm.provider;
  return {
    provider,
    region: input?.region || env.farm.sauceRegion,
    hubUrl: input?.hubUrl,
    username: input?.username || (provider === "browserstack" ? env.farm.browserstackUser : env.farm.sauceUser),
    accessKey: input?.accessKey || (provider === "browserstack" ? env.farm.browserstackKey : env.farm.sauceKey)
  };
}
function mergeWithEnvDefaults(req) {
  return { ...req, farm: resolveFarmCreds(req.farm), uipath: resolveUipathConfig(req.uipath) };
}
function seedFromRecording(state, source) {
  const oldGen = source.generatedData ?? [];
  const newGen = state.generatedData ?? [];
  const refresh = (text, template) => text === void 0 ? void 0 : regenerateRecordedText(text, template, oldGen, newGen);
  state.steps = source.steps.filter((s) => s.action).map((s, i) => ({
    index: i,
    description: refresh(s.description, s.descriptionTemplate) ?? s.description,
    // Carried through so exports from a replay keep per-step token scoping.
    descriptionTemplate: s.descriptionTemplate,
    status: "pending",
    action: s.action ? { ...s.action, text: refresh(s.action.text, s.descriptionTemplate) } : s.action,
    selector: s.selector,
    element: s.element,
    condition: s.condition,
    conditionGroup: s.conditionGroup,
    optional: s.optional
  }));
  state.title = `${source.title} (replay)`;
  return state;
}
function buildInitialState(id, req) {
  const parsed = parseStepScriptWithData(req.testSteps ?? []);
  const platform = req.device?.platform || "Android";
  const target2 = req.device?.connectionTarget ?? "app";
  const provider = req.farm.provider;
  const deviceLabel = `${req.device?.deviceName || "Sample Device"} \xB7 ${platform} ${req.device?.osVersion || ""}`.trim();
  const nativeBuildId = platform === "Android" ? req.app?.android?.buildId : req.app?.ios?.buildId;
  const appLabel = target2 === "browser" ? req.app?.startUrl || "ACME Shopping (sample web)" : req.app?.appName || nativeBuildId || "ACME Shopping (sample)";
  const title = (req.title || "").trim() || appLabel;
  const mobile = {
    platformName: platform,
    platformVersion: req.device?.osVersion || "",
    deviceName: req.device?.deviceName || "",
    automationName: platform === "Android" ? "UiAutomator2" : "XCUITest",
    provider,
    app: target2 === "browser" ? void 0 : nativeBuildId || void 0,
    startUrl: target2 === "browser" ? req.app?.startUrl || void 0 : void 0,
    browserName: target2 === "browser" ? platform === "iOS" ? "safari" : req.device?.browser || "chrome" : void 0
  };
  return {
    id,
    title,
    mobile,
    mode: "simulated",
    status: "created",
    platform,
    target: target2,
    provider,
    deviceLabel,
    appLabel,
    llmModel: req.uipath.llmModel || env.uipath.llmModel,
    llmLive: false,
    gpsCoordinates: req.device?.gpsCoordinates?.trim() || void 0,
    createdAt: Date.now(),
    currentStep: 0,
    generatedData: parsed.generated.length ? parsed.generated : void 0,
    // Conditional syntax (`If … / End if`, `Optional:`) is parsed here so the
    // orchestrator can gate steps without re-parsing.
    steps: parsed.steps.map((parsed2, index) => ({
      index,
      description: parsed2.description,
      descriptionTemplate: parsed2.template,
      status: "pending",
      condition: parsed2.condition,
      conditionGroup: parsed2.conditionGroup,
      optional: parsed2.optional
    }))
  };
}
function slug(s) {
  return (s || "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}
function fileStem(state) {
  const title = slug(state.title) || "MobileTest";
  const device = slug((state.deviceLabel || "").split("\xB7")[0]);
  return [title, device, state.id.slice(-6)].filter(Boolean).join("_");
}
function sameHost(a, b) {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}
function parseCoordinates(value) {
  if (!value) return null;
  const m = value.split(",").map((p) => Number(p.trim()));
  if (m.length !== 2 || !Number.isFinite(m[0]) || !Number.isFinite(m[1])) return null;
  if (Math.abs(m[0]) > 90 || Math.abs(m[1]) > 180) return null;
  return { latitude: m[0], longitude: m[1] };
}
async function executeRun(state, request, emit) {
  state.status = "connecting";
  saveSession(state);
  emit({ type: "session", session: state });
  emit({ type: "log", level: "info", message: "Provisioning device session\u2026", at: Date.now() });
  let auth = null;
  if (isUiPathConfigured(request.uipath)) {
    try {
      auth = await resolveUiPathToken(request.uipath);
      emit({ type: "log", level: "info", message: "UiPath authenticated; LLM Gateway will plan actions.", at: Date.now() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit({ type: "log", level: "warn", message: `${message} Falling back to the built-in heuristic planner.`, at: Date.now() });
    }
  } else {
    emit({ type: "log", level: "info", message: "No UiPath credentials provided; using the built-in heuristic planner.", at: Date.now() });
  }
  const { driver, mode, connection } = await createSession({
    creds: request.farm,
    device: request.device,
    app: request.app
  });
  state.mode = mode;
  if (connection) state.connection = connection;
  saveSession(state);
  emit({ type: "session", session: state });
  emit({
    type: "log",
    level: "info",
    message: mode === "live" ? `Live session started on ${state.provider} (${state.deviceLabel}).` : "No device-farm credentials - running the bundled simulated session.",
    at: Date.now()
  });
  const coords = parseCoordinates(request.device?.gpsCoordinates);
  if (mode === "live" && coords) {
    try {
      const reported = await driver.setGeoLocation(coords.latitude, coords.longitude);
      emit({
        type: "log",
        level: reported ? "info" : "warn",
        message: reported ? `\u{1F4CD} Device GPS set to ${coords.latitude}, ${coords.longitude} - device reports ${reported.latitude}, ${reported.longitude}.` : `\u{1F4CD} Device GPS set to ${coords.latitude}, ${coords.longitude} - accepted, but this device can't report its position back, so confirm from the app itself (e.g. the address "use my current location" resolves to).`,
        at: Date.now()
      });
    } catch (error) {
      emit({
        type: "log",
        level: "warn",
        message: `Could not set the device GPS (${error instanceof Error ? error.message : String(error)}). "Use my current location" will use the device's real position.`,
        at: Date.now()
      });
    }
  }
  if (mode === "live" && state.target === "browser") {
    const url = request.app.startUrl?.trim();
    if (!url) {
      emit({ type: "log", level: "warn", message: "No start URL provided - the browser will stay on its home page.", at: Date.now() });
    } else {
      emit({
        type: "log",
        level: "info",
        message: `Opening ${url} in ${state.platform === "iOS" ? "Safari" : "the device browser"}\u2026`,
        at: Date.now()
      });
      let landed = "";
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await driver.navigateTo(url);
          landed = await driver.currentUrl();
          if (sameHost(landed, url)) break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit({ type: "log", level: "warn", message: `Navigation attempt ${attempt} failed: ${message}`, at: Date.now() });
        }
      }
      if (sameHost(landed, url)) {
        emit({ type: "log", level: "info", message: `Browser loaded ${landed}.`, at: Date.now() });
      } else if (landed) {
        emit({ type: "log", level: "warn", message: `Browser ended on ${landed} (expected ${url}) - continuing with what's on screen.`, at: Date.now() });
      } else {
        emit({ type: "log", level: "warn", message: `Could not confirm ${url} loaded - continuing; the agent will read whatever is on screen.`, at: Date.now() });
      }
    }
  }
  await runAutomation({
    session: state,
    driver,
    auth,
    llmModel: request.uipath.llmModel || env.uipath.llmModel,
    emit,
    replay: Boolean(request.replayOf)
  });
}
var json = (status, value) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(value)
});
function imageResult(stored) {
  if (!stored) return json(404, { error: "No screenshot for this step." });
  const m = stored.match(/^data:([^;,]+);base64,/);
  return {
    status: 200,
    contentType: m ? m[1] : "image/png",
    isBase64: true,
    body: m ? stored.slice(m[0].length) : stored
  };
}
async function route(req) {
  const path = req.path.split("?")[0].replace(/\/+$/, "");
  const method = (req.method || "GET").toUpperCase();
  const parse = () => req.body ? JSON.parse(req.body) : {};
  try {
    if (method === "GET" && path === "/api/health") return json(200, { ok: true });
    if (method === "GET" && path === "/api/defaults") {
      return json(200, {
        uipath: {
          baseUrl: env.uipath.baseUrl,
          orgName: env.uipath.orgName,
          tenantName: env.uipath.tenantName,
          scope: env.uipath.scope,
          llmModel: env.uipath.llmModel,
          hasClientCredentials: false,
          hasBearer: false
        },
        farm: {
          provider: env.farm.provider,
          sauceRegion: env.farm.sauceRegion,
          hasBrowserstack: false,
          hasSauce: false
        }
      });
    }
    if (method === "POST" && path === "/api/uipath/validate") {
      const u = resolveUipathConfig(parse());
      if (!isUiPathConfigured(u)) {
        return json(400, {
          ok: false,
          error: u.mode === "bearer" ? "Provide UiPath org, tenant and a bearer/PAT token." : "Provide UiPath org, tenant, client id and client secret."
        });
      }
      try {
        const auth = await resolveUiPathToken(u);
        try {
          const r = await chatComplete(
            auth,
            [{ role: "user", content: "Reply with the single word: ok" }],
            { model: u.llmModel, temperature: 0 }
          );
          return json(200, { ok: true, llm: true, model: r.model, basePath: r.basePathUsed });
        } catch (error) {
          return json(200, {
            ok: true,
            llm: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      } catch (error) {
        return json(200, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (method === "POST" && path === "/api/uipath/models") {
      const u = resolveUipathConfig(parse());
      if (!isUiPathConfigured(u)) return json(400, { error: "Provide UiPath credentials first." });
      const auth = await resolveUiPathToken(u);
      const models = await listWorkingModels(auth);
      return json(200, { models });
    }
    if (method === "POST" && path === "/api/farm/devices") {
      const creds = resolveFarmCreds(parse());
      const devices = await listFarmDevices(creds);
      return json(200, { devices });
    }
    if (method === "POST" && path === "/api/farm/apps") {
      const creds = resolveFarmCreds(parse());
      if (!creds.username || !creds.accessKey) {
        return json(400, { error: "Provide device-farm username and access key." });
      }
      const apps = await listFarmApps(creds);
      return json(200, { apps });
    }
    if (method === "POST" && path === "/api/farm/upload") {
      const fields = req.fields ?? {};
      const creds = resolveFarmCreds(fields);
      if (!creds.username || !creds.accessKey) {
        return json(400, { error: "Provide device-farm username and access key." });
      }
      if (!req.file && !fields.url) {
        return json(400, { error: "Attach a file or provide a public URL." });
      }
      const app = await uploadFarmApp(creds, {
        file: req.file ? { buffer: req.file.bytes, filename: req.file.name } : void 0,
        url: fields.url,
        customId: fields.customId
      });
      return json(200, { app });
    }
    if (method === "POST" && path === "/api/sessions") {
      const body = parse();
      if (!body || !Array.isArray(body.testSteps) || body.testSteps.length === 0) {
        return json(400, { error: "At least one test step is required." });
      }
      const merged = mergeWithEnvDefaults(body);
      const id = newSessionId();
      let state = buildInitialState(id, merged);
      if (merged.replayOf) {
        const source = await loadSession(merged.replayOf);
        if (!source) return json(404, { error: "The run to replay was not found." });
        state = seedFromRecording(state, source);
      }
      saveSession(state);
      runners.set(id, new SessionRunner(merged));
      return json(201, { session: state });
    }
    if (method === "POST" && path === "/api/batches") {
      const body = parse();
      const runs = Array.isArray(body?.runs) ? body.runs : [];
      if (runs.length === 0) return json(400, { error: "A batch needs at least one run." });
      const runIds = [];
      const sessions2 = [];
      for (const run of runs) {
        if (!Array.isArray(run.testSteps) || run.testSteps.filter((s) => s.trim()).length === 0) continue;
        const merged = mergeWithEnvDefaults(run);
        const id = newSessionId();
        const state = buildInitialState(id, merged);
        saveSession(state);
        const runner = new SessionRunner(merged);
        runner.batchManaged = true;
        runners.set(id, runner);
        runIds.push(id);
        sessions2.push(state);
      }
      if (runIds.length === 0) {
        return json(400, { error: "No valid runs (each run needs at least one step)." });
      }
      const batchId = newBatchId();
      saveBatch({ id: batchId, runIds, createdAt: Date.now() });
      batchRunners.set(batchId, new BatchRunner(runIds));
      const effectiveCap = env.farm.maxParallel > 0 ? env.farm.maxParallel : runIds.length;
      return json(201, { batchId, runIds, sessions: sessions2, maxParallel: effectiveCap });
    }
    let m = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      if (!state) return json(404, { error: "Session not found." });
      return json(200, { session: state });
    }
    m = path.match(/^\/api\/sessions\/([^/]+)\/control$/);
    if (method === "POST" && m) {
      const body = parse();
      const control = getRunControl(m[1]);
      switch (body?.action) {
        case "stop":
          control.stop();
          break;
        case "pause":
          control.requestPause();
          break;
        case "resume":
        case "skip":
          control.resume({ kind: "skip" });
          break;
        case "retry":
          control.resume({ kind: "retry", targetIndex: body.targetIndex });
          break;
        case "pauseOnFailure":
          control.pauseOnFailure = Boolean(body.value);
          break;
        default:
          return json(400, { error: "Unknown control action." });
      }
      return json(200, { ok: true, paused: control.paused, pauseOnFailure: control.pauseOnFailure });
    }
    m = path.match(/^\/api\/sessions\/([^/]+)\/catalog$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      if (!state) return json(404, { error: "Session not found." });
      return json(200, { catalog: buildSelectorCatalog(state), actionLog: buildActionLog(state) });
    }
    m = path.match(/^\/api\/sessions\/([^/]+)\/steps\/(\d+)\/screenshot$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      const step = state?.steps.find((s) => s.index === Number(m[2]));
      return imageResult(step?.afterScreenshot || step?.beforeScreenshot);
    }
    m = path.match(/^\/api\/sessions\/([^/]+)\/steps\/(\d+)\/elementshot$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      const step = state?.steps.find((s) => s.index === Number(m[2]));
      return imageResult(step?.elementShot);
    }
    m = path.match(/^\/api\/sessions\/([^/]+)\/workflow\.xaml$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      if (!state) return json(404, { error: "Session not found." });
      return {
        status: 200,
        contentType: "application/xml",
        contentDisposition: `attachment; filename="${fileStem(state)}.xaml"`,
        body: buildXaml(state)
      };
    }
    m = path.match(/^\/api\/sessions\/([^/]+)\/workflow\.cs$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      if (!state) return json(404, { error: "Session not found." });
      const flavor = /[?&]flavor=(http|mdm|hybrid)\b/.exec(req.path)?.[1] ?? "hybrid";
      const body = flavor === "http" ? buildCodedWorkflow(state) : flavor === "mdm" ? buildMdmCodedWorkflow(state) : buildCodedWorkflow(state, { attachToMdm: true });
      const suffix = flavor === "http" ? "-appium" : flavor === "mdm" ? "-mdm" : "-mdm-http";
      return {
        status: 200,
        contentType: "text/plain; charset=utf-8",
        contentDisposition: `attachment; filename="${fileStem(state)}${suffix}.cs"`,
        body
      };
    }
    m = path.match(/^\/api\/sessions\/([^/]+)\/actionlog\.json$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      if (!state) return json(404, { error: "Session not found." });
      return {
        status: 200,
        contentType: "application/json",
        contentDisposition: `attachment; filename="${fileStem(state)}.json"`,
        body: JSON.stringify(buildActionLog(state), null, 2)
      };
    }
    return json(404, { error: `No such endpoint: ${method} ${path}` });
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : String(error) });
  }
}
async function openStream(path, send) {
  const cleanPath = path.split("?")[0].replace(/\/+$/, "");
  let m = cleanPath.match(/^\/api\/sessions\/([^/]+)\/events$/);
  if (m) {
    const id = m[1];
    const runner = runners.get(id);
    if (!runner) {
      const state2 = await loadSession(id);
      if (state2) {
        send("data", JSON.stringify({ type: "session", session: state2 }));
        if (state2.status === "completed" || state2.status === "error") {
          send("data", JSON.stringify({ type: "done", session: state2 }));
        }
        send("end");
        return () => void 0;
      }
      send("error", "Session not found.");
      return () => void 0;
    }
    const state = getSession(id);
    const off = runner.subscribe((event) => send("data", JSON.stringify(event)));
    if (!runner.batchManaged) {
      runner.begin(async (emit) => {
        await executeRun(state, runner.request, emit);
      });
    }
    return off;
  }
  m = cleanPath.match(/^\/api\/batches\/([^/]+)\/events$/);
  if (m) {
    const batch = getBatch(m[1]);
    if (!batch) {
      send("error", "Batch not found.");
      return () => void 0;
    }
    const unsubs = [];
    for (const runId of batch.runIds) {
      const runner = runners.get(runId);
      if (!runner) continue;
      unsubs.push(runner.subscribe((event) => send("data", JSON.stringify({ runId, event }))));
    }
    const controller = batchRunners.get(batch.id) ?? new BatchRunner(batch.runIds);
    batchRunners.set(batch.id, controller);
    unsubs.push(controller.onDone(() => send("data", JSON.stringify({ batchDone: true }))));
    const cap = env.farm.maxParallel > 0 ? env.farm.maxParallel : batch.runIds.length;
    controller.begin(cap, executeRun);
    return () => unsubs.forEach((u) => u());
  }
  send("error", `No such stream: ${cleanPath}`);
  return () => void 0;
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
var uploads = /* @__PURE__ */ new Map();
function toWireResult(r) {
  return {
    ok: true,
    status: r.status,
    contentType: r.contentType ?? "",
    contentDisposition: r.contentDisposition ?? "",
    body: r.body,
    isBase64: r.isBase64 ?? false
  };
}
async function finishUpload(id) {
  const u = uploads.get(id);
  uploads.delete(id);
  if (!u) return { ok: false, error: "Unknown upload." };
  try {
    let file;
    if (u.chunks.length > 0) {
      const parts = u.chunks.map((c) => base64ToBytes(c ?? ""));
      const total = parts.reduce((n, p) => n + p.length, 0);
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const p of parts) {
        bytes.set(p, offset);
        offset += p.length;
      }
      file = { bytes, name: u.req.fileName || "upload.bin" };
    }
    const result = await route({ method: "POST", path: u.req.path, fields: u.req.fields, file });
    return toWireResult(result);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
chrome.runtime.onMessage.addListener(
  (msg, _sender, sendResponse) => {
    if (msg.type === "fetch" && msg.req) {
      const r = msg.req;
      route({ method: r.method ?? "GET", path: r.path, body: r.body }).then(
        (result) => sendResponse(toWireResult(result)),
        (error) => sendResponse({ ok: false, error: String(error?.message || error) })
      );
      return true;
    }
    if (msg.type === "upload-begin" && msg.id && msg.req) {
      const req = msg.req;
      uploads.set(msg.id, { req, chunks: new Array(req.totalChunks).fill(null), received: 0 });
      if (req.totalChunks === 0) {
        void finishUpload(msg.id).then((result) => sendResponse({ final: true, result }));
        return true;
      }
      sendResponse({ final: false });
      return false;
    }
    if (msg.type === "upload-chunk" && msg.id) {
      const u = uploads.get(msg.id);
      if (!u) {
        sendResponse({ final: true, result: { ok: false, error: "Unknown upload." } });
        return false;
      }
      if (u.chunks[msg.seq ?? 0] == null) {
        u.chunks[msg.seq ?? 0] = msg.data ?? "";
        u.received++;
      }
      if (u.received === u.chunks.length) {
        void finishUpload(msg.id).then((result) => sendResponse({ final: true, result }));
        return true;
      }
      sendResponse({ final: false });
      return false;
    }
    return false;
  }
);
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "mta-stream") return;
  let cleanup = null;
  let closed = false;
  const keepAlive = setInterval(() => {
    if (closed) return;
    try {
      port.postMessage({ event: "ping" });
      void chrome.storage.local.get("mta_keepalive");
    } catch {
    }
  }, 2e4);
  port.onDisconnect.addListener(() => {
    closed = true;
    clearInterval(keepAlive);
    cleanup?.();
  });
  port.onMessage.addListener((m) => {
    if (!m.path) return;
    void openStream(m.path, (event, data) => {
      if (closed) return;
      try {
        if (event === "data") port.postMessage({ event: "data", data });
        else if (event === "end") {
          clearInterval(keepAlive);
          port.postMessage({ event: "end" });
        } else {
          clearInterval(keepAlive);
          port.postMessage({ event: "error", message: data ?? "stream error" });
        }
      } catch {
      }
    }).then((off) => {
      cleanup = off;
      if (closed) off();
    });
  });
});
