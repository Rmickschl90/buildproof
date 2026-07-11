package com.linquelabs.leeward;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "PdfSaver")
public class PdfSaverPlugin extends Plugin {

    @PluginMethod
    public void savePdf(PluginCall call) {
        String fileName = call.getString("fileName");
        String exportUrl = call.getString("exportUrl");
        String accessToken = call.getString("accessToken");
        String projectId = call.getString("projectId");

        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("Missing PDF filename.");
            return;
        }

        if (exportUrl == null || exportUrl.trim().isEmpty()) {
            call.reject("Missing PDF export URL.");
            return;
        }

        if (accessToken == null || accessToken.trim().isEmpty()) {
            call.reject("Missing access token.");
            return;
        }

        if (projectId == null || projectId.trim().isEmpty()) {
            call.reject("Missing project ID.");
            return;
        }

        if (!fileName.toLowerCase().endsWith(".pdf")) {
            fileName = fileName + ".pdf";
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);

        startActivityForResult(call, intent, "savePdfResult");
    }

    @ActivityCallback
    private void savePdfResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) {
            return;
        }

        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            call.reject("PDF save was cancelled.");
            return;
        }

        Intent resultData = activityResult.getData();
        Uri destinationUri = resultData != null ? resultData.getData() : null;

        if (destinationUri == null) {
            call.reject("No save location was selected.");
            return;
        }

        new Thread(() -> downloadAndSave(call, destinationUri)).start();
    }

    private void downloadAndSave(PluginCall call, Uri destinationUri) {
        HttpURLConnection connection = null;

        try {
            String exportUrl = call.getString("exportUrl");
            String accessToken = call.getString("accessToken");
            String projectId = call.getString("projectId");
            String reportMode = call.getString("reportMode", "standard");

            JSONObject requestBody = new JSONObject();
            requestBody.put("projectId", projectId);

            if ("dispute".equals(reportMode)) {
                requestBody.put("reportMode", "dispute");
            }

            byte[] bodyBytes =
                requestBody.toString().getBytes(StandardCharsets.UTF_8);

            connection = (HttpURLConnection) new URL(exportUrl).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(180000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + accessToken);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/pdf");
            connection.setFixedLengthStreamingMode(bodyBytes.length);

            try (OutputStream requestStream = connection.getOutputStream()) {
                requestStream.write(bodyBytes);
                requestStream.flush();
            }

            int statusCode = connection.getResponseCode();

            if (statusCode < 200 || statusCode >= 300) {
                call.reject("PDF export failed with status " + statusCode + ".");
                return;
            }

            try (
                InputStream inputStream = connection.getInputStream();
                OutputStream outputStream =
                    getContext()
                        .getContentResolver()
                        .openOutputStream(destinationUri, "w")
            ) {
                if (outputStream == null) {
                    call.reject("Unable to open the selected save location.");
                    return;
                }

                byte[] buffer = new byte[64 * 1024];
                int bytesRead;

                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                }

                outputStream.flush();
            }

            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("uri", destinationUri.toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Failed to download and save PDF.", error);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}