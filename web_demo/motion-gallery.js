'use strict';

const clips = document.querySelectorAll('.motion-card');
const filters = document.querySelectorAll('.motion-filters button');

function setPlaying(clip, playing) {
  const image = clip.querySelector('img');
  const button = clip.querySelector('.motion-toggle');
  image.src = playing ? image.dataset.animation : image.dataset.poster;
  button.textContent = playing ? 'Stop animation' : 'Play animation';
  button.setAttribute('aria-label', (playing ? 'Stop' : 'Play') + ' animation for ' + image.alt);
  clip.dataset.playing = String(playing);
}

for (const clip of clips) {
  clip.querySelector('.motion-toggle').addEventListener('click', () => {
    setPlaying(clip, clip.dataset.playing !== 'true');
  });
}

for (const filter of filters) {
  filter.addEventListener('click', () => {
    const mode = filter.dataset.filter;
    for (const button of filters) {
      button.setAttribute('aria-pressed', String(button === filter));
    }
    for (const clip of clips) {
      clip.hidden = mode !== 'all' && clip.dataset.mode !== mode;
      if (clip.hidden && clip.dataset.playing === 'true') {
        setPlaying(clip, false);
      }
    }
  });
}
