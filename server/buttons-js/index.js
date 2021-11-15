let broadcastChannel;

const onAction = (o) => {
  const audio = new Audio('media/click.wav');
  audio.play();
  broadcastChannel.postMessage(o);
};

broadcastChannel = new BroadcastChannel('buttons-channel');
