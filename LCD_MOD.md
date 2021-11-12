# LCD Mod - How to

If you are interested about the LCD screens used on my [LCD mod](https://pcpartpicker.com/b/ftMcCJ) for the Lian Li O11 Dynamic XL, I've put some information together that may help you
getting the mod setup on your end. If you have a Lian Li O11 Dynamic XL and some money and time to spare, it's a very easy mod that just needs the right screens. Here's a list of the LCD screens I'm using:

## 15.6" (front)

UPERFECT Portable Monitor 15.6" QLED 100% DCI-P3 99% Adobe RGB 500 Nits Brightness, 10Bit Color Display, IPS HDR

https://smile.amazon.com/gp/product/B08CVQ5SD9/ref=ppx_yo_dt_b_asin_title_o03_s00?ie=UTF8&psc=1

Also available on Aliexpress.

There are many 15.6 screens available but most of them don't fit the O11 DXL horizontally, the one that I linked above fits it perfectly. If you're looking for a cheaper alternative just make sure the total screen height is less than 8.5 inches.

## 7" (back)

https://smile.amazon.com/gp/product/B07Y889J3X/ref=ppx_yo_dt_b_asin_title_o04_s00?ie=UTF8&psc=1


## 2.1" rounded (Galahad AIO pump cover)

https://shop.pimoroni.com/products/hyperpixel-round

Also available on Chicago Electronics, Adafruit and other stores.

## How to setup the screens

The 15.6" screen is connected to the video card via HDMI, you'll just need some creativity to center it vertically like I did. I used some cable clips that I had around, like [these][1] - I put two below the front monitor as can be seen [here][2] using double sided tape. To fill the spaces out on top and bottom of the front panel glass I used a black film like [this][3].

The 7" screen is connected to a Raspberry Pi 4 Model B via HDMI but if you have a spare HDMI connection (or a DP connection with a DP -> HDMI adapter) the video card can be used instead of the Raspberry Pi which saves some money.

The 2.1" rounded screen requires a Raspberry Pi Zero 2 W, a Raspberry Pi Zero W can be used but it is too slow to show MP4/gifs. I mounted the 2.1" rounded screen and the Raspberry Pi Zero 2 W that sits on the back of the screen using the Galahad AIO pump magnetic cover and some double sided tape. The pics below show a Pi Zero WH but it was upgraded later to a Pi Zero 2 W which is much better for animated gifs and smooth MP4 playback.

Just place the screen using the AIO pump magnetic cover and plug in the micro USB cable to power the Raspberry Pi Zero 2 W.

## Other stuff

You'll need regular HDMI/USB C/micro USB cables.

[1]: https://smile.amazon.com/gp/product/B07YV2TT44/ref=ppx_yo_dt_b_search_asin_title?ie=UTF8&psc=1
[2]: img/clips.jpg
[3]: https://smile.amazon.com/gp/product/B084Z7RZ7H/ref=ppx_yo_dt_b_asin_title_o02_s00?ie=UTF8&psc=1

