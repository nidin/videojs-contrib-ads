'use strict';

var _window = require('global/window');

var _window2 = _interopRequireDefault(_window);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Start sending contentupdate events
var initializeContentupdate = function initializeContentupdate(player) {

  // Keep track of the current content source
  // If you want to change the src of the video without triggering
  // the ad workflow to restart, you can update this variable before
  // modifying the player's source
  player.ads.contentSrc = player.currentSrc();

  // Check if a new src has been set, if so, trigger contentupdate
  var checkSrc = function checkSrc() {
    if (player.ads.state !== 'ad-playback') {
      var src = player.currentSrc();

      if (src !== player.ads.contentSrc) {
        player.trigger({
          type: 'contentupdate',
          oldValue: player.ads.contentSrc,
          newValue: src
        });
        player.ads.contentSrc = src;
      }
    }
  };

  // loadstart reliably indicates a new src has been set
  player.on('loadstart', checkSrc);
  // check immediately in case we missed the loadstart
  _window2.default.setTimeout(checkSrc, 1);
}; /*
   This feature sends a `contentupdate` event when the player source changes.
   */

module.exports = initializeContentupdate;