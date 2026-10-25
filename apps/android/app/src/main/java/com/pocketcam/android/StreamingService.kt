package com.pocketcam.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import org.webrtc.EglBase

class StreamingService : Service() {
    private var eglBase: EglBase? = null
    private var session: WebRtcSession? = null

    override fun onCreate() {
        super.onCreate()
        val channel = NotificationChannel("streaming", "Camera streaming", NotificationManager.IMPORTANCE_LOW)
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        val notification = Notification.Builder(this, "streaming")
            .setContentTitle("PocketCam is streaming")
            .setContentText("Tap Stop in the app to end camera sharing.")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true).build()
        startForeground(7, notification)
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val token = intent?.getStringExtra("token")
        val serverUrl = intent?.getStringExtra("serverUrl")
        if (token.isNullOrBlank() || serverUrl.isNullOrBlank()) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (session == null) {
            eglBase = EglBase.create()
            session = WebRtcSession(this, serverUrl, token, eglBase!!.eglBaseContext).also { it.connect() }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        session?.close()
        session = null
        eglBase?.release()
        eglBase = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
