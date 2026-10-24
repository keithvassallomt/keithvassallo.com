---
# Sample post: shows every formatting feature the blog supports. It stays a draft,
# so it never appears on the live site. Rewrite it, or delete the folder.
title: Putting Nextcloud inside Android's photo picker
description: Android's system photo picker can show photos from a cloud provider. I wanted that provider to be my own Nextcloud server, so I built one.
pubDate: 2026-10-23
category: dev
tags: [Kotlin, Nextcloud, Android]
cover: ./cover.avif
coverAlt: "NC Media Provider: your Nextcloud photos, in Android's photo picker"
share:
  linkedin: |
    Android's system photo picker can pull photos from a cloud provider, so why not your own Nextcloud server?

    This write-up covers how NC Media Provider plugs Nextcloud into the picker, why thumbnails have to come first, and the keyboard trick for apps that skip the picker entirely.

    #Android #Nextcloud #Kotlin #OpenSource
  x: "Your Nextcloud photos, right inside Android's system photo picker. How NC Media Provider does it, and the keyboard trick for apps that skip the picker."
  bluesky: "Your Nextcloud photos, right inside Android's system photo picker. How NC Media Provider does it, and the keyboard trick for apps that skip the picker."
  threads: "Your Nextcloud photos, right inside Android's system photo picker. How NC Media Provider plugs a self-hosted library into the picker, and the keyboard trick for apps that skip it. #Nextcloud"
  mastodon: |
    Your Nextcloud photos, right inside Android's system photo picker.

    How NC Media Provider plugs a self-hosted library into the picker, why thumbnails come first, and a media keyboard for apps that skip the picker.

    #Android #Nextcloud #SelfHosting #Kotlin
  facebook: "Ever wished your Nextcloud photos showed up in Android's photo picker like everything else? This post explains how NC Media Provider makes that happen."
draft: true
---

Every time an app asks me for a photo, Android opens its system photo picker. It is fast, private and consistent across apps, which is exactly what you want from a picker. The trouble is that my photos don't live on my phone. They live on a Nextcloud server at home.

For years the workaround was to open the Nextcloud app, find the photo, download it, then go back and pick it from local storage. It works, but it is the kind of friction you stop noticing until it's gone. **NC Media Provider** removes it: your Nextcloud library shows up right inside the picker, next to everything else.

> [!NOTE]
> NC Media Provider is open source. The code is on [GitHub](https://github.com/keithvassallomt/nc-media-provider) and the app is on [Google Play](https://play.google.com/store/apps/details?id=com.keithvassallo.ncmediaprovider).

## How the picker finds cloud photos

The photo picker doesn't only read local storage. It can also query a cloud media provider, which is how some cloud galleries already show up there. A provider is an ordinary app component, a subclass of `CloudMediaProvider`, that answers a small set of questions:

1. What media do you have?
2. What changed since last time?
3. Can I have a preview of this item?

```kotlin title="NextcloudMediaProvider.kt"
// Called whenever the picker needs to know what changed
override fun onQueryMedia(extras: Bundle): Cursor {
    val since = extras.getLong(EXTRA_SYNC_GENERATION, 0L)
    val cursor = MatrixCursor(MEDIA_PROJECTION)
    library.changesSince(since).forEach { item ->
        cursor.addRow(item.toRow())
    }
    return cursor
}
```

The method itself is short. The interesting work sits around it: keeping a local index of a large library in step with the server, and answering quickly enough that the picker never feels slower than it does for local photos.

> If the picker ever feels slower than it does for local photos, nobody will use it.

## Thumbnails first, originals later

A picker is mostly a grid of thumbnails, so thumbnails are what have to be fast. The app pre-caches them in the background and lets you decide how much storage that cache may use. The full-resolution original is only downloaded when you actually pick something.

![The Android photo picker showing photos from a Nextcloud library](./picker.avif "The system photo picker, showing a Nextcloud library")

## When an app skips the picker

Not every app uses the system picker. Some messaging apps still ship their own gallery, which can't see cloud providers at all. For those, NC Media Provider also works as a keyboard: switch to it, browse your Nextcloud library, and send a photo straight into the conversation.

![The NC Media Provider keyboard showing a grid of Nextcloud photos](./keyboard.avif "The media keyboard, for apps that skip the picker")

### Where each part runs

| Situation | What handles it |
| --- | --- |
| An app opens the system photo picker | The cloud media provider |
| An app ships its own gallery | The media keyboard |
| Browsing ahead of time | Background thumbnail pre-caching |

> [!TIP]
> Set a storage limit for the thumbnail cache in the app's settings if your phone is short on space.

## Try it

Put together, that gives you:

- Your Nextcloud photos and albums in the system photo picker
- A media keyboard for apps that don't use the picker
- Background thumbnail pre-caching, with a storage limit you control
- A setup wizard that gets you connected in a few steps

NC Media Provider is available on Google Play, and the source code is on GitHub. Bug reports and pull requests are very welcome.
