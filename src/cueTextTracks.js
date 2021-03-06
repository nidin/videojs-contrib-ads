/**
* This feature allows metadata text tracks to be manipulated once available
* @see processMetadataTracks.
* It also allows ad implementations to leverage ad cues coming through
* text tracks, @see processAdTrack
**/

import videojs from 'video.js';

const cueTextTracks = {};

/**
* This feature allows metadata text tracks to be manipulated once they are available,
* usually after the 'loadstart' event is observed on the player
* @param player A reference to a player
* @param processMetadataTrack A callback that performs some operations on a
* metadata text track
**/
cueTextTracks.processMetadataTracks = function(player, processMetadataTrack) {
  const tracks = player.textTracks();
  const setModeAndProcess = function(track) {
    if (track.kind === 'metadata') {
      cueTextTracks.setMetadataTrackMode(track);
      processMetadataTrack(player, track);
    }
  };

  // Text tracks are available
  if (tracks.length > 0) {
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];

      setModeAndProcess(track);
    }
  // Wait until text tracks are added
  // We avoid always setting the event handler in case
  // integrations decide to handle this separately
  // with a different handler for the same event
  } else {
    tracks.addEventListener('addtrack', (event) => {
      const track = event.track;

      setModeAndProcess(track);
    });
  }
};

/**
* Sets the track mode to one of 'disabled', 'hidden' or 'showing'
* @see https://github.com/videojs/video.js/blob/master/docs/guides/text-tracks.md
* Default behavior is to do nothing, @override if this is not desired
* @param track The text track to set the mode on
*/
cueTextTracks.setMetadataTrackMode = function(track) {
  return;
};

/**
* Determines whether cue is an ad cue and returns the cue data.
* @param player A reference to the player
* @param cue The cue to be checked
* Returns the given cue by default @override if futher processing is required
* @return the cueData in JSON if cue is a supported ad cue, or -1 if not
**/
cueTextTracks.getSupportedAdCue = function(player, cue) {
  return cue;
};

/**
* Gets the id associated with a cue.
* @param cue The cue to extract an ID from
* @returns The first occurance of 'id' in the object,
* @override if this is not the desired cue id
**/
cueTextTracks.getCueId = function(player, cue) {
  return cue.id;
};

/**
* Checks whether a cue has already been used
* @param cueId The Id associated with a cue
**/
const cueAlreadySeen = function(player, cueId) {
  return (cueId !== undefined) && player.ads.includedCues[cueId];
};

/**
* Indicates that a cue has been used
* @param cueId The Id associated with a cue
**/
const setCueAlreadySeen = function(player, cueId) {
  if (cueId !== undefined && cueId !== '') {
    player.ads.includedCues[cueId] = true;
  }
};

/**
* This feature allows ad metadata tracks to be manipulated in ad implementations
* @param player A reference to the player
* @param cues The set of cues to work with
* @param processCue A method that uses a cue to make some ad request
* in the ad implementation
* @param [cancelAds] A method that dynamically cancels ads in the ad implementation
**/
cueTextTracks.processAdTrack = function(player, cues, processCue, cancelAds) {
  player.ads.includedCues = {};

  // loop over set of cues
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const cueData = this.getSupportedAdCue(player, cue);

    // Exit if this is not a supported cue
    if (cueData === -1) {
      videojs.log.warn('Skipping as this is not a supported ad cue.', cue);
      return;
    }

    // Continue processing supported cue
    const cueId = this.getCueId(player, cue);
    const startTime = cue.startTime;

    // Skip ad if cue was already used
    if (cueAlreadySeen(player, cueId)) {
      videojs.log('Skipping ad already seen with ID ' + cueId);
      return;
    }

    // Process cue as an ad cue
    processCue(player, cueData, cueId, startTime);

    // Indicate that this cue has been used
    setCueAlreadySeen(player, cueId);

    // Optional dynamic ad cancellation
    if (cancelAds !== undefined) {
      cancelAds(player, cueData);
    }
  }
};

module.exports = cueTextTracks;

