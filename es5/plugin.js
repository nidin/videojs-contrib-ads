'use strict';

var _window = require('global/window');

var _window2 = _interopRequireDefault(_window);

var _video = require('video.js');

var _video2 = _interopRequireDefault(_video);

var _redispatch = require('./redispatch.js');

var _redispatch2 = _interopRequireDefault(_redispatch);

var _snapshot = require('./snapshot.js');

var _snapshot2 = _interopRequireDefault(_snapshot);

var _contentupdate = require('./contentupdate.js');

var _contentupdate2 = _interopRequireDefault(_contentupdate);

var _cancelContentPlay = require('./cancelContentPlay.js');

var _cancelContentPlay2 = _interopRequireDefault(_cancelContentPlay);

var _macros = require('./macros.js');

var _macros2 = _interopRequireDefault(_macros);

var _cueTextTracks = require('./cueTextTracks.js');

var _cueTextTracks2 = _interopRequireDefault(_cueTextTracks);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*
This main plugin file is responsible for integration logic and enabling the features
that live in in separate files.
*/

var VIDEO_EVENTS = _video2.default.getComponent('Html5').Events;

/**
 * Remove the poster attribute from the video element tech, if present. When
 * reusing a video element for multiple videos, the poster image will briefly
 * reappear while the new source loads. Removing the attribute ahead of time
 * prevents the poster from showing up between videos.
 *
 * @param {Object} player The videojs player object
 */
var removeNativePoster = function removeNativePoster(player) {
  var tech = player.$('.vjs-tech');

  if (tech) {
    tech.removeAttribute('poster');
  }
};

// ---------------------------------------------------------------------------
// Ad Framework
// ---------------------------------------------------------------------------

// default framework settings
var defaults = {
  // maximum amount of time in ms to wait to receive `adsready` from the ad
  // implementation after play has been requested. Ad implementations are
  // expected to load any dynamic libraries and make any requests to determine
  // ad policies for a video during this time.
  timeout: 5000,

  // maximum amount of time in ms to wait for the ad implementation to start
  // linear ad mode after `readyforpreroll` has fired. This is in addition to
  // the standard timeout.
  prerollTimeout: 100,

  // maximum amount of time in ms to wait for the ad implementation to start
  // linear ad mode after `contentended` has fired.
  postrollTimeout: 100,

  // when truthy, instructs the plugin to output additional information about
  // plugin state to the video.js log. On most devices, the video.js log is
  // the same as the developer console.
  debug: false,

  // set this to true when using ads that are part of the content video
  stitchedAds: false
};

