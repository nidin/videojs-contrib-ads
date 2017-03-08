'use strict';

var _window = require('global/window');

var _window2 = _interopRequireDefault(_window);

var _video = require('video.js');

var _video2 = _interopRequireDefault(_video);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*
The snapshot feature is responsible for saving the player state before an ad, then
restoring the player state after an ad.
*/

var snapshot = {};

/**
 * Returns an object that captures the portions of player state relevant to
 * video playback. The result of this function can be passed to
 * restorePlayerSnapshot with a player to return the player to the state it
 * was in when this function was invoked.
 *
 * @param {Object} player The videojs player object
 * @return {Object} snapshot
 */
snapshot.getPlayerSnapshot = function (player) {

  var currentTime = void 0;

  if (_video2.default.browser.IS_IOS && player.ads.isLive(player)) {
    // Record how far behind live we are
    if (player.seekable().length > 0) {
      currentTime = player.currentTime() - player.seekable().end(0);
    } else {
      currentTime = player.currentTime();
    }
  } else {
    currentTime = player.currentTime();
  }

  var tech = player.$('.vjs-tech');
  var remoteTracks = player.remoteTextTracks ? player.remoteTextTracks() : [];
  var tracks = player.textTracks ? player.textTracks() : [];
  var suppressedRemoteTracks = [];
  var suppressedTracks = [];
  var snapshotObject = {
    ended: player.ended(),
    currentSrc: player.currentSrc(),
    src: player.src(),
    currentTime: currentTime,
    type: player.currentType()
  };

  if (tech) {
    snapshotObject.nativePoster = tech.poster;
    snapshotObject.style = tech.getAttribute('style');
  }

  for (var i = 0; i < remoteTracks.length; i++) {
    var track = remoteTracks[i];

    suppressedRemoteTracks.push({
      track: track,
      mode: track.mode
    });
    track.mode = 'disabled';
  }
  snapshotObject.suppressedRemoteTracks = suppressedRemoteTracks;

  for (var _i = 0; _i < tracks.length; _i++) {
    var _track = tracks[_i];

    suppressedTracks.push({
      track: _track,
      mode: _track.mode
    });
    _track.mode = 'disabled';
  }
  snapshotObject.suppressedTracks = suppressedTracks;

  return snapshotObject;
};

/**
 * Attempts to modify the specified player so that its state is equivalent to
 * the state of the snapshot.
 *
 * @param {Object} player - the player
 * @param {Object} snapshotObject - the player state to apply
 */
snapshot.restorePlayerSnapshot = function (player, snapshotObject) {

  if (player.ads.disableNextSnapshotRestore === true) {
    player.ads.disableNextSnapshotRestore = false;
    return;
  }

  // The playback tech
  var tech = player.$('.vjs-tech');

  // the number of[ remaining attempts to restore the snapshot
  var attempts = 20;

  var suppressedRemoteTracks = snapshotObject.suppressedRemoteTracks;
  var suppressedTracks = snapshotObject.suppressedTracks;
  var trackSnapshot = void 0;
  var restoreTracks = function restoreTracks() {
    for (var i = 0; i < suppressedRemoteTracks.length; i++) {
      trackSnapshot = suppressedRemoteTracks[i];
      trackSnapshot.track.mode = trackSnapshot.mode;
    }

    for (var _i2 = 0; _i2 < suppressedTracks.length; _i2++) {
      trackSnapshot = suppressedTracks[_i2];
      trackSnapshot.track.mode = trackSnapshot.mode;
    }
  };

  // finish restoring the playback state
  var resume = function resume() {
    var currentTime = void 0;

    if (_video2.default.browser.IS_IOS && player.ads.isLive(player)) {
      if (snapshotObject.currentTime < 0) {
        // Playback was behind real time, so seek backwards to match
        if (player.seekable().length > 0) {
          currentTime = player.seekable().end(0) + snapshotObject.currentTime;
        } else {
          currentTime = player.currentTime();
        }
        player.currentTime(currentTime);
      }
    } else if (snapshotObject.ended) {
      player.currentTime(player.duration());
    } else {
      player.currentTime(snapshotObject.currentTime);
    }

    // Resume playback if this wasn't a postroll
    if (!snapshotObject.ended) {
      player.play();
    }
  };

  // determine if the video element has loaded enough of the snapshot source
  // to be ready to apply the rest of the state
  var tryToResume = function tryToResume() {

    // tryToResume can either have been called through the `contentcanplay`
    // event or fired through setTimeout.
    // When tryToResume is called, we should make sure to clear out the other
    // way it could've been called by removing the listener and clearing out
    // the timeout.
    player.off('contentcanplay', tryToResume);
    if (player.ads.tryToResumeTimeout_) {
      player.clearTimeout(player.ads.tryToResumeTimeout_);
      player.ads.tryToResumeTimeout_ = null;
    }

    // Tech may have changed depending on the differences in sources of the
    // original video and that of the ad
    tech = player.el().querySelector('.vjs-tech');

    if (tech.readyState > 1) {
      // some browsers and media aren't "seekable".
      // readyState greater than 1 allows for seeking without exceptions
      return resume();
    }

    if (tech.seekable === undefined) {
      // if the tech doesn't expose the seekable time ranges, try to
      // resume playback immediately
      return resume();
    }

    if (tech.seekable.length > 0) {
      // if some period of the video is seekable, resume playback
      return resume();
    }

    // delay a bit and then check again unless we're out of attempts
    if (attempts--) {
      _window2.default.setTimeout(tryToResume, 50);
    } else {
      try {
        resume();
      } catch (e) {
        _video2.default.log.warn('Failed to resume the content after an advertisement', e);
      }
    }
  };

  if (snapshotObject.nativePoster) {
    tech.poster = snapshotObject.nativePoster;
  }

  if ('style' in snapshotObject) {
    // overwrite all css style properties to restore state precisely
    tech.setAttribute('style', snapshotObject.style || '');
  }

  // Determine whether the player needs to be restored to its state
  // before ad playback began. With a custom ad display or burned-in
  // ads, the content player state hasn't been modified and so no
  // restoration is required

  if (player.ads.videoElementRecycled()) {
    // on ios7, fiddling with textTracks too early will cause safari to crash
    player.one('contentloadedmetadata', restoreTracks);

    // if the src changed for ad playback, reset it
    player.src({ src: snapshotObject.currentSrc, type: snapshotObject.type });
    // safari requires a call to `load` to pick up a changed source
    player.load();
    // and then resume from the snapshots time once the original src has loaded
    // in some browsers (firefox) `canplay` may not fire correctly.
    // Reace the `canplay` event with a timeout.
    player.one('contentcanplay', tryToResume);
    player.ads.tryToResumeTimeout_ = player.setTimeout(tryToResume, 2000);
  } else if (!player.ended() || !snapshotObject.ended) {
    // if we didn't change the src, just restore the tracks
    restoreTracks();
    // the src didn't change and this wasn't a postroll
    // just resume playback at the current time.
    player.play();
  }
};

module.exports = snapshot;