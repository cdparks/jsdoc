/*global env: true */
/**
    @overview
    @author Michael Mathews <micmath@gmail.com>
    @license Apache License 2.0 - See file 'LICENSE.md' in this project.
 */

/**
    Functionality related to JSDoc tags.
    @module jsdoc/tag
    @requires jsdoc/tag/dictionary
    @requires jsdoc/tag/validator
    @requires jsdoc/tag/type
 */
'use strict';

var jsdoc = {
    tag: {
        dictionary: require('jsdoc/tag/dictionary'),
        validator: require('jsdoc/tag/validator'),
        type: require('jsdoc/tag/type')
    },
    util: {
        logger: require('jsdoc/util/logger')
    }
};
var path = require('jsdoc/path');
var util = require('util');

// Check whether the text is the same as a symbol name with leading or trailing whitespace. If so,
// the text cannot be trimmed.
function textIsUntrimmable(text, meta) {
    return meta && meta.code && meta.code.name === text && text.match(/(?:^\s+)|(?:\s+$)/);
}

function trim(text, opts, meta) {
    var indentMatcher;
    var match;

    opts = opts || {};
    text = text || '';

    if ( textIsUntrimmable(text, meta) ) {
        text = util.format('"%s"', text);
    }
    else if (opts.keepsWhitespace) {
        text = text.replace(/^[\n\r\f]+|[\n\r\f]+$/g, '');
        if (opts.removesIndent) {
            match = text.match(/^([ \t]+)/);
            if (match && match[1]) {
                indentMatcher = new RegExp('^' + match[1], 'gm');
                text = text.replace(indentMatcher, '');
            }
        }
    }
    else {
        text = text.replace(/^\s+|\s+$/g, '');
    }

    return text;
}

function addHiddenProperty(obj, propName, propValue) {
    Object.defineProperty(obj, propName, {
        value: propValue,
        writable: true,
        enumerable: !!global.env.opts.debug,
        configurable: true
    });
}

function processTagText(tag, tagDef) {
    var tagType;

    if (tagDef.onTagText) {
        tag.text = tagDef.onTagText(tag.text);
    }

    if (tagDef.canHaveType || tagDef.canHaveName) {
        /** The value property represents the result of parsing the tag text. */
        tag.value = {};

        tagType = jsdoc.tag.type.parse(tag.text, tagDef.canHaveName, tagDef.canHaveType);

        // It is possible for a tag to *not* have a type but still have
        // optional or defaultvalue, e.g. '@param [foo]'.
        // Although tagType.type.length == 0 we should still copy the other properties.
        if (tagType.type) {
            if (tagType.type.length) {
                tag.value.type = {
                    names: tagType.type
                };
                addHiddenProperty(tag.value.type, 'parsedType', tagType.parsedType);
            }
            tag.value.optional = tagType.optional;
            tag.value.nullable = tagType.nullable;
            tag.value.variable = tagType.variable;
            tag.value.defaultvalue = tagType.defaultvalue;
        }

        if (tagType.text && tagType.text.length) {
            tag.value.description = tagType.text;
        }

        if (tagDef.canHaveName) {
            // note the dash is a special case: as a param name it means "no name"
            if (tagType.name && tagType.name !== '-') { tag.value.name = tagType.name; }
        }
    }
    else {
        tag.value = tag.text;
    }
}

/**
 * Replace the existing tag dictionary with a new tag dictionary.
 *
 * Used for testing only. Do not call this method directly. Instead, call
 * {@link module:jsdoc/doclet._replaceDictionary}, which also updates this module's tag dictionary.
 *
 * @private
 * @param {module:jsdoc/tag/dictionary.Dictionary} dict - The new tag dictionary.
 */
exports._replaceDictionary = function _replaceDictionary(dict) {
    jsdoc.tag.dictionary = dict;
};

/**
    Constructs a new tag object. Calls the tag validator.
    @class
    @classdesc Represents a single doclet tag.
    @param {string} tagTitle
    @param {string=} tagBody
    @param {object=} meta
 */
var Tag = exports.Tag = function(tagTitle, tagBody, meta) {
    var tagDef;
    var trimOpts;

    meta = meta || {};

    this.originalTitle = trim(tagTitle);

    /** The title of the tag (for example, `title` in `@title text`). */
    this.title = jsdoc.tag.dictionary.normalise(this.originalTitle);

    tagDef = jsdoc.tag.dictionary.lookUp(this.title);
    trimOpts = {
        keepsWhitespace: tagDef.keepsWhitespace,
        removesIndent: tagDef.removesIndent
    };

    /**
     * The text following the tag (for example, `text` in `@title text`).
     *
     * Whitespace is trimmed from the tag text as follows:
     *
     * + If the tag's `keepsWhitespace` option is falsy, all leading and trailing whitespace are
     * removed.
     * + If the tag's `keepsWhitespace` option is set to `true`, leading and trailing whitespace are
     * not trimmed, unless the `removesIndent` option is also enabled.
     * + If the tag's `removesIndent` option is set to `true`, any indentation that is shared by
     * every line in the string is removed. This option is ignored unless `keepsWhitespace` is set
     * to `true`.
     *
     * **Note**: If the tag text is the name of a symbol, and the symbol's name includes leading or
     * trailing whitespace (for example, the property names in `{ ' ': true, ' foo ': false }`),
     * the tag text is not trimmed. Instead, the tag text is wrapped in double quotes to prevent the
     * whitespace from being trimmed.
     */
    this.text = trim(tagBody, trimOpts, meta);

    if (this.text) {
        try {
            processTagText(this, tagDef);
        }
        catch (e) {
            // probably a type-parsing error
            jsdoc.util.logger.error(
                'Unable to create a Tag object%s with title "%s" and body "%s": %s',
                meta.filename ? ( ' for source file ' + path.join(meta.path, meta.filename) ) : '',
                tagTitle,
                tagBody,
                e.message
            );
        }
    }

    jsdoc.tag.validator.validate(this, tagDef, meta);
};
