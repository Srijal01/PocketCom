package com.pocketcam.android

import io.socket.client.IO
import io.socket.client.Socket
import android.content.Context
import org.json.JSONObject
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import android.util.Log

/**
 * Owns the Android peer connection. The caller must have camera permission and
 * must only call start after the user explicitly starts streaming.
 */
class WebRtcSession(
    private val context: Context,
    private val signalingUrl: String,
    private val token: String,
    private val eglContext: org.webrtc.EglBase.Context
) {
    private lateinit var socket: Socket
    private lateinit var factory: PeerConnectionFactory
    private lateinit var capturer: CameraVideoCapturer
    private lateinit var connection: PeerConnection

    fun connect() {
        Log.i("PocketCam", "Connecting to signaling server: $signalingUrl")
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(
                context.applicationContext
            ).createInitializationOptions()
        )
        factory = PeerConnectionFactory.builder().setVideoEncoderFactory(org.webrtc.DefaultVideoEncoderFactory(eglContext, true, true))
            .setVideoDecoderFactory(org.webrtc.DefaultVideoDecoderFactory(eglContext)).createPeerConnectionFactory()
        socket = IO.socket(signalingUrl, IO.Options().apply { auth = mapOf("token" to token) })
        socket.on("session:invite") { args ->
            try {
                val invite = args[0] as JSONObject
                Log.i("PocketCam", "Received streaming session invite")
                join(invite.getString("sessionId"), parseIceServers(invite.optJSONArray("iceServers")))
            } catch (error: Exception) {
                Log.e("PocketCam", "Could not handle session invite", error)
            }

            private fun parseIceServers(values: org.json.JSONArray?): List<PeerConnection.IceServer> {
                if (values == null) return emptyList()
                return (0 until values.length()).mapNotNull { index ->
                    val value = values.optJSONObject(index) ?: return@mapNotNull null
                    val urls = value.optJSONArray("urls")
                    val builder = if (urls != null && urls.length() > 0) {
                        PeerConnection.IceServer.builder(urls.optString(0))
                    } else {
                        PeerConnection.IceServer.builder(value.optString("urls"))
                    }
                    if (value.has("username")) builder.setUsername(value.optString("username"))
                    if (value.has("credential")) builder.setPassword(value.optString("credential"))
                    builder.createIceServer()
                }
            }
        }
        socket.on(Socket.EVENT_CONNECT) { Log.i("PocketCam", "Signaling connected") }
        socket.on(Socket.EVENT_CONNECT_ERROR) { args -> Log.e("PocketCam", "Signaling connection failed: ${args.firstOrNull()}") }
        socket.connect()
    }

    fun close() {
        if (::capturer.isInitialized) {
            try {
                capturer.stopCapture()
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
            capturer.dispose()
        }
        if (::connection.isInitialized) connection.close()
        if (::factory.isInitialized) factory.dispose()
        if (::socket.isInitialized) socket.disconnect()
    }

    private fun join(sessionId: String, iceServers: List<PeerConnection.IceServer>) {
        val observer = object : EmptyPeerObserver() {
            override fun onIceCandidate(candidate: org.webrtc.IceCandidate) {
                socket.emit("session:ice", JSONObject().put("sessionId", sessionId).put("payload", JSONObject().put("candidate", candidate.sdp).put("sdpMid", candidate.sdpMid).put("sdpMLineIndex", candidate.sdpMLineIndex)))
            }
        }
        connection = factory.createPeerConnection(iceServers, observer) ?: error("Unable to create peer connection")
        val videoSource: VideoSource = factory.createVideoSource(false)
        capturer = createCapturer()
        val surfaceTextureHelper = org.webrtc.SurfaceTextureHelper.create("PocketCamCamera", eglContext)
        capturer.initialize(surfaceTextureHelper, null, videoSource.capturerObserver)
        capturer.startCapture(1280, 720, 30)
        connection.addTrack(factory.createVideoTrack("camera", videoSource))
        socket.emit("session:join", JSONObject().put("sessionId", sessionId))
        socket.on("session:offer") { args ->
            try {
                val offer = args[0] as JSONObject
                connection.setRemoteDescription(SimpleSdpObserver(), org.webrtc.SessionDescription(org.webrtc.SessionDescription.Type.OFFER, offer.getString("sdp")))
                connection.createAnswer(object : SimpleSdpObserver() {
                    override fun onCreateSuccess(description: org.webrtc.SessionDescription) {
                        connection.setLocalDescription(this, description)
                        socket.emit("session:answer", JSONObject().put("sessionId", sessionId).put("payload", JSONObject().put("type", "answer").put("sdp", description.description)))
                    }
                }, org.webrtc.MediaConstraints())
            } catch (error: Exception) {
                Log.e("PocketCam", "Could not handle WebRTC offer", error)
            }
        }
    }

    private fun createCapturer(): CameraVideoCapturer {
        val enumerator = Camera2Enumerator(context)
        val name = enumerator.deviceNames.firstOrNull { enumerator.isBackFacing(it) } ?: enumerator.deviceNames.first()
        return enumerator.createCapturer(name, null)
    }

    open class EmptyPeerObserver : PeerConnection.Observer {
        override fun onSignalingChange(state: PeerConnection.SignalingState) {}
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {}
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
        override fun onIceCandidate(candidate: org.webrtc.IceCandidate) {}
        override fun onIceCandidatesRemoved(candidates: Array<org.webrtc.IceCandidate>) {}
        override fun onAddStream(stream: org.webrtc.MediaStream) {}
        override fun onRemoveStream(stream: org.webrtc.MediaStream) {}
        override fun onDataChannel(channel: org.webrtc.DataChannel) {}
        override fun onRenegotiationNeeded() {}
        override fun onAddTrack(receiver: org.webrtc.RtpReceiver, mediaStreams: Array<org.webrtc.MediaStream>) {}
        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {}
    }
}

open class SimpleSdpObserver : org.webrtc.SdpObserver {
    override fun onCreateSuccess(description: org.webrtc.SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String) {}
    override fun onSetFailure(error: String) {}
}
