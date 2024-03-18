var offset = [0,0];
var divOverlay;
var isDown = false;
var currentId;

const mouseDown = (e) => {
  divOverlay = e.eventTarget || e.target;
  startDrag(divOverlay, e);
};
const startDrag = (o, e) => {
  isDown = true;
  offset = [
    o.offsetLeft - e.clientX,
    o.offsetTop - e.clientY
  ];
  console.log('start dragging of ', o.id, 'offsetLeft', offset[0], 'offsetTop', offset[1]);
  divOverlay.style.background = 'mediumblue';
  divOverlay.style.cursor = 'grab';
};
export function setDraggable(elem) {
  if (!elem.hasEventListener) {
    elem.hasEventListener = true;
    elem.addEventListener('mousedown', mouseDown, true);
  }
}

document.addEventListener('mouseup', (e) => {
  if (isDown) {
    isDown = false;
    console.log('stopping dragging of', divOverlay.id);
    divOverlay.style.background = 'transparent';
    divOverlay.style.cursor = 'inherit';
    console.log('End drag');
    divOverlay = undefined;
  }
}, true);

document.addEventListener('mousemove', (e) => {
  event.preventDefault();
  if (isDown) {
    divOverlay.style.left = (e.clientX + offset[0]) + 'px';
    divOverlay.style.top  = (e.clientY + offset[1]) + 'px';
  }
}, true);

/*
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.ctrlKey && (e.keyCode === 65 || e.keyCode === 97)) {  // CTRL+A
    e.preventDefault();
    return false;
  } else if (e.altKey && (e.keyCode === 83 || e.keyCode === 115)) { // ALT+S
    console.log('add sensor');
    e.preventDefault();
    return false;
  } else if (e.altKey && (e.keyCode === 84 || e.keyCode === 116)) { // ALT+T
    console.log('add text');
    e.preventDefault();
    return false;
  }
});
*/
