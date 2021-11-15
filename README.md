# Widgets

A simple client/server app to render widgets defined by a JSON file onto a web browser page.

Used primarily on my Lian Li O11 Dynamic XL [LCD mod](LCD_MOD.md)

Client (JS) and Server (Node.js) included, see `/path/to/repo/client` and `/path/to/repo/server`

The companion app [widget-sensors][1] can track sensor data fed by [HWINFO][2] (free version) and sensor data can be displayed using widgets to monitor hardware information such as CPU temperature, GPU usage etc.

Widgets can be used on any device that can run a modern web browser. The app was created to make easier to update remote LCD screens connected to an Raspberry Pi 4 Model B (see demo video below) but can be used with regular monitor(s) on any device, including smartphones and tablets.

## Demo

In the video below the two LCD screens inside the Lian Li O11 Dynamic XL case are connected to a Raspberry Pi 4 Model B.

https://user-images.githubusercontent.com/5205328/139351061-a6285647-3ab3-464b-9ac7-f99a53fed95d.mp4

## Requirements

* [Node.js](https://nodejs.org/en/download/) - tested with Node.js v12.22.5
* [git](https://git-scm.com/downloads)

Tested on Windows 10 but should work on Mac OS and other operating systems as well with little effort.

## Install

### Install server dependencies

**Command prompt**
```
C:\>cd \path\to\repo\server
C:\path\to\repo\server>npm i
```

**Bash**
```
$ cd /path/to/repo/server
$ npm i
```

### Setup media folder

Set an environment variable named `PW_ROOT` with the folder name where your media files are saved.
The default is `D:/Backgrounds`. The folder must exist and some media files (.mp4, .gif, .jpg etc.)
should be available before modifying the `widgets.json` file.

### Copy widget configuration file and sample media files to your media folder

**Command prompt**
```
C:\>cd \path\to\repo\data
C:\path\to\repo\data>copy *.* %PW_ROOT%
```

**Bash**
```
$ cd /path/to/repo/data
$ cp * $PW_ROOT/
```

Replace `/path/to/repo` to your local repository contents folder.

### Modify the widget configuration file

Enter your media folder and edit the `widgets.json` file using a text editor. Set the media file names
and other properties such as position on screen and screen index for each widget item. A few sample files
are provided for quick setup.

### Running the web server/websocket server

Open a command prompt or bash terminal window and type `npm start` to run the server

**Command prompt**
```
C:\>CD \path\to\repo\server
C:\path\to\repo\server>npm start
```

**Bash**
```
$ cd /path/to/repo/server
$ npm start
```

Possible output:
```
> pagewatch@1.0.0 start D:\pi\pagewatch\server
> nodemon index.js

[nodemon] 2.0.14
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `node index.js`
Page watch app listening at http://localhost:30000
```

### Testing the server

Open a browser tab on your computer and navigate to `http://localhost:30000`

The page should show whatever widgets you have defined for screen: 0 in your widgets.json file

### Setup client hostname/port configuration

Edit `/path/to/repo/client/config.js` file and set the host name and port used by the server.
You must at least set the host name to your server IP address, your computer name is probably
what you need. If you don't know your computer name, use a command prompt or bash terminal window and type

**Command prompt**
```
cmd /k hostname
```

Possible response:
```
C:\>cmd /k hostname
MR-PC
```

**Bash**
```
echo $HOSTNAME
```

Possible response:
```
$ echo $HOSTNAME
MR-PC
```

If using a Raspberry Pi make sure it can access your PC via its name - e.g. open a terminal window on your Raspberry Pi and
ping your computer name.

```
$ ping YOUR-PC-NAME
```

For example, if your computer name is DESKTOP-PC, the config will look like below

```
const config = {
  // Any host name or IP that is reachable by your Raspberry Pi - e.g. your computer name
  host: 'DESKTOP-PC',
  // Port where the web server/websocket server is running
  port: 3000,
};
```

## Testing the client

Connect to your Raspberry Pi via VNC and open Chromium, then navigate to `http://YOUR-PC-NAME:30000`

You should see the same contents when you tested the server on your computer. If you don't, go back
and check the configuration. It's worth noting that both client and server must be running on the same local network.

## Widget configuration JSON file format

```json
{
  "widgets": [
    {
      "uri": "Widget URI",
      "position": { "x": X, "y": Y, "w": W, "h": H },
      "screen": X
    },
    {
      "uri": "Another Widget URI",
      "position": { "x": X, "y": Y, "w": W, "h": H },
      "screen": X
    }
  ]
}
```

- `uri` is a file name.
- `position` determines where the widget will be displayed (absolute positioning)
  - x, y are optional, 0 is used if omitted. Coordinates are relative to the top/left screen corner
  - w, h are optional, the default width and/or height is used if omitted
- `screen` is an optional 0-based index value that can be used to separate widgets by screen

`widgets` array is processed by appearance order where the topmost array item has the least z-index value; aka item is displayed underneath the item immediatelly below it in the array and so on.

Supports video files (`.mp4`), images in general (`.gif*` `.jpg` `.png` etc.) and YouTube videos. Transparency is also supported meaning widgets can be stacked up to create personalized output.

* `.gif` is not supported on Safari.

## Editing, copying and switching between widget configuration profiles

Open `http://YOUR-PC-NAME:30000/admin/` in a browser tab to access a web-based tool that allows quick editing, copying and switching between your widget configuration profiles.

In the video below the two LCD screens inside the Lian Li O11 Dynamic XL case are connected to a Raspberry Pi 4 Model B.

https://user-images.githubusercontent.com/5205328/139523342-f8864793-be65-4ef3-8346-abf27701e266.mp4

## Setting up Chromium to open fullscreen when the Raspberry Pi is booted

Open a SSH connection to your Raspberry Pi and add the following lines to the bottom of `/etc/xdg/lxsession/LXDE-pi/autostart` file

```
$ sudo nano /etc/xdg/lxsession/LXDE-pi/autostart
```

```
chromium-browser --new-window --start-fullscreen --window-position=0,0 --noerrdialogs --user-data-dir=/tmp/screen-1 --app=http://YOUR-PC-NAME:30000/index.html?screen=0 &
```

If you have two screens connected to the Raspberry Pi, add another line as follows (modify the `--window-position` values to match your primary screen width)

```
chromium-browser --new-window --start-fullscreen --window-position=800,0 --noerrdialogs --user-data-dir=/tmp/screen-2 --app=http://YOUR-PC-NAME:30000/index.html?screen=1 &
```

Press `CTRL+X` `Y` to save your changes.

The `--user-data-dir` option is required to allow more than one screen, if you have only one screen it may be omitted. Be sure to create the `/tmp/screen-1` (and `/tmp/screen-2` if using two screens) to allow Chromium to work properly - e.g.

```
$ mkdir /tmp/screen-1
```

I also recommend installing `unclutter` to remove the mouse cursor. Just clone unclutter repo and add a single line to the `autostart` configuration file

```
$ sudo apt-get install unclutter
$ sudo nano /etc/xdg/lxsession/LXDE-pi/autostart
```

Add the following line to the end of `autostart` file

```
@unclutter -idle 0
```

Press `CTRL+X` `Y` to save your changes.

It's also recommended to disable screen blanking (to avoid the screen to enter sleep mode). Edit the file `/home/pi/.config/lxsession/LXDE-pi/autostart`

```
$ sudo nano /home/pi/.config/lxsession/LXDE-pi/autostart
```

Add the lines below to the bottom of the file

```
@xset s off
@xset -dpms 
@xset s noblank
```

Press `CTRL+X` `Y` to save your changes.

Additionally it's recommended to [increase the Raspian swap file size](https://pimylifeup.com/raspberry-pi-swap-file/) which defaults to only 100MB.

Before starting make sure any running programs are closed.

1. Temporarily stop the swap file usage.

To stop the operating system from using the current swap file run the following command:

```
$ sudo dphys-swapfile swapoff
```

2. Modify the swap file configuration file.

Use the command below to open the swap file configuration file

```
$ sudo nano /etc/dphys-swapfile
```

3. Change the default swap file size by changing the line below.

```
CONF_SWAPSIZE=100
```

To increase the swap file size to 1GB, just change the default value of 100 (value in MB) to 1024.

```
CONF_SWAPSIZE=1024
```

Whatever size you set, that space must be available on the SD card.

Save the changes by pressing `CTRL+X` Y then press ENTER.

4. Delete the original swap file and recreate it to fit the newly defined size.

```
$ sudo dphys-swapfile setup
```

6. Turn the swap file usage back on.

```
$ sudo dphys-swapfile swapon
```

Reboot your Raspberry Pi to verify your changes.

```
$ sudo reboot
```

Once the system is rebooted Chromium should be opened in fullscreen. If something goes wrong, just SSH again to your Raspberry Pi and either fix the commands or remove them to undo the changes.

**Note:** instructions valid for Raspian.

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## Acknowledgments

Built with
* [Node.js](https://nodejs.org/en/)
* [Express](https://expressjs.com/)
* [ws: a Node.js WebSocket library](https://www.npmjs.com/package/ws)
* [nodemon](https://www.npmjs.com/package/nodemon)

[1]: https://github.com/jmautari/widget-sensors
[2]: https://github.com/jmautari/widget-sensors#download
