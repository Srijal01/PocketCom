# PocketCam Android

This is the native Android Studio project. It uses Kotlin, Jetpack Compose, CameraX dependencies, Socket.IO, and the native WebRTC library. It does not use a WebView as a camera substitute.

Required behavior before declaring the Android client complete:

- runtime camera permission with explanation
- explicit Start/Stop Streaming actions
- front/rear camera switching
- foreground notification while streaming
- pairing-code entry
- authenticated WSS signaling
- WebRTC camera track publication and offer/answer/ICE handling
- safe reconnect without automatic camera activation
- visible errors for denied permission, camera failure, network loss, and expired sessions
