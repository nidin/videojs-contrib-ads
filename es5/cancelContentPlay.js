'use strict';

var _window = require('global/window');

var _window2 = _interopRequireDefault(_window);

var _document = require('global/document');

var _document2 = _interopRequireDefault(_document);

var _video = require('video.js');

var _video2 = _interopRequireDefault(_video);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var cancelContentPlay = function cancelContentPlay(player) {
  if (player.ads.cancelPlayTimeout) {
    // another cancellation is already in flight, so do nothing
    return;
  }

  // Avoid content flash on non-iPad iOS and iPhones on iOS10 with playsinline
  if (_video2.default.browser.IS_IOS && _video2.default.browser.IS_IPHONE && !player.el_.hasAttribute('playsinline')) {

    var width = player.currentWidth ? player.currentWidth() : player.width();
    var height = player.currentHeight ? player.currentHeight() : player.height();

    // A placeholder black box will be shown in the document while the player is hidden.
    var placeholder = _document2.default.createElement('div');

    placeholder.style.width = width + 'px';
    placeholder.style.height = height + 'px';
    placeholder.style.top = '0';
    placeholder.style.background = 'black';
    placeholder.style.position = 'absolute';
    player.el_.parentNode.insertBefore(placeholder, player.el_);

    // Hide the player. While in full-screen video playback mode on iOS, this
    // makes the player show a black screen instead of content flash.
    player.el_.style.display = 'none';

    // Unhide the player and remove the placeholder once we're ready to move on.
    player.one(['adstart', 'adplaying', 'adtimeout', 'adserror', 'adscanceled', 'adskip', 'playing'], function () {
      player.el_.style.display = 'block';
      placeholder.remove();
    });

    // Detect fullscreen change, if returning from fullscreen and placeholder exists,
    // remove placeholder and show player whether or not playsinline was attached.
    player.on('fullscreenchange', function () {
      if (placeholder && player.hasClass('vjs-fullscreen')) {
        player.el_.style.display = 'block';
        placeholder.remove();
      }
    });
  }

  // The timeout is necessary because pausing a video element while processing a `play`
  // event on iOS can cause the video element to continuously toggle between playing and
  // paused states.
  player.ads.cancelPlayTimeout = _window2.default.setTimeout(function () {
    // deregister the cancel timeout so subsequent cancels are scheduled
    player.ads.cancelPlayTimeout = null;

    // pause playback so ads can be handled.
    if (!player.paused()) {
      player.pause();
    }

    // When the 'content-playback' state is entered, this will let us know to play
    player.ads.cancelledPlay = true;
  }, 1);
}; /*
   This feature makes sure the player is paused during ad loading.
   
   It does this by pausing the player immediately after a "play" where ads will be requested,
   then signalling that we should play after the ad is done.
   */

module.exports = cancelContentPlay;