var contribAdsPlugin = function contribAdsPlugin(options) {

  var player = this; // eslint-disable-line consistent-this

  var settings = _video2.default.mergeOptions(defaults, options);

  // prefix all video element events during ad playback
  // if the video element emits ad-related events directly,
  // plugins that aren't ad-aware will break. prefixing allows
  // plugins that wish to handle ad events to do so while
  // avoiding the complexity for common usage
  var videoEvents = VIDEO_EVENTS.concat(['firstplay', 'loadedalldata', 'playing']);

  // Set up redispatching of player events
  player.on(videoEvents, _redispatch2.default);

  // "vjs-has-started" should be present at the end of a video. This makes sure it's
  // always there.
  player.on('ended', function () {
    if (!player.hasClass('vjs-has-started')) {
      player.addClass('vjs-has-started');
    }
  });

  // We now auto-play when an ad gets loaded if we're playing ads in the same video
  // element as the content.
  // The problem is that in IE11, we cannot play in addurationchange but in iOS8, we
  // cannot play from adcanplay.
  // This will prevent ad-integrations from needing to do this themselves.
  player.on(['addurationchange', 'adcanplay'], function () {
    if (player.currentSrc() === player.ads.snapshot.currentSrc) {
      return;
    }

    player.play();
  });

  player.on('nopreroll', function () {
    player.ads.nopreroll_ = true;
  });

  player.on('nopostroll', function () {
    player.ads.nopostroll_ = true;
  });

  // Remove ad-loading class when ad plays or when content plays (in case there was no ad)
  // If you remove this class too soon you can get a flash of content!
  player.on(['ads-ad-started', 'playing'], function () {
    player.removeClass('vjs-ad-loading');
  });

  // Replace the plugin constructor with the ad namespace
  player.ads = {
    state: 'content-set',
    disableNextSnapshotRestore: false,

    // This is set to true if the content has ended once. After that, the user can
    // seek backwards and replay content, but _contentHasEnded remains true.
    _contentHasEnded: false,

    VERSION: '__VERSION__',

    reset: function reset() {
      player.ads.disableNextSnapshotRestore = false;
      player.ads._contentHasEnded = false;
      player.ads.snapshot = null;
    },


    // Call this when an ad response has been received and there are
    // linear ads ready to be played.
    startLinearAdMode: function startLinearAdMode() {
      if (player.ads.state === 'preroll?' || player.ads.state === 'content-playback' || player.ads.state === 'postroll?') {
        player.trigger('adstart');
      }
    },


    // Call this when a linear ad pod has finished playing.
    endLinearAdMode: function endLinearAdMode() {
      if (player.ads.state === 'ad-playback') {
        player.trigger('adend');
        // In the case of an empty ad response, we want to make sure that
        // the vjs-ad-loading class is always removed. We could probably check for
        // duration on adPlayer for an empty ad but we remove it here just to make sure
        player.removeClass('vjs-ad-loading');
      }
    },


    // Call this when an ad response has been received but there are no
    // linear ads to be played (i.e. no ads available, or overlays).
    // This has no effect if we are already in a linear ad mode.  Always
    // use endLinearAdMode() to exit from linear ad-playback state.
    skipLinearAdMode: function skipLinearAdMode() {
      if (player.ads.state !== 'ad-playback') {
        player.trigger('adskip');
      }
    },
    stitchedAds: function stitchedAds(arg) {
      if (arg !== undefined) {
        this._stitchedAds = !!arg;
      }
      return this._stitchedAds;
    },


    // Returns whether the video element has been modified since the
    // snapshot was taken.
    // We test both src and currentSrc because changing the src attribute to a URL that
    // AdBlocker is intercepting doesn't update currentSrc.
    videoElementRecycled: function videoElementRecycled() {
      if (!this.snapshot) {
        throw new Error('You cannot use videoElementRecycled while there is no snapshot.');
      }

      var srcChanged = player.src() !== this.snapshot.src;
      var currentSrcChanged = player.currentSrc() !== this.snapshot.currentSrc;

      return srcChanged || currentSrcChanged;
    },


    // Returns a boolean indicating if given player is in live mode.
    // Can be replaced when this is fixed: https://github.com/videojs/video.js/issues/3262
    isLive: function isLive(somePlayer) {
      if (somePlayer.duration() === Infinity) {
        return true;
      } else if (_video2.default.browser.IOS_VERSION === '8' && somePlayer.duration() === 0) {
        return true;
      }
      return false;
    },


    // Return true if content playback should mute and continue during ad breaks.
    // This is only done during live streams on platforms where it's supported.
    // This improves speed and accuracy when returning from an ad break.
    shouldPlayContentBehindAd: function shouldPlayContentBehindAd(somePlayer) {
      return !_video2.default.browser.IS_IOS && !_video2.default.browser.IS_ANDROID && somePlayer.duration() === Infinity;
    }
  };

  player.ads.stitchedAds(settings.stitchedAds);

  player.ads.cueTextTracks = _cueTextTracks2.default;
  player.ads.adMacroReplacement = _macros2.default.bind(player);

  // Start sending contentupdate events for this player
  (0, _contentupdate2.default)(player);

  // Global contentupdate handler for resetting plugin state
  player.on('contentupdate', player.ads.reset);

  // Ad Playback State Machine
  var states = {
    'content-set': {
      events: {
        adscanceled: function adscanceled() {
          this.state = 'content-playback';
        },
        adsready: function adsready() {
          this.state = 'ads-ready';
        },
        play: function play() {
          this.state = 'ads-ready?';
          (0, _cancelContentPlay2.default)(player);
          // remove the poster so it doesn't flash between videos
          removeNativePoster(player);
        },
        adserror: function adserror() {
          this.state = 'content-playback';
        },
        adskip: function adskip() {
          this.state = 'content-playback';
        }
      }
    },
    'ads-ready': {
      events: {
        play: function play() {
          this.state = 'preroll?';
          (0, _cancelContentPlay2.default)(player);
        },
        adskip: function adskip() {
          this.state = 'content-playback';
        },
        adserror: function adserror() {
          this.state = 'content-playback';
        }
      }
    },
    'preroll?': {
      enter: function enter() {
        if (player.ads.nopreroll_) {
          // This will start the ads manager in case there are later ads
          player.trigger('readyforpreroll');

          // If we don't wait a tick, entering content-playback will cancel
          // cancelPlayTimeout, causing the video to not pause for the ad
          _window2.default.setTimeout(function () {
            // Don't wait for a preroll
            player.trigger('nopreroll');
          }, 1);
        } else {
          // change class to show that we're waiting on ads
          player.addClass('vjs-ad-loading');
          // schedule an adtimeout event to fire if we waited too long
          player.ads.adTimeoutTimeout = _window2.default.setTimeout(function () {
            player.trigger('adtimeout');
          }, settings.prerollTimeout);
          // signal to ad plugin that it's their opportunity to play a preroll
          player.trigger('readyforpreroll');
        }
      },
      leave: function leave() {
        _window2.default.clearTimeout(player.ads.adTimeoutTimeout);
      },

      events: {
        play: function play() {
          (0, _cancelContentPlay2.default)(player);
        },
        adstart: function adstart() {
          this.state = 'ad-playback';
        },
        adskip: function adskip() {
          this.state = 'content-playback';
        },
        adtimeout: function adtimeout() {
          this.state = 'content-playback';
        },
        adserror: function adserror() {
          this.state = 'content-playback';
        },
        nopreroll: function nopreroll() {
          this.state = 'content-playback';
        }
      }
    },
    'ads-ready?': {
      enter: function enter() {
        player.addClass('vjs-ad-loading');
        player.ads.adTimeoutTimeout = _window2.default.setTimeout(function () {
          player.trigger('adtimeout');
        }, settings.timeout);
      },
      leave: function leave() {
        _window2.default.clearTimeout(player.ads.adTimeoutTimeout);
        player.removeClass('vjs-ad-loading');
      },

      events: {
        play: function play() {
          (0, _cancelContentPlay2.default)(player);
        },
        adscanceled: function adscanceled() {
          this.state = 'content-playback';
        },
        adsready: function adsready() {
          this.state = 'preroll?';
        },
        adskip: function adskip() {
          this.state = 'content-playback';
        },
        adtimeout: function adtimeout() {
          this.state = 'content-playback';
        },
        adserror: function adserror() {
          this.state = 'content-playback';
        }
      }
    },
    'ad-playback': {
      enter: function enter() {
        // capture current player state snapshot (playing, currentTime, src)
        if (!player.ads.shouldPlayContentBehindAd(player)) {
          this.snapshot = _snapshot2.default.getPlayerSnapshot(player);
        }

        // Mute the player behind the ad
        if (player.ads.shouldPlayContentBehindAd(player)) {
          this.preAdVolume_ = player.volume();
          player.volume(0);
        }

        // add css to the element to indicate and ad is playing.
        player.addClass('vjs-ad-playing');

        // We should remove the vjs-live class if it has been added in order to
        // show the adprogress control bar on Android devices for falsely
        // determined LIVE videos due to the duration incorrectly reported as Infinity
        if (player.hasClass('vjs-live')) {
          player.removeClass('vjs-live');
        }

        // remove the poster so it doesn't flash between ads
        removeNativePoster(player);

        // We no longer need to supress play events once an ad is playing.
        // Clear it if we were.
        if (player.ads.cancelPlayTimeout) {
          // If we don't wait a tick, we could cancel the pause for cancelContentPlay,
          // resulting in content playback behind the ad
          _window2.default.setTimeout(function () {
            _window2.default.clearTimeout(player.ads.cancelPlayTimeout);
            player.ads.cancelPlayTimeout = null;
          }, 1);
        }
      },
      leave: function leave() {
        player.removeClass('vjs-ad-playing');

        // We should add the vjs-live class back if the video is a LIVE video
        // If we dont do this, then for a LIVE Video, we will get an incorrect
        // styled control, which displays the time for the video
        if (player.ads.isLive(player)) {
          player.addClass('vjs-live');
        }
        if (!player.ads.shouldPlayContentBehindAd(player)) {
          _snapshot2.default.restorePlayerSnapshot(player, this.snapshot);
        }

        // Reset the volume to pre-ad levels
        if (player.ads.shouldPlayContentBehindAd(player)) {
          player.volume(this.preAdVolume_);
        }
      },

      events: {
        adend: function adend() {
          this.state = 'content-resuming';
        },
        adserror: function adserror() {
          this.state = 'content-resuming';
          // Trigger 'adend' to notify that we are exiting 'ad-playback'
          player.trigger('adend');
        }
      }
    },
    'content-resuming': {
      enter: function enter() {
        if (this._contentHasEnded) {
          _window2.default.clearTimeout(player.ads._fireEndedTimeout);
          // in some cases, ads are played in a swf or another video element
          // so we do not get an ended event in this state automatically.
          // If we don't get an ended event we can use, we need to trigger
          // one ourselves or else we won't actually ever end the current video.
          player.ads._fireEndedTimeout = _window2.default.setTimeout(function () {
            player.trigger('ended');
          }, 1000);
        }
      },
      leave: function leave() {
        _window2.default.clearTimeout(player.ads._fireEndedTimeout);
      },

      events: {
        contentupdate: function contentupdate() {
          this.state = 'content-set';
        },
        contentresumed: function contentresumed() {
          this.state = 'content-playback';
        },
        playing: function playing() {
          this.state = 'content-playback';
        },
        ended: function ended() {
          this.state = 'content-playback';
        }
      }
    },
    'postroll?': {
      enter: function enter() {
        this.snapshot = _snapshot2.default.getPlayerSnapshot(player);
        if (player.ads.nopostroll_) {
          _window2.default.setTimeout(function () {
            // content-resuming happens after the timeout for backward-compatibility
            // with plugins that relied on a postrollTimeout before nopostroll was
            // implemented
            player.ads.state = 'content-resuming';
            player.trigger('ended');
          }, 1);
        } else {
          player.addClass('vjs-ad-loading');

          player.ads.adTimeoutTimeout = _window2.default.setTimeout(function () {
            player.trigger('adtimeout');
          }, settings.postrollTimeout);
        }
      },
      leave: function leave() {
        _window2.default.clearTimeout(player.ads.adTimeoutTimeout);
        player.removeClass('vjs-ad-loading');
      },

      events: {
        adstart: function adstart() {
          this.state = 'ad-playback';
        },
        adskip: function adskip() {
          this.state = 'content-resuming';
          _window2.default.setTimeout(function () {
            player.trigger('ended');
          }, 1);
        },
        adtimeout: function adtimeout() {
          this.state = 'content-resuming';
          _window2.default.setTimeout(function () {
            player.trigger('ended');
          }, 1);
        },
        adserror: function adserror() {
          this.state = 'content-resuming';
          _window2.default.setTimeout(function () {
            player.trigger('ended');
          }, 1);
        },
        contentupdate: function contentupdate() {
          this.state = 'ads-ready?';
        }
      }
    },
    'content-playback': {
      enter: function enter() {
        // make sure that any cancelPlayTimeout is cleared
        if (player.ads.cancelPlayTimeout) {
          _window2.default.clearTimeout(player.ads.cancelPlayTimeout);
          player.ads.cancelPlayTimeout = null;
        }

        // This was removed because now that "playing" is fixed to only play after
        // preroll, any integration should just use the "playing" event. However,
        // we found out some 3rd party code relied on this event, so we've temporarily
        // added it back in to give people more time to update their code.
        player.trigger({
          type: 'contentplayback',
          triggerevent: player.ads.triggerevent
        });

        // Play the content
        if (player.ads.cancelledPlay) {
          player.ads.cancelledPlay = false;
          if (player.paused()) {
            player.play();
          }
        }
      },

      events: {
        // In the case of a timeout, adsready might come in late.
        // This assumes the behavior that if an ad times out, it could still
        // interrupt the content and start playing. An integration could
        // still decide to behave otherwise.
        adsready: function adsready() {
          player.trigger('readyforpreroll');
        },
        adstart: function adstart() {
          this.state = 'ad-playback';
        },
        contentupdate: function contentupdate() {
          // We know sources have changed, so we call CancelContentPlay
          // to avoid playback of video in the background of an ad. Playback Occurs on
          // Android devices if we do not call cancelContentPlay. This is because
          // the sources do not get updated in time on Android due to timing issues.
          // So instead of checking if the sources have changed in the play handler
          // and calling cancelContentPlay() there we call it here.
          // This does not happen on Desktop as the sources do get updated in time.
          if (!player.ads.shouldPlayContentBehindAd(player)) {
            (0, _cancelContentPlay2.default)(player);
          }
          if (player.paused()) {
            this.state = 'content-set';
          } else {
            this.state = 'ads-ready?';
          }
        },
        contentended: function contentended() {

          // If _contentHasEnded is true it means we already checked for postrolls and
          // played postrolls if needed, so now we're ready to send an ended event
          if (this._contentHasEnded) {
            // Causes ended event to trigger in content-resuming.enter.
            // From there, the ended event event is not redispatched.
            // Then we end up back in content-playback state.
            this.state = 'content-resuming';
            return;
          }

          this._contentHasEnded = true;
          this.state = 'postroll?';
        }
      }
    }
  };

  var processEvent = function processEvent(event) {

    var state = player.ads.state;

    // Execute the current state's handler for this event
    var eventHandlers = states[state].events;

    if (eventHandlers) {
      var handler = eventHandlers[event.type];

      if (handler) {
        handler.apply(player.ads);
      }
    }

    // If the state has changed...
    if (state !== player.ads.state) {
      var previousState = state;
      var newState = player.ads.state;

      // Record the event that caused the state transition
      player.ads.triggerevent = event.type;

      // Execute "leave" method for the previous state
      if (states[previousState].leave) {
        states[previousState].leave.apply(player.ads);
      }

      // Execute "enter" method for the new state
      if (states[newState].enter) {
        states[newState].enter.apply(player.ads);
      }

      // Debug log message for state changes
      if (settings.debug) {
        _video2.default.log('ads', player.ads.triggerevent + ' triggered: ' + previousState + ' -> ' + newState);
      }
    }
  };

  // Register our handler for the events that the state machine will process
  player.on(VIDEO_EVENTS.concat([
  // Events emitted by this plugin
  'adtimeout', 'contentupdate', 'contentplaying', 'contentended', 'contentresumed',
  // Triggered by startLinearAdMode()
  'adstart',
  // Triggered by endLinearAdMode()
  'adend',
  // Triggered by skipLinearAdMode()
  'adskip',

  // Events emitted by integrations
  'adsready', 'adserror', 'adscanceled', 'nopreroll']), processEvent);

  // If we're autoplaying, the state machine will immidiately process
  // a synthetic play event
  if (!player.paused()) {
    processEvent({ type: 'play' });
  }
};

// Register this plugin with videojs
_video2.default.plugin('ads', contribAdsPlugin);