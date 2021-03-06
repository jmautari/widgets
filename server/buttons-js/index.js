let _C;
const broadcastChannel = new BroadcastChannel('buttons-channel');
const bc = new BroadcastChannel('buttons-data');
broadcastChannel.postMessage({ action: 'buttonsReady'});

const onAction = (silent, o) => {
  if (!silent) {
    const audio = new Audio('media/click.wav');
    audio.play();
  }
  broadcastChannel.postMessage(o);
};

let i = 0, x0 = null, locked = false, w, ini, fin, rID = null, anf;

function stopAni() {
  cancelAnimationFrame(rID);
  rID = null
};

function ani(cf = 0) {
  _C.style.setProperty('--i', ini + (fin - ini) * TFN['ease-out'](cf / anf));

  if (cf === anf) {
    stopAni();
    return
  }

  rID = requestAnimationFrame(ani.bind(this, ++cf))
};

function unify(e) { return e.changedTouches ? e.changedTouches[0] : e };

function lock(e) {
  x0 = unify(e).clientX;
  locked = true
};

function drag(e) {
  e.preventDefault();

  if (locked) {
    let dx = unify(e).clientX - x0, f = +(dx / w).toFixed(2);

    _C.style.setProperty('--i', i - f)
  }
};

function move(e) {
  if (locked) {
    let dx = unify(e).clientX;
    if (dx === x0) {  // Didn't swiped? Just return to resetting to first page.
      x0 = null;
      locked = false;
      return;
    }
    dx -= x0;
    let
      s = Math.sign(dx),
      f = +(s * dx / w).toFixed(2);

    ini = i - s * f;

    if ((i > 0 || s < 0) && (i < N - 1 || s > 0) && f > .2) {
      i -= s;
      f = 1 - f
    }

    fin = i;
    anf = Math.round(f * NF);
    ani();
    x0 = null;
    locked = false;
  }
};

function size() { w = window.innerWidth };

bc.onmessage = (m) => {
  const data = JSON.parse(m.data.buttons);
  let h = '<div class="container">';
  Object.keys(data).forEach(index => {
    const list = data[index];
    h += `<div class="wrap">`;
    h += `<div class="buttons">`;
    list.forEach(i => {
      const textStyle = i.textStyle || '';
      const silent = i.silent || false;
      h += `<div class="` + i.class + `" `;
      if (i.style) {
        h += ` style="` + i.style + `" `;
      }
      h += `onclick='onAction(${silent},` + i.action + `)'>
          <i class="ff fa-3x`;
      if (i.image) {
        if (i.image.match(/fa\-/i)) {
          h += ' ' + i.image + `">`;
        } else {
          h += `"><img src="` + i.image + `">`;
        }
      }
      h += `</i><span class="label bottom ` + textStyle + `">` + i.title + `</span></div>`;
    });
    h += '</div></div>';
  });
  h += '</div>';
  const o = document.getElementById('buttons-container');
  console.log(o.innerHTML);
  o.innerHTML = h;

  size();

  _C = document.querySelector('.container'),
    N = _C.children.length, NF = 30,
    TFN = {
      'linear': function (k) { return k },
      'ease-in': function (k, e = 1.675) {
        return Math.pow(k, e)
      },
      'ease-out': function (k, e = 1.675) {
        return 1 - Math.pow(1 - k, e)
      },
      'ease-in-out': function (k) {
        return .5 * (Math.sin((k - .5) * Math.PI) + 1)
      }
    };
  _C.style.setProperty('--n', N);

  addEventListener('resize', size, false);

  _C.addEventListener('mousedown', lock, false);
  _C.addEventListener('touchstart', lock, false);

  _C.addEventListener('mousemove', drag, false);
  _C.addEventListener('touchmove', drag, false);

  _C.addEventListener('mouseup', move, false);
  _C.addEventListener('touchend', move, false);
};