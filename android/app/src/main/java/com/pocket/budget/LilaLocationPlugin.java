package com.pocket.budget;

import android.Manifest;
import android.content.Intent;
import android.location.LocationManager;
import android.content.Context;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

@CapacitorPlugin(name = "LilaLocation", permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
})
public class LilaLocationPlugin extends Plugin {
    @PluginMethod public void start(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationResult");
            return;
        }
        locationResult(call);
    }
    @PermissionCallback private void locationResult(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) { call.reject("Allow precise location to enable nearby heads-ups."); return; }
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (!manager.isLocationEnabled()) { call.reject("Turn on your phone's Location setting first."); return; }
        // The demo origin is fixed; JavaScript cannot direct this authenticated service elsewhere.
        String cookie = android.webkit.CookieManager.getInstance().getCookie("http://localhost:3002");
        if (cookie == null || !cookie.contains("pocket=")) { call.reject("Reconnect Lila to the demo laptop first."); return; }
        Intent intent = new Intent(getContext(), LilaLocationService.class).putExtra("cookie", cookie);
        try { getContext().startForegroundService(intent); call.resolve(statusValue()); }
        catch (Exception error) { call.reject("Could not start location. Keep Lila open and try again."); }
    }
    @PluginMethod public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), LilaLocationService.class));
        call.resolve();
    }
    @PluginMethod public void status(PluginCall call) { call.resolve(statusValue()); }
    private JSObject statusValue() {
        JSObject result = new JSObject();
        result.put("active", LilaLocationService.active);
        result.put("lastUpdate", LilaLocationService.lastUpdate);
        result.put("message", LilaLocationService.message);
        return result;
    }
}
