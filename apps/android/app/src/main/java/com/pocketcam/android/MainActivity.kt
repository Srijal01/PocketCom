package com.pocketcam.android

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : ComponentActivity() {
    private val cameraPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) permissionDenied = true
    }
    private var permissionDenied by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                var streaming by remember { mutableStateOf(false) }
                var serverUrl by remember { mutableStateOf("http://192.168.16.214:8080") }
                var pairingCode by remember { mutableStateOf("") }
                var pairedToken by remember { mutableStateOf("") }
                var pairingMessage by remember { mutableStateOf("") }
                Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("PocketCam", style = MaterialTheme.typography.headlineMedium)
                    Text(if (streaming) "Streaming is active. The foreground notification remains visible." else "Streaming is stopped.")
                    OutlinedTextField(value = serverUrl, onValueChange = { serverUrl = it }, label = { Text("Signaling server URL") }, enabled = !streaming)
                    OutlinedTextField(value = pairingCode, onValueChange = { pairingCode = it }, label = { Text("Pairing code") }, enabled = !streaming)
                    Button(onClick = {
                        Thread {
                            try {
                                val baseUrl = serverUrl.trim().trimEnd('/')
                                val connection = (URL("$baseUrl/devices/pair").openConnection() as HttpURLConnection).apply {
                                    requestMethod = "POST"; doOutput = true; setRequestProperty("Content-Type", "application/json")
                                }
                                connection.outputStream.use { it.write(JSONObject().put("code", pairingCode).put("name", "Android camera").toString().toByteArray()) }
                                val responseStream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
                                val response = JSONObject(responseStream.bufferedReader().readText())
                                if (connection.responseCode !in 200..299) throw IllegalStateException(response.optString("error", "server returned HTTP ${connection.responseCode}"))
                                pairedToken = response.getString("token")
                                pairingMessage = "Device paired. You can start streaming."
                            } catch (error: Exception) {
                                pairingMessage = "Pairing failed: ${error.message ?: "check server address and network"}"
                            }
                        }.start()
                    }, enabled = pairingCode.length == 6 && !streaming) { Text("Pair device") }
                    if (pairingMessage.isNotEmpty()) Text(pairingMessage)
                    if (permissionDenied) Text("Camera permission is required before streaming.", color = MaterialTheme.colorScheme.error)
                    Button(onClick = {
                        if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) cameraPermission.launch(Manifest.permission.CAMERA)
                        else if (pairedToken.isEmpty()) pairingMessage = "Pair this phone before starting a stream."
                        else {
                            startForegroundService(
                                Intent(this@MainActivity, StreamingService::class.java)
                                    .putExtra("token", pairedToken)
                                    .putExtra("serverUrl", serverUrl.trim().trimEnd('/'))
                            )
                            streaming = true
                        }
                    }, enabled = !streaming) { Text("Start streaming") }
                    OutlinedButton(onClick = { stopService(Intent(this@MainActivity, StreamingService::class.java)); streaming = false }, enabled = streaming) { Text("Stop streaming") }
                }
            }
        }
    }
}
