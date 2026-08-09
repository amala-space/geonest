package com.geotracker.app;

import android.Manifest;
import android.content.ComponentName;
import android.os.Build;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

@CapacitorPlugin(
    name = "GpsTracker",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class GpsTrackerPlugin extends Plugin {

    private LocationService locationService;
    private boolean isBound = false;
    private boolean isPaused = false;
    private float accuracyThresholdM = 50f;

    // Map-mode watch: FusedLocationProviderClient used directly so we never
    // go through Capacitor's permission-request bridge (which NPEs on some
    // Android versions inside GeolocationPlugin.handlePermissionRequest).
    private FusedLocationProviderClient mapLocationClient;
    private LocationCallback mapLocationCallback;

    private boolean hasAndroidPermission(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasFineLocationPermission() {
        return hasAndroidPermission(Manifest.permission.ACCESS_FINE_LOCATION);
    }

    private boolean hasLocationPermission() {
        return hasFineLocationPermission() || hasAndroidPermission(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private boolean isDeviceLocationEnabled() {
        LocationManager locationManager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return locationManager.isLocationEnabled();
        }
        try {
            return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                    || locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {
            return false;
        }
    }

    private void rejectLocationDisabled(PluginCall call) {
        call.reject("LOCATION_DISABLED", "LOCATION_DISABLED");
    }

    private String permissionState(String permission) {
        return hasAndroidPermission(permission)
                ? "granted"
                : "prompt";
    }

    private void resolvePermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("location", hasLocationPermission() ? "granted" : "prompt");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            result.put("notifications", permissionState(Manifest.permission.POST_NOTIFICATIONS));
        } else {
            result.put("notifications", "granted");
        }
        call.resolve(result);
    }

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            LocationService.LocalBinder localBinder = (LocationService.LocalBinder) binder;
            locationService = localBinder.getService();
            locationService.setPlugin(GpsTrackerPlugin.this);
            locationService.startLocationUpdates();
            isBound = true;
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            isBound = false;
            locationService = null;
        }
    };

    public void onLocation(Location location) {
        if (isPaused) return;
        if (location.getAccuracy() > accuracyThresholdM) return;

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        String timestamp = sdf.format(new Date(location.getTime()));

        JSObject data = new JSObject();
        data.put("lat", location.getLatitude());
        data.put("lon", location.getLongitude());
        data.put("accuracy", (double) location.getAccuracy());
        data.put("timestamp", timestamp);
        notifyListeners("location", data);
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        if (!hasLocationPermission()) {
            call.reject("PERMISSION_DENIED");
            return;
        }
        if (!isDeviceLocationEnabled()) {
            rejectLocationDisabled(call);
            return;
        }
        Float threshold = call.getFloat("accuracyThreshold");
        if (threshold != null) accuracyThresholdM = threshold;
        isPaused = false;

        Intent serviceIntent = new Intent(getContext(), LocationService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }
        getContext().bindService(serviceIntent, connection, Context.BIND_AUTO_CREATE);

        call.resolve();
    }

    @PluginMethod
    public void pauseTracking(PluginCall call) {
        isPaused = true;
        call.resolve();
    }

    @PluginMethod
    public void resumeTracking(PluginCall call) {
        isPaused = false;
        call.resolve();
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        isPaused = false;
        stopTrackingService();
        call.resolve();
    }

    @PluginMethod
    public void watchMap(PluginCall call) {
        // Check permission using ContextCompat directly — never touches
        // Capacitor's Bridge.getPermissionStates() which NPEs on some devices.
        if (!hasLocationPermission()) {
            call.reject("PERMISSION_DENIED");
            return;
        }
        if (!isDeviceLocationEnabled()) {
            rejectLocationDisabled(call);
            return;
        }
        stopMapWatch(); // clear any existing watch
        if (mapLocationClient == null) {
            mapLocationClient = LocationServices.getFusedLocationProviderClient(getContext());
        }
        mapLocationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                if (result == null) return;
                Location loc = result.getLastLocation();
                if (loc == null) return;
                java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat(
                        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US);
                sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                JSObject data = new JSObject();
                data.put("lat", loc.getLatitude());
                data.put("lon", loc.getLongitude());
                data.put("accuracy", (double) loc.getAccuracy());
                data.put("timestamp", sdf.format(new java.util.Date(loc.getTime())));
                notifyListeners("mapLocation", data);
            }
        };
        int priority = hasFineLocationPermission()
                ? Priority.PRIORITY_HIGH_ACCURACY
                : Priority.PRIORITY_BALANCED_POWER_ACCURACY;
        LocationRequest request = new LocationRequest.Builder(priority, 3000L)
                .setMinUpdateDistanceMeters(2f)
                .build();
        //noinspection MissingPermission — checked above via ContextCompat
        mapLocationClient.requestLocationUpdates(request, mapLocationCallback, Looper.getMainLooper());
        call.resolve();
    }

    @PluginMethod
    public void stopMap(PluginCall call) {
        stopMapWatch();
        call.resolve();
    }

    private void stopMapWatch() {
        if (mapLocationClient != null && mapLocationCallback != null) {
            mapLocationClient.removeLocationUpdates(mapLocationCallback);
            mapLocationCallback = null;
        }
    }

    private void stopTrackingService() {
        if (isBound) {
            if (locationService != null) {
                locationService.stopLocationUpdates();
            }
            getContext().unbindService(connection);
            isBound = false;
            locationService = null;
        }
        Intent serviceIntent = new Intent(getContext(), LocationService.class);
        getContext().stopService(serviceIntent);
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        resolvePermissions(call);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        resolvePermissions(call);
    }

    @PluginMethod
    public void isLocationEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", isDeviceLocationEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        try {
            getActivity().startActivity(intent);
        } catch (Exception err) {
            Intent fallback = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
        call.resolve();
    }

    @PluginMethod
    public void getSafeAreaInsets(PluginCall call) {
        android.content.res.Resources res = getContext().getResources();
        DisplayMetrics dm = res.getDisplayMetrics();
        int statusBarId = res.getIdentifier("status_bar_height", "dimen", "android");
        int navBarId = res.getIdentifier("navigation_bar_height", "dimen", "android");
        float statusBarPx = statusBarId > 0 ? res.getDimensionPixelSize(statusBarId) : 0;
        float navBarPx = navBarId > 0 ? res.getDimensionPixelSize(navBarId) : 0;
        // Convert physical pixels to CSS pixels (dp)
        int top = Math.round(statusBarPx / dm.density);
        int bottom = Math.round(navBarPx / dm.density);
        JSObject result = new JSObject();
        result.put("top", top);
        result.put("bottom", bottom);
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        stopMapWatch();
        stopTrackingService();
        super.handleOnDestroy();
    }
}
