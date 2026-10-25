package com.pocket.budget;

import android.app.*;
import android.content.*;
import android.location.*;
import android.os.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.JSONObject;

public class LilaLocationService extends Service implements LocationListener {
    public static volatile boolean active = false;
    public static volatile long lastUpdate = 0;
    public static volatile String message = "Location is off";
    private LocationManager manager;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean sending = false;
    private long lastSent = 0;
    private String cookie;
    private static final String CHANNEL = "lila_location";

    @Override public void onCreate() {
        super.onCreate();
        manager = (LocationManager) getSystemService(LOCATION_SERVICE);
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL, "Nearby budget heads-ups", NotificationManager.IMPORTANCE_LOW));
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || "STOP".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        cookie = intent.getStringExtra("cookie");
        if (cookie == null) { stopSelf(); return START_NOT_STICKY; }
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, LilaLocationService.class).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL)
            .setContentTitle("Lila is looking out for your budget")
            .setContentText("Nearby heads-ups are on. Tap Pause to stop sharing.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentIntent(open).setOngoing(true)
            .addAction(new Notification.Action.Builder(null, "Pause", stop).build()).build();
        startForeground(42, notification);
        try {
            manager.removeUpdates(this);
            for (String provider : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
                if (manager.isProviderEnabled(provider)) manager.requestLocationUpdates(provider, 30000L, 20f, this, Looper.getMainLooper());
            }
            active = true;
            message = "Waiting for a fresh location";
        } catch (SecurityException error) { message = "Location permission is required"; stopSelf(); }
        return START_NOT_STICKY;
    }
    @Override public void onLocationChanged(Location location) {
        if (sending || System.currentTimeMillis() - lastSent < 60000 || location.getAccuracy() > 150) return;
        if (SystemClock.elapsedRealtimeNanos() - location.getElapsedRealtimeNanos() > 120000000000L) return;
        sending = true; lastSent = System.currentTimeMillis();
        worker.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL("http://localhost:3002/api/location").openConnection();
                connection.setConnectTimeout(10000); connection.setReadTimeout(120000);
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("Cookie", cookie);
                JSONObject input = new JSONObject().put("lat", location.getLatitude()).put("lng", location.getLongitude()).put("accuracy", location.getAccuracy());
                try (java.io.OutputStream out = connection.getOutputStream()) { out.write(input.toString().getBytes(StandardCharsets.UTF_8)); }
                if (connection.getResponseCode() != 200) throw new Exception("Connection unavailable");
                String body;
                try (java.io.InputStream in = connection.getInputStream()) { body = new String(in.readAllBytes(), StandardCharsets.UTF_8); }
                JSONObject result = new JSONObject(body);
                JSONObject profile = result.optJSONObject("profile");
                if (profile != null && !profile.optBoolean("locationEnabled", true)) { message = "Paused by SMS or in Lila"; stopSelf(); return; }
                lastUpdate = System.currentTimeMillis();
                JSONObject note = result.optJSONObject("location");
                message = note == null ? "Location updated" : note.optString("reason", "Nearby budget checked");
            } catch (Exception error) { message = "Reconnecting to the demo laptop"; }
            finally { if (connection != null) connection.disconnect(); sending = false; }
        });
    }
    @Override public void onDestroy() {
        active = false;
        if (manager != null) manager.removeUpdates(this);
        worker.shutdownNow();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
