'use strict';

const bootLoader = (onloadCB) => {
  let head = document.head;
  let script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = '/js/config.js';
  script.onload = onloadCB;
  head.appendChild(script);
};
