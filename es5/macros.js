'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; /*
                                                                                                                                                                                                                                                                              This feature provides an optional method for ad integrations to insert run-time values
                                                                                                                                                                                                                                                                              into an ad server URL or configuration.
                                                                                                                                                                                                                                                                              */

var _window = require('global/window');

var _window2 = _interopRequireDefault(_window);

var _document = require('global/document');

var _document2 = _interopRequireDefault(_document);

var _video = require('video.js');

var _video2 = _interopRequireDefault(_video);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Return URI encoded version of value if uriEncode is true
var uriEncodeIfNeeded = function uriEncodeIfNeeded(value, uriEncode) {
  if (uriEncode) {
    return encodeURIComponent(value);
  }
  return value;
};

// Add custom field macros to macros object
// based on given name for custom fields property of mediainfo object.
var customFields = function customFields(mediainfo, macros, customFieldsName) {
  if (mediainfo && mediainfo[customFieldsName]) {
    var fields = mediainfo[customFieldsName];
    var fieldNames = Object.keys(fields);

    for (var i = 0; i < fieldNames.length; i++) {
      var tag = '{mediainfo.' + customFieldsName + '.' + fieldNames[i] + '}';

      macros[tag] = fields[fieldNames[i]];
    }
  }
};

// Public method that integrations use for ad macros.
// "string" is any string with macros to be replaced
// "uriEncode" if true will uri encode macro values when replaced
// "customMacros" is a object with custom macros and values to map them to
//  - For example: {'{five}': 5}
// Return value is is "string" with macros replaced
//  - For example: adMacroReplacement('{player.id}') returns a string of the player id
var adMacroReplacement = function adMacroReplacement(string, uriEncode, customMacros) {

  if (uriEncode === undefined) {
    uriEncode = false;
  }

  var macros = {};

  if (customMacros !== undefined) {
    macros = customMacros;
  }

  // Static macros
  macros['{player.id}'] = this.options_['data-player'];
  macros['{mediainfo.id}'] = this.mediainfo ? this.mediainfo.id : '';
  macros['{mediainfo.name}'] = this.mediainfo ? this.mediainfo.name : '';
  macros['{mediainfo.description}'] = this.mediainfo ? this.mediainfo.description : '';
  macros['{mediainfo.tags}'] = this.mediainfo ? this.mediainfo.tags : '';
  macros['{mediainfo.reference_id}'] = this.mediainfo ? this.mediainfo.reference_id : '';
  macros['{mediainfo.duration}'] = this.mediainfo ? this.mediainfo.duration : '';
  macros['{mediainfo.ad_keys}'] = this.mediainfo ? this.mediainfo.ad_keys : '';
  macros['{player.duration}'] = this.duration();
  macros['{timestamp}'] = new Date().getTime();
  macros['{document.referrer}'] = _document2.default.referrer;
  macros['{window.location.href}'] = _window2.default.location.href;
  macros['{random}'] = Math.floor(Math.random() * 1000000000000);

  // Custom fields in mediainfo
  customFields(this.mediainfo, macros, 'custom_fields');
  customFields(this.mediainfo, macros, 'customFields');

  // Go through all the replacement macros and apply them to the string.
  // This will replace all occurrences of the replacement macros.
  for (var i in macros) {
    string = string.split(i).join(uriEncodeIfNeeded(macros[i], uriEncode));
  }

  // Page variables
  string = string.replace(/{pageVariable\.([^}]+)}/g, function (match, name) {
    var value = void 0;
    var context = _window2.default;
    var names = name.split('.');

    // Iterate down multiple levels of selector without using eval
    // This makes things like pageVariable.foo.bar work
    for (var _i = 0; _i < names.length; _i++) {
      if (_i === names.length - 1) {
        value = context[names[_i]];
      } else {
        context = context[names[_i]];
      }
    }

    var type = typeof value === 'undefined' ? 'undefined' : _typeof(value);

    // Only allow certain types of values. Anything else is probably a mistake.
    if (value === null) {
      return 'null';
    } else if (value === undefined) {
      _video2.default.log.warn('Page variable "' + name + '" not found');
      return '';
    } else if (type !== 'string' && type !== 'number' && type !== 'boolean') {
      _video2.default.log.warn('Page variable "' + name + '" is not a supported type');
      return '';
    }

    return uriEncodeIfNeeded(String(value), uriEncode);
  });

  return string;
};

module.exports = adMacroReplacement